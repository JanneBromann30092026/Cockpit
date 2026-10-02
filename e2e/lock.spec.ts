import { expect, test, type Page } from '@playwright/test';
import { TEST_PASSWORD } from './ipad.ts';
import { enableDevMode, nav, openApp, setupVault, storageDump, unlock } from './vault.ts';

const lockScreen = (page: Page) => page.getByTestId('lock-screen');

async function lockNow(page: Page) {
  await page.goto('./#/settings');
  await page.getByTestId('lock-now').click();
  await expect(lockScreen(page)).toHaveAttribute('data-mode', 'unlock');
}

/**
 * Time travel for Date.now() only. Playwright's page.clock did not reliably apply
 * fastForward here and stalls animations; the app's lock logic only reads Date.now(),
 * while its 5 s check interval keeps running in real time.
 */
async function installTimeTravel(page: Page) {
  await page.addInitScript(() => {
    const realNow = Date.now.bind(Date);
    let offset = 0;
    Date.now = () => realNow() + offset;
    Object.assign(window, {
      __advanceTime: (ms: number) => {
        offset += ms;
      },
    });
  });
}

async function advance(page: Page, ms: number) {
  await page.evaluate((value) => {
    (window as unknown as { __advanceTime: (n: number) => void }).__advanceTime(value);
  }, ms);
}

/** The inactivity check runs every 5 s (real time). */
const CHECK_TIMEOUT = { timeout: 8_000 };

/** Fakes the page going to the background and coming back (iPad app switcher). */
async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'visibilityState', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('first start asks for a password and validates the form', async ({ page }) => {
  await page.goto('./');
  await expect(lockScreen(page)).toHaveAttribute('data-mode', 'setup');
  await expect(page.getByRole('heading', { name: 'Willkommen bei Cockpit' })).toBeVisible();
  await expect(page.getByText('Passwort vergessen = Daten verloren')).toBeVisible();
  await expect(nav(page)).toHaveCount(0);

  // Keychain-friendly form: real <form>, username field and new-password fields.
  const form = page.locator('form');
  await expect(form.locator('input[autocomplete="username"]')).toHaveValue('Cockpit');
  await expect(form.locator('input[autocomplete="new-password"]')).toHaveCount(2);

  const submit = page.getByTestId('setup-submit');
  await page.getByTestId('setup-password').fill('kurz');
  await submit.click();
  await expect(page.getByText('Das Passwort braucht mindestens 8 Zeichen.')).toBeVisible();

  await page.getByTestId('setup-password').fill('passwort');
  await expect(page.getByTestId('password-strength')).toHaveAttribute('data-score', '1');
  await page.getByTestId('setup-password').fill(TEST_PASSWORD);
  await expect(page.getByTestId('password-strength')).toHaveAttribute('data-score', /[34]/);
  await page.getByTestId('setup-repeat').fill(`${TEST_PASSWORD}x`);
  await submit.click();
  await expect(page.getByText('Die Passwörter stimmen nicht überein.')).toBeVisible();

  await page.getByTestId('setup-repeat').fill(TEST_PASSWORD);
  await submit.click();
  await expect(page.getByText('Bitte bestätige den Hinweis.')).toBeVisible();

  await page.getByRole('switch', { name: /Verstanden/ }).click();
  await submit.click();
  await expect(nav(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
});

test('locks, refuses a wrong password with a short wait and unlocks', async ({ page }) => {
  await installTimeTravel(page);
  await openApp(page);
  await lockNow(page);
  await expect(nav(page)).toHaveCount(0);
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();

  const field = page.getByTestId('unlock-password');
  const submit = page.getByTestId('unlock-submit');
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await field.fill(`falsch-${attempt}`);
    await submit.click();
    await expect(field).toHaveValue('');
  }
  await expect(page.getByText(/Zu viele Versuche – bitte warte [1-5] s\./)).toBeVisible();
  await field.fill(TEST_PASSWORD);
  await expect(submit).toBeDisabled();
  // The wait survives a reload.
  await page.reload();
  await expect(page.getByText(/Zu viele Versuche/)).toBeVisible();

  await advance(page, 6_000);
  await expect(page.getByText(/Zu viele Versuche/)).toHaveCount(0);
  await unlock(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
});

test('locks automatically after five minutes without input', async ({ page }) => {
  await installTimeTravel(page);
  await openApp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();

  await advance(page, 4 * 60_000);
  await page.waitForTimeout(5_500);
  await expect(lockScreen(page)).toHaveCount(0);
  // Any input restarts the countdown.
  await nav(page).getByRole('link', { name: 'Aufgaben' }).click();
  await advance(page, 4 * 60_000);
  await page.waitForTimeout(5_500);
  await expect(lockScreen(page)).toHaveCount(0);

  await advance(page, 70_000);
  await expect(lockScreen(page)).toHaveAttribute('data-mode', 'unlock', CHECK_TIMEOUT);
  await expect(page.getByTestId('lock-reason')).toContainText('eine Weile nichts passiert');
  await expect(nav(page)).toHaveCount(0);
  await unlock(page);
  // Back on the page that was open before.
  await expect(page.getByRole('heading', { level: 1, name: 'Aufgaben' })).toBeVisible();
});

test('the lock time can be changed', async ({ page }) => {
  await installTimeTravel(page);
  await openApp(page, '/settings');
  await page.getByTestId('lock-after').selectOption('1');
  await advance(page, 70_000);
  await expect(lockScreen(page)).toBeVisible(CHECK_TIMEOUT);
});

test('locks after more than one minute in the background', async ({ page }) => {
  await installTimeTravel(page);
  await openApp(page);

  await setVisibility(page, 'hidden');
  await advance(page, 30_000);
  await setVisibility(page, 'visible');
  await expect(lockScreen(page)).toHaveCount(0);

  await setVisibility(page, 'hidden');
  await advance(page, 61_000);
  await setVisibility(page, 'visible');
  await expect(lockScreen(page)).toBeVisible();
  await expect(page.getByTestId('lock-reason')).toContainText('im Hintergrund');
});

test('IndexedDB and localStorage contain no plaintext', async ({ page }) => {
  await openApp(page);
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  const section = page.getByTestId('dev-section-vault');
  await section.getByRole('button', { name: 'Testaufgabe anlegen' }).click();
  await expect(section.getByTestId('vault-count-tasks')).toHaveText('1');
  await expect(section.getByTestId('vault-tasks')).toContainText('Steuererklärung abschicken');
  await expect(section.getByTestId('vault-raw')).toBeVisible();

  const dump = await storageDump(page);
  for (const plaintext of [
    'Steuererklärung',
    'Steuererkl',
    'abschicken',
    '"priority"',
    '"title"',
  ]) {
    expect(dump.indexedDb).not.toContain(plaintext);
    expect(dump.localStorage).not.toContain(plaintext);
  }
  // Only technical fields stay readable.
  expect(dump.indexedDb).toContain('"payload"');
  expect(dump.indexedDb).toContain('updatedAt');
});

test('changes from another tab are picked up', async ({ page, context }) => {
  await openApp(page);
  await enableDevMode(page);
  await page.goto('./#/dev/ui');

  const other = await context.newPage();
  await other.goto('./#/dev/ui');
  await unlock(other);
  await expect(other.getByTestId('vault-count-tasks')).toHaveText('0');

  await page.getByRole('button', { name: 'Testaufgabe anlegen' }).click();
  await expect(page.getByTestId('vault-count-tasks')).toHaveText('1');
  await page.getByRole('button', { name: 'Testaufgabe anlegen' }).click();
  await expect(page.getByTestId('vault-count-tasks')).toHaveText('2');
  await expect(other.getByTestId('vault-count-tasks')).toHaveText('2');
  await expect(other.getByTestId('vault-tasks')).toContainText('Hausratversicherung vergleichen');

  await page.getByRole('button', { name: 'Letzte ändern' }).click();
  await expect(other.getByTestId('vault-tasks')).toContainText('niedrig');
  await page.getByRole('button', { name: 'Letzte löschen' }).click();
  await expect(other.getByTestId('vault-count-tasks')).toHaveText('1');
});

test('changing the password re-encrypts and only the new one unlocks', async ({ page }) => {
  await openApp(page);
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  await page.getByRole('button', { name: 'Testaufgabe anlegen' }).click();
  await expect(page.getByTestId('vault-count-tasks')).toHaveText('1');

  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Passwort ändern' }).click();
  const dialog = page.getByRole('dialog', { name: 'Passwort ändern' });
  await dialog.getByLabel('Aktuelles Passwort').fill('falsch-falsch');
  await dialog.getByLabel('Neues Passwort', { exact: true }).fill('Neues-Passwort-2026');
  await dialog.getByLabel('Neues Passwort wiederholen').fill('Neues-Passwort-2026');
  await dialog.getByRole('button', { name: 'Passwort ändern' }).click();
  await expect(dialog.getByText('Das aktuelle Passwort stimmt nicht.')).toBeVisible();
  await dialog.getByLabel('Aktuelles Passwort').fill(TEST_PASSWORD);
  await dialog.getByRole('button', { name: 'Passwort ändern' }).click();
  await expect(page.getByText('Passwort geändert')).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await page.getByTestId('lock-now').click();
  await page.getByTestId('unlock-password').fill(TEST_PASSWORD);
  await page.getByTestId('unlock-submit').click();
  await expect(page.getByText('Das Passwort stimmt nicht.')).toBeVisible();
  await unlock(page, 'Neues-Passwort-2026');
  await page.goto('./#/dev/ui');
  await expect(page.getByTestId('vault-count-tasks')).toHaveText('1');
});

test('forgot password: delete everything and start again', async ({ page }) => {
  await openApp(page);
  await page.reload();
  await page.getByRole('button', { name: 'Passwort vergessen?' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Passwort vergessen?' });
  const confirm = dialog.getByRole('button', { name: 'Alles löschen' });
  await expect(confirm).toBeDisabled();
  await dialog.getByTestId('reset-confirm').fill('löschen');
  await confirm.click();
  await expect(lockScreen(page)).toHaveAttribute('data-mode', 'setup');
  await setupVault(page, 'Ganz-neues-Passwort');
  await expect(nav(page)).toBeVisible();
});

test('the sidebar locks the app and the developer mode shows the derivation time', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'ipad-landscape', 'sidebar only in the wide layout');
  await openApp(page);
  await enableDevMode(page);
  await page.getByTestId('sidebar-lock').click();
  await expect(lockScreen(page)).toHaveAttribute('data-mode', 'unlock');
  await expect(page.getByTestId('dev-password-hint')).toContainText(TEST_PASSWORD);
  await unlock(page);
  await page.goto('./#/settings');
  await expect(page.getByTestId('encryption-info')).toContainText('800.000 Iterationen');
  await expect(page.getByTestId('derivation-ms')).toHaveText(/^\d+ ms$/);
});
