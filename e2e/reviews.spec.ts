import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { enableDevMode, openApp, reloadAndUnlock, storageDump } from './vault.ts';

/** Monday, 5 October 2026, 20:15 in Berlin – review time. */
const MONDAY_EVENING = new Date('2026-10-05T20:15:00+02:00');
/** Sunday, 4 October 2026, 19:00 – weekly review time. */
const SUNDAY_EVENING = new Date('2026-10-04T19:00:00+02:00');
const KEY = 'sk-ant-api03-test-0123456789abcdefghijklmnopqrstuvwxyz';
const TOKEN = 'ya29.review-token-0123456789';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

interface Sent {
  raw: string;
  body: { system?: string; output_config?: unknown };
}

/** Mocked api.anthropic.com: answers by request kind (day or week review). */
async function mockClaude(page: Page, answers: { day?: unknown; week?: unknown } = {}) {
  const sent: Sent[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const raw = request.postData() ?? '';
    const body = JSON.parse(raw) as Sent['body'];
    sent.push({ raw, body });
    const system = body.system ?? '';
    const json = system.startsWith('Du hilfst einer Person bei ihrem Tages-Review')
      ? answers.day
      : answers.week;
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'msg_review',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5-20251001',
        content: [{ type: 'text', text: JSON.stringify(json) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 500, output_tokens: 90 },
      }),
    });
  });
  return sent;
}

async function enableAi(page: Page) {
  await page.goto('./#/settings');
  const ai = page.getByTestId('settings-ai');
  await ai.getByRole('switch', { name: 'KI verwenden' }).click();
  await ai.getByTestId('api-key-input').fill(KEY);
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
}

async function demoData(page: Page, reviews: boolean) {
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  await page.getByTestId('dev-demo-tasks').click();
  await expect(page.getByTestId('dev-demo-count')).toHaveText('9 Demo-Einträge');
  if (reviews) {
    await page.getByTestId('dev-demo-reviews').click();
    await expect(page.getByTestId('dev-demo-count')).toHaveText('15 Demo-Einträge');
  }
}

/** Fake Google sign-in and a calendar with two events close together. */
async function mockGoogle(context: BrowserContext) {
  await context.route('https://accounts.google.com/**', async (route: Route) => {
    const url = new URL(route.request().url());
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
  const json = (body: unknown) => async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  };
  const at = (time: string) => `2026-10-05T${time}:00+02:00`;
  await context.route('https://www.googleapis.com/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/calendarList'))
      return json({ items: [{ id: 'primary', primary: true }] })(route);
    return json({
      items: [
        {
          id: 'e1',
          summary: 'Vorlesung Statistik II',
          location: 'Hörsaal 3',
          start: { dateTime: at('08:00') },
          end: { dateTime: at('09:30') },
        },
        {
          id: 'e2',
          summary: 'Projektarbeit',
          start: { dateTime: at('09:35') },
          end: { dateTime: at('11:00') },
        },
      ],
    })(route);
  });
  await context.route('https://gmail.googleapis.com/**', json({ messages: [] }));
}

test('daily review: suggestions from the day, own points, draft saved, finished – encrypted', async ({
  page,
}) => {
  await page.clock.setFixedTime(MONDAY_EVENING);
  const claude = await mockClaude(page);
  await openApp(page, '/today');
  await demoData(page, false);

  // "Heute" reminds in the evening (Monday: no weekly review).
  await page.goto('./#/today');
  await expect(page.getByTestId('today-review-week')).toHaveCount(0);
  await page.getByTestId('today-review-day-start').click();
  await expect(page).toHaveURL(/#\/reviews\/day\/2026-10-05$/);
  await expect(page.getByTestId('review-date')).toHaveText('Montag, 5. Oktober 2026');
  await expect(page.getByTestId('review-facts')).toContainText(
    'Termine siehst du, sobald Google verbunden ist.',
  );
  await expect(page.getByTestId('review-day-done')).toContainText('Miete überweisen');
  await expect(page.getByTestId('review-day-open').locator('li')).toHaveText([
    'Steuererklärung abschicken',
    'Geschenk für Mia besorgen',
    'Folien fürs Kundenportal an Lena schicken',
    'Gliederung Hausarbeit Statistik',
  ]);

  const well = page.getByTestId('review-went-well');
  await well.getByRole('button', { name: 'Erledigt: Miete überweisen' }).click();
  await well.getByTestId('review-went-well-input').fill('Lange Lernsession am Vormittag');
  await well.getByTestId('review-went-well-input').press('Enter');
  await expect(well.getByTestId('review-point')).toHaveText([
    'Erledigt: Miete überweisen',
    'Lange Lernsession am Vormittag',
  ]);
  await page
    .getByTestId('review-not-well')
    .getByRole('button', { name: '„Steuererklärung abschicken“ ist seit 2 Tagen überfällig' })
    .click();
  // Open tasks are listed under "Besser machen", not postponed.
  await page
    .getByTestId('review-improve')
    .getByRole('button', { name: 'Offen: Steuererklärung abschicken' })
    .click();
  await page.getByTestId('review-note').fill('Geheime Notiz zum Tag');
  await expect(page.getByTestId('review-autosave')).toHaveText('Gespeichert');

  await page.goto('./#/reviews');
  await expect(page.getByTestId('reviews-today').getByTestId('review-status')).toHaveText(
    'Begonnen',
  );

  await page.getByTestId('reviews-today-open').click();
  await page.getByTestId('review-finish').click();
  await expect(page.getByTestId('review-completed')).toContainText('Tag abgeschlossen');
  await page.getByTestId('review-to-overview').click();
  await expect(page.getByTestId('reviews-today').getByTestId('review-status')).toHaveText(
    'Erledigt',
  );
  await expect(page.getByTestId('review-row')).toHaveCount(1);
  await page.goto('./#/today');
  await expect(page.getByTestId('today-review-day')).toHaveCount(0);

  // Earlier days can be reviewed too; the future not.
  await page.goto('./#/reviews/day/2026-10-05');
  await page.getByRole('button', { name: 'Vorheriger Tag' }).click();
  await expect(page).toHaveURL(/#\/reviews\/day\/2026-10-04$/);
  await expect(page.getByRole('button', { name: 'Nächster Tag' })).toBeEnabled();
  await page.goto('./#/reviews/day/2026-10-05');
  await expect(page.getByRole('button', { name: 'Nächster Tag' })).toBeDisabled();

  const dump = await storageDump(page);
  for (const text of ['Lange Lernsession', 'Geheime Notiz', 'Miete überweisen']) {
    expect(dump.indexedDb).not.toContain(text);
    expect(dump.localStorage).not.toContain(text);
  }
  expect(claude).toEqual([]);

  // Everything is still there after locking (last: with the fixed test clock the route
  // transition does not run again after a reload).
  await reloadAndUnlock(page);
  await expect(well.getByTestId('review-point')).toHaveCount(2);
  await expect(page.getByTestId('review-note')).toHaveValue('Geheime Notiz zum Tag');
});

test('weekly review: patterns from the daily reviews, exactly three changes become tasks', async ({
  page,
}) => {
  await page.clock.setFixedTime(SUNDAY_EVENING);
  await openApp(page, '/today');
  await demoData(page, true);

  await page.goto('./#/today');
  await expect(page.getByTestId('today-review-day')).toBeVisible();
  await page.getByTestId('today-review-week-start').click();
  await expect(page).toHaveURL(/#\/reviews\/week\/2026-10-04$/);
  await expect(page.getByTestId('review-week-stats')).toContainText(
    '5 von 7 Tagen mit Tages-Review',
  );
  await expect(page.getByTestId('review-week-days').locator('[data-done="true"]')).toHaveCount(5);

  await page
    .getByTestId('review-patterns')
    .getByRole('button', { name: '„Sport“ lief an 2 Tagen gut' })
    .click();
  await page
    .getByTestId('review-brakes')
    .getByRole('button', { name: '„Handy“ an 2 Tagen unter „Nicht gut“' })
    .click();

  // Exactly three changes.
  await page.getByTestId('review-finish').click();
  await expect(page.getByText('Bitte genau drei Änderungen eintragen.')).toHaveCount(3);
  const changes = page.getByTestId('review-changes');
  await changes.getByRole('button', { name: 'Vor Meetings drei Ziele notieren' }).click();
  await changes.getByRole('button', { name: 'Um 23 Uhr Bildschirm aus' }).click();
  await expect(page.getByTestId('review-change-1')).toHaveValue('Vor Meetings drei Ziele notieren');
  await expect(page.getByTestId('review-change-2')).toHaveValue('Um 23 Uhr Bildschirm aus');
  await page.getByTestId('review-change-3').fill('Sonntags 15 Minuten Wochenplanung');
  await expect(page.getByTestId('review-changes-due')).toHaveText(
    'Werden Aufgaben, fällig am Mo., 05.10.',
  );
  await page.getByTestId('review-finish').click();
  await expect(page.getByTestId('review-completed')).toContainText('Woche abgeschlossen');
  await expect(page.getByTestId('review-week-tasks').locator('li')).toHaveCount(3);

  await page.getByTestId('review-to-tasks').click();
  const tasks = page.getByTestId('task-row');
  await expect(tasks.filter({ hasText: 'Vor Meetings drei Ziele notieren' })).toHaveCount(1);
  await expect(tasks.filter({ hasText: 'Sonntags 15 Minuten Wochenplanung' })).toHaveCount(1);

  // Finishing again updates the tasks instead of adding more.
  await page.goto('./#/reviews/week/2026-10-04');
  await page.getByTestId('review-change-3').fill('Sonntags 20 Minuten Wochenplanung');
  await page.getByTestId('review-finish').click();
  await expect(page.getByTestId('review-completed')).toBeVisible();
  await page.goto('./#/tasks');
  await expect(tasks.filter({ hasText: 'Sonntags 20 Minuten Wochenplanung' })).toHaveCount(1);
  await expect(tasks.filter({ hasText: 'Sonntags 15 Minuten Wochenplanung' })).toHaveCount(0);
  await expect(tasks.filter({ hasText: 'Vor Meetings drei Ziele notieren' })).toHaveCount(1);

  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain('Wochenplanung');
});

test('Claude evaluates day and week only on tap – marked, without task notes', async ({ page }) => {
  await page.clock.setFixedTime(SUNDAY_EVENING);
  const claude = await mockClaude(page, {
    day: {
      gut_gelaufen: ['Wocheneinkauf ohne Stress erledigt'],
      nicht_gut: ['Steuererklärung wieder liegen gelassen'],
      besser_machen: ['Offen: Steuererklärung abschicken'],
    },
    week: {
      muster: ['Sport an mehreren Tagen hilft beim Lernen'],
      bremsen: ['Handy in Reichweite'],
      aenderungen: ['Handy in die Schublade', 'Meetings mit Agenda', 'Sonntags planen', 'Zu viel'],
    },
  });
  await openApp(page, '/settings');
  await enableAi(page);
  await demoData(page, true);

  await page.goto('./#/reviews/day/today');
  await expect(page).toHaveURL(/#\/reviews\/day\/2026-10-04$/);
  await page.getByTestId('review-note').fill('Mein Kopf war voll');
  expect(claude).toEqual([]);
  await page.getByTestId('review-ai-evaluate').click();
  await expect(page.getByTestId('review-proposal')).toContainText(
    'Wocheneinkauf ohne Stress erledigt (Claude)',
  );
  await page.getByTestId('review-ai-accept').click();
  await expect(page.getByTestId('review-went-well').getByTestId('review-point')).toHaveText([
    'Wocheneinkauf ohne Stress erledigt (Claude)',
  ]);
  expect(claude).toHaveLength(1);
  const day = claude[0];
  expect(day?.body.system).toContain('Tages-Review');
  expect(day?.body.output_config).toMatchObject({ format: { type: 'json_schema' } });
  expect(day?.raw).toContain('Mein Kopf war voll');
  expect(day?.raw).toContain('Steuererklärung abschicken');
  expect(day?.raw).not.toContain('Kapitel 2 und 3');

  await page.goto('./#/reviews/week/current');
  await expect(page).toHaveURL(/#\/reviews\/week\/2026-10-04$/);
  await page.getByTestId('review-ai-evaluate').click();
  await page.getByTestId('review-ai-accept').click();
  await expect(page.getByTestId('review-change-1')).toHaveValue('Handy in die Schublade (Claude)');
  await expect(page.getByTestId('review-change-3')).toHaveValue('Sonntags planen (Claude)');
  const week = claude[1];
  expect(week?.body.system).toContain('Wochen-Review');
  expect(week?.raw).toContain('Zu lange am Handy hängen geblieben');
  expect(week?.raw).toContain('Gutes Gefühl nach dem Training.');

  await page.getByTestId('review-finish').click();
  await page.getByTestId('review-to-tasks').click();
  const tasks = page.getByTestId('task-row');
  await expect(tasks.filter({ hasText: 'Handy in die Schublade' })).toHaveCount(1);
  await expect(tasks.filter({ hasText: '(Claude)' })).toHaveCount(0);
});

test('the day review shows the day’s events from Google (in memory only)', async ({
  page,
  context,
}) => {
  await page.clock.setFixedTime(MONDAY_EVENING);
  await mockGoogle(context);
  await openApp(page, '/settings');
  const google = page.getByTestId('settings-google');
  const popup = context.waitForEvent('page');
  await google.getByRole('button', { name: 'Mit Google verbinden' }).click();
  await popup;
  await expect(google.getByTestId('google-status')).toContainText('Verbunden bis');

  await page.goto('./#/reviews/day/2026-10-05');
  const events = page.getByTestId('review-day-events');
  await expect(events).toContainText('2 Termine');
  await expect(events.locator('li')).toHaveText([
    /08:00–09:30\s+Vorlesung Statistik II/,
    /09:35–11:00\s+Projektarbeit/,
  ]);
  await expect(
    page.getByTestId('review-not-well').getByRole('button', {
      name: 'Zwischen „Vorlesung Statistik II“ und „Projektarbeit“ nur 5 Min. Puffer',
    }),
  ).toBeVisible();
  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain('Projektarbeit');
});

test('hardware keyboard: N opens today’s review, W the weekly one', async ({ page }) => {
  await page.clock.setFixedTime(MONDAY_EVENING);
  await openApp(page, '/reviews');
  await page.getByRole('heading', { level: 1, name: 'Reviews' }).click();
  await page.keyboard.press('n');
  await expect(page).toHaveURL(/#\/reviews\/day\/2026-10-05$/);
  await page.goto('./#/reviews');
  await page.getByRole('heading', { level: 1, name: 'Reviews' }).click();
  await page.keyboard.press('w');
  await expect(page).toHaveURL(/#\/reviews\/week\/2026-10-04$/);
});
