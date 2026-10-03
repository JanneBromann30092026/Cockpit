import { expect, test, type Page, type Route } from '@playwright/test';
import { openApp, reloadAndUnlock, storageDump } from './vault.ts';

const KEY = 'sk-ant-api03-test-0123456789abcdefghijklmnopqrstuvwxyz';

const CORS_HEADERS = {
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

type MockReply = 200 | 401 | 404 | 429 | 529;

const ERRORS: Record<Exclude<MockReply, 200>, { type: string; message: string }> = {
  401: { type: 'authentication_error', message: 'invalid x-api-key' },
  404: { type: 'not_found_error', message: 'model not found' },
  429: { type: 'rate_limit_error', message: 'rate limited' },
  529: { type: 'overloaded_error', message: 'overloaded' },
};

/** Fake Anthropic API (no real calls in tests). Records the requests it received. */
async function mockAnthropic(page: Page, reply: () => MockReply) {
  const requests: { url: string; apiKey: string | null; browserAccess: string | null }[] = [];
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    const headers = request.headers();
    requests.push({
      url: request.url(),
      apiKey: headers['x-api-key'] ?? null,
      browserAccess: headers['anthropic-dangerous-direct-browser-access'] ?? null,
    });
    const status = reply();
    const body =
      status === 200
        ? {
            type: 'model',
            id: 'claude-haiku-4-5-20251001',
            display_name: 'Claude Haiku 4.5',
            created_at: '2025-10-01T00:00:00Z',
          }
        : { type: 'error', error: ERRORS[status] };
    await route.fulfill({
      status,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });
  return requests;
}

const aiSection = (page: Page) => page.getByTestId('settings-ai');

async function enableAi(page: Page) {
  await aiSection(page).getByRole('switch', { name: 'KI verwenden' }).click();
  await expect(aiSection(page).getByTestId('ai-privacy')).toBeVisible();
}

test('AI is off by default and nothing is sent', async ({ page }) => {
  const requests = await mockAnthropic(page, () => 200);
  await openApp(page, '/settings');
  const ai = aiSection(page);
  await expect(ai.getByRole('switch', { name: 'KI verwenden' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(ai.getByTestId('api-key-input')).toHaveCount(0);
  await expect(ai.getByRole('button', { name: 'Verbindung testen' })).toHaveCount(0);
  await page.goto('./#/today');
  await page.goto('./#/settings');
  expect(requests).toHaveLength(0);
});

test('API key: save, test, never shown again, remove', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  const requests = await mockAnthropic(page, () => 200);
  await openApp(page, '/settings');
  await enableAi(page);
  const ai = aiSection(page);
  const keyInput = ai.getByTestId('api-key-input');
  await expect(ai.getByTestId('api-key-status')).toHaveText('Kein Key hinterlegt');

  // Without a key: understandable message, no request.
  await ai.getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(ai.getByTestId('connection-result')).toContainText('Kein API-Key hinterlegt');
  expect(requests).toHaveLength(0);

  // Invalid key format.
  await keyInput.fill('hello world');
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByText('Das sieht nicht nach einem Anthropic-API-Key aus')).toBeVisible();

  // Valid key: masked while typing, stored encrypted, field cleared.
  await keyInput.fill(`  ${KEY}  `);
  await expect(keyInput).toHaveCSS('-webkit-text-security', 'disc');
  await expect(keyInput).toHaveAttribute('autocomplete', 'off');
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(page.getByText('API-Key gespeichert')).toBeVisible();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
  await expect(keyInput).toHaveValue('');

  await reloadAndUnlock(page);
  await expect(aiSection(page).getByTestId('api-key-status')).toHaveText('Key hinterlegt');
  expect(await page.content()).not.toContain(KEY);
  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain('sk-ant');
  expect(dump.localStorage).not.toContain('sk-ant');

  // Connection test against the (mocked) API: only the model lookup, no tokens.
  await aiSection(page).getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(aiSection(page).getByTestId('connection-result')).toContainText(
    'Verbindung steht – Claude Haiku 4.5 ist bereit.',
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]?.url).toContain('/v1/models/claude-haiku-4-5-20251001');
  expect(requests[0]?.apiKey).toBe(KEY);
  expect(requests[0]?.browserAccess).toBe('true');

  // Remove the key.
  await aiSection(page).getByRole('button', { name: 'Entfernen' }).click();
  await page
    .getByRole('alertdialog', { name: 'API-Key entfernen?' })
    .getByRole('button', { name: 'Entfernen' })
    .click();
  await expect(aiSection(page).getByTestId('api-key-status')).toHaveText('Kein Key hinterlegt');

  expect(problems).toEqual([]);
});

test('API errors become understandable messages', async ({ page }) => {
  // Same answer until the next case (the SDK retries 429 and 529 once on its own).
  let status: MockReply = 200;
  await mockAnthropic(page, () => status);
  await openApp(page, '/settings');
  await enableAi(page);
  const ai = aiSection(page);
  await ai.getByTestId('api-key-input').fill(KEY);
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');

  const cases: [MockReply, string][] = [
    [401, 'Der API-Key wurde abgelehnt'],
    [404, 'Dieses Modell gibt es nicht'],
    [429, 'Zu viele Anfragen'],
    [529, 'Anthropic ist gerade überlastet'],
    [200, 'Verbindung steht'],
  ];
  for (const [reply, text] of cases) {
    status = reply;
    await ai.getByRole('button', { name: 'Verbindung testen' }).click();
    await expect(ai.getByTestId('connection-result')).toContainText(text);
  }
});

test('offline: the test explains that the AI needs the internet', async ({ page, context }) => {
  await mockAnthropic(page, () => 200);
  await openApp(page, '/settings');
  await enableAi(page);
  const ai = aiSection(page);
  await ai.getByTestId('api-key-input').fill(KEY);
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
  await context.setOffline(true);
  await ai.getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(ai.getByTestId('connection-result')).toContainText('Du bist offline');
  await context.setOffline(false);
});

test('the model can be chosen or entered and survives a reload', async ({ page }) => {
  const requests = await mockAnthropic(page, () => 200);
  await openApp(page, '/settings');
  await enableAi(page);
  const ai = aiSection(page);
  const model = ai.getByTestId('ai-model');
  await expect(model).toHaveValue('claude-haiku-4-5-20251001');

  await model.selectOption('claude-sonnet-5-5');
  await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible();
  await reloadAndUnlock(page);
  await expect(aiSection(page).getByTestId('ai-model')).toHaveValue('claude-sonnet-5-5');

  await aiSection(page).getByTestId('ai-model').selectOption('custom');
  const custom = aiSection(page).getByTestId('ai-custom-model');
  await custom.fill('Claude Haiku!');
  await custom.press('Enter');
  await expect(aiSection(page).getByText('Ungültige Modell-ID')).toBeVisible();
  await custom.fill('claude-haiku-4-5');
  await custom.press('Enter');
  await reloadAndUnlock(page);
  await expect(aiSection(page).getByTestId('ai-model')).toHaveValue('custom');
  await expect(aiSection(page).getByTestId('ai-custom-model')).toHaveValue('claude-haiku-4-5');

  // The test uses the chosen model.
  await aiSection(page).getByTestId('api-key-input').fill(KEY);
  await aiSection(page).getByRole('button', { name: 'Key speichern' }).click();
  await aiSection(page).getByRole('button', { name: 'Verbindung testen' }).click();
  await expect(aiSection(page).getByTestId('connection-result')).toBeVisible();
  expect(requests.at(-1)?.url).toContain('/v1/models/claude-haiku-4-5');

  // Switching off hides everything again; the key stays stored.
  await aiSection(page).getByRole('switch', { name: 'KI verwenden' }).click();
  await expect(aiSection(page).getByText('Ein hinterlegter Key bleibt')).toBeVisible();
  await expect(aiSection(page).getByTestId('ai-model')).toHaveCount(0);
});
