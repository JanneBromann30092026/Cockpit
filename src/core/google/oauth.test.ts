import { describe, expect, it } from 'vitest';
import {
  buildAuthUrl,
  GOOGLE_CLIENT_ID_PATTERN,
  GOOGLE_SCOPES,
  missingScopes,
  parseOAuthFragment,
} from './oauth';

describe('Google OAuth', () => {
  it('builds the authorization URL for the token flow with read-only scopes', () => {
    const url = new URL(
      buildAuthUrl({
        clientId: '123-abc.apps.googleusercontent.com',
        redirectUri: 'https://example.github.io/Cockpit/oauth.html',
        state: 'xyz',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '123-abc.apps.googleusercontent.com',
      redirect_uri: 'https://example.github.io/Cockpit/oauth.html',
      response_type: 'token',
      scope: GOOGLE_SCOPES.join(' '),
      include_granted_scopes: 'true',
      state: 'xyz',
    });
    expect(GOOGLE_SCOPES.every((scope) => scope.endsWith('.readonly'))).toBe(true);
  });

  it('reads a token, an error or nothing from the fragment', () => {
    expect(
      parseOAuthFragment(
        `#state=s1&access_token=ya29.abc&token_type=Bearer&expires_in=3599&scope=${encodeURIComponent(
          GOOGLE_SCOPES.join(' '),
        )}`,
      ),
    ).toEqual({
      kind: 'token',
      state: 's1',
      accessToken: 'ya29.abc',
      expiresIn: 3599,
      scopes: [...GOOGLE_SCOPES],
    });
    expect(parseOAuthFragment('#error=access_denied&state=s2')).toEqual({
      kind: 'error',
      state: 's2',
      error: 'access_denied',
    });
    expect(parseOAuthFragment('#/today')).toBeNull();
    expect(parseOAuthFragment('#access_token=t&expires_in=abc')).toMatchObject({
      expiresIn: 3600,
      scopes: [],
      state: '',
    });
  });

  it('reports scopes the user did not grant', () => {
    expect(missingScopes([...GOOGLE_SCOPES])).toEqual([]);
    expect(missingScopes([GOOGLE_SCOPES[0]])).toEqual([GOOGLE_SCOPES[1]]);
  });

  it('accepts only web client IDs', () => {
    expect(GOOGLE_CLIENT_ID_PATTERN.test('123456789012-abcdef123.apps.googleusercontent.com')).toBe(
      true,
    );
    expect(GOOGLE_CLIENT_ID_PATTERN.test('GOCSPX-secret')).toBe(false);
    expect(GOOGLE_CLIENT_ID_PATTERN.test('123.apps.googleusercontent.com')).toBe(false);
  });
});
