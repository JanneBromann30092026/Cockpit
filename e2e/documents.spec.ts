import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { enableDevMode, openApp, reloadAndUnlock, storageDump } from './vault.ts';

/** Monday, 5 October 2026, 10:20 in Berlin (the iPad profiles use Europe/Berlin). */
const NOW = new Date('2026-10-05T10:20:00+02:00');

/** 1×1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n% Geheimer Vertragstext\n%%EOF\n');

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

const editor = (page: Page) => page.getByTestId('document-editor');

async function createGym(page: Page) {
  await page.getByTestId('documents-add').click();
  await editor(page).getByTestId('document-name').fill('Fitnessstudio');
  await editor(page).getByTestId('document-category').selectOption('subscription');
  await editor(page).getByTestId('document-provider').fill('Studio Beispiel');
  await editor(page).getByTestId('document-amount').fill('29,90');
  await editor(page).getByTestId('document-interval').selectOption('monthly');
  await editor(page).getByTestId('document-due').fill('2026-10-17');
  await editor(page).getByTestId('document-term-end').fill('2026-11-14');
  await editor(page).getByTestId('document-notice-text').fill('4 Wochen zum Ende der Laufzeit');
  await expect(editor(page).getByTestId('document-notice-amount')).toHaveValue('4');
  await expect(editor(page).getByTestId('document-notice-unit')).toHaveValue('weeks');
  await expect(editor(page).getByTestId('document-notice-preview')).toHaveText(
    'Spätestens kündigen bis: 17.10.2026',
  );
  await editor(page)
    .getByTestId('document-summary')
    .fill('Mindestlaufzeit 12 Monate\nDanach monatlich kündbar');
  await editor(page).getByTestId('document-open-points').fill('Gilt eine Aufnahmegebühr?');
  await page.getByTestId('document-save').click();
  await expect(page.getByText('„Fitnessstudio“ angelegt')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('a contract with notice period: latest cancel day, costs, "Heute" – encrypted', async ({
  page,
}) => {
  const problems = collectConsoleProblems(page);
  await openApp(page, '/documents');
  await expect(page.getByText('Noch keine Verträge')).toBeVisible();

  // Validation: name and amount.
  await page.getByTestId('documents-add').click();
  await editor(page).getByTestId('document-amount').fill('zwölf');
  await page.getByTestId('document-save').click();
  await expect(editor(page).getByText('Bitte einen Namen eingeben.')).toBeVisible();
  await expect(editor(page).getByText('Bitte einen Betrag wie 19,99 eingeben.')).toBeVisible();
  await page.getByRole('button', { name: 'Abbrechen' }).click();

  await createGym(page);
  await expect(page.getByTestId('documents-summary')).toHaveText(
    /1 Vertrag · 29,90\s€ im Monat · 358,80\s€ im Jahr/,
  );
  const upcoming = page.getByTestId('documents-upcoming');
  await expect(upcoming.getByTestId('deadline')).toHaveCount(1);
  await expect(upcoming).toContainText('Kündigen bis');
  await expect(upcoming).toContainText('in 12 Tagen');
  await expect(page.getByTestId('document-card')).toContainText('Kündigen bis Sa., 17.10.');
  await expect(page.getByTestId('document-card')).toContainText('1 offener Punkt');

  await page.getByTestId('document-card').click();
  const cancel = page.getByTestId('document-cancel-by');
  await expect(cancel).toContainText('17.10.2026');
  await expect(cancel).toContainText('(in 12 Tagen)');
  await expect(cancel).toContainText('4 Wochen vor Laufzeitende (14.11.2026)');
  await expect(page.getByTestId('document-check-original')).toContainText('im Original prüfen');
  await expect(page.getByTestId('document-next-payment')).toHaveText('17.10.2026');
  await expect(page.getByTestId('document-summary-list')).toContainText('Danach monatlich kündbar');
  await expect(page.getByTestId('document-open-points-list')).toContainText('Aufnahmegebühr');

  // "Heute": the deadline card.
  await page.getByTestId('document-back').click();
  await page.getByTestId('documents-search').blur();
  await page.keyboard.press('1');
  await expect(page.getByTestId('today-deadlines').getByTestId('deadline')).toHaveCount(1);
  await expect(page.getByTestId('today-deadlines')).toContainText('Fitnessstudio');

  const dump = await storageDump(page);
  for (const text of ['Fitnessstudio', 'Studio Beispiel', 'Aufnahmegebühr']) {
    expect(dump.indexedDb).not.toContain(text);
    expect(dump.localStorage).not.toContain(text);
  }
  expect(problems).toEqual([]);
});

test('originals: attach, view, keep after unlocking, remove – stored encrypted', async ({
  page,
}) => {
  await openApp(page, '/documents');
  await createGym(page);
  await page.getByTestId('document-card').click();
  await page.getByTestId('file-input').setInputFiles([
    { name: 'Vertrag.pdf', mimeType: 'application/pdf', buffer: PDF },
    { name: 'Karte.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await expect(page.getByTestId('file-tile')).toHaveCount(2);
  await expect(page.getByText('„Karte.png“ verschlüsselt gespeichert')).toBeVisible();

  // Rejected type.
  await page.getByTestId('file-input').setInputFiles({
    name: 'Programm.exe',
    mimeType: 'application/x-msdownload',
    buffer: Buffer.from('MZ'),
  });
  await expect(page.getByText('Nur PDFs und Fotos (JPEG, PNG, HEIC) sind möglich.')).toBeVisible();
  await expect(page.getByTestId('file-tile')).toHaveCount(2);

  // Encrypted at rest: neither content nor names are readable.
  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain('Geheimer Vertragstext');
  expect(dump.indexedDb).not.toContain('Karte.png');

  // Still readable after locking and unlocking.
  await reloadAndUnlock(page);
  await expect(page.getByTestId('file-tile')).toHaveCount(2);
  await page.getByRole('button', { name: 'Öffnen: Karte.png' }).click();
  const viewer = page.getByTestId('file-viewer');
  await expect(viewer.getByTestId('file-image')).toBeVisible();
  await expect
    .poll(() =>
      viewer.getByTestId('file-image').evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBe(1);
  await viewer.getByTestId('file-close').click();
  await page.getByRole('button', { name: 'Öffnen: Vertrag.pdf' }).click();
  await expect(page.getByTestId('file-pdf')).toHaveAttribute('src', /^blob:/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('file-viewer')).toHaveCount(0);

  // Remove one original.
  await page
    .getByTestId('file-tile')
    .filter({ hasText: 'Karte.png' })
    .getByRole('button', { name: 'Aktionen für „Karte.png“' })
    .click();
  await page.getByRole('menuitem', { name: 'Entfernen' }).click();
  await page
    .getByRole('alertdialog', { name: 'Original entfernen?' })
    .getByRole('button', { name: 'Entfernen' })
    .click();
  await expect(page.getByTestId('file-tile')).toHaveCount(1);

  // Deleting the contract deletes its originals.
  await page.getByTestId('document-menu').click();
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Vertrag löschen?' });
  await expect(confirm).toContainText('sein Original');
  await confirm.getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Noch keine Verträge')).toBeVisible();
  const files = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('cockpit');
      request.onsuccess = () => resolve(request.result);
    });
    const count = await new Promise<number>((resolve) => {
      const request = db.transaction('files').objectStore('files').count();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return count;
  });
  expect(files).toBe(0);
});

test('calendar export: only cancel dates and term ends, no amounts', async ({ page }) => {
  await openApp(page, '/documents');
  await createGym(page);
  await page.getByTestId('documents-export').click();
  const preview = page.getByTestId('calendar-preview');
  await expect(preview.locator('li')).toHaveText([
    /Sa\., 17\.10\.\s*Kündigen bis: Fitnessstudio/,
    /Sa\., 14\.11\.\s*Laufzeit endet: Fitnessstudio/,
  ]);
  const download = page.waitForEvent('download');
  await page.getByTestId('calendar-download').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('cockpit-fristen.ics');
  const ics = readFileSync(await file.path(), 'utf8');
  expect(ics).toContain('SUMMARY:Kündigen bis: Fitnessstudio');
  expect(ics).toContain('DTSTART;VALUE=DATE:20261017');
  expect(ics).not.toContain('29,90');
  expect(ics).not.toContain('Zahlung');
});

test('demo contracts: search, categories, overview focus on a close cancel date', async ({
  page,
}) => {
  await openApp(page, '/documents');
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  await page.getByTestId('dev-demo-documents').click();
  await expect(page.getByTestId('dev-demo-count')).toHaveText('6 Demo-Einträge');
  await page.goto('./#/documents');
  await expect(page.getByTestId('document-card')).toHaveCount(6);
  await page.getByTestId('documents-search').fill('beispiel gmbh');
  await expect(page.getByTestId('document-card')).toHaveCount(1);
  await expect(page.getByTestId('document-card')).toContainText('Mietvertrag');
  await page.getByTestId('documents-search').fill('');
  await page.getByRole('button', { name: 'Abo', exact: true }).click();
  await expect(page.getByTestId('document-card')).toHaveCount(2);

  await page.goto('./#/today');
  await expect(page.getByTestId('overview-sentence').first()).toHaveText(
    'Frist: „Hausratversicherung“ kannst du nur noch bis So., 11.10. kündigen (im Original prüfen).',
  );
  const deadlines = page.getByTestId('today-deadlines').getByTestId('deadline');
  await expect(deadlines).toHaveCount(3);
});

test('hardware keyboard: N opens a new contract', async ({ page }) => {
  await openApp(page, '/documents');
  await page.getByRole('heading', { level: 1, name: 'Verträge' }).click();
  await page.keyboard.press('n');
  await expect(editor(page)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Neuer Vertrag' })).toBeVisible();
});
