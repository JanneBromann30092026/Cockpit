import { expect, test, type Page } from '@playwright/test';
import { enableDevMode, openApp, reloadAndUnlock, storageDump } from './vault.ts';

/** Monday, 5 October 2026, 10:20 in Berlin (the iPad profiles use Europe/Berlin). */
const NOW = new Date('2026-10-05T10:20:00+02:00');

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

const rows = (page: Page) => page.getByTestId('task-row');
const row = (page: Page, title: string) => rows(page).filter({ hasText: title });
const bucket = (page: Page, name: string) => page.getByTestId(`bucket-${name}`);

async function quickAdd(page: Page, title: string, ...chips: string[]) {
  const form = page.getByTestId('quick-add');
  for (const chip of chips) await form.getByRole('button', { name: chip, exact: true }).click();
  await form.getByTestId('quick-add-input').fill(title);
  await form.getByTestId('quick-add-input').press('Enter');
  await expect(row(page, title)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('quick add, groups, badge and "Heute" – encrypted at rest', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await openApp(page, '/tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Aufgaben' })).toBeVisible();
  await expect(page.getByText('Keine offenen Aufgaben')).toBeVisible();

  await quickAdd(page, 'Steuererklärung abschicken', 'Heute', 'Wichtig');
  await quickAdd(page, 'Videoskript schreiben', 'Morgen');
  await quickAdd(page, 'Lernzettel ergänzen');
  await expect(bucket(page, 'today')).toContainText('Steuererklärung abschicken');
  await expect(bucket(page, 'today')).toContainText('Wichtig');
  await expect(bucket(page, 'tomorrow')).toContainText('Videoskript schreiben');
  await expect(bucket(page, 'someday')).toContainText('Lernzettel ergänzen');
  await expect(page.getByTestId('tasks-summary')).toHaveText('3 offen · 1 fällig');
  await expect(page.getByTestId('nav-due-badge')).toHaveText('1');

  // "Heute": the due task and an overview without Google (keys work outside text fields).
  await page.getByTestId('quick-add-input').blur();
  await page.keyboard.press('1');
  const card = page.getByTestId('today-tasks');
  await expect(card.getByTestId('task-row')).toHaveCount(1);
  await expect(card).toContainText('Steuererklärung abschicken');
  await expect(page.getByTestId('overview-sentence')).toHaveText([
    'Das Wichtigste: „Steuererklärung abschicken“ ist heute fällig.',
    'Deine Termine siehst du hier, sobald Google verbunden ist.',
    'Auf deiner Liste: 1 fällige Aufgabe.',
  ]);

  // Stored encrypted, decrypted again after unlocking.
  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain('Steuererklärung');
  expect(dump.localStorage).not.toContain('Steuererklärung');
  await reloadAndUnlock(page);
  await page.goto('./#/tasks');
  await expect(rows(page)).toHaveCount(3);
  expect(problems).toEqual([]);
});

test('complete with undo, reopen from the done list', async ({ page }) => {
  await openApp(page, '/tasks');
  await quickAdd(page, 'Zahnarzt anrufen', 'Heute');
  await row(page, 'Zahnarzt anrufen').getByTestId('task-complete').click();
  await expect(page.getByText('„Zahnarzt anrufen“ erledigt')).toBeVisible();
  await expect(page.getByText('Alles erledigt')).toBeVisible();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(bucket(page, 'today')).toContainText('Zahnarzt anrufen');

  await row(page, 'Zahnarzt anrufen').getByTestId('task-complete').click();
  await expect(page.getByText('Alles erledigt')).toBeVisible();
  await page.getByTestId('tasks-show-done').click();
  const done = page.getByTestId('tasks-done');
  await expect(done.getByTestId('task-row')).toHaveAttribute('data-done', 'true');
  await expect(done).toContainText('Erledigt am Mo., 05.10.');
  await done.getByRole('button', { name: '„Zahnarzt anrufen“ wieder öffnen' }).click();
  await expect(bucket(page, 'today')).toContainText('Zahnarzt anrufen');
});

test('swiping right completes a task', async ({ page }) => {
  await openApp(page, '/tasks');
  await quickAdd(page, 'Wäsche aufhängen');
  const box = await row(page, 'Wäsche aufhängen').getByTestId('task-title').boundingBox();
  if (!box) throw new Error('row not visible');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 10, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step += 1) await page.mouse.move(box.x + 10 + step * 25, y);
  await page.mouse.up();
  await expect(page.getByText('„Wäsche aufhängen“ erledigt')).toBeVisible();
  await expect(page.getByText('Alles erledigt')).toBeVisible();
});

test('editor, postponing and deleting with undo', async ({ page }) => {
  await openApp(page, '/tasks');
  await page.getByTestId('tasks-add').click();
  const editor = page.getByTestId('task-editor');
  await page.getByTestId('task-save').click();
  await expect(editor.getByText('Bitte einen Titel eingeben.')).toBeVisible();
  await editor.getByTestId('task-title-input').fill('Bewerbung abschicken');
  await editor.getByRole('button', { name: 'In einer Woche', exact: true }).click();
  await expect(editor.getByTestId('task-date')).toHaveValue('2026-10-12');
  await editor.getByRole('radio', { name: 'Hoch' }).click();
  await editor.getByTestId('task-notes').fill('Lebenslauf aktualisieren');
  await page.getByTestId('task-save').click();
  await expect(bucket(page, 'week')).toContainText('Bewerbung abschicken');
  await expect(row(page, 'Bewerbung abschicken')).toContainText('Lebenslauf aktualisieren');
  await expect(row(page, 'Bewerbung abschicken')).toContainText('in 7 Tagen');

  // Edit: title and no date.
  await row(page, 'Bewerbung abschicken').getByTestId('task-menu').click();
  await page.getByRole('menuitem', { name: 'Bearbeiten' }).click();
  await editor.getByTestId('task-title-input').fill('Bewerbung Praktikum abschicken');
  await editor.getByRole('button', { name: 'Ohne Datum', exact: true }).click();
  await page.getByTestId('task-save').click();
  await expect(bucket(page, 'someday')).toContainText('Bewerbung Praktikum abschicken');

  // Postpone to tomorrow and to a chosen date.
  await row(page, 'Bewerbung Praktikum').getByTestId('task-menu').click();
  await page.getByRole('menuitem', { name: 'Auf morgen' }).click();
  await expect(page.getByText('Verschoben auf Di., 06.10.')).toBeVisible();
  await expect(bucket(page, 'tomorrow')).toContainText('Bewerbung Praktikum abschicken');
  await row(page, 'Bewerbung Praktikum').getByTestId('task-menu').click();
  await page.getByRole('menuitem', { name: 'Datum wählen …' }).click();
  await page.getByTestId('date-input').fill('2026-11-02');
  await page.getByTestId('date-confirm').click();
  await expect(bucket(page, 'later')).toContainText('Bewerbung Praktikum abschicken');

  // Delete – and bring it back.
  await row(page, 'Bewerbung Praktikum').getByTestId('task-menu').click();
  await page.getByRole('menuitem', { name: 'Löschen' }).click();
  await expect(page.getByText('„Bewerbung Praktikum abschicken“ gelöscht')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(bucket(page, 'later')).toContainText('Bewerbung Praktikum abschicken');
  await expect(row(page, 'Bewerbung Praktikum')).toContainText('Lebenslauf aktualisieren');
});

test('hardware keyboard: N jumps to the new task field', async ({ page }) => {
  await openApp(page, '/tasks');
  await page.getByRole('heading', { level: 1, name: 'Aufgaben' }).click();
  await page.keyboard.press('n');
  await expect(page.getByTestId('quick-add-input')).toBeFocused();
  await page.keyboard.type('Per Tastatur');
  await page.keyboard.press('Enter');
  await expect(row(page, 'Per Tastatur')).toBeVisible();
});

test('"Heute": complete a due task and add one for today', async ({ page }) => {
  await openApp(page, '/today');
  const card = page.getByTestId('today-tasks');
  await expect(card).toContainText('Heute ist nichts fällig.');
  await card.getByRole('button', { name: 'Neue Aufgabe' }).click();
  await page.getByTestId('task-title-input').fill('Folien schicken');
  await expect(page.getByTestId('task-date')).toHaveValue('2026-10-05');
  await page.getByTestId('task-save').click();
  await expect(card.getByTestId('task-row')).toHaveCount(1);
  await card.getByTestId('task-complete').click();
  await expect(card).toContainText('Heute ist nichts fällig.');
  await card.getByRole('button', { name: 'Alle Aufgaben' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Aufgaben' })).toBeVisible();
});

test('developer mode: demo tasks and removing only those', async ({ page }) => {
  await openApp(page, '/tasks');
  await quickAdd(page, 'Echte Aufgabe');
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  const section = page.getByTestId('dev-section-demo');
  await section.getByTestId('dev-demo-tasks').click();
  await expect(section.getByTestId('dev-demo-count')).toHaveText('9 Demo-Einträge');
  await page.goto('./#/tasks');
  await expect(page.getByTestId('tasks-summary')).toHaveText('9 offen · 4 fällig');
  await expect(bucket(page, 'overdue')).toContainText('Steuererklärung abschicken');
  await page.goto('./#/dev/ui');
  await section.getByTestId('dev-demo-remove').click();
  await expect(section.getByTestId('dev-demo-count')).toHaveText('0 Demo-Einträge');
  await page.goto('./#/tasks');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Echte Aufgabe');
});
