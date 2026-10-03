import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { openApp, storageDump, unlock } from './vault.ts';

const CLIENT_ID = '123456789012-testclient.apps.googleusercontent.com';
const TOKEN = 'ya29.test-token-0123456789';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

function collectConsoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

type SignIn = 'grant' | 'deny' | 'calendarOnly' | 'stay';

/**
 * Fake Google sign-in: answers like Google with a redirect to the callback page
 * (token or error in the fragment). "stay" shows a page and never redirects.
 */
async function mockGoogleSignIn(context: BrowserContext, behaviour: () => SignIn) {
  const authRequests: URL[] = [];
  await context.route('https://accounts.google.com/**', async (route: Route) => {
    const url = new URL(route.request().url());
    authRequests.push(url);
    const mode = behaviour();
    if (mode === 'stay') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Google</p>' });
      return;
    }
    const state = url.searchParams.get('state') ?? '';
    const fragment =
      mode === 'deny'
        ? new URLSearchParams({ error: 'access_denied', state })
        : new URLSearchParams({
            state,
            access_token: TOKEN,
            token_type: 'Bearer',
            expires_in: '3599',
            scope: (mode === 'calendarOnly' ? SCOPES.slice(0, 1) : SCOPES).join(' '),
          });
    await route.fulfill({
      status: 302,
      headers: { location: `${url.searchParams.get('redirect_uri')}#${fragment.toString()}` },
    });
  });
  return authRequests;
}

type ApiReply = 'ok' | 'disabled' | 'expired';

/** Fake Calendar/Gmail APIs (with CORS preflight). Records the Authorization headers. */
async function mockGoogleApis(context: BrowserContext, gmail: () => ApiReply = () => 'ok') {
  const calls: { url: string; auth: string | null }[] = [];
  const handle = async (route: Route, body: () => { status: number; json: unknown }) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    calls.push({ url: request.url(), auth: request.headers()['authorization'] ?? null });
    const { status, json } = body();
    await route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(json),
    });
  };
  await context.route('https://www.googleapis.com/**', (route) =>
    handle(route, () => ({
      status: 200,
      json: {
        items: [
          { id: 'primary', summary: 'Ich', primary: true },
          { id: 'feiertage', summary: 'Feiertage' },
        ],
      },
    })),
  );
  await context.route('https://gmail.googleapis.com/**', (route) =>
    handle(route, () => {
      const reply = gmail();
      if (reply === 'disabled') {
        return {
          status: 403,
          json: {
            error: { status: 'PERMISSION_DENIED', errors: [{ reason: 'accessNotConfigured' }] },
          },
        };
      }
      if (reply === 'expired') {
        return { status: 401, json: { error: { status: 'UNAUTHENTICATED' } } };
      }
      return { status: 200, json: { emailAddress: 'test@example.com', messagesTotal: 42 } };
    }),
  );
  const revokes: string[] = [];
  await context.route('https://oauth2.googleapis.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    revokes.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, headers: CORS, body: '' });
  });
  return { calls, revokes };
}

const section = (page: Page) => page.getByTestId('settings-google');

async function setClientId(page: Page) {
  const field = section(page).getByTestId('google-client-id');
  await field.fill(CLIENT_ID);
  await field.press('Enter');
  await expect(page.getByText('Client-ID gespeichert')).toBeVisible();
}

test('the setup guide shows the addresses to register', async ({ page }) => {
  await openApp(page, '/settings');
  const google = section(page);
  await expect(google.getByTestId('google-status')).toHaveText('Nicht verbunden');
  await expect(google.getByRole('button', { name: 'Mit Google verbinden' })).toBeDisabled();
  await google.getByRole('button', { name: /So richtest du Google ein/ }).click();
  await expect(google.getByTestId('google-origin')).toHaveText('http://localhost:4173');
  await expect(google.getByTestId('google-redirect')).toHaveText(
    'http://localhost:4173/Cockpit/oauth.html',
  );
  const field = google.getByTestId('google-client-id');
  await field.fill('GOCSPX-geheim');
  await field.press('Enter');
  await expect(google.getByText('Das sieht nicht nach einer Client-ID aus')).toBeVisible();
});

test('sign-in in a window, access test, disconnect', async ({ page, context }) => {
  const problems = collectConsoleProblems(page);
  const authRequests = await mockGoogleSignIn(context, () => 'grant');
  const { calls, revokes } = await mockGoogleApis(context);
  await openApp(page, '/settings');
  await setClientId(page);

  const popupPromise = context.waitForEvent('page');
  await section(page).getByRole('button', { name: 'Mit Google verbinden' }).click();
  const popup = await popupPromise;
  await popup.waitForEvent('close');

  await expect(section(page).getByTestId('google-status')).toContainText('Verbunden bis');
  const request = authRequests[0];
  expect(request?.searchParams.get('client_id')).toBe(CLIENT_ID);
  expect(request?.searchParams.get('response_type')).toBe('token');
  expect(request?.searchParams.get('scope')).toBe(SCOPES.join(' '));
  expect(request?.searchParams.get('redirect_uri')).toBe(
    'http://localhost:4173/Cockpit/oauth.html',
  );

  await section(page).getByRole('button', { name: 'Zugriff testen' }).click();
  const result = section(page).getByTestId('google-test-result');
  await expect(result).toContainText('Kalender: 2 Kalender gefunden');
  await expect(result).toContainText('Gmail: verbunden als test@example.com');
  expect(calls.map((call) => call.auth)).toEqual([`Bearer ${TOKEN}`, `Bearer ${TOKEN}`]);

  // The token lives in memory only.
  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain(TOKEN);
  expect(dump.localStorage).not.toContain(TOKEN);
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain(TOKEN);

  await section(page).getByRole('button', { name: 'Trennen' }).click();
  await expect(section(page).getByTestId('google-status')).toHaveText('Nicht verbunden');
  expect(revokes).toEqual([`token=${encodeURIComponent(TOKEN)}`]);
  expect(problems).toEqual([]);
});

test('sign-in by redirect comes back to the settings after unlocking', async ({
  page,
  context,
}) => {
  await mockGoogleSignIn(context, () => 'grant');
  await mockGoogleApis(context);
  await openApp(page, '/settings');
  await setClientId(page);

  await section(page).getByRole('button', { name: 'Alternative: per Weiterleitung' }).click();
  await expect(page.getByTestId('lock-screen')).toHaveAttribute('data-mode', 'unlock');
  // The token is gone from the address bar and from sessionStorage.
  expect(page.url()).not.toContain('access_token');
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage }))).not.toContain(TOKEN);
  await unlock(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
  await expect(section(page).getByTestId('google-status')).toContainText('Verbunden bis');
});

test('refused or incomplete permissions are explained', async ({ page, context }) => {
  const outcomes: SignIn[] = ['deny', 'calendarOnly'];
  let next = 0;
  await mockGoogleSignIn(context, () => outcomes[next++] ?? 'grant');
  await openApp(page, '/settings');
  await setClientId(page);

  const connect = section(page).getByRole('button', { name: 'Mit Google verbinden' });
  await connect.click();
  await expect(section(page).getByTestId('google-error')).toHaveText(
    'Du hast den Zugriff nicht erlaubt.',
  );
  await connect.click();
  await expect(section(page).getByTestId('google-error')).toContainText(
    'Bitte beide Berechtigungen erlauben',
  );
  await expect(section(page).getByTestId('google-status')).toHaveText('Nicht verbunden');
});

test('closing the sign-in window cancels', async ({ page, context }) => {
  await mockGoogleSignIn(context, () => 'stay');
  await openApp(page, '/settings');
  await setClientId(page);
  const popupPromise = context.waitForEvent('page');
  await section(page).getByRole('button', { name: 'Mit Google verbinden' }).click();
  const popup = await popupPromise;
  await expect(section(page).getByTestId('google-status')).toHaveText('Wird verbunden …');
  await popup.close();
  await expect(section(page).getByTestId('google-error')).toHaveText('Anmeldung abgebrochen.');
});

test('API problems are shown per service', async ({ page, context }) => {
  const replies: ApiReply[] = ['disabled', 'expired'];
  let next = 0;
  await mockGoogleSignIn(context, () => 'grant');
  await mockGoogleApis(context, () => replies[next++] ?? 'ok');
  await openApp(page, '/settings');
  await setClientId(page);
  await section(page).getByRole('button', { name: 'Mit Google verbinden' }).click();
  await expect(section(page).getByTestId('google-status')).toContainText('Verbunden bis');

  await section(page).getByRole('button', { name: 'Zugriff testen' }).click();
  const result = section(page).getByTestId('google-test-result');
  await expect(result).toContainText('Kalender: 2 Kalender gefunden');
  await expect(result).toContainText('Gmail: Die API ist im Google-Cloud-Projekt nicht aktiviert.');

  // An expired token disconnects and asks to connect again.
  await section(page).getByRole('button', { name: 'Zugriff testen' }).click();
  await expect(section(page).getByTestId('google-status')).toHaveText('Nicht verbunden');
  await expect(section(page).getByTestId('google-error')).toHaveText(
    'Die Verbindung ist abgelaufen. Bitte neu verbinden.',
  );
});
