import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { enableDevMode, openApp, storageDump, unlock } from './vault.ts';

/** The client ID built into the app (public). */
const CLIENT_ID = '435425521293-m9kr2n2kdb4n88m7pkugdhd8nfdk26ro.apps.googleusercontent.com';
const TOKEN = 'ya29.today-token-0123456789';
const KEY = 'sk-ant-api03-test-0123456789abcdefghijklmnopqrstuvwxyz';
/** Monday, 5 October 2026, 10:20 in Berlin (the iPad profiles use Europe/Berlin). */
const NOW = new Date('2026-10-05T10:20:00+02:00');

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const at = (time: string) => `2026-10-05T${time}:00+02:00`;
const ago = (minutes: number) => String(NOW.getTime() - minutes * 60_000);

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

const CALENDARS = {
  items: [
    { id: 'primary', primary: true },
    { id: 'team@group.calendar.google.com', selected: true },
    { id: 'hidden@group.calendar.google.com', selected: false },
  ],
};

const PRIMARY_EVENTS = {
  items: [
    {
      id: 'e1',
      summary: 'Daily Stand-up',
      start: { dateTime: at('08:30') },
      end: { dateTime: at('09:00') },
    },
    {
      id: 'e2',
      summary: 'Vorlesung Statistik II',
      location: 'Hörsaal 3',
      start: { dateTime: at('10:00') },
      end: { dateTime: at('11:30') },
      htmlLink: 'https://www.google.com/calendar/event?eid=e2',
    },
    {
      id: 'e3',
      summary: 'Mittagessen',
      start: { dateTime: at('11:40') },
      end: { dateTime: at('12:30') },
    },
    {
      id: 'e4',
      status: 'cancelled',
      summary: 'Abgesagt',
      start: { dateTime: at('13:00') },
      end: { dateTime: at('14:00') },
    },
    {
      id: 'e5',
      summary: 'Abgelehnt',
      start: { dateTime: at('15:00') },
      end: { dateTime: at('16:00') },
      attendees: [{ self: true, responseStatus: 'declined' }],
    },
    {
      id: 'e6',
      summary: 'Geburtstag Mia',
      start: { date: '2026-10-05' },
      end: { date: '2026-10-06' },
    },
  ],
};

const TEAM_EVENTS = {
  items: [
    // The same meeting in a second calendar is shown once.
    {
      id: 't1',
      summary: 'Mittagessen',
      start: { dateTime: at('11:40') },
      end: { dateTime: at('12:30') },
    },
    {
      id: 't2',
      summary: 'Projektmeeting',
      start: { dateTime: at('16:00') },
      end: { dateTime: at('17:00') },
    },
  ],
};

interface FakeMail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  minutesAgo: number;
  labels?: string[];
  unsubscribe?: boolean;
}

const MAILS: FakeMail[] = [
  {
    id: 'm1',
    from: 'Paketdienst <noreply@paket.example>',
    subject: 'Deine Sendung kommt heute',
    snippet: 'Zustellung heute.',
    minutesAgo: 30,
    labels: ['CATEGORY_UPDATES'],
  },
  {
    id: 'm2',
    from: 'Lena Berg <lena.berg@example.com>',
    subject: 'Folien',
    snippet: 'Schaffst du die Folien bis heute 13 Uhr?',
    minutesAgo: 60,
  },
  {
    id: 'm3',
    from: 'Creator Weekly <news@creator.example>',
    subject: '5 Hooks',
    snippet: 'Diese Woche &amp; mehr',
    minutesAgo: 90,
    unsubscribe: true,
  },
  {
    id: 'm4',
    from: '"Jonas Keller" <jonas@example.net>',
    subject: 'Fotos',
    snippet: 'Hier sind die Bilder.',
    minutesAgo: 120,
  },
  {
    id: 'm5',
    from: 'Modeshop <angebote@shop.example>',
    subject: 'Nur heute: 30 %',
    snippet: 'Rabatt',
    minutesAgo: 700,
    labels: ['CATEGORY_PROMOTIONS'],
  },
];

function gmailMessage(mail: FakeMail) {
  const headers = [
    { name: 'From', value: mail.from },
    { name: 'Subject', value: mail.subject },
  ];
  if (mail.unsubscribe) headers.push({ name: 'List-Unsubscribe', value: '<mailto:x@example.com>' });
  return {
    id: mail.id,
    threadId: `thread-${mail.id}`,
    labelIds: ['INBOX', 'UNREAD', ...(mail.labels ?? [])],
    snippet: mail.snippet,
    internalDate: ago(mail.minutesAgo),
    payload: { headers },
  };
}

type Reply = 'ok' | 'disabled' | 'expired';

interface GoogleMock {
  /** Sign-in requests to accounts.google.com. */
  auth: URL[];
  calls: { url: URL; auth: string | null }[];
  calendar: Reply;
  gmail: Reply;
}

/** Fake sign-in (always granted) and fake Calendar/Gmail APIs with CORS preflight. */
async function mockGoogle(context: BrowserContext): Promise<GoogleMock> {
  const mock: GoogleMock = { auth: [], calls: [], calendar: 'ok', gmail: 'ok' };
  await context.route('https://accounts.google.com/**', async (route: Route) => {
    const url = new URL(route.request().url());
    mock.auth.push(url);
    const fragment = new URLSearchParams({
      state: url.searchParams.get('state') ?? '',
      access_token: TOKEN,
      token_type: 'Bearer',
      expires_in: '3599',
      scope: url.searchParams.get('scope') ?? '',
    });
    await route.fulfill({
      status: 302,
      headers: { location: `${url.searchParams.get('redirect_uri')}#${fragment.toString()}` },
    });
  });
  const reply = async (route: Route, state: Reply, body: () => unknown) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    mock.calls.push({
      url: new URL(request.url()),
      auth: request.headers()['authorization'] ?? null,
    });
    const [status, json] =
      state === 'disabled'
        ? [
            403,
            { error: { status: 'PERMISSION_DENIED', errors: [{ reason: 'accessNotConfigured' }] } },
          ]
        : state === 'expired'
          ? [401, { error: { status: 'UNAUTHENTICATED' } }]
          : [200, body()];
    await route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(json),
    });
  };
  await context.route('https://www.googleapis.com/**', (route) =>
    reply(route, mock.calendar, () => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/calendarList')) return CALENDARS;
      if (path.includes('/calendars/primary/')) return PRIMARY_EVENTS;
      if (path.includes('/calendars/team%40group.calendar.google.com/')) return TEAM_EVENTS;
      return { items: [] };
    }),
  );
  await context.route('https://gmail.googleapis.com/**', (route) =>
    reply(route, mock.gmail, () => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/messages')) return { messages: MAILS.map(({ id }) => ({ id })) };
      const mail = MAILS.find(({ id }) => path.endsWith(`/messages/${id}`));
      return mail ? gmailMessage(mail) : {};
    }),
  );
  return mock;
}

async function connectGoogle(page: Page, context: BrowserContext) {
  await page.goto('./#/settings');
  const google = page.getByTestId('settings-google');
  const popup = context.waitForEvent('page');
  await google.getByRole('button', { name: 'Mit Google verbinden' }).click();
  // No wait for the window to close: the app closes it as soon as the result arrives,
  // possibly before a listener could be attached.
  await popup;
  await expect(google.getByTestId('google-status')).toContainText('Verbunden bis');
}

const events = (page: Page) => page.getByTestId('today-events');
const mails = (page: Page) => page.getByTestId('today-mails');
const sentences = (page: Page) => page.getByTestId('overview-sentence');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('without Google: connect right here, the demo day in developer mode', async ({
  page,
  context,
}) => {
  const mock = await mockGoogle(context);
  await openApp(page, '/today');
  const connect = page.getByTestId('today-connect');
  await expect(connect).toContainText('Verbinde Google (nur lesend)');
  await expect(page.getByTestId('today-date')).toHaveText('Montag, 5. Oktober');
  await expect(page.getByTestId('today-refresh')).toHaveCount(0);
  await expect(page.getByTestId('today-demo')).toHaveCount(0);
  await enableDevMode(page);
  await page.goto('./#/today');
  await page.getByTestId('today-demo').click();
  await expect(page.getByText('Demo-Tag')).toBeVisible();
  await expect(sentences(page).first()).toHaveText(/Lena Berg wartet mit einer Frist/);
  await expect(events(page).getByTestId('event')).toHaveCount(6);
  await page.getByRole('button', { name: 'Demo beenden' }).click();
  await expect(page.getByTestId('today-connect')).toBeVisible();
  expect(mock.calls).toEqual([]);

  // Connecting from "Heute" uses the built-in client ID and loads the day.
  const popup = context.waitForEvent('page');
  await page
    .getByTestId('today-connect')
    .getByRole('button', { name: 'Mit Google verbinden' })
    .click();
  await popup;
  await expect(events(page).getByTestId('event')).toHaveCount(4);
  expect(mock.auth[0]?.searchParams.get('client_id')).toBe(CLIENT_ID);
});

test('events and mails from Google: sorted, grouped, only in memory', async ({ page, context }) => {
  const problems = collectConsoleProblems(page);
  const mock = await mockGoogle(context);
  await openApp(page, '/settings');
  await connectGoogle(page, context);
  await page.keyboard.press('1');
  await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
  await expect(page.getByTestId('today-updated')).toHaveText('Stand 10:20 Uhr');

  // Events: all-day on top; cancelled, declined and hidden calendars left out; no duplicates.
  await expect(events(page).getByTestId('all-day')).toHaveText('Ganztägig: Geburtstag Mia');
  const rows = events(page).getByTestId('event');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveAttribute('data-timing', 'past');
  await expect(rows.nth(1)).toHaveAttribute('data-timing', 'now');
  await expect(rows.nth(1)).toContainText('Vorlesung Statistik II');
  await expect(rows.nth(1)).toContainText('Hörsaal 3');
  await expect(rows.nth(1)).toContainText('Jetzt');
  await expect(rows.nth(2)).toContainText('Mittagessen');
  await expect(rows.nth(2)).toContainText('Nur 10 Min. Puffer');
  await expect(rows.nth(3)).toContainText('Projektmeeting');
  await expect(rows.nth(1).locator('a')).toHaveAttribute(
    'href',
    'https://www.google.com/calendar/event?eid=e2',
  );
  await expect(events(page)).not.toContainText('Abgesagt');
  await expect(events(page)).not.toContainText('Abgelehnt');

  // Mails: question/deadline first, newsletters and advertising collapsed.
  await expect(mails(page).getByTestId('mail-group-important')).toContainText('Lena Berg');
  await expect(mails(page).getByTestId('mail-group-important')).toContainText('Frist');
  await expect(mails(page).getByTestId('mail-group-people')).toContainText('Jonas Keller');
  await expect(mails(page).getByTestId('mail-group-people')).toContainText('08:20');
  await expect(mails(page).getByTestId('mail-group-updates')).toContainText('Paketdienst');
  const bulk = mails(page).getByTestId('mail-group-bulk');
  await expect(bulk.getByTestId('mail')).toHaveCount(0);
  await bulk.getByRole('button', { name: '2 anzeigen' }).click();
  await expect(bulk.getByTestId('mail')).toHaveCount(2);
  await expect(bulk).toContainText('Diese Woche & mehr');
  await expect(bulk).toContainText('gestern 22:40');
  await expect(mails(page).getByTestId('mail').first().locator('a')).toHaveAttribute(
    'href',
    'https://mail.google.com/mail/u/0/#inbox/thread-m2',
  );

  await expect(sentences(page)).toHaveText([
    'Das Wichtigste: Lena Berg wartet mit einer Frist auf dich – „Folien“.',
    '4 Termine zwischen 08:30 und 17:00 Uhr – eng wird es um 11:30 Uhr zwischen „Vorlesung Statistik II“ und „Mittagessen“.',
    '5 ungelesene Mails seit gestern, davon 1 mit Frage oder Frist; 2 Newsletter und Werbung können warten.',
  ]);
  await expect(page.getByTestId('overview-source')).toHaveText('Ohne KI');
  // AI is off: no button to send anything.
  await expect(page.getByTestId('summarize')).toHaveCount(0);

  // Only the shown calendars, today's range, unread inbox mails of 24 hours.
  const calendarUrls = mock.calls.filter((call) => call.url.host === 'www.googleapis.com');
  expect(calendarUrls.some((call) => call.url.pathname.includes('hidden'))).toBe(false);
  const primary = calendarUrls.find((call) => call.url.pathname.includes('/calendars/primary/'));
  expect(primary?.url.searchParams.get('timeMin')).toBe('2026-10-04T22:00:00.000Z');
  expect(primary?.url.searchParams.get('timeMax')).toBe('2026-10-05T22:00:00.000Z');
  expect(primary?.url.searchParams.get('singleEvents')).toBe('true');
  const list = mock.calls.find((call) => call.url.pathname.endsWith('/messages'));
  expect(list?.url.searchParams.get('q')).toBe('in:inbox is:unread newer_than:1d');
  expect(mock.calls.every((call) => call.auth === `Bearer ${TOKEN}`)).toBe(true);

  // Nothing of it is stored.
  const dump = await storageDump(page);
  for (const text of [TOKEN, 'Lena', 'Vorlesung', 'Folien']) {
    expect(dump.indexedDb).not.toContain(text);
    expect(dump.localStorage).not.toContain(text);
  }

  // Hardware keyboard: R loads again.
  const before = mock.calls.length;
  await page.keyboard.press('r');
  await expect.poll(() => mock.calls.length).toBeGreaterThan(before);
  expect(problems).toEqual([]);
});

test('locking forgets the day, unlocking loads it again', async ({ page, context }) => {
  const mock = await mockGoogle(context);
  await openApp(page, '/settings');
  await connectGoogle(page, context);
  await page.goto('./#/today');
  await expect(events(page).getByTestId('event')).toHaveCount(4);
  const before = mock.calls.length;

  // Settings → Sicherheit → "Jetzt sperren" (works in both layouts).
  await page.goto('./#/settings');
  await page.getByTestId('lock-now').click();
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await expect(page.getByText('Vorlesung Statistik II')).toHaveCount(0);
  await unlock(page);
  await page.goto('./#/today');
  await expect(events(page).getByTestId('event')).toHaveCount(4);
  expect(mock.calls.length).toBeGreaterThan(before);
});

test('problems are shown per source; an expired connection keeps the data', async ({
  page,
  context,
}) => {
  const mock = await mockGoogle(context);
  mock.gmail = 'disabled';
  await openApp(page, '/settings');
  await connectGoogle(page, context);
  await page.goto('./#/today');
  await expect(mails(page)).toContainText(
    'Konnte nicht geladen werden: Die API ist im Google-Cloud-Projekt nicht aktiviert.',
  );
  await expect(events(page).getByTestId('event')).toHaveCount(4);
  await expect(sentences(page).nth(2)).toHaveText(
    'Deine Mails konnten gerade nicht geladen werden.',
  );

  mock.gmail = 'ok';
  mock.calendar = 'expired';
  await page.getByTestId('today-refresh').click();
  await expect(page.getByTestId('today-expired')).toBeVisible();
  await expect(page.getByTestId('today-refresh')).toHaveCount(0);
  // What was shown stays visible.
  await expect(events(page).getByTestId('event')).toHaveCount(4);

  // Connecting again loads everything (the failed source included).
  mock.calendar = 'ok';
  const popup = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Neu verbinden' }).click();
  await popup;
  await expect(page.getByTestId('today-expired')).toHaveCount(0);
  await expect(mails(page).getByTestId('mail').first()).toContainText('Lena Berg');
  await expect(events(page).getByTestId('event')).toHaveCount(4);
});

test('Claude formulates the overview only on tap', async ({ page, context }) => {
  await mockGoogle(context);
  const bodies: string[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    bodies.push(request.postData() ?? '');
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5-20251001',
        content: [
          {
            type: 'text',
            text: 'Lena braucht bis 13 Uhr deine Folien. Zwischen Vorlesung und Mittagessen bleiben nur zehn Minuten. Zwei Newsletter können warten.',
          },
        ],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 400, output_tokens: 40 },
      }),
    });
  });
  await openApp(page, '/settings');
  const ai = page.getByTestId('settings-ai');
  await ai.getByRole('switch', { name: 'KI verwenden' }).click();
  await ai.getByTestId('api-key-input').fill(KEY);
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
  await connectGoogle(page, context);
  await page.goto('./#/today');
  await expect(events(page).getByTestId('event')).toHaveCount(4);
  expect(bodies).toEqual([]);

  await page.getByTestId('summarize').click();
  await expect(page.getByTestId('overview-source')).toHaveText('(Claude)');
  await expect(sentences(page)).toHaveText([
    'Lena braucht bis 13 Uhr deine Folien.',
    'Zwischen Vorlesung und Mittagessen bleiben nur zehn Minuten.',
    'Zwei Newsletter können warten.',
  ]);
  expect(bodies).toHaveLength(1);
  const sent = bodies[0] ?? '';
  expect(sent).toContain('Vorlesung Statistik II');
  expect(sent).toContain('Lena Berg');
  // Addresses and newsletter contents stay on the iPad.
  expect(sent).not.toContain('@example');
  expect(sent).not.toContain('5 Hooks');

  await page.getByRole('button', { name: 'Ohne KI anzeigen' }).click();
  await expect(page.getByTestId('overview-source')).toHaveText('Ohne KI');
});
