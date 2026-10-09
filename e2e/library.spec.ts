import { expect, test, type Page } from '@playwright/test';
import { enableDevMode, openApp, reloadAndUnlock, storageDump } from './vault.ts';

const KEY = 'sk-ant-api03-test-0123456789abcdefghijklmnopqrstuvwxyz';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

interface Sent {
  body: { system?: unknown; messages: { content: string }[] };
  raw: string;
}

/** Mocks api.anthropic.com (preflight included); every request body is recorded. */
async function mockClaude(page: Page, reply: (sent: Sent) => unknown) {
  const sent: Sent[] = [];
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const raw = request.postData() ?? '';
    const entry = { raw, body: JSON.parse(raw) as Sent['body'] };
    sent.push(entry);
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5-20251001',
        content: [{ type: 'text', text: JSON.stringify(reply(entry)) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 500, output_tokens: 80 },
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

async function demoLibrary(page: Page) {
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  await page.getByTestId('dev-demo-library').click();
  await expect(page.getByTestId('dev-demo-count')).toHaveText('9 Demo-Einträge');
  await page.goto('./#/library');
  await expect(page.getByTestId('library-card')).toHaveCount(9);
}

const cards = (page: Page) => page.getByTestId('library-card');
const editor = (page: Page) => page.getByTestId('library-editor');

test('add, open, edit and delete an entry (with undo) – stored encrypted', async ({ page }) => {
  await openApp(page, '/library');
  await expect(page.getByText('Deine Bibliothek ist noch leer')).toBeVisible();
  await page.getByTestId('library-add').click();
  await editor(page).getByTestId('library-title').fill('Atomic Habits');
  await editor(page).getByTestId('library-author').fill('James Clear');
  await editor(page).getByTestId('library-link').fill('kein link');
  const topics = editor(page).getByLabel('Themen');
  await topics.fill('Gewohnheiten');
  await topics.press('Enter');
  await topics.fill('Fokus,');
  await editor(page)
    .getByTestId('library-key-points')
    .fill('Kleine Schritte summieren sich.\nSysteme schlagen Ziele.');
  await editor(page).getByTestId('library-thoughts').fill('Handy abends in die Küche legen.');
  await page.getByTestId('library-save').click();
  await expect(editor(page)).toContainText('vollständigen Link');
  await editor(page).getByTestId('library-link').fill('https://jamesclear.com/atomic-habits');
  await page.getByTestId('library-save').click();
  await expect(page.getByText('„Atomic Habits“ gespeichert')).toBeVisible();

  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByTestId('library-summary')).toHaveText('1 Eintrag · 1 dieses Jahr');
  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain('Atomic');
  expect(dump.indexedDb).not.toContain('Küche');

  await cards(page).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Atomic Habits' })).toBeVisible();
  await expect(page.getByTestId('library-source')).toContainText('James Clear · Buch');
  await expect(page.getByTestId('library-point')).toHaveText([
    'Kleine Schritte summieren sich.',
    'Systeme schlagen Ziele.',
  ]);
  await expect(page.getByTestId('library-topics')).toContainText('#Gewohnheiten');
  await expect(page.getByTestId('library-topics')).toContainText('#Fokus');
  await expect(page.getByTestId('library-open-link')).toHaveAttribute(
    'href',
    'https://jamesclear.com/atomic-habits',
  );

  await page.getByTestId('library-edit').click();
  await editor(page).getByTestId('library-type').selectOption('podcast');
  await page.getByTestId('library-save').click();
  await expect(page.getByTestId('library-source')).toContainText('Podcast');

  await page.getByTestId('library-delete').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bibliothek' })).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(cards(page)).toHaveCount(1);
});

test('catch up with a list: headings, links, dates, duplicates, type per entry', async ({
  page,
}) => {
  await openApp(page, '/library');
  await page.getByTestId('library-import-empty').click();
  await page
    .getByTestId('import-text')
    .fill(
      [
        'Bücher:',
        '- Atomic Habits – James Clear #Gewohnheiten',
        '- Sapiens von Yuval Noah Harari 12.03.2026',
        'Podcast: Hard Fork | NYT',
        'https://youtu.be/abc123 #KI',
        '- 01.01.2026',
      ].join('\n'),
    );
  await page.getByTestId('import-recognize').click();
  await expect(page.getByTestId('import-count')).toHaveText('4 Einträge erkannt');
  const rows = page.getByTestId('import-row');
  await expect(rows.nth(1)).toContainText('Yuval Noah Harari · 12.03.2026');
  await expect(rows.nth(3).getByTestId('import-type')).toHaveValue('video');
  // Change a type and leave one out.
  await rows.nth(2).getByTestId('import-type').selectOption('article');
  await rows.nth(0).getByTestId('import-include').click();
  await expect(page.getByTestId('import-apply')).toHaveText('3 Einträge übernehmen');
  await page.getByTestId('import-apply').click();
  await expect(page.getByText('3 Einträge nachgetragen')).toBeVisible();
  await expect(cards(page)).toHaveCount(3);

  // The same list again: what is already there is marked and left out.
  await page.getByTestId('library-import-open').click();
  await page
    .getByTestId('import-text')
    .fill('Sapiens – Yuval Noah Harari\nDeep Work – Cal Newport');
  await page.getByTestId('import-recognize').click();
  await expect(rows.nth(0)).toContainText('Schon in der Bibliothek');
  await expect(rows.nth(0).getByTestId('import-include')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('import-apply')).toHaveText('1 Eintrag übernehmen');
  await page.getByTestId('import-apply').click();
  await expect(cards(page)).toHaveCount(4);
});

test('search, types and topics; questions answered with sources – without AI', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('anthropic')) requests.push(request.url());
  });
  await openApp(page);
  await demoLibrary(page);
  await expect(page.getByTestId('library-summary')).toContainText('9 Einträge');

  await page.getByTestId('library-search').fill('newport');
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page)).toContainText('Deep Work');
  await page.getByTestId('library-search').fill('');
  await page.getByRole('button', { name: 'Podcasts · 2' }).click();
  await expect(cards(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Alle', exact: true }).click();
  await page.getByTestId('library-topic-filter').getByRole('button', { name: '#Studium' }).click();
  await expect(cards(page)).toHaveCount(3);
  await page
    .getByTestId('library-topic-filter')
    .getByRole('button', { name: 'Alle Themen' })
    .click();

  // A question: key points quoted with their entry.
  await page.getByTestId('library-ask-input').fill('Was habe ich zu Gewohnheiten gelernt?');
  await page.getByTestId('library-ask-submit').click();
  const atomic = page.getByTestId('library-answer-item').filter({ hasText: 'Atomic Habits' });
  await expect(atomic).toContainText('James Clear · Buch');
  await expect(atomic.getByTestId('library-answer-point')).toHaveText([
    'Gewohnheiten an bestehende Routinen hängen („Nach dem Kaffee …“).',
  ]);
  await expect(page.getByTestId('library-answer')).toContainText('Hard Fork');
  // No Claude without AI.
  await expect(page.getByTestId('library-ask-claude')).toHaveCount(0);

  await page.getByTestId('library-answer-show-all').click();
  await expect(page.getByTestId('library-search')).toHaveValue('gewohnheiten');
  await expect(cards(page)).toHaveCount(2);

  await page.getByTestId('library-ask-input').fill('Was habe ich über Kochen gelernt?');
  await page.getByTestId('library-ask-submit').click();
  await expect(page.getByTestId('library-answer-nothing')).toHaveText(
    'Zu „kochen“ steht noch nichts in deiner Bibliothek.',
  );

  // A topic on the detail page leads to all entries with it.
  await page.getByTestId('library-search').fill('');
  await cards(page).filter({ hasText: 'Deep Work' }).click();
  await page.getByTestId('library-topics').getByRole('link', { name: /Fokus/ }).click();
  await expect(page).toHaveURL(/#\/library\?topic=Fokus$/);
  await expect(cards(page)).toHaveCount(1);
  expect(requests).toEqual([]);
});

test('Claude: answer with sources, list parsing and key points – only what is needed', async ({
  page,
}) => {
  const sent = await mockClaude(page, (request) => {
    const system = JSON.stringify(request.body.system);
    if (system.includes('Fragen einer Person')) {
      const { eintraege } = JSON.parse(request.body.messages[0]?.content ?? '{}') as {
        eintraege: { ref: string; titel: string }[];
      };
      const atomic = eintraege.find((entry) => entry.titel === 'Atomic Habits');
      return { antwort: 'Kleine Schritte und feste Routinen.', quellen: [atomic?.ref, 'b99'] };
    }
    if (system.includes('frei geschriebene Liste')) {
      return {
        eintraege: [
          {
            titel: 'Thinking, Fast and Slow',
            typ: 'book',
            autor: 'Daniel Kahneman',
            link: null,
            datum: null,
            themen: ['Psychologie'],
          },
        ],
      };
    }
    return { kernaussagen: ['Fokusblöcke am Morgen schützen.'] };
  });
  await openApp(page);
  await enableAi(page);
  await demoLibrary(page);

  await page.getByTestId('library-ask-input').fill('Was habe ich zu Gewohnheiten gelernt?');
  await page.getByTestId('library-ask-submit').click();
  await expect(page.getByTestId('library-ask-claude')).toBeVisible();
  expect(sent).toHaveLength(0);
  await page.getByTestId('library-ask-claude').click();
  await expect(page.getByTestId('library-claude-answer')).toContainText(
    'Kleine Schritte und feste Routinen.',
  );
  // Unknown refs are dropped.
  await expect(page.getByTestId('library-claude-source')).toHaveText(['Atomic Habits']);
  const question = sent[0]?.raw ?? '';
  expect(question).toContain('Gewohnheiten');
  expect(question).not.toContain('Küche'); // my thoughts stay on the iPad
  expect(question).not.toContain('youtube.com'); // no links

  // A free-written list.
  await page.getByTestId('library-import-open').click();
  await page
    .getByTestId('import-text')
    .fill('Das Kahneman-Buch übers schnelle und langsame Denken');
  await page.getByTestId('import-claude').click();
  await expect(page.getByTestId('import-count')).toHaveText('1 Eintrag erkannt');
  await expect(page.getByTestId('library-import')).toContainText('Von Claude aufbereitet');
  expect(sent[1]?.raw).toContain('Kahneman-Buch');
  await page.getByTestId('import-apply').click();
  await expect(cards(page).filter({ hasText: 'Thinking, Fast and Slow' })).toHaveCount(1);

  // Key points from my thoughts.
  await cards(page).filter({ hasText: 'Thinking, Fast and Slow' }).click();
  await page.getByTestId('library-edit').click();
  await editor(page).getByTestId('library-thoughts').fill('Morgens zuerst die schwerste Sache.');
  await editor(page).getByTestId('library-from-thoughts').click();
  await expect(editor(page).getByTestId('library-key-points')).toHaveValue(
    'Fokusblöcke am Morgen schützen.',
  );
  const keyPoints = JSON.parse(sent[2]?.body.messages[0]?.content ?? '{}') as Record<
    string,
    unknown
  >;
  expect(keyPoints).toEqual({
    titel: 'Thinking, Fast and Slow',
    typ: 'Buch',
    autor: 'Daniel Kahneman',
    gedanken: 'Morgens zuerst die schwerste Sache.',
  });
  await page.getByTestId('library-save').click();
  await expect(page.getByTestId('library-point')).toHaveText([
    'Fokusblöcke am Morgen schützen.(Claude)',
  ]);
  await expect(page.getByTestId('library-key-points-section')).toContainText(
    'aus deinen Gedanken formuliert',
  );
  expect(sent).toHaveLength(3);
});

test('keyboard: N new entry, L list; entries survive a reload', async ({ page }) => {
  await openApp(page, '/library');
  await page.keyboard.press('n');
  await expect(editor(page)).toBeVisible();
  await editor(page).getByTestId('library-title').fill('Deep Work');
  await page.getByTestId('library-save').click();
  await expect(cards(page)).toHaveCount(1);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('l');
  await expect(page.getByTestId('library-import')).toBeVisible();
  await page.keyboard.press('Escape');
  await reloadAndUnlock(page);
  await page.goto('./#/library');
  await expect(cards(page)).toHaveCount(1);
});
