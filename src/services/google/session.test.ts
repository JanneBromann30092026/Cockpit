import { beforeEach, describe, expect, it } from 'vitest';
import { clearGoogleToken, currentGoogleToken, setGoogleToken, useGoogleSession } from './session';

beforeEach(() => clearGoogleToken());

describe('Google session', () => {
  it('keeps the token in memory until shortly before it expires', () => {
    setGoogleToken('ya29.token', 3600, 1_000_000);
    expect(useGoogleSession.getState()).toMatchObject({
      status: 'connected',
      expiresAt: 1_000_000 + 3_600_000,
      error: null,
    });
    expect(currentGoogleToken(1_000_000 + 3_500_000)).toBe('ya29.token');
    // One minute before the end it counts as expired.
    expect(currentGoogleToken(1_000_000 + 3_540_000)).toBeNull();
    expect(useGoogleSession.getState()).toMatchObject({ status: 'disconnected', error: 'EXPIRED' });
  });

  it('forgets the token when disconnecting', () => {
    setGoogleToken('ya29.token', 3600);
    clearGoogleToken();
    expect(currentGoogleToken()).toBeNull();
    expect(useGoogleSession.getState()).toMatchObject({ status: 'disconnected', error: null });
  });
});
