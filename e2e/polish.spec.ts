import { expect, test, type Page } from '@playwright/test';
import { enableDevMode, openApp, reloadAndUnlock, setupVault } from './vault.ts';

const ROUTES = [
  '/today',
  '/tasks',
  '/documents',
  '/reviews',
  '/library',
  '/brand',
  '/brand?tab=design',
  '/brand?tab=build',
  '/settings',
  '/reviews/day/today',
  '/reviews/week/current',
  '/brand/interview',
  '/dev/ui',
];

/** Detail pages of the first contract and library entry (ids are random). */
async function detailRoutes(page: Page): Promise<string[]> {
  const routes: string[] = [];
  for (const [list, prefix] of [
    ['/documents', '#/documents/'],
    ['/library', '#/library/'],
  ] as const) {
    await page.goto(`./#${list}`);
    const link = page.locator(`a[href^="${prefix}"]`).first();
    await link.waitFor();
    const href = await link.getAttribute('href');
    if (href) routes.push(href.slice(1));
  }
  return routes;
}

async function createDemoData(page: Page) {
  await enableDevMode(page);
  await page.goto('./#/dev/ui');
  for (const id of ['tasks', 'documents', 'reviews', 'library', 'brand']) {
    await page.getByTestId(`dev-demo-${id}`).click();
  }
  await expect(page.getByTestId('dev-demo-count')).not.toHaveText(/^0/);
}

/** Visible controls smaller than 44×44 px (inline text links and hidden inputs excepted). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector =
      'button, a[href], select, input:not([type=hidden]), textarea, [role=switch], [role=radio], [role=tab], [role=checkbox]';
    const problems: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (element.closest('[aria-hidden=true], [inert]')) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // Inputs inside a larger label/control (switch, checkbox) are hit through their parent.
      if (element instanceof HTMLInputElement && Number(style.opacity) === 0) continue;
      // Inline links inside running text follow the text size (WCAG exception).
      if (element.tagName === 'A' && style.display === 'inline') continue;
      // Layout size: animations (scale) do not shrink the hit area for long.
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width < 44 || height < 44) {
        const name =
          element.getAttribute('aria-label') ??
          element.getAttribute('data-testid') ??
          element.textContent?.trim().slice(0, 40) ??
          element.tagName;
        problems.push(`${element.tagName.toLowerCase()} „${name}“ ${width}×${height}`);
      }
    }
    return problems;
  });
}

async function storedSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (name) =>
      new Promise((resolve) => {
        const open = indexedDB.open('cockpit');
        open.onsuccess = () => {
          const request = open.result.transaction('settings').objectStore('settings').get(name);
          request.onsuccess = () => {
            const row = request.result as { value?: unknown } | undefined;
            resolve(row?.value);
            open.result.close();
          };
        };
      }),
    key,
  );
}

async function horizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-scroll-container]') ?? document.documentElement;
    return container.scrollWidth > container.clientWidth + 1;
  });
}

test('every page: touch targets ≥ 44 px, no sideways scrolling', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await createDemoData(page);
  const report: string[] = [];
  for (const route of [...ROUTES, ...(await detailRoutes(page))]) {
    await page.goto(`./#${route}`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await page.waitForTimeout(500);
    for (const problem of await smallTargets(page)) report.push(`${route}: ${problem}`);
    if (await horizontalOverflow(page)) report.push(`${route}: scrolls sideways`);
  }
  expect(report).toEqual([]);
});

test('Split View (500 px): no sideways scrolling', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 500, height: 820 });
  await openApp(page);
  await createDemoData(page);
  const report: string[] = [];
  for (const route of [...ROUTES, ...(await detailRoutes(page))]) {
    await page.goto(`./#${route}`);
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    await page.waitForTimeout(400);
    if (await horizontalOverflow(page)) report.push(route);
  }
  expect(report).toEqual([]);
});

test('Safari tab: setup hint and install card, hidden for good after "Ausblenden"', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.getByTestId('setup-browser-hint')).toContainText('Zum Home-Bildschirm');
  await expect(page.getByTestId('setup-restore-hint')).toContainText('Backup');
  await setupVault(page);
  await page.goto('./#/today');
  const card = page.getByTestId('install-card');
  await expect(card).toContainText('Zum Home-Bildschirm');
  await expect(card).toContainText('eigene Daten');
  await card.getByTestId('install-dismiss').click();
  await expect(card).toHaveCount(0);
  // The setting is stored asynchronously; reload only once it is in IndexedDB.
  await expect.poll(() => storedSetting(page, 'installHintDismissed')).toBe(true);
  await reloadAndUnlock(page);
  await page.goto('./#/today');
  await expect(page.getByTestId('today-tasks')).toBeVisible();
  await expect(page.getByTestId('install-card')).toHaveCount(0);
});

test('home screen app: no install hints', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', {
      get: () => true,
      configurable: true,
    });
  });
  await page.goto('./');
  await expect(page.getByTestId('setup-restore-hint')).toBeVisible();
  await expect(page.getByTestId('setup-browser-hint')).toHaveCount(0);
  await setupVault(page);
  await page.goto('./#/today');
  await expect(page.getByTestId('today-tasks')).toBeVisible();
  await expect(page.getByTestId('install-card')).toHaveCount(0);
  await page.goto('./#/settings');
  await expect(page.getByTestId('launch-mode')).toHaveText('Homescreen-App');
});
