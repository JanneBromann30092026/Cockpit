import { expect, test, type Page } from '@playwright/test';
import { enableDevMode, openApp, storageDump } from './vault.ts';

/** Monday, 5 October 2026, 10:20 in Berlin (the iPad profiles use Europe/Berlin). */
const NOW = new Date('2026-10-05T10:20:00+02:00');
const KEY = 'sk-ant-api03-test-0123456789abcdefghijklmnopqrstuvwxyz';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

const PDF = Buffer.from('%PDF-1.4\n% Handyvertrag Beispiel\n%%EOF\n');
/** 1×1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

interface Sent {
  body: Record<string, unknown>;
  raw: string;
}

type Reply =
  { status: number; json?: unknown } | ((sent: Sent) => { status: number; json?: unknown });

/** Mocks api.anthropic.com (preflight included) and records every request body. */
async function mockClaude(page: Page) {
  const sent: Sent[] = [];
  const state: { reply: Reply } = { reply: { status: 500 } };
  await page.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const raw = request.postData() ?? '';
    const entry = { raw, body: JSON.parse(raw) as Record<string, unknown> };
    sent.push(entry);
    const reply = typeof state.reply === 'function' ? state.reply(entry) : state.reply;
    await route.fulfill({
      status: reply.status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(
        reply.json ?? { type: 'error', error: { type: 'api_error', message: 'mock' } },
      ),
    });
  });
  return { sent, state };
}

/** A message whose text is the structured (JSON) answer. */
function message(json: unknown, stopReason = 'end_turn') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text: JSON.stringify(json) }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 900, output_tokens: 120 },
  };
}

async function enableAi(page: Page) {
  await page.goto('./#/settings');
  const ai = page.getByTestId('settings-ai');
  await ai.getByRole('switch', { name: 'KI verwenden' }).click();
  await ai.getByTestId('api-key-input').fill(KEY);
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');
}

async function demoContracts(page: Page) {
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  await page.getByTestId('dev-demo-documents').click();
  await expect(page.getByTestId('dev-demo-count')).toHaveText('6 Demo-Einträge');
  await page.goto('./#/documents');
  await expect(page.getByTestId('document-card')).toHaveCount(6);
}

const lines = (page: Page) => page.getByTestId('ask-line');

async function ask(page: Page, question: string) {
  await page.getByTestId('ask-input').fill(question);
  await page.getByTestId('ask-submit').click();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('questions are answered from the stored fields – without AI nothing is sent', async ({
  page,
}) => {
  const claude = await mockClaude(page);
  await openApp(page, '/documents');
  await demoContracts(page);

  await page.getByRole('button', { name: 'Wann kann ich spätestens kündigen?' }).click();
  await expect(lines(page)).toHaveCount(6);
  await expect(lines(page).nth(0)).toHaveText(
    /^Hausratversicherung\s*Spätestens kündigen bis 11\.10\.2026 \(in 6 Tagen\)$/,
  );
  await expect(lines(page).nth(1)).toContainText('Fitnessstudio');
  await expect(lines(page).nth(1)).toContainText('17.10.2026 (in 12 Tagen)');
  await expect(lines(page).nth(4)).toContainText(
    '„3 Monate zum Monatsende“ – Laufzeitende fehlt, daher nicht berechnet',
  );
  await expect(lines(page).nth(4)).toContainText('offener Punkt');
  await expect(page.getByTestId('ask-answer')).toContainText('im Original prüfen');

  await ask(page, 'Wann ist meine Versicherung fällig?');
  await expect(lines(page)).toHaveCount(1);
  await expect(lines(page)).toContainText('Nächste Zahlung am 11.01.2027 (in 98 Tagen) · 89,40');

  await ask(page, 'Was kosten meine Abos im Monat?');
  await expect(lines(page)).toHaveCount(2);
  await expect(page.getByTestId('ask-total')).toHaveText(
    /Zusammen: 43,89\s€ im Monat · 526,68\s€ im Jahr/,
  );

  await ask(page, 'Wie wird das Wetter?');
  await expect(page.getByTestId('ask-not-understood')).toBeVisible();
  await expect(page.getByTestId('ask-claude')).toHaveCount(0);

  // Every line links to its contract.
  await ask(page, 'Wann endet das Fitnessstudio?');
  await lines(page).getByRole('link', { name: 'Fitnessstudio' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Fitnessstudio' })).toBeVisible();
  expect(claude.sent).toEqual([]);
});

test('Claude answers with sources – only the structured fields are sent', async ({ page }) => {
  const claude = await mockClaude(page);
  await openApp(page, '/settings');
  await enableAi(page);
  await demoContracts(page);

  // A note stays on the iPad.
  await page.getByTestId('document-card').filter({ hasText: 'Mietvertrag' }).click();
  await page.getByTestId('document-edit').click();
  await page.getByTestId('document-notes').fill('Schlüssel liegt bei der Nachbarin');
  await page.getByTestId('document-save').click();
  await page.getByTestId('document-back').click();

  claude.state.reply = ({ body }) => {
    const content = (body.messages as { content: string }[])[0]?.content ?? '{}';
    const contracts = (JSON.parse(content) as { vertraege: { ref: string; name: string }[] })
      .vertraege;
    const gym = contracts.find((contract) => contract.name === 'Fitnessstudio')?.ref;
    return {
      status: 200,
      json: message({
        antwort:
          'Das Fitnessstudio kostet 29,90 € im Monat. Kündigen kannst du bis 17.10.2026 – im Original prüfen.',
        quellen: [gym, 'v99'],
      }),
    };
  };
  await ask(page, 'Lohnt sich das Fitnessstudio noch?');
  await expect(lines(page)).toHaveCount(1);
  expect(claude.sent).toEqual([]);
  await expect(page.getByTestId('documents-ask')).toContainText('keine Notizen, keine Originale');
  await page.getByTestId('ask-claude').click();

  const answer = page.getByTestId('ask-claude-answer');
  await expect(answer).toContainText('Das Fitnessstudio kostet 29,90 € im Monat.');
  await expect(answer).toContainText('(Claude)');
  await expect(answer.getByTestId('ask-claude-source')).toHaveText(['Fitnessstudio']);

  expect(claude.sent).toHaveLength(1);
  const sent = claude.sent[0];
  expect(sent?.body.output_config).toMatchObject({ format: { type: 'json_schema' } });
  expect(sent?.raw).toContain('Lohnt sich das Fitnessstudio noch?');
  expect(sent?.raw).toContain('Hausratversicherung');
  for (const secret of ['Nachbarin', 'Hausrat-Police', 'JVBERi', 'Musterversicherung AG –']) {
    expect(sent?.raw).not.toContain(secret);
  }

  // Errors are shown at the question; a new question starts over.
  claude.state.reply = { status: 429 };
  await ask(page, 'Was kostet das Streaming-Abo?');
  await page.getByTestId('ask-claude').click();
  await expect(page.getByTestId('ask-claude-error')).toHaveText(
    'Zu viele Anfragen – bitte kurz warten und erneut versuchen.',
  );
});

test('reading an original with Claude: warning first, then chosen fields with Claude marks', async ({
  page,
}) => {
  const claude = await mockClaude(page);
  await openApp(page, '/settings');
  await enableAi(page);
  await page.goto('./#/documents');
  await page.getByTestId('documents-file-input').setInputFiles({
    name: 'Handy_Vertrag_2026.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });

  // The contract exists right away (named after the file); nothing is sent before the tap.
  await expect(page.getByRole('heading', { level: 1, name: 'Handy Vertrag 2026' })).toBeVisible();
  const panel = page.getByTestId('extract-panel');
  await expect(panel.getByTestId('extract-warning')).toContainText(
    'Kontonummern, Ausweis- und Versicherungsnummern vorher schwärzen.',
  );
  expect(claude.sent).toEqual([]);

  claude.state.reply = {
    status: 200,
    json: message({
      name: 'Handyvertrag',
      category: 'mobile',
      provider: 'Funknetz Beispiel',
      amount_eur: 19.99,
      interval: 'monthly',
      due_date: null,
      term_end: '2027-03-31',
      notice_period: '1 Monat zum Ende der Mindestlaufzeit',
      summary: ['20 GB Datenvolumen', 'Abbuchung von DE89 3704 0044 0532 0130 00'],
      open_points: ['Nächster Zahlungstermin steht nicht im Dokument'],
    }),
  };
  await page.getByTestId('extract-send').click();

  await expect(panel.getByTestId('extract-fields').getByRole('checkbox')).toHaveCount(7);
  for (const field of ['name', 'category', 'provider', 'amount', 'termEnd', 'noticePeriod']) {
    await expect(panel.getByTestId(`extract-field-${field}`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
  }
  await expect(panel.getByTestId('extract-removed')).toHaveText(
    'Eine Angabe mit einer Nummer hat Cockpit weggelassen.',
  );
  await expect(panel).not.toContainText('DE89');
  await panel.getByTestId('extract-field-provider').click();
  await expect(panel.getByTestId('extract-field-provider')).toHaveAttribute(
    'aria-checked',
    'false',
  );

  // Sent: the PDF as document, today's date – not the file name.
  expect(claude.sent).toHaveLength(1);
  const body = claude.sent[0]?.body as {
    messages: { content: { type: string; source?: { media_type: string; data: string } }[] }[];
  };
  const content = body.messages[0]?.content ?? [];
  expect(content[0]).toMatchObject({
    type: 'document',
    source: { media_type: 'application/pdf', data: PDF.toString('base64') },
  });
  expect(JSON.stringify(content[1])).toContain('2026-10-05');
  expect(claude.sent[0]?.raw).not.toContain('Handy_Vertrag');

  await page.getByTestId('extract-apply').click();
  await expect(page.getByText('Übernommen – bitte im Original prüfen')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Handyvertrag' })).toBeVisible();
  await expect(page.getByTestId('ai-mark-hint')).toBeVisible();
  await expect(page.getByTestId('ai-mark')).toHaveCount(4);
  await expect(page.getByTestId('document-cancel-by')).toContainText('28.02.2027');
  await expect(page.getByTestId('document-summary-list')).toContainText(
    '20 GB Datenvolumen (Claude)',
  );
  await expect(page.getByTestId('document-open-points-list')).toContainText(
    'Nächster Zahlungstermin',
  );
  await expect(page.getByTestId('document-overview')).toContainText('19,99');
  await expect(page.getByTestId('document-overview')).not.toContainText('Funknetz');

  // Changing a value by hand removes its mark.
  await page.getByTestId('document-edit').click();
  await page.getByTestId('document-term-end').fill('2027-04-30');
  await page.getByTestId('document-save').click();
  await expect(page.getByTestId('ai-mark')).toHaveCount(3);

  const dump = await storageDump(page);
  for (const text of ['Handyvertrag', 'Datenvolumen', 'Mindestlaufzeit']) {
    expect(dump.indexedDb).not.toContain(text);
  }
});

test('photos are sent as JPEG; errors can be retried', async ({ page }) => {
  const claude = await mockClaude(page);
  await openApp(page, '/settings');
  await enableAi(page);
  await page.goto('./#/documents');
  await page.getByTestId('documents-file-input').setInputFiles({
    name: 'IMG_0815.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  const panel = page.getByTestId('extract-panel');
  // Same answer for the SDK's own retry.
  claude.state.reply = { status: 529 };
  await page.getByTestId('extract-send').click();
  await expect(panel.getByTestId('extract-error')).toHaveText(
    'Anthropic ist gerade überlastet – bitte gleich noch einmal versuchen.',
  );

  claude.state.reply = {
    status: 200,
    json: message({
      name: null,
      category: null,
      provider: null,
      amount_eur: null,
      interval: null,
      due_date: null,
      term_end: null,
      notice_period: null,
      summary: [],
      open_points: [],
    }),
  };
  await page.getByTestId('extract-retry').click();
  await expect(panel).toContainText('keine neuen Vertragsangaben');
  await expect(page.getByTestId('extract-apply')).toHaveCount(0);

  const last = claude.sent.at(-1)?.body as {
    messages: { content: { type: string; source?: { media_type: string; data: string } }[] }[];
  };
  const image = last.messages[0]?.content[0];
  expect(image?.type).toBe('image');
  expect(image?.source?.media_type).toBe('image/jpeg');
  expect(image?.source?.data.startsWith('/9j/')).toBe(true);
});

test('without AI an original creates a contract and opens the editor', async ({ page }) => {
  const claude = await mockClaude(page);
  await openApp(page, '/documents');
  await page.getByTestId('documents-file-input').setInputFiles({
    name: 'Scan_0815.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  const editor = page.getByTestId('document-editor');
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('document-name')).toHaveValue('Scan 0815');
  await editor.getByTestId('document-name').fill('Handyvertrag');
  await page.getByTestId('document-save').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Handyvertrag' })).toBeVisible();
  await expect(page.getByTestId('file-tile')).toHaveCount(1);
  await expect(page.getByTestId('file-extract')).toHaveCount(0);
  expect(claude.sent).toEqual([]);
});
