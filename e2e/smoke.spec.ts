import { expect, test, type Page } from '@playwright/test';
import { enableDevMode, nav, openApp, reloadAndUnlock, unlock } from './vault.ts';

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

test('app shell loads without console errors or warnings', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await openApp(page);

  await expect(page).toHaveURL(/#\/today$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
  await expect(page.getByText('Termine und Mails einbinden')).toBeVisible();
  await expect(nav(page)).toBeVisible();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await expect(page).toHaveTitle('Cockpit');

  expect(problems).toEqual([]);
});

test('sidebar from 900 px, tab bar below', async ({ page }, testInfo) => {
  await openApp(page);
  const wide = testInfo.project.name === 'ipad-landscape';
  await expect(page.locator('[data-layout]')).toHaveAttribute(
    'data-layout',
    wide ? 'wide' : 'narrow',
  );
  await expect(page.locator('aside')).toHaveCount(wide ? 1 : 0);
  if (!wide) return;
  // The sidebar collapses and stays collapsed after a reload.
  await page.getByRole('button', { name: 'Seitenleiste einklappen' }).click();
  await expect(page.getByRole('button', { name: 'Seitenleiste ausklappen' })).toBeVisible();
  await reloadAndUnlock(page);
  await expect(page.getByRole('button', { name: 'Seitenleiste ausklappen' })).toBeVisible();
  await page.getByRole('button', { name: 'Seitenleiste ausklappen' }).click();
});

test('navigation switches pages', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await openApp(page);
  const pages = [
    ['Aufgaben', 'Keine offenen Aufgaben'],
    ['Verträge', 'Noch keine Verträge'],
    ['Reviews', 'Noch keine Reviews'],
    ['Bibliothek', 'Kommt in Schritt 9'],
    ['Marke', 'Kommt in Schritt 10'],
    ['Einstellungen', 'Darstellung'],
    ['Heute', 'Termine und Mails einbinden'],
  ] as const;
  for (const [name, text] of pages) {
    await nav(page).getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(nav(page).getByRole('link', { name: 'Entwickler' })).toHaveCount(0);
  // Unknown routes lead back to the start page.
  await page.goto('./#/gibt-es-nicht');
  await expect(page).toHaveURL(/#\/today$/);
  expect(problems).toEqual([]);
});

test('number keys open the sections (hardware keyboard)', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
  const sections = [
    ['2', 'Aufgaben'],
    ['3', 'Verträge'],
    ['4', 'Reviews'],
    ['5', 'Bibliothek'],
    ['6', 'Marke'],
    ['7', 'Einstellungen'],
    ['1', 'Heute'],
  ] as const;
  for (const [key, name] of sections) {
    await page.keyboard.press(key);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  }
  // Not while a dialog is open.
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Tastaturkürzel' })).toBeVisible();
  await page.keyboard.press('2');
  await expect(page).toHaveURL(/#\/today$/);
});

test('requests persistent storage at startup and shows the system status', async ({ page }) => {
  await page.addInitScript(() => {
    const storage = navigator.storage;
    const original = storage.persist.bind(storage);
    Object.defineProperty(storage, 'persist', {
      value: () => {
        (window as unknown as { __persistCalls: number }).__persistCalls =
          ((window as unknown as { __persistCalls?: number }).__persistCalls ?? 0) + 1;
        return original();
      },
    });
  });
  await openApp(page, '/settings');
  await expect(page.getByTestId('app-version')).toHaveText('0.1.0');
  await expect(page.getByTestId('build-time')).not.toBeEmpty();
  await expect(page.getByTestId('database-status')).toHaveText('Bereit');
  await expect(page.getByTestId('persisted')).toHaveText(/^(Ja|Nein)$/);
  await expect(page.getByTestId('storage-used')).toHaveText(/ von /);
  // Chromium answers persisted() with false here, so persist() must have been asked.
  expect(
    await page.evaluate(() => (window as unknown as { __persistCalls?: number }).__persistCalls),
  ).toBeGreaterThanOrEqual(1);
});

test('theme choice is applied and survives a reload', async ({ page }) => {
  await openApp(page, '/settings');
  const html = page.locator('html');
  await page.getByRole('radio', { name: 'Hell' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    'content',
    '#f3f5f9',
  );
  await page.getByRole('radio', { name: 'Dunkel' }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    'content',
    '#090d16',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Gespeichert' })).toBeVisible();

  await page.reload();
  // The theme applies before unlocking (settings are not encrypted).
  await expect(page.getByTestId('lock-screen')).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await unlock(page);
  await expect(page.getByRole('radio', { name: 'Dunkel' })).toHaveAttribute('aria-checked', 'true');

  // Own storage names: no collision with Kompass and Synapse on the same origin.
  const storage = await page.evaluate(async () => ({
    keys: Object.keys(localStorage),
    databases: (await indexedDB.databases()).map((db) => db.name),
  }));
  expect(storage.keys).toContain('cockpit.bootPrefs');
  expect(storage.keys.filter((key) => !key.startsWith('cockpit.'))).toEqual([]);
  expect(storage.databases).toEqual(['cockpit']);
});

test('reduced motion is applied and survives a reload', async ({ page }) => {
  await openApp(page, '/settings');
  const toggle = page.getByRole('switch', { name: 'Bewegungen reduzieren' });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', '');
  await reloadAndUnlock(page);
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', '');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('developer mode shows the component overview and the focus mode', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await openApp(page, '/dev/ui');
  await expect(page.getByText('Entwicklermodus ist aus')).toBeVisible();

  await enableDevMode(page);
  await nav(page).getByRole('link', { name: 'Entwickler' }).click();
  await expect(page).toHaveURL(/#\/dev\/ui$/);
  await expect(page.getByTestId('dev-section-buttons')).toBeVisible();
  await reloadAndUnlock(page);
  await expect(nav(page).getByRole('link', { name: 'Entwickler' })).toBeVisible();

  await page.getByRole('button', { name: 'Modal öffnen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Vertrag bearbeiten' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Focus mode hides the navigation; Esc or the button brings it back.
  await page.getByRole('button', { name: 'Fokusmodus testen' }).click();
  await expect(nav(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(nav(page)).toBeVisible();
  await page.getByRole('button', { name: 'Fokusmodus testen' }).click();
  await expect(nav(page)).toHaveCount(0);
  await page.getByTestId('focus-end').click();
  await expect(nav(page)).toBeVisible();

  expect(problems).toEqual([]);
});

test('keyboard shortcut overview opens with ?', async ({ page }) => {
  await openApp(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog', { name: 'Tastaturkürzel' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Tastaturkürzel' })).toHaveCount(0);
});

test('manifest is linked and valid', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();

  const manifestUrl = new URL(href ?? '', page.url());
  const response = await request.get(manifestUrl.toString());
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    icons: { src: string; sizes: string; purpose?: string }[];
  } & Record<string, unknown>;
  expect(manifest).toMatchObject({
    id: '/Cockpit/',
    name: 'Cockpit',
    short_name: 'Cockpit',
    display: 'standalone',
    start_url: '/Cockpit/',
    scope: '/Cockpit/',
    theme_color: '#090D16',
  });
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512', '512x512']);
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const image = await request.get(new URL(icon.src, manifestUrl).toString());
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toBe('image/png');
  }
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(new URL(touchIcon ?? '', page.url()).toString())).ok()).toBe(true);
});

test('app works offline after the service worker is installed', async ({ page, context }) => {
  const problems = collectConsoleProblems(page);
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Wait until the service worker controls the page (precache complete).
  await reloadAndUnlock(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Own service worker scope and cache names (Kompass and Synapse share the origin).
  const sw = await page.evaluate(async () => ({
    scope: (await navigator.serviceWorker.getRegistration())?.scope,
    caches: await caches.keys(),
  }));
  expect(new URL(sw.scope ?? '').pathname).toBe('/Cockpit/');
  expect(sw.caches.length).toBeGreaterThan(0);
  expect(sw.caches.filter((name) => !name.startsWith('cockpit-'))).toEqual([]);

  await context.setOffline(true);
  // Unlocking works offline: the key is derived on the device.
  await reloadAndUnlock(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
  await nav(page).getByRole('link', { name: 'Aufgaben' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Aufgaben' })).toBeVisible();
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
  await expect(page.getByTestId('database-status')).toHaveText('Bereit');
  await context.setOffline(false);

  expect(problems).toEqual([]);
});
