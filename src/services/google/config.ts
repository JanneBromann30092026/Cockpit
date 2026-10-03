/** Where the OAuth result comes back (oauth.html next to the app, a separate tiny page). */
export const OAUTH_CALLBACK_FILE = 'oauth.html';

/** postMessage / BroadcastChannel name for results from the sign-in window. */
export const OAUTH_MESSAGE_TYPE = 'cockpit-google-oauth';

/** sessionStorage keys of the full-page redirect variant (survive the reload, per tab). */
export const REDIRECT_STATE_KEY = 'cockpit.googleOAuthState';
export const REDIRECT_RESULT_KEY = 'cockpit.googleOAuthResult';

export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Absolute URL of the callback page, e.g. https://…github.io/Cockpit/oauth.html. */
export function oauthRedirectUri(): string {
  return new URL(`${import.meta.env.BASE_URL}${OAUTH_CALLBACK_FILE}`, window.location.origin).href;
}

/** Origin to register as "Authorized JavaScript origin" in the Google Cloud console. */
export function appOrigin(): string {
  return window.location.origin;
}
