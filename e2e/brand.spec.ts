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

const ANSWERS = [
  'Ich studiere BWL und mache YouTube-Videos über Lernen.',
  'Studierende mit Nebenjob.',
  'Ehrliche Systeme für Studium und Job.',
  'Ich zeige auch, was nicht klappt.',
  'Ehrlichkeit, Leichtigkeit, Neugier',
  'Locker und direkt, aber ruhig.',
  'Hey du, Schritt für Schritt',
  'Hustle, Gamechanger',
  'Du musst nicht alles schaffen. Fang heute an.',
  'Grün und natürlich.',
];

async function answerAll(page: Page) {
  for (const [index, answer] of ANSWERS.entries()) {
    await expect(page.getByTestId('interview-progress')).toHaveText(`Frage ${index + 1} von 10`);
    await page.getByTestId('interview-answer').fill(answer);
    if (index < ANSWERS.length - 1) await page.getByTestId('interview-next').click();
  }
  await page.getByTestId('interview-finish').click();
  await expect(page.getByTestId('brand-page')).toBeVisible();
}

test('interview → profile and design by rules, stored encrypted', async ({ page }) => {
  await openApp(page, '/brand');
  await page.getByTestId('brand-start').click();
  await expect(page.getByTestId('interview-question')).toHaveText('Wer bist du und was machst du?');
  // Skip and come back.
  await page.getByTestId('interview-skip').click();
  await expect(page.getByTestId('interview-progress')).toHaveText('Frage 2 von 10');
  await page.getByTestId('interview-back').click();
  await answerAll(page);

  const profile = page.getByTestId('brand-profile');
  await expect(profile.getByTestId('brand-part-tone')).toContainText(
    'Locker und direkt, aber ruhig.',
  );
  await expect(profile.getByTestId('brand-part-values')).toContainText('Leichtigkeit');
  await expect(profile.getByTestId('brand-part-words-avoided')).toContainText('Gamechanger');
  await expect(profile.getByTestId('brand-part-examples')).toContainText('Fang heute an.');
  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain('Leichtigkeit');
  expect(dump.indexedDb).not.toContain('Nebenjob');

  // "grün" → forest palette, contrast checks all fine.
  await page.getByRole('radio', { name: 'Design' }).click();
  await expect(page.getByTestId('brand-swatch').first()).toContainText('#166534');
  await expect(page.getByTestId('brand-contrast')).not.toContainText('zu schwach');

  // Edit the design: an unreadable text colour is flagged.
  await page.getByTestId('brand-design-edit').click();
  await page.getByTestId('brand-hex-text').fill('#eeeeee');
  await page.getByTestId('brand-heading-font').selectOption('didot');
  await page.getByTestId('brand-design-save').click();
  await expect(page.getByTestId('brand-contrast')).toContainText('zu schwach');
  await expect(page.getByTestId('brand-heading-font-name')).toHaveText('Didot');

  await reloadAndUnlock(page);
  await page.goto('./#/brand?tab=design');
  await expect(page.getByTestId('brand-heading-font-name')).toHaveText('Didot');
});

test('an interview can be continued and finished early; profile edits and restart', async ({
  page,
}) => {
  await openApp(page, '/brand');
  await page.getByTestId('brand-start').click();
  await page.getByTestId('interview-answer').fill('Ich mache Videos.');
  await page.getByTestId('interview-next').click();
  await page.getByTestId('interview-close').click();
  await expect(page.getByTestId('brand-continue')).toContainText('1 von 10 Fragen');
  await page.getByTestId('brand-continue-link').click();
  await expect(page.getByTestId('interview-progress')).toHaveText('Frage 2 von 10');
  await page.getByTestId('interview-close').click();
  await page.getByTestId('brand-finish-now').click();
  await expect(page.getByTestId('brand-page')).toBeVisible();

  await page.getByTestId('brand-profile-edit').click();
  await page.getByTestId('brand-tone').fill('Ruhig und klar.');
  const values = page.getByTestId('brand-profile-editor').getByLabel('Werte');
  await values.fill('Klarheit,');
  await page.getByTestId('brand-profile-save').click();
  await expect(page.getByTestId('brand-part-tone')).toContainText('Ruhig und klar.');
  await expect(page.getByTestId('brand-part-values')).toContainText('Klarheit');

  await page.getByTestId('brand-restart').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByTestId('brand-start')).toBeVisible();
});

test('build without AI: template with placeholders, avoided words, saved texts', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('anthropic')) requests.push(request.url());
  });
  await openApp(page);
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  await page.getByTestId('dev-demo-brand').click();
  await page.goto('./#/brand?tab=build');
  await expect(page.getByTestId('brand-write-claude')).toHaveCount(0);
  await page.getByTestId('brand-template').click();
  await expect(page.getByTestId('brand-build')).toContainText('Bitte ein Thema eingeben.');
  await page.getByTestId('brand-topic').fill('Lernen neben dem Job');
  await page.getByTestId('brand-cta').fill('Abonnieren');
  await page.getByTestId('brand-template').click();
  const text = page.getByTestId('brand-result-text');
  await expect(text).toHaveValue(/Titel: Lernen neben dem Job/);
  await expect(text).toHaveValue(/HOOK \(0–10 s\)\nDu musst nicht alles schaffen\./);
  await expect(text).toHaveValue(/\[Punkt 2\]/);
  await expect(text).toHaveValue(/Abonnieren/);
  // A word from "nie benutzen" is pointed out.
  await text.fill('Das ist ein echter Gamechanger.');
  await expect(page.getByTestId('brand-avoided')).toContainText('Gamechanger');
  await page.getByTestId('brand-copy').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'Das ist ein echter Gamechanger.',
  );
  await page.getByTestId('brand-save-draft').click();
  await expect(page.getByTestId('brand-draft')).toHaveCount(1);
  await expect(page.getByTestId('brand-draft')).toContainText('Lernen neben dem Job');

  // The brand kit as text.
  await page.getByRole('radio', { name: 'Profil' }).click();
  await page.getByTestId('brand-copy-kit').click();
  const kit = await page.evaluate(() => navigator.clipboard.readText());
  expect(kit).toContain('# Brand-Kit');
  expect(kit).toContain('- Hauptfarbe: #1d4ed8');
  expect(kit).toContain('Gamechanger');
  expect(requests).toEqual([]);
});

test('Claude: profile from the answers, texts in the voice – only on tap', async ({ page }) => {
  const sent = await mockClaude(page, (request) => {
    const system = JSON.stringify(request.body.system);
    if (system.includes('Markenprofil einer Person')) {
      return {
        tonalitaet: 'Du klingst wie ein ehrlicher Freund.',
        werte: ['Ehrlichkeit', 'Leichtigkeit', 'Neugier'],
        woerter_nutzen: ['Hey du'],
        woerter_nie: ['Hustle'],
        beispielsaetze: ['Du musst nicht alles schaffen.', 'Klein anfangen.', 'Heute zählt.'],
        palette: {
          primary: '#1d4ed8',
          secondary: '#0f172a',
          accent: '#f5c400',
          background: '#ffffff',
          text: '#0f172a',
        },
        schrift_ueberschrift: 'futura',
        schrift_text: 'avenir',
      };
    }
    return { text: 'HOOK\nHey du, kennst du das?\n\nOUTRO\nBis bald.' };
  });
  await openApp(page);
  await enableAi(page);
  await page.goto('./#/brand');
  await page.getByTestId('brand-start').click();
  await answerAll(page);
  expect(sent).toHaveLength(0);

  await page.getByTestId('brand-profile-claude').click();
  await expect(page.getByTestId('brand-part-tone')).toContainText('ehrlicher Freund');
  await expect(page.getByTestId('brand-part-tone')).toContainText('(Claude)');
  const profileRequest = sent[0]?.raw ?? '';
  expect(profileRequest).toContain('Studierende mit Nebenjob.');
  await page.getByRole('radio', { name: 'Design' }).click();
  await expect(page.getByTestId('brand-heading-font-name')).toHaveText('Futura');

  await page.getByRole('radio', { name: 'Damit bauen' }).click();
  await page.getByRole('button', { name: 'Instagram-Post' }).click();
  await page.getByTestId('brand-topic').fill('Lernen neben dem Job');
  await page.getByTestId('brand-write-claude').click();
  await expect(page.getByTestId('brand-result')).toContainText('(Claude)');
  await expect(page.getByTestId('brand-result-text')).toHaveValue(/Hey du, kennst du das\?/);
  const write = JSON.parse(sent[1]?.body.messages[0]?.content ?? '{}') as Record<string, unknown>;
  expect(write).toMatchObject({ format: 'instagram', thema: 'Lernen neben dem Job' });
  expect(JSON.stringify(write)).toContain('Hustle');
  expect(sent).toHaveLength(2);
});
