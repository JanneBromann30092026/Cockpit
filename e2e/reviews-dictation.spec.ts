import { expect, test, type Page } from '@playwright/test';
import { openApp, storageDump } from './vault.ts';

/** Monday, 5 October 2026, 20:15 in Berlin. */
const NOW = new Date('2026-10-05T20:15:00+02:00');

interface SpeechMock {
  text?: string;
  error?: string;
  /** Remove speech recognition entirely (browser without it). */
  missing?: boolean;
}

/** A fake SpeechRecognition: first an interim result, then the final text. */
async function mockSpeech(page: Page, mock: SpeechMock) {
  await page.addInitScript((config: SpeechMock) => {
    const scope = window as unknown as Record<string, unknown>;
    scope.__speechLang = '';
    if (config.missing) {
      scope.SpeechRecognition = undefined;
      scope.webkitSpeechRecognition = undefined;
      return;
    }
    type Handler = ((event: unknown) => void) | null;
    const results = (text: string, isFinal: boolean) => [
      Object.assign([{ transcript: text, confidence: 0.9 }], { isFinal }),
    ];
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: Handler = null;
      onerror: Handler = null;
      onend: (() => void) | null = null;
      start() {
        scope.__speechLang = this.lang;
        setTimeout(() => {
          if (config.error) {
            this.onerror?.({ error: config.error });
            this.onend?.();
            return;
          }
          const text = config.text ?? '';
          this.onresult?.({ results: results(text.slice(0, 12), false) });
          setTimeout(() => this.onresult?.({ results: results(text, true) }), 80);
        }, 80);
      }
      stop() {
        setTimeout(() => this.onend?.(), 20);
      }
      abort() {
        this.onend?.();
      }
    }
    scope.SpeechRecognition = FakeRecognition;
    scope.webkitSpeechRecognition = FakeRecognition;
  }, mock);
}

const card = (page: Page) => page.getByTestId('dictation-card');
const points = (page: Page, section: string) =>
  page.getByTestId(section).getByTestId('review-point');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test('daily review: speak, see the text, sort the sentences, take them over', async ({ page }) => {
  await mockSpeech(page, {
    text: 'Heute lief die Präsentation richtig gut. Ich war am Nachmittag abgelenkt. Morgen will ich das Handy weglegen. Mittags mit Mia gegessen.',
  });
  await openApp(page, '/reviews/day/2026-10-05');
  await card(page).getByTestId('dictation-record').click();
  await expect(card(page)).toContainText('Hört zu …');
  await expect(card(page).getByTestId('dictation-text')).toHaveValue(/Mittags mit Mia gegessen\.$/);
  expect(
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__speechLang),
  ).toBe('de-DE');
  await card(page).getByTestId('dictation-stop').click();
  await expect(card(page).getByTestId('dictation-record')).toHaveText('Weiter aufnehmen');

  await card(page).getByTestId('dictation-sort').click();
  const rows = card(page).getByTestId('dictation-row');
  await expect(rows).toHaveCount(4);
  const checked = (index: number) => rows.nth(index).getByRole('radio', { checked: true });
  await expect(checked(0)).toHaveText('Gut');
  await expect(checked(1)).toHaveText('Nicht gut');
  await expect(checked(2)).toHaveText('Besser');
  await expect(checked(3)).toHaveText('Notiz');
  // Adjusting the proposal.
  await rows.nth(3).getByRole('radio', { name: 'Gut', exact: true }).click();
  await card(page).getByTestId('dictation-apply').click();

  await expect(page.getByText('4 Sätze übernommen')).toBeVisible();
  await expect(points(page, 'review-went-well')).toHaveText([
    'Heute lief die Präsentation richtig gut',
    'Mittags mit Mia gegessen',
  ]);
  await expect(points(page, 'review-not-well')).toHaveText(['Ich war am Nachmittag abgelenkt']);
  await expect(points(page, 'review-improve')).toHaveText(['Morgen will ich das Handy weglegen']);
  await expect(card(page).getByTestId('dictation-text')).toHaveValue('');
  await expect(page.getByTestId('review-autosave')).toHaveText('Gespeichert');
  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain('Präsentation');
});

test('weekly review: spoken plans become the three changes, the rest goes to the note', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-04T19:00:00+02:00'));
  await mockSpeech(page, {
    text: 'Sport lief richtig gut. Meetings ohne Agenda waren schlecht. Ich will jeden Sonntag planen. Ich will das Handy weglegen. Ich will früher schlafen. Ich will mehr lesen.',
  });
  await openApp(page, '/reviews/week/2026-10-04');
  await card(page).getByTestId('dictation-record').click();
  await expect(card(page).getByTestId('dictation-text')).toHaveValue(/mehr lesen\.$/);
  await card(page).getByTestId('dictation-sort').click();
  await expect(
    card(page).getByTestId('dictation-row').first().getByRole('radio', { checked: true }),
  ).toHaveText('Muster');
  await card(page).getByTestId('dictation-apply').click();
  await expect(points(page, 'review-patterns')).toHaveText(['Sport lief richtig gut']);
  await expect(points(page, 'review-brakes')).toHaveText(['Meetings ohne Agenda waren schlecht']);
  await expect(page.getByTestId('review-change-1')).toHaveValue('Ich will jeden Sonntag planen');
  await expect(page.getByTestId('review-change-3')).toHaveValue('Ich will früher schlafen');
  await expect(page.getByTestId('review-note')).toHaveValue('Ich will mehr lesen');
});

test('without speech recognition the keyboard microphone is the way; typed text sorts too', async ({
  page,
}) => {
  await mockSpeech(page, { missing: true });
  await openApp(page, '/reviews/day/2026-10-05');
  await expect(card(page).getByTestId('dictation-record')).toHaveCount(0);
  await expect(card(page).getByTestId('dictation-hint')).toContainText('Mikrofon auf der Tastatur');
  await card(page)
    .getByTestId('dictation-text')
    .fill('Endlich die Steuer erledigt. Zu spät ins Bett.');
  await card(page).getByTestId('dictation-sort').click();
  await card(page).getByTestId('dictation-apply').click();
  await expect(points(page, 'review-went-well')).toHaveText(['Endlich die Steuer erledigt']);
  await expect(points(page, 'review-not-well')).toHaveText(['Zu spät ins Bett']);
});

test('a denied microphone shows how to go on; silence asks to try again', async ({ page }) => {
  await mockSpeech(page, { error: 'not-allowed' });
  await openApp(page, '/reviews/day/2026-10-05');
  await card(page).getByTestId('dictation-record').click();
  await expect(card(page).getByTestId('dictation-hint')).toContainText(
    'Das Mikrofon ist nicht erlaubt',
  );
  await expect(card(page).getByTestId('dictation-record')).toHaveCount(0);
});

test('nothing heard: try again', async ({ page }) => {
  await mockSpeech(page, { error: 'no-speech' });
  await openApp(page, '/reviews/day/2026-10-05');
  await card(page).getByTestId('dictation-record').click();
  await expect(card(page).getByTestId('dictation-problem')).toHaveText(
    'Nichts gehört – bitte noch einmal.',
  );
  await expect(card(page).getByTestId('dictation-record')).toBeVisible();
});
