export interface ConnectionTestResult {
  model: string;
  /** Human-readable model name, e.g. "Claude Haiku 4.5". */
  displayName: string;
}

export interface AiCallOptions {
  /** Cancels the request (e.g. when the user leaves the page). */
  signal?: AbortSignal;
}

/**
 * Exchangeable AI backend. UI code never talks to an SDK directly, only through this.
 * The feature steps add their calls (e.g. reading a contract, review evaluation).
 */
export interface AiProvider {
  readonly id: string;
  readonly model: string;
  /** Cheap check that key, network and model work (no tokens are generated). */
  testConnection(options?: AiCallOptions): Promise<ConnectionTestResult>;
}

export const AI_ERROR_CODES = [
  'NO_API_KEY',
  'DISABLED',
  'LOCKED',
  'OFFLINE',
  'NETWORK',
  'TIMEOUT',
  'ABORTED',
  'RATE_LIMIT',
  'OVERLOADED',
  'AUTH',
  'MODEL_NOT_FOUND',
  'API_ERROR',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

/** Error with a stable code; the UI maps codes to German messages. Never contains the key. */
export class AiError extends Error {
  override readonly name = 'AiError';

  constructor(
    readonly code: AiErrorCode,
    message: string = code,
    readonly status?: number,
  ) {
    super(message);
  }
}
