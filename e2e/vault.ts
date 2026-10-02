import type { Page } from '@playwright/test';
import { TEST_PASSWORD } from './ipad.ts';

export const nav = (page: Page) => page.getByRole('navigation', { name: 'Hauptnavigation' });

/** Waits until the app is open and the lock screen has faded out. */
async function waitUntilOpen(page: Page): Promise<void> {
  await nav(page).waitFor();
  await page.getByTestId('lock-screen').waitFor({ state: 'detached' });
}

/** First start: set the app password (every test context starts with an empty database). */
export async function setupVault(page: Page, password = TEST_PASSWORD): Promise<void> {
  await page.getByTestId('setup-password').fill(password);
  await page.getByTestId('setup-repeat').fill(password);
  await page.getByRole('switch', { name: /Verstanden/ }).click();
  await page.getByTestId('setup-submit').click();
  await waitUntilOpen(page);
}

export async function unlock(page: Page, password = TEST_PASSWORD): Promise<void> {
  await page.getByTestId('unlock-password').fill(password);
  await page.getByTestId('unlock-submit').click();
  await waitUntilOpen(page);
}

/** Opens the app on a route and sets it up. */
export async function openApp(page: Page, route = ''): Promise<void> {
  await page.goto(`./${route ? `#${route}` : ''}`);
  await setupVault(page);
}

/** Reloads; the app comes back locked and is unlocked again. */
export async function reloadAndUnlock(page: Page): Promise<void> {
  await page.reload();
  await unlock(page);
}

export async function enableDevMode(page: Page): Promise<void> {
  await page.goto('./#/settings');
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await page.getByText('Testpasswort').first().waitFor();
}

/** Everything in IndexedDB and localStorage as text (byte arrays decoded) to look for plaintext. */
export async function storageDump(
  page: Page,
): Promise<{ indexedDb: string; localStorage: string }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('cockpit');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('open failed'));
    });
    const parts: string[] = [];
    for (const name of Array.from(db.objectStoreNames)) {
      const rows = await new Promise<unknown[]>((resolve) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
      });
      parts.push(
        JSON.stringify(rows, (_key, value: unknown) =>
          value instanceof Uint8Array ? new TextDecoder('latin1').decode(value) : value,
        ),
      );
    }
    db.close();
    return { indexedDb: parts.join('\n'), localStorage: JSON.stringify({ ...localStorage }) };
  });
}
