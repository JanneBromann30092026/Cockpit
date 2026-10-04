/**
 * Creates iPad screenshots of the production build (vite preview).
 * Usage: npm run screenshots  →  screenshots/*.png (SHOTS=settings for one group)
 */
import { mkdirSync } from 'node:fs';
import { chromium, type BrowserContextOptions, type Page, type Route } from '@playwright/test';
import { preview } from 'vite';
import { IPAD_LANDSCAPE, IPAD_PORTRAIT, PREVIEW_URL, TEST_PASSWORD } from './ipad.ts';

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

/** Unlocks after a reload (every reload locks the app). */
async function unlockIfLocked(page: Page) {
  const field = page.getByTestId('unlock-password');
  if (!(await field.isVisible())) return;
  await field.fill(TEST_PASSWORD);
  await page.getByTestId('unlock-submit').click();
  await page.getByTestId('lock-screen').waitFor({ state: 'detached' });
}

/** Height of the iPad on-screen keyboard per orientation (approx., without the shortcut bar). */
const KEYBOARD_HEIGHT = { landscape: 400, portrait: 330 };

/**
 * Chromium has no on-screen keyboard: a fake visualViewport lets the app lay out as with the
 * iPad keyboard (height via window.__setKeyboard), a grey block shows where the keyboard sits.
 */
function simulatedKeyboardScript() {
  const events = new EventTarget();
  let keyboard = 0;
  const viewport = {
    get width() {
      return window.innerWidth;
    },
    get height() {
      return window.innerHeight - keyboard;
    },
    offsetTop: 0,
    offsetLeft: 0,
    pageTop: 0,
    pageLeft: 0,
    scale: 1,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  Object.defineProperty(window, 'visualViewport', { get: () => viewport });
  Object.assign(window, {
    __setKeyboard: (height: number) => {
      keyboard = height;
      events.dispatchEvent(new Event('resize'));
      document.getElementById('e2e-keyboard')?.remove();
      if (!height) return;
      const block = document.createElement('div');
      block.id = 'e2e-keyboard';
      block.textContent = 'Bildschirmtastatur (simuliert)';
      Object.assign(block.style, {
        position: 'fixed',
        left: '0',
        right: '0',
        bottom: '0',
        height: `${height}px`,
        zIndex: '2147483647',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        font: '500 15px system-ui',
        color: '#6b7280',
        background: 'repeating-linear-gradient(0deg, #d1d5db 0 1px, #e5e7eb 1px 58px)',
        pointerEvents: 'none',
      });
      document.body.append(block);
    },
  });
}

async function setKeyboard(page: Page, on: boolean) {
  const landscape = (page.viewportSize()?.width ?? 0) > (page.viewportSize()?.height ?? 0);
  const height = on ? KEYBOARD_HEIGHT[landscape ? 'landscape' : 'portrait'] : 0;
  await page.evaluate(
    (h) => (window as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(h),
    height,
  );
  await page.waitForTimeout(300);
}

/** First start: empty setup, a mismatch error with the strength meter, the keyboard. */
async function captureSetup(page: Page, variant: string) {
  await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
  await page.getByTestId('setup-password').waitFor();
  await page.waitForTimeout(700);
  await capture(page, `lock-setup-${variant}`);

  await page.getByTestId('setup-password').fill(TEST_PASSWORD);
  await page.getByTestId('setup-repeat').fill('Cockpit-Test');
  await page.getByTestId('setup-submit').click();
  await page.getByText('Die Passwörter stimmen nicht überein.').waitFor();
  await page.waitForTimeout(600);
  await capture(page, `lock-setup-error-${variant}`);

  await page.getByTestId('setup-repeat').fill(TEST_PASSWORD);
  await page.getByTestId('setup-repeat').focus();
  await setKeyboard(page, true);
  await capture(page, `lock-setup-keyboard-${variant}`);
  await setKeyboard(page, false);

  await page.getByRole('switch', { name: /Verstanden/ }).click();
  await page.getByTestId('setup-submit').click();
  await page.getByTestId('lock-screen').waitFor({ state: 'detached' });
}

/** Locked: unlock screen, the unlock moment, a wrong password and the wait. */
async function captureUnlock(page: Page, variant: string) {
  await page.goto(`${PREVIEW_URL}#/settings`);
  // Reload: no dialog or overlay from the previous shot.
  await page.reload({ waitUntil: 'networkidle' });
  await unlockIfLocked(page);
  await page.getByTestId('lock-now').click();
  const field = page.getByTestId('unlock-password');
  await field.waitFor();
  await page.waitForTimeout(700);
  await capture(page, `lock-unlock-${variant}`);

  await field.fill(TEST_PASSWORD);
  await page.getByTestId('unlock-submit').click();
  await page.locator('[data-state="success"]').waitFor();
  await page.waitForTimeout(450);
  await capture(page, `lock-opening-${variant}`);
  await page.getByTestId('lock-screen').waitFor({ state: 'detached' });

  await page.getByTestId('sidebar-lock').or(page.getByTestId('lock-now')).first().click();
  for (const attempt of [1, 2, 3]) {
    await field.fill(`falsch-${attempt}`);
    await page.getByTestId('unlock-submit').click();
    await page
      .getByText(attempt < 3 ? 'Das Passwort stimmt nicht.' : /Zu viele Versuche/)
      .waitFor();
    await page.waitForTimeout(700);
    if (attempt === 1) await capture(page, `lock-unlock-error-${variant}`);
  }
  await capture(page, `lock-unlock-wait-${variant}`);
}

async function settingsSecurity(page: Page) {
  await page.getByTestId('settings-security').evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
  });
}

async function changePassword(page: Page) {
  await page.getByRole('button', { name: 'Passwort ändern' }).click();
  const dialog = page.getByRole('dialog', { name: 'Passwort ändern' });
  await dialog.getByLabel('Aktuelles Passwort').fill(TEST_PASSWORD);
  await dialog.getByLabel('Neues Passwort', { exact: true }).fill('Sonnenblume Fahrrad Wolke');
}

/** Mocked Anthropic API: the connection test answers without a real key or network. */
async function mockAnthropic(page: Page) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  const model = {
    type: 'model',
    id: 'claude-haiku-4-5-20251001',
    display_name: 'Claude Haiku 4.5',
    created_at: '2025-10-01T00:00:00Z',
  };
  const message = {
    id: 'msg_screenshot',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    content: [
      {
        type: 'text',
        text: 'Am wichtigsten sind heute Lenas Folien fürs Kundenportal – sie braucht sie bis 13 Uhr. Eng wird es nach dem Projektmeeting, bis zum Videodreh bleiben nur zehn Minuten. Im Postfach warten zwei Mails mit Frist, der Rest kann bis heute Abend liegen bleiben.',
      },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 600, output_tokens: 70 },
  };
  await page.route('https://api.anthropic.com/**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          status: 200,
          headers: { ...cors, 'content-type': 'application/json' },
          body: JSON.stringify(route.request().method() === 'POST' ? message : model),
        }),
  );
}

async function settingsAi(page: Page) {
  const ai = page.getByTestId('settings-ai');
  const toggle = ai.getByRole('switch', { name: 'KI verwenden' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  const status = ai.getByTestId('api-key-status');
  await status.waitFor();
  if ((await status.textContent()) !== 'Key hinterlegt') {
    await ai.getByTestId('api-key-input').fill('sk-ant-api03-screenshot-0123456789abcdefghijk');
    await ai.getByRole('button', { name: 'Key speichern' }).click();
    await status.filter({ hasText: 'Key hinterlegt' }).waitFor();
  }
  await ai.getByRole('button', { name: 'Verbindung testen' }).click();
  await ai.getByTestId('connection-result').waitFor();
  await page.waitForTimeout(3200); // let the toast disappear
  await ai.evaluate((element) => element.scrollIntoView({ block: 'start' }));
}

/** Mocked Google sign-in and APIs for the screenshots (no real account). */
async function mockGoogle(page: Page) {
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  await page.context().route('https://accounts.google.com/**', (route) => {
    const url = new URL(route.request().url());
    const fragment = new URLSearchParams({
      state: url.searchParams.get('state') ?? '',
      access_token: 'ya29.screenshot',
      token_type: 'Bearer',
      expires_in: '3599',
      scope: url.searchParams.get('scope') ?? '',
    });
    return route.fulfill({
      status: 302,
      headers: { location: `${url.searchParams.get('redirect_uri')}#${fragment.toString()}` },
    });
  });
  const api = (body: unknown) => (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          status: 200,
          headers: { ...cors, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
  await page
    .context()
    .route(
      'https://www.googleapis.com/**',
      api({ items: [{ id: 'primary', primary: true }, { id: 'feiertage' }] }),
    );
  await page
    .context()
    .route('https://gmail.googleapis.com/**', api({ emailAddress: 'du@example.com' }));
}

/** The setup guide and the own client ID are in developer mode only. */
async function settingsGoogleSetup(page: Page) {
  const toggle = page.getByRole('switch', { name: 'Entwicklermodus' });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  const google = page.getByTestId('settings-google');
  await google.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await google.getByRole('button', { name: /So richtest du Google ein/ }).click();
  await page.waitForTimeout(300);
}

async function settingsGoogleConnected(page: Page) {
  const google = page.getByTestId('settings-google');
  const popup = page.context().waitForEvent('page');
  await google.getByRole('button', { name: 'Mit Google verbinden' }).click();
  await popup;
  await google.getByTestId('google-status').filter({ hasText: 'Verbunden bis' }).waitFor();
  await google.getByRole('button', { name: 'Zugriff testen' }).click();
  await google.getByTestId('google-test-result').waitFor();
  await page.waitForTimeout(3200); // let the toasts disappear
  await google.evaluate((element) => element.scrollIntoView({ block: 'start' }));
}

async function settingsAiOff(page: Page) {
  await page.getByTestId('settings-ai').evaluate((element) => {
    element.scrollIntoView({ block: 'start' });
  });
}

async function devVault(page: Page) {
  const section = page.getByTestId('dev-section-vault');
  for (let i = 0; i < 3; i += 1) {
    await section.getByRole('button', { name: 'Testaufgabe anlegen' }).click();
    await section
      .getByTestId('vault-count-tasks')
      .filter({ hasText: String(i + 1) })
      .waitFor();
  }
  await section.getByRole('button', { name: 'Letzte ändern' }).click();
  await page.waitForTimeout(3200); // let the toasts disappear
}

/** Fresh invented tasks and contracts (the vault shot created demo test tasks before). */
async function createDemoData(page: Page) {
  await page.goto(`${PREVIEW_URL}#/dev/ui`);
  const section = page.getByTestId('dev-section-demo');
  await section.waitFor();
  const remove = section.getByTestId('dev-demo-remove');
  if (await remove.isEnabled()) {
    await remove.click();
    await section.getByTestId('dev-demo-count').filter({ hasText: '0 Demo-Einträge' }).waitFor();
  }
  await section.getByTestId('dev-demo-tasks').click();
  await section.getByTestId('dev-demo-count').filter({ hasText: '9 Demo-Einträge' }).waitFor();
  await section.getByTestId('dev-demo-documents').click();
  await section.getByTestId('dev-demo-count').filter({ hasText: '15 Demo-Einträge' }).waitFor();
}

async function demoTasks(page: Page) {
  await createDemoData(page);
  await page.goto(`${PREVIEW_URL}#/tasks`);
  await page.getByTestId('task-row').first().waitFor();
  await page.waitForTimeout(3200); // let the toast disappear
}

async function taskEditor(page: Page) {
  await page.getByTestId('tasks-add').click();
  await page.getByTestId('task-title-input').fill('Bewerbung für das Praktikum abschicken');
  const editor = page.getByTestId('task-editor');
  await editor.getByRole('button', { name: 'Morgen', exact: true }).click();
  await editor.getByRole('radio', { name: 'Hoch' }).click();
}

async function demoDocuments(page: Page) {
  // A filtered run (SHOTS=documents) has no demo data yet.
  if ((await page.getByTestId('document-card').count()) === 0) {
    await createDemoData(page);
    await page.goto(`${PREVIEW_URL}#/documents`);
  }
  await page.getByTestId('document-card').first().waitFor();
  await page.waitForTimeout(3200); // let the toasts disappear
}

async function documentDetail(page: Page) {
  await page.getByTestId('document-card').filter({ hasText: 'Hausrat' }).click();
  await page.getByTestId('file-tile').first().waitFor();
}

async function documentEditor(page: Page) {
  await documentDetail(page);
  await page.getByTestId('document-edit').click();
  await page.getByTestId('document-editor').waitFor();
}

async function documentCalendar(page: Page) {
  await page.getByTestId('documents-export').click();
  await page.getByTestId('calendar-preview').waitFor();
}

async function taskMenu(page: Page) {
  await page.getByTestId('task-menu').first().click();
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
  { route: '/settings', name: 'settings-security', prepare: settingsSecurity },
  { route: '/settings', name: 'settings-password', prepare: changePassword },
  { route: '/settings', name: 'settings-google', prepare: settingsGoogleConnected },
  { route: '/settings', name: 'settings-google-setup', prepare: settingsGoogleSetup },
  { route: '/settings', name: 'settings-ai-off', prepare: settingsAiOff },
  { route: '/settings', name: 'settings-ai', prepare: settingsAi },
  { route: '/dev/ui', name: 'dev-ui', prepare: enableDevMode, scroll: true },
  { route: '/dev/ui', name: 'dev-vault', prepare: devVault },
  { route: '/dev/ui', name: 'tasks-demo', prepare: demoTasks, scroll: true },
  { route: '/tasks', name: 'tasks-editor', prepare: taskEditor },
  { route: '/tasks', name: 'tasks-menu', prepare: taskMenu },
  { route: '/documents', name: 'documents-demo', prepare: demoDocuments, scroll: true },
  { route: '/documents', name: 'documents-detail', prepare: documentDetail, scroll: true },
  { route: '/documents', name: 'documents-editor', prepare: documentEditor },
  { route: '/documents', name: 'documents-calendar', prepare: documentCalendar },
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

async function quickSetup(page: Page) {
  await page.goto(PREVIEW_URL, { waitUntil: 'networkidle' });
  await page.getByTestId('setup-password').fill(TEST_PASSWORD);
  await page.getByTestId('setup-repeat').fill(TEST_PASSWORD);
  await page.getByRole('switch', { name: /Verstanden/ }).click();
  await page.getByTestId('setup-submit').click();
  await page.getByTestId('lock-screen').waitFor({ state: 'detached' });
}

/** Scrolls the page in viewport-sized steps and captures every part after the first. */
async function captureScrolled(page: Page, name: string, variant: string) {
  const container = page.locator('[data-scroll-container]');
  for (let part = 2; part <= 4; part += 1) {
    const moved = await container.evaluate((element) => {
      const before = element.scrollTop;
      element.scrollTop += element.clientHeight - 80;
      return element.scrollTop !== before;
    });
    if (!moved) break;
    await page.waitForTimeout(300);
    await capture(page, `${name}-${part}-${variant}`);
  }
}

/**
 * "Heute" with the invented demo day at a fixed time (Monday 10:20), once rule-based and
 * once formulated by (mocked) Claude. Own context: the fixed clock stays out of the lock shots.
 */
async function captureToday(variant: { name: string; options: BrowserContextOptions }) {
  const context = await browser.newContext({ ...variant.options, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-05T10:20:00+02:00'));
  await mockAnthropic(page);
  await quickSetup(page);
  await enableDevMode(page);
  await createDemoData(page);
  await page.goto(`${PREVIEW_URL}#/settings`);
  await settingsAi(page);
  // Hash navigation only: a reload would lock the app and forget the demo day.
  await page.goto(`${PREVIEW_URL}#/today`);
  await page.getByTestId('today-demo').click();
  await page.getByTestId('today-overview').waitFor();
  await page.waitForTimeout(900);
  await capture(page, `today-demo-${variant.name}`);
  await captureScrolled(page, 'today-demo', variant.name);
  await page.locator('[data-scroll-container]').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByTestId('summarize').click();
  await page.getByTestId('overview-source').filter({ hasText: '(Claude)' }).waitFor();
  await page.waitForTimeout(900);
  await capture(page, `today-claude-${variant.name}`);
  await context.close();
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
    await context.addInitScript(simulatedKeyboardScript);
    const page = await context.newPage();
    await mockAnthropic(page);
    await mockGoogle(page);
    const wide = (variant.options.viewport?.width ?? 0) >= 900;
    const split = variant.name.startsWith('split');
    if (!ONLY || ONLY.startsWith('lock')) {
      await captureSetup(page, variant.name);
    } else {
      await quickSetup(page);
    }
    // A filtered run still needs the developer mode (normally enabled by the dev-ui shot).
    if (ONLY) await enableDevMode(page);
    const shots = SHOTS.filter((s) => !ONLY || s.name.startsWith(ONLY));
    for (const shot of split ? shots.slice(0, SPLIT_SHOTS) : shots) {
      if (shot.wideOnly && !wide) continue;
      await page.goto(`${PREVIEW_URL}#${shot.route}`, { waitUntil: 'networkidle' });
      // Same hash = no navigation; reload so dialogs from the previous shot are gone.
      await page.reload({ waitUntil: 'networkidle' });
      await unlockIfLocked(page);
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
    if (!split && (!ONLY || ONLY.startsWith('lock'))) await captureUnlock(page, variant.name);
    await context.close();
    if (!ONLY || ONLY.startsWith('today')) await captureToday(variant);
  }
} finally {
  await browser.close();
  await server.close();
}
