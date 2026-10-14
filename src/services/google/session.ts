/**
 * The Google access token of this session. It lives only in this module's memory (never in
 * a store, never persisted) and expires after about an hour; Google issues no refresh token
 * to browser apps, so the user connects again when it has run out.
 */
import { create } from 'zustand';
import type { GoogleErrorCode } from './errors';

export type GoogleStatus = 'disconnected' | 'connecting' | 'connected';

interface GoogleSessionState {
  status: GoogleStatus;
  /** Epoch milliseconds when the token runs out. */
  expiresAt: number | null;
  /** Last connection problem (shown in the settings until the next attempt). */
  error: GoogleErrorCode | null;
  /** Granted scopes of the current token (not secret; decides whether writing is allowed). */
  scopes: string[];
}

export const useGoogleSession = create<GoogleSessionState>(() => ({
  status: 'disconnected',
  expiresAt: null,
  error: null,
  scopes: [],
}));

/** A token is treated as expired a minute early, so requests do not fail mid-way. */
const EXPIRY_MARGIN_MS = 60_000;

let accessToken: string | null = null;

export function setGoogleToken(
  token: string,
  expiresInSeconds: number,
  now = Date.now(),
  scopes: string[] = [],
): void {
  accessToken = token;
  useGoogleSession.setState({
    status: 'connected',
    expiresAt: now + expiresInSeconds * 1000,
    error: null,
    scopes,
  });
}

/** The current token, or null when there is none or it has expired. */
export function currentGoogleToken(now = Date.now()): string | null {
  const { expiresAt } = useGoogleSession.getState();
  if (!accessToken || expiresAt === null) return null;
  if (now >= expiresAt - EXPIRY_MARGIN_MS) {
    clearGoogleToken('EXPIRED');
    return null;
  }
  return accessToken;
}

export function clearGoogleToken(error: GoogleErrorCode | null = null): void {
  accessToken = null;
  useGoogleSession.setState({ status: 'disconnected', expiresAt: null, error, scopes: [] });
}

export function setGoogleConnecting(): void {
  useGoogleSession.setState({ status: 'connecting', error: null });
}

export function setGoogleError(error: GoogleErrorCode): void {
  const status = accessToken ? 'connected' : 'disconnected';
  useGoogleSession.setState({ status, error });
}
