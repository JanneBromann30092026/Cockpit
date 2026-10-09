/**
 * Sends one push reminder (run by .github/workflows/push.yml).
 *
 * Environment: PUSH_CONFIG (GitHub secret, see src/core/push/config.ts), EVENT_NAME
 * ("schedule" or "workflow_dispatch"), SCHEDULE (cron that started the run), REMINDER
 * (manual run). Never prints the subscription or the keys.
 */
import { appendFileSync } from 'node:fs';
import { WebPushError } from 'web-push';
import { PUSH_SECRET_NAME, parsePushConfig } from '../../src/core/push/config.ts';
import { isPushReminder, type PushReminder } from '../../src/core/push/reminders.ts';
import { decideSlot } from '../../src/core/push/schedule.ts';
import { sendPush } from './request.ts';

function summary(text: string): void {
  console.log(text);
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${text}\n`);
}

function fail(text: string): never {
  console.log(`::error::${text}`);
  summary(`❌ ${text}`);
  process.exit(1);
}

const manual = process.env.EVENT_NAME === 'workflow_dispatch';
const secret = process.env.PUSH_CONFIG?.trim() ?? '';

if (!secret) {
  const text = `Secret ${PUSH_SECRET_NAME} ist nicht hinterlegt – nichts gesendet. Einrichten: Cockpit → Einstellungen → Mitteilungen.`;
  if (manual) fail(text);
  summary(`ℹ️ ${text}`);
  process.exit(0);
}

const parsed = parsePushConfig(secret);
if (!parsed.ok) {
  fail(
    `Secret ${PUSH_SECRET_NAME} ist ungültig (${parsed.problem}). In Cockpit den Schlüssel neu kopieren und das Secret ersetzen.`,
  );
}
const config = parsed.config;
// Hide the values from the log even if a library prints them.
for (const value of [
  config.subscription.endpoint,
  config.subscription.keys.p256dh,
  config.subscription.keys.auth,
  config.privateKey,
]) {
  console.log(`::add-mask::${value}`);
}

let reminder: PushReminder;
if (manual) {
  const input = process.env.REMINDER ?? 'test';
  if (!isPushReminder(input)) fail(`Unbekannte Mitteilung „${input}“.`);
  reminder = input;
} else {
  const decision = decideSlot(process.env.SCHEDULE ?? '', new Date());
  if (!decision.send) {
    const reasons = {
      unknownCron: 'Zeitplan unbekannt',
      otherSeason: 'Zeitplan der anderen Jahreszeit (Sommer-/Winterzeit)',
      tooLate: `GitHub hat ${decision.delayMinutes ?? '?'} Min. zu spät gestartet – übersprungen`,
    } as const;
    summary(`⏭️ Nichts gesendet: ${reasons[decision.reason]}.`);
    process.exit(0);
  }
  reminder = decision.reminder;
  summary(`⏱️ GitHub startete ${decision.delayMinutes} Min. nach Plan.`);
}

try {
  const result = await sendPush(config, reminder);
  summary(`✅ Mitteilung „${reminder}“ gesendet (Status ${result.statusCode}).`);
} catch (error) {
  if (error instanceof WebPushError) {
    const reason = error.body ? ` – ${error.body.slice(0, 200)}` : '';
    if (error.statusCode === 404 || error.statusCode === 410) {
      fail(
        `Das Abo gibt es nicht mehr (${error.statusCode}). In Cockpit → Einstellungen → Mitteilungen neu einrichten und das Secret ${PUSH_SECRET_NAME} ersetzen.`,
      );
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      fail(
        `Der Push-Dienst lehnt die Schlüssel ab (${error.statusCode}${reason}). In Cockpit neu einrichten und das Secret ${PUSH_SECRET_NAME} ersetzen.`,
      );
    }
    fail(`Senden fehlgeschlagen (${error.statusCode}${reason}).`);
  }
  fail(`Senden fehlgeschlagen (${error instanceof Error ? error.name : 'unbekannt'}).`);
}
