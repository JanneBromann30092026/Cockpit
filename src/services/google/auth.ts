/**
 * Google sign-in for the home screen app. Two variants, because iPadOS treats them
 * differently in installed web apps:
 * - popup: window.open keeps the sign-in inside the app; the callback page hands the
 *   result back via postMessage (opener) or BroadcastChannel.
 * - redirect: the whole app navigates to Google and comes back (reloads, locked again);
 *   the result waits in sessionStorage of this tab and is picked up at startup.
 */
import {
  buildAuthUrl,
  missingScopes,
  REDIRECT_STATE_PREFIX,
  type OAuthResult,
} from '@/core/google/oauth';
import {
  GOOGLE_REVOKE_URL,
  OAUTH_MESSAGE_TYPE,
  oauthRedirectUri,
  REDIRECT_RESULT_KEY,
  REDIRECT_STATE_KEY,
} from './config';
import type { GoogleErrorCode } from './errors';
import {
  clearGoogleToken,
  currentGoogleToken,
  setGoogleConnecting,
  setGoogleError,
  setGoogleToken,
} from './session';

export interface OAuthMessage {
  type: typeof OAUTH_MESSAGE_TYPE;
  result: OAuthResult;
}

function isOAuthMessage(value: unknown): value is OAuthMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === OAUTH_MESSAGE_TYPE &&
    typeof (value as { result?: unknown }).result === 'object'
  );
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** State of the popup sign-in that is still waiting for its result. */
let pending: { state: string; popup: Window; timer: number } | null = null;

function finishPending(): void {
  if (!pending) return;
  window.clearInterval(pending.timer);
  pending = null;
}

/** Applies a result whose state was checked by the caller. */
function applyResult(result: OAuthResult): void {
  if (result.kind === 'error') {
    setGoogleError(result.error === 'access_denied' ? 'DENIED' : 'AUTH_FAILED');
    return;
  }
  if (missingScopes(result.scopes).length > 0) {
    setGoogleError('MISSING_SCOPES');
    return;
  }
  setGoogleToken(result.accessToken, result.expiresIn);
}

function onPopupResult(result: OAuthResult): void {
  if (!pending) return;
  if (result.state !== pending.state) {
    finishPending();
    setGoogleError('STATE_MISMATCH');
    return;
  }
  try {
    pending.popup.close();
  } catch {
    // The window may already be gone.
  }
  finishPending();
  applyResult(result);
}

let listening = false;

/** Receives results from the sign-in window (opener message or broadcast). */
function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin || !isOAuthMessage(event.data)) return;
    onPopupResult(event.data.result);
  });
  if (typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel(OAUTH_MESSAGE_TYPE);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isOAuthMessage(event.data)) onPopupResult(event.data.result);
    };
  }
}

/** A closed window without result counts as cancelled (after a short grace period). */
const POLL_MS = 700;

/**
 * Opens Google's sign-in in a window. Must run directly in the tap handler, otherwise
 * Safari blocks the window.
 */
export function connectWithPopup(clientId: string): void {
  if (!clientId) {
    setGoogleError('NO_CLIENT_ID');
    return;
  }
  listen();
  finishPending();
  const state = randomState();
  const url = buildAuthUrl({ clientId, redirectUri: oauthRedirectUri(), state });
  const popup = window.open(url, 'cockpit-google', 'popup,width=520,height=680');
  if (!popup) {
    setGoogleError('POPUP_BLOCKED');
    return;
  }
  setGoogleConnecting();
  let closedPolls = 0;
  const timer = window.setInterval(() => {
    if (!pending || !pending.popup.closed) return;
    closedPolls += 1;
    if (closedPolls < 3) return;
    finishPending();
    setGoogleError('CANCELLED');
  }, POLL_MS);
  pending = { state, popup, timer };
}

/** Navigates the whole app to Google; the result is picked up after the reload. */
export function connectWithRedirect(clientId: string): void {
  if (!clientId) {
    setGoogleError('NO_CLIENT_ID');
    return;
  }
  const state = `${REDIRECT_STATE_PREFIX}${randomState()}`;
  try {
    sessionStorage.setItem(REDIRECT_STATE_KEY, state);
  } catch {
    setGoogleError('AUTH_FAILED');
    return;
  }
  setGoogleConnecting();
  window.location.assign(buildAuthUrl({ clientId, redirectUri: oauthRedirectUri(), state }));
}

/** Startup: takes over the result of a redirect sign-in (and removes it from storage). */
export function consumeRedirectResult(): void {
  let raw: string | null;
  let expected: string | null;
  try {
    raw = sessionStorage.getItem(REDIRECT_RESULT_KEY);
    expected = sessionStorage.getItem(REDIRECT_STATE_KEY);
    sessionStorage.removeItem(REDIRECT_RESULT_KEY);
    sessionStorage.removeItem(REDIRECT_STATE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let result: OAuthResult;
  try {
    result = JSON.parse(raw) as OAuthResult;
  } catch {
    setGoogleError('AUTH_FAILED');
    return;
  }
  if (!expected || result.state !== expected) {
    setGoogleError('STATE_MISMATCH');
    return;
  }
  applyResult(result);
}

/** Forgets the token and asks Google to revoke it (best effort, also works offline). */
export async function disconnectGoogle(): Promise<void> {
  const token = currentGoogleToken();
  finishPending();
  clearGoogleToken();
  if (!token) return;
  try {
    await fetch(GOOGLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // The token expires on its own within the hour.
  }
}

export function reportGoogleError(code: GoogleErrorCode): void {
  setGoogleError(code);
}
