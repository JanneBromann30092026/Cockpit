import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { TEST_PASSWORD } from './ipad.ts';
import { enableDevMode, openApp, setupVault, storageDump } from './vault.ts';

const NEW_PASSWORD = 'Neues iPad Passwort 2026';

async function addTask(page: Page, title: string) {
  await page.goto('./#/tasks');
  await page.getByTestId('quick-add-input').fill(title);
  await page.getByTestId('quick-add-input').press('Enter');
  await expect(page.getByTestId('task-row').filter({ hasText: title })).toBeVisible();
  await page.getByTestId('quick-add-input').blur();
}

/** Creates a backup in the settings and returns the downloaded file's text and path. */
async function createBackupFile(page: Page): Promise<{ text: string; path: string }> {
  await page.goto('./#/settings');
  const section = page.getByTestId('settings-backup');
  await expect(section.getByTestId('backup-last')).toHaveText('Noch keins');
  await section.getByTestId('backup-create').click();
  await expect(section.getByTestId('backup-ready')).toBeVisible();
  const download = page.waitForEvent('download');
  await section.getByTestId('backup-save').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^Cockpit-Backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  await expect(section.getByTestId('backup-last')).toContainText('heute');
  return { text: await readFile(path, 'utf8'), path };
}

test('backup: only ciphertext, restored on a "new iPad" with another password', async ({
  page,
  browser,
}, testInfo) => {
  await openApp(page);
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  await page.getByTestId('dev-demo-documents').click();
  await page.getByTestId('dev-demo-library').click();
  await expect(page.getByTestId('dev-demo-count')).not.toHaveText(/^0/);
  await addTask(page, 'Steuererklärung abschicken');
  // The API key never goes into a backup.
  await page.goto('./#/settings');
  const ai = page.getByTestId('settings-ai');
  await ai.getByRole('switch', { name: 'KI verwenden' }).click();
  await ai.getByTestId('api-key-input').fill('sk-ant-api03-backup-test-0123456789abcdef');
  await ai.getByRole('button', { name: 'Key speichern' }).click();
  await expect(ai.getByTestId('api-key-status')).toHaveText('Key hinterlegt');

  const { text, path } = await createBackupFile(page);
  expect(text).toContain('"format":"cockpit-backup"');
  expect(text).not.toContain('Steuererklärung');
  expect(text).not.toContain('Hausrat');
  expect(text).not.toContain('sk-ant');
  expect(text).not.toContain('%PDF');
  const parsed = JSON.parse(text) as { files: unknown[]; tables: { tasks: unknown[] } };
  expect(parsed.files.length).toBeGreaterThan(0);
  expect(parsed.tables.tasks).toHaveLength(1);

  // A new device: other password, empty database.
  const other = await browser.newContext(testInfo.project.use);
  const fresh = await other.newPage();
  await fresh.goto('./');
  await setupVault(fresh, NEW_PASSWORD);
  await fresh.goto('./#/settings');
  const section = fresh.getByTestId('settings-backup');

  // Not a backup file.
  await section.getByTestId('backup-file-input').setInputFiles({
    name: 'notiz.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hallo":1}'),
  });
  await expect(fresh.getByText('Das ist keine Cockpit-Backup-Datei.')).toBeVisible();

  await section.getByTestId('backup-file-input').setInputFiles(path);
  const dialog = fresh.getByTestId('backup-restore');
  await expect(dialog.getByTestId('backup-file-info')).toContainText('Backup vom');
  await expect(dialog).toContainText('1 Original');
  await dialog.getByTestId('backup-password').fill(NEW_PASSWORD);
  await dialog.getByTestId('backup-restore-start').click();
  await expect(dialog.getByTestId('backup-error')).toHaveText(
    'Das Passwort passt nicht zu diesem Backup.',
  );
  await dialog.getByTestId('backup-password').fill(TEST_PASSWORD);
  await dialog.getByTestId('backup-restore-start').click();
  await expect(fresh.getByText(/Einträge wiederhergestellt/)).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await fresh.goto('./#/tasks');
  await expect(fresh.getByTestId('task-row').filter({ hasText: 'Steuererklärung' })).toBeVisible();
  await fresh.goto('./#/documents');
  await expect(fresh.getByText('Hausrat').first()).toBeVisible();
  // Secrets stay behind; the data is stored with the new password's key.
  await fresh.goto('./#/settings');
  await expect(fresh.getByTestId('settings-ai')).not.toContainText('Key hinterlegt');
  const dump = await storageDump(fresh);
  expect(dump.indexedDb).not.toContain('Steuererklärung');

  // Lock and unlock with the new password: everything is readable.
  await fresh.reload();
  await fresh.getByTestId('unlock-password').fill(NEW_PASSWORD);
  await fresh.getByTestId('unlock-submit').click();
  await fresh.goto('./#/tasks');
  await expect(fresh.getByTestId('task-row').filter({ hasText: 'Steuererklärung' })).toBeVisible();
  await other.close();
});

test('restore: merge keeps local changes, replace deletes them', async ({ page }) => {
  await openApp(page);
  await addTask(page, 'Aus dem Backup');
  const { path } = await createBackupFile(page);
  await addTask(page, 'Nur auf dem Gerät');

  const restore = async (replace: boolean) => {
    await page.goto('./#/settings');
    await page.getByTestId('backup-file-input').setInputFiles(path);
    const dialog = page.getByTestId('backup-restore');
    await dialog.getByTestId('backup-password').fill(TEST_PASSWORD);
    if (replace) await dialog.getByRole('switch', { name: 'Aktuelle Daten ersetzen' }).click();
    await dialog.getByTestId('backup-restore-start').click();
    await expect(dialog).toHaveCount(0);
  };

  await restore(false);
  await expect(
    page.getByText('0 Einträge wiederhergestellt · 1 aktuellere behalten'),
  ).toBeVisible();
  await page.goto('./#/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(2);

  await restore(true);
  await page.goto('./#/tasks');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('task-row')).toContainText('Aus dem Backup');
});

test('"Heute" reminds of a backup once there is data, and stops after one', async ({ page }) => {
  await openApp(page, '/today');
  await expect(page.getByTestId('backup-prompt')).toHaveCount(0);
  await addTask(page, 'Erste Aufgabe');
  await page.goto('./#/today');
  await expect(page.getByTestId('backup-prompt')).toContainText('Backup');
  await page.getByTestId('backup-prompt-open').click();
  await expect(page.getByTestId('settings-backup')).toBeInViewport();

  // "Nie" switches the reminder off.
  await page.getByTestId('backup-reminder').selectOption('0');
  await page.goto('./#/today');
  await expect(page.getByTestId('backup-prompt')).toHaveCount(0);
  await page.goto('./#/settings');
  await page.getByTestId('backup-reminder').selectOption('14');
  await page.goto('./#/today');
  await expect(page.getByTestId('backup-prompt')).toBeVisible();
  await createBackupFile(page);
  await page.goto('./#/today');
  await expect(page.getByTestId('backup-prompt')).toHaveCount(0);
});
