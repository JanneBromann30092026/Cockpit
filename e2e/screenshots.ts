/**
 * Creates iPad screenshots of the production build (vite preview).
 * Usage: npm run screenshots  →  screenshots/*.png (SHOTS=settings for one group)
 */
import { mkdirSync } from 'node:fs';
import { chromium, type BrowserContextOptions, type Page } from '@playwright/test';
import { preview } from 'vite';
import { IPAD_LANDSCAPE, IPAD_PORTRAIT, PREVIEW_URL } from './ipad.ts';

interface Shot {
  /** Hash route, e.g. "/tasks". */
  route: string;
  name: string;
  /** Optional interaction before the screenshot (e.g. opening a dialog). */
  prepare?: (page: Page) => Promise<void>;
  /** Additionally screenshot the rest of the scrolling page in viewport-sized steps. */
  scroll?: boolean;
  /** Only in the wide layout (sidebar). */
  wideOnly?: boolean;
}

async function enableDevMode(page: Page) {
  await page.goto(`${PREVIEW_URL}#/settings`);
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await page.goto(`${PREVIEW_URL}#/dev/ui`);
  await page.getByTestId('dev-section-buttons').waitFor();
}

const click = (name: string) => async (page: Page) => {
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForTimeout(500);
};

async function focusMode(page: Page) {
  await page.getByTestId('dev-section-focus').scrollIntoViewIfNeeded();
  await click('Fokusmodus testen')(page);
}

async function shortcuts(page: Page) {
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.keyboard.press('Shift+?');
  await page.getByTestId('shortcuts').waitFor();
}

async function collapsedSidebar(page: Page) {
  await click('Seitenleiste einklappen')(page);
  await page.waitForTimeout(400);
}

async function expandSidebar(page: Page) {
  const expand = page.getByRole('button', { name: 'Seitenleiste ausklappen' });
  if (await expand.count()) await expand.click();
}

const SHOTS: Shot[] = [
  { route: '/today', name: 'today' },
  { route: '/tasks', name: 'tasks' },
  { route: '/documents', name: 'documents' },
  { route: '/reviews', name: 'reviews' },
  { route: '/library', name: 'library' },
  { route: '/brand', name: 'brand' },
  { route: '/settings', name: 'settings', scroll: true },
  { route: '/dev/ui', name: 'dev-ui', prepare: enableDevMode, scroll: true },
  { route: '/dev/ui', name: 'dev-modal', prepare: click('Modal öffnen') },
  { route: '/dev/ui', name: 'dev-sheet', prepare: click('Bottom Sheet öffnen') },
  { route: '/dev/ui', name: 'dev-side-panel', prepare: click('Seitenpanel öffnen') },
  { route: '/dev/ui', name: 'dev-focus', prepare: focusMode },
  { route: '/today', name: 'shortcuts', prepare: shortcuts },
  { route: '/tasks', name: 'sidebar-collapsed', prepare: collapsedSidebar, wideOnly: true },
];

/** Split View only gets the section pages and the settings. */
const SPLIT_SHOTS = 7;

const VARIANTS: { name: string; options: BrowserContextOptions }[] = [
  { name: 'landscape-dark', options: { ...IPAD_LANDSCAPE, colorScheme: 'dark' } },
  { name: 'landscape-light', options: { ...IPAD_LANDSCAPE, colorScheme: 'light' } },
  { name: 'portrait-dark', options: { ...IPAD_PORTRAIT, colorScheme: 'dark' } },
  { name: 'portrait-light', options: { ...IPAD_PORTRAIT, colorScheme: 'light' } },
  // Split View: half of a landscape iPad Air (narrowest supported width ≈ 500 px).
  {
    name: 'split-dark',
    options: { ...IPAD_PORTRAIT, viewport: { width: 500, height: 820 }, colorScheme: 'dark' },
  },
];

/** Optional name prefix, e.g. SHOTS=dev npm run screenshots. */
const ONLY = process.env.SHOTS;

const outDir = new URL('../screenshots/', import.meta.url);
mkdirSync(outDir, { recursive: true });

async function capture(page: Page, name: string) {
  const file = new URL(`${name}.png`, outDir).pathname;
  await page.screenshot({ path: file });
  console.log(`✓ ${file}`);
}

/** Icon preview: home screen icon, maskable icon in a circle, tab icon and startup images. */
async function captureIconPreview() {
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  const icon = (file: string) => `${PREVIEW_URL}icons/${file}`;
  const splash = (file: string) => `${PREVIEW_URL}splash/${file}`;
  const panel = (theme: 'dark' | 'light') => {
    const fg = theme === 'dark' ? '#e6ebf5' : '#0d1321';
    const muted = theme === 'dark' ? '#9ba5b8' : '#4a5467';
    const bg = theme === 'dark' ? '#090d16' : '#f3f5f9';
    return `
      <section style="background:${bg};color:${fg};padding:28px 32px;display:flex;gap:40px;align-items:flex-end">
        <figure><img src="${icon('apple-touch-icon-180x180.png')}" width="120" height="120" style="border-radius:27px"><figcaption>Cockpit</figcaption><small style="color:${muted}">iPad-Homescreen</small></figure>
        <figure><img src="${icon('maskable-icon-512x512.png')}" width="120" height="120" style="border-radius:50%"><figcaption>maskable</figcaption><small style="color:${muted}">Kreismaske</small></figure>
        <figure><img src="${icon('pwa-512x512.png')}" width="120" height="120"><figcaption>pwa-512</figcaption><small style="color:${muted}">transparent</small></figure>
        <figure><span style="display:flex;gap:12px;align-items:center;height:120px"><img src="${icon('favicon.svg')}" width="32" height="32"><img src="${icon('favicon.svg')}" width="16" height="16"></span><figcaption>Favicon</figcaption><small style="color:${muted}">32 / 16 px</small></figure>
        <figure><img src="${splash(`splash-1640x2360-${theme}.png`)}" height="200" style="border-radius:12px;border:1px solid ${muted}55"><figcaption>Startbild</figcaption><small style="color:${muted}">${theme === 'dark' ? 'dunkel' : 'hell'}</small></figure>
      </section>`;
  };
  await page.setContent(`<!doctype html><html><body style="margin:0;font:500 15px system-ui">
    <style>figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px}</style>
    ${panel('dark')}${panel('light')}</body></html>`);
  await page.waitForLoadState('networkidle');
  const size = await page.evaluate(() => ({
    width: document.body.scrollWidth,
    height: document.body.scrollHeight,
  }));
  await page.setViewportSize(size);
  await capture(page, 'icon-preview');
  await context.close();
}

const server = await preview();
const browser = await chromium.launch();
try {
  if (!ONLY || 'icon-preview'.startsWith(ONLY)) await captureIconPreview();
  for (const variant of VARIANTS) {
    const context = await browser.newContext({
      ...variant.options,
      // Keep screenshots free of the "offline ready" toast.
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const wide = (variant.options.viewport?.width ?? 0) >= 900;
    // A filtered run still needs the developer mode (normally enabled by the dev-ui shot).
    if (ONLY) await enableDevMode(page);
    const shots = SHOTS.filter((s) => !ONLY || s.name.startsWith(ONLY));
    for (const shot of variant.name.startsWith('split') ? shots.slice(0, SPLIT_SHOTS) : shots) {
      if (shot.wideOnly && !wide) continue;
      await page.goto(`${PREVIEW_URL}#${shot.route}`, { waitUntil: 'networkidle' });
      // Same hash = no navigation; reload so dialogs from the previous shot are gone.
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await shot.prepare?.(page);
      const container = page.locator('[data-scroll-container]');
      if (shot.scroll) {
        await container.evaluate((element) => {
          element.scrollTop = 0;
        });
      }
      await page.waitForTimeout(700);
      await capture(page, `${shot.name}-${variant.name}`);
      if (shot.name === 'sidebar-collapsed') await expandSidebar(page);
      if (!shot.scroll) continue;
      for (let part = 2; part <= 8; part += 1) {
        const moved = await container.evaluate((element) => {
          const before = element.scrollTop;
          element.scrollTop += element.clientHeight - 80;
          return element.scrollTop !== before;
        });
        if (!moved) break;
        await page.waitForTimeout(300);
        await capture(page, `${shot.name}-${part}-${variant.name}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
