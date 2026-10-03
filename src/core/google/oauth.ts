/**
 * Google OAuth 2.0 for client-side apps (token flow): building the authorization URL and
 * reading the result from the redirect fragment. Pure functions, no browser APIs.
 */

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

/** Read-only access to Calendar and Gmail (nothing else is ever requested). */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const;

/** OAuth client IDs of type "Web application", e.g. 1234-abc.apps.googleusercontent.com. */
export const GOOGLE_CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

export interface AuthUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}

export function buildAuthUrl({
  clientId,
  redirectUri,
  state,
  scopes = GOOGLE_SCOPES,
}: AuthUrlInput): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: scopes.join(' '),
    include_granted_scopes: 'true',
    state,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export type OAuthResult =
  | { kind: 'token'; state: string; accessToken: string; expiresIn: number; scopes: string[] }
  | { kind: 'error'; state: string; error: string };

/**
 * Reads "#access_token=…&expires_in=…&scope=…&state=…" or "#error=…&state=…".
 * Returns null when the fragment holds no OAuth result.
 */
export function parseOAuthFragment(fragment: string): OAuthResult | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const state = params.get('state') ?? '';
  const error = params.get('error');
  if (error) return { kind: 'error', state, error };
  const accessToken = params.get('access_token');
  if (!accessToken) return null;
  const expiresIn = Number(params.get('expires_in'));
  return {
    kind: 'token',
    state,
    accessToken,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
    scopes: (params.get('scope') ?? '').split(/\s+/).filter(Boolean),
  };
}

/** Scopes the user did not grant (Google lets people untick single permissions). */
export function missingScopes(granted: readonly string[]): string[] {
  return GOOGLE_SCOPES.filter((scope) => !granted.includes(scope));
}
