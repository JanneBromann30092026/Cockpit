export const GOOGLE_ERROR_CODES = [
  'NO_CLIENT_ID',
  'POPUP_BLOCKED',
  'CANCELLED',
  'DENIED',
  'STATE_MISMATCH',
  'MISSING_SCOPES',
  'AUTH_FAILED',
  'NOT_CONNECTED',
  'EXPIRED',
  'API_DISABLED',
  'FORBIDDEN',
  'RATE_LIMIT',
  'OFFLINE',
  'NETWORK',
  'INVALID_RESPONSE',
  'API_ERROR',
] as const;
export type GoogleErrorCode = (typeof GOOGLE_ERROR_CODES)[number];

/** Error with a stable code; the UI maps codes to German messages. Never contains a token. */
export class GoogleError extends Error {
  override readonly name = 'GoogleError';

  constructor(
    readonly code: GoogleErrorCode,
    message: string = code,
    readonly status?: number,
  ) {
    super(message);
  }
}
