/**
 * Builds the Web Push request for one reminder (web-push library: VAPID JWT and aes128gcm
 * encrypted payload). The payload only names the reminder; the texts live in the app.
 */
import webpush, { type RequestDetails } from 'web-push';
import type { PushConfig } from '../../src/core/push/config.ts';
import { pushPayload, type PushReminder } from '../../src/core/push/reminders.ts';

/** Contact in the VAPID token (Apple requires mailto: or https:). No personal address. */
export const VAPID_SUBJECT = 'https://jannebromann30092026.github.io/Cockpit/';

/** A reminder that cannot be delivered within 4 hours (iPad off) is dropped by the push service. */
export const PUSH_TTL_SECONDS = 4 * 60 * 60;

function options(config: PushConfig) {
  return {
    vapidDetails: {
      subject: VAPID_SUBJECT,
      publicKey: config.publicKey,
      privateKey: config.privateKey,
    },
    TTL: PUSH_TTL_SECONDS,
    urgency: 'normal' as const,
  };
}

export function pushBody(reminder: PushReminder): string {
  return JSON.stringify(pushPayload(reminder));
}

export function buildPushRequest(config: PushConfig, reminder: PushReminder): RequestDetails {
  return webpush.generateRequestDetails(config.subscription, pushBody(reminder), options(config));
}

export function sendPush(config: PushConfig, reminder: PushReminder) {
  return webpush.sendNotification(config.subscription, pushBody(reminder), options(config));
}
