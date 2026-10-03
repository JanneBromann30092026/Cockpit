/**
 * Callback page of the Google sign-in window (oauth.html). Reads the result from the URL
 * fragment, removes it from the address bar, hands it to the app (postMessage to the
 * opening window, BroadcastChannel if the opener link is lost) and closes itself.
 * The token is never written to any storage.
 */
import { parseOAuthFragment, type OAuthResult } from '@/core/google/oauth';
import { de } from '@/i18n/de';
import { OAUTH_MESSAGE_TYPE } from '@/services/google/config';
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
