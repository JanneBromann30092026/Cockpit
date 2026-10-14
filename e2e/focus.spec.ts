import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { openApp, storageDump } from './vault.ts';

const TOKEN = 'ya29.focus-token-0123456789';
/** Monday, 12 October 2026, 07:30 in Berlin (the iPad profiles use Europe/Berlin). */
const NOW = new Date('2026-10-12T07:30:00+02:00');
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
};

const day = (offset: number, time: string) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + offset);
  const iso = date.toISOString().slice(0, 10);
  return `${iso}T${time}:00+02:00`;
};

/** Uni Monday to Friday 9–13, sport Tuesday and Thursday 18–19:30, a "free" reminder. */
interface FakeEvent {
  id: string;
  summary: string;
  transparency?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

const CALENDAR: FakeEvent[] = [
  ...[0, 1, 2, 3, 4].map((offset) => ({
    id: `uni-${offset}`,
    summary: 'Vorlesung',
    start: { dateTime: day(offset, '09:00') },
    end: { dateTime: day(offset, '13:00') },
  })),
  ...[1, 3].map((offset) => ({
    id: `sport-${offset}`,
    summary: 'Sport',
    start: { dateTime: day(offset, '18:00') },
    end: { dateTime: day(offset, '19:30') },
  })),
  {
    id: 'free',
    summary: 'Erinnerung',
    transparency: 'transparent',
    start: { dateTime: day(0, '14:00') },
    end: { dateTime: day(0, '20:00') },
  },
  {
    id: 'allday',
    summary: 'Feiertag',
    start: { date: day(5, '00:00').slice(0, 10) },
    end: { date: day(6, '00:00').slice(0, 10) },
  },
];

interface Mock {
  grantWrite: boolean;
  posted: Record<string, unknown>[];
  deleted: string[];
  listed: URL[];
  created: {
    id: string;
    summary: string;
    start: unknown;
    end: unknown;
    extendedProperties: unknown;
  }[];
}

async function mockGoogle(context: BrowserContext, grantWrite = true): Promise<Mock> {
  const mock: Mock = { grantWrite, posted: [], deleted: [], listed: [], created: [] };
  await context.route('https://accounts.google.com/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const scopes = (url.searchParams.get('scope') ?? '')
      .split(' ')
      .filter((scope) => mock.grantWrite || scope !== WRITE_SCOPE);
    const fragment = new URLSearchParams({
      state: url.searchParams.get('state') ?? '',
      access_token: TOKEN,
      token_type: 'Bearer',
      expires_in: '3599',
      scope: scopes.join(' '),
    });
    await route.fulfill({
      status: 302,
      headers: { location: `${url.searchParams.get('redirect_uri')}#${fragment.toString()}` },
    });
  });
  await context.route('https://www.googleapis.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const url = new URL(request.url());
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    if (url.pathname.endsWith('/calendarList')) {
      await json(200, { items: [{ id: 'primary@example.com', primary: true, selected: true }] });
      return;
    }
    if (request.method() === 'POST') {
      if (!mock.grantWrite) {
        await json(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } });
        return;
      }
      const body = request.postDataJSON() as Mock['created'][number];
      mock.posted.push(body);
      const id = `block-${mock.posted.length}`;
      mock.created.push({ ...body, id });
      await json(200, { id });
      return;
    }
    if (request.method() === 'DELETE') {
      const id = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      mock.deleted.push(id);
      mock.created = mock.created.filter((event) => event.id !== id);
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    mock.listed.push(url);
    await json(200, { items: [...CALENDAR, ...mock.created] });
  });
  return mock;
}

async function connect(page: Page, context: BrowserContext) {
  const popup = context.waitForEvent('page');
  await page.getByTestId('focus-connect').click();
  await popup;
  await expect(page.getByTestId('focus-find')).toBeVisible();
}

async function speak(page: Page, text: string) {
  await page.goto('./#/today');
  await page.getByTestId('command-open').click();
  await page.getByTestId('command-text').fill(text);
  await page.getByTestId('command-understand').click();
}

const SPOKEN =
  'Ja, ich hätte gern Fokusblöcke. Sport ist schon eingetragen, meine Uni ist schon eingetragen. ' +
  'Was noch fehlt, ist Zeit fürs Nacharbeiten, Vorarbeiten von der Uni und Zeit, die ich für Instagram aufbringe.';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('spoken wish → focus blocks in free time → written into Google Calendar', async ({
  page,
  context,
}) => {
  // Many steps (setup, planning, writing, planning again, removing): slower on CI runners.
  test.setTimeout(90_000);
  const mock = await mockGoogle(context);
  await openApp(page);
  await speak(page, SPOKEN);
  await expect(page.getByTestId('command-result')).toContainText(
    'Fokusblöcke planen für: Uni nacharbeiten, Uni vorarbeiten, Instagram',
  );
  await page.getByTestId('command-run').click();
  await expect(page.getByTestId('focus-page')).toBeVisible();
  await expect(page.getByTestId('focus-activity-name')).toHaveCount(3);
  await expect(page.getByTestId('focus-activity-name').nth(2)).toHaveValue('Instagram');
  // Encrypted at rest.
  await expect.poll(async () => (await storageDump(page)).indexedDb).not.toContain('Instagram');

  await connect(page, context);
  await page.getByTestId('focus-find').click();
  const blocks = page.getByTestId('focus-block');
  await expect(blocks.first()).toBeVisible();
  // Seven days from today, all calendars that are shown.
  // Midnight in Berlin.
  expect(mock.listed[0]?.searchParams.get('timeMin')).toBe('2026-10-11T22:00:00.000Z');
  expect(mock.listed[0]?.searchParams.get('singleEvents')).toBe('true');
  await expect(page.getByTestId('focus-summary')).toContainText(
    'Uni nacharbeiten · 3 Std. von 3 Std.',
  );
  await expect(page.getByTestId('focus-missing')).toHaveCount(0);
  const count = await blocks.count();
  expect(count).toBeGreaterThanOrEqual(6);

  // Leave one out.
  await blocks.first().getByTestId('focus-block-remove').click();
  await expect(blocks).toHaveCount(count - 1);

  await page.getByTestId('focus-insert').click();
  await expect(page.getByText(`${count - 1} Fokusblöcke eingetragen`)).toBeVisible();
  expect(mock.posted).toHaveLength(count - 1);
  for (const body of mock.posted) {
    expect(Object.keys(body).sort()).toEqual(
      [
        'colorId',
        'description',
        'end',
        'extendedProperties',
        'reminders',
        'start',
        'summary',
        'transparency',
      ].sort(),
    );
    expect(String(body.summary)).toMatch(/^Fokus: (Uni nacharbeiten|Uni vorarbeiten|Instagram)$/);
    expect(body.extendedProperties).toMatchObject({ private: { cockpit: 'focus' } });
    const start = Date.parse((body.start as { dateTime: string }).dateTime);
    const end = Date.parse((body.end as { dateTime: string }).dateTime);
    // Never during uni (9–13 on weekdays) or sport, always between 8 and 20 o'clock.
    for (const event of CALENDAR.filter((entry) => entry.start.dateTime && !entry.transparency)) {
      const from = Date.parse(event.start.dateTime!) - 15 * 60_000;
      const to = Date.parse(event.end.dateTime!) + 15 * 60_000;
      expect(start < to && from < end).toBe(false);
    }
  }

  // Planned again: the blocks are in the calendar now and count as done.
  await expect(page.getByTestId('focus-existing')).toHaveCount(count - 1);
  await expect(page.getByTestId('focus-block')).toHaveCount(1);

  // Remove all Cockpit blocks again.
  await page.getByTestId('focus-clear').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Entfernen' }).click();
  await expect(page.getByText('Fokusblöcke entfernt')).toBeVisible();
  expect(mock.deleted).toHaveLength(count - 1);
  await expect(page.getByTestId('focus-existing')).toHaveCount(0);
});

test('without permission to create events: reconnect hint, nothing is written', async ({
  page,
  context,
}) => {
  const mock = await mockGoogle(context, false);
  await openApp(page, '/focus');
  await page.getByRole('button', { name: '+ Instagram' }).click();
  await connect(page, context);
  await page.getByTestId('focus-find').click();
  await expect(page.getByTestId('focus-block').first()).toBeVisible();
  await expect(page.getByTestId('focus-insert')).toHaveCount(0);
  await expect(page.getByTestId('focus-plan')).toContainText('Termine erstellen');
  expect(mock.posted).toHaveLength(0);

  // Allowing it now: connect again, then writing works.
  mock.grantWrite = true;
  const popup = context.waitForEvent('page');
  await page.getByTestId('focus-reconnect').click();
  await popup;
  await expect(page.getByTestId('focus-insert')).toBeVisible();
});

test('spoken commands: a task and opening a section, unknown wishes', async ({ page }) => {
  await openApp(page);
  await speak(page, 'Aufgabe Miete überweisen morgen, wichtig');
  await expect(page.getByTestId('command-result')).toContainText(
    'Neue Aufgabe: „Miete überweisen“ · fällig morgen · wichtig',
  );
  await page.getByTestId('command-run').click();
  await expect(page.getByText('Aufgabe angelegt')).toBeVisible();
  await page.goto('./#/tasks');
  await expect(page.getByTestId('task-row').filter({ hasText: 'Miete überweisen' })).toContainText(
    'Wichtig',
  );

  await speak(page, 'Wie wird das Wetter?');
  await expect(page.getByTestId('command-result')).toContainText('nicht verstanden');
  await expect(page.getByTestId('command-run')).toHaveCount(0);

  await page.getByTestId('command-text').fill('Öffne den Wochen-Review');
  await page.getByTestId('command-understand').click();
  await page.getByTestId('command-run').click();
  await expect(page).toHaveURL(/#\/reviews\/week\//);
});

test('speaking the wish with the speech recognition', async ({ page }) => {
  await page.addInitScript(() => {
    const scope = window as unknown as Record<string, unknown>;
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const result = Object.assign(
            [{ transcript: 'Fokusblöcke für Instagram abends', confidence: 0.9 }],
            { isFinal: true },
          );
          this.onresult?.({ results: [result] });
        }, 50);
      }
      stop() {
        setTimeout(() => this.onend?.(), 20);
      }
      abort() {
        this.onend?.();
      }
    }
    scope.SpeechRecognition = FakeRecognition;
    scope.webkitSpeechRecognition = FakeRecognition;
  });
  await openApp(page);
  await page.getByTestId('command-open').click();
  await page.getByTestId('command-record').click();
  await expect(page.getByTestId('command-text')).toHaveValue('Fokusblöcke für Instagram abends');
  await page.getByTestId('command-understand').click();
  await expect(page.getByTestId('command-result')).toContainText('Instagram');
  await page.getByTestId('command-run').click();
  await expect(page.getByTestId('focus-activity-part')).toHaveValue('evening');
});
