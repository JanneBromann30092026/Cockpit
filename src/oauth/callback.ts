/**
 * Callback page of the Google sign-in (oauth.html). Reads the result from the URL fragment,
 * removes it from the address bar and hands it to the app:
 * - popup: postMessage to the opening app window and BroadcastChannel (if the opener link
 *   is lost), then closes itself;
 * - redirect: keeps it in sessionStorage of this tab and returns to the app.
 * The token is never written to persistent storage.
 */
import { parseOAuthFragment, REDIRECT_STATE_PREFIX, type OAuthResult } from '@/core/google/oauth';
import { de } from '@/i18n/de';
import { OAUTH_MESSAGE_TYPE, REDIRECT_RESULT_KEY } from '@/services/google/config';
import '@/styles/global.css';

const t = de.google.callback;

function show(title: string, text: string): void {
  const titleElement = document.getElementById('title');
  const textElement = document.getElementById('text');
  if (titleElement) titleElement.textContent = title;
  if (textElement) textElement.textContent = text;
}

const result: OAuthResult = parseOAuthFragment(window.location.hash) ?? {
  kind: 'error',
  state: '',
  error: 'invalid_response',
};
// The token must not stay in the address bar or the history.
window.history.replaceState(null, '', window.location.pathname);
const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href;

if (result.state.startsWith(REDIRECT_STATE_PREFIX)) {
  try {
    sessionStorage.setItem(REDIRECT_RESULT_KEY, JSON.stringify(result));
  } catch {
    // Without sessionStorage the app reports a failed sign-in.
  }
  show(t.title, t.returning);
  window.location.replace(`${appUrl}#/settings`);
} else {
  const message = { type: OAUTH_MESSAGE_TYPE, result };
  try {
    const opener = window.opener as Window | null;
    opener?.postMessage(message, window.location.origin);
  } catch {
    // The opener may be gone; the broadcast below still reaches the app.
  }
  try {
    const channel = new BroadcastChannel(OAUTH_MESSAGE_TYPE);
    channel.postMessage(message);
    channel.close();
  } catch {
    // Not supported: the opener message is the only way.
  }
  show(t.title, result.kind === 'token' ? t.done : t.failed);
  window.setTimeout(() => window.close(), 400);
}
