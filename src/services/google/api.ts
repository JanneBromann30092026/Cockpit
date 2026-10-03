/**
 * Read-only calls to the Google REST APIs straight from the browser. Responses are only
 * kept in memory by the caller; nothing from Google is stored.
 */
import { z } from 'zod';
import { GoogleError } from './errors';
import { clearGoogleToken, currentGoogleToken } from './session';

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';

const TIMEOUT_MS = 15_000;

function isOffline(): boolean {
  return globalThis.navigator?.onLine === false;
}

const errorBodySchema = z.object({
  error: z
    .object({
      status: z.string().optional(),
      errors: z.array(z.object({ reason: z.string().optional() })).optional(),
      details: z.array(z.object({ reason: z.string().optional() }).loose()).optional(),
    })
    .loose(),
});

/** Reasons Google gives when the API is not switched on in the Cloud project. */
const DISABLED_REASONS = new Set(['accessNotConfigured', 'SERVICE_DISABLED']);
const SCOPE_REASONS = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT']);

async function errorFor(response: Response): Promise<GoogleError> {
  const { status } = response;
  if (status === 401) {
    clearGoogleToken('EXPIRED');
    return new GoogleError('EXPIRED', 'token expired or revoked', status);
  }
  if (status === 429) return new GoogleError('RATE_LIMIT', 'rate limited', status);
  if (status === 403) {
    const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
    const reasons = parsed.success
      ? [
          ...(parsed.data.error.errors ?? []).map((e) => e.reason),
          ...(parsed.data.error.details ?? []).map((d) => d.reason),
        ]
      : [];
    if (reasons.some((reason) => reason && DISABLED_REASONS.has(reason))) {
      return new GoogleError('API_DISABLED', 'api not enabled', status);
    }
    if (reasons.some((reason) => reason && SCOPE_REASONS.has(reason))) {
      clearGoogleToken('MISSING_SCOPES');
      return new GoogleError('MISSING_SCOPES', 'missing scopes', status);
    }
    return new GoogleError('FORBIDDEN', 'forbidden', status);
  }
  return new GoogleError('API_ERROR', `api error ${status}`, status);
}

/** GET with the session token; validates the JSON with `schema`. */
export async function googleGet<S extends z.ZodType>(
  url: string,
  schema: S,
  signal?: AbortSignal,
): Promise<z.output<S>> {
  const token = currentGoogleToken();
  if (!token) throw new GoogleError('NOT_CONNECTED');
  if (isOffline()) throw new GoogleError('OFFLINE');
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new GoogleError(isOffline() ? 'OFFLINE' : 'NETWORK');
  }
  if (!response.ok) throw await errorFor(response);
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new GoogleError('INVALID_RESPONSE');
  return parsed.data;
}

const calendarListSchema = z.object({
  items: z
    .array(
      z.object({ id: z.string(), summary: z.string().optional(), primary: z.boolean().optional() }),
    )
    .default([]),
});

const gmailProfileSchema = z.object({
  emailAddress: z.string(),
  messagesTotal: z.number().optional(),
});

export type CheckResult<T> = { ok: true; value: T } | { ok: false; error: GoogleError };

export interface GoogleConnectionTest {
  calendar: CheckResult<{ calendars: number }>;
  gmail: CheckResult<{ email: string }>;
}

async function check<T>(run: () => Promise<T>): Promise<CheckResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof GoogleError ? error : new GoogleError('API_ERROR'),
    };
  }
}

/** Reads the calendar list and the Gmail profile: proves both APIs work with this token. */
export async function testGoogleConnection(signal?: AbortSignal): Promise<GoogleConnectionTest> {
  const [calendar, gmail] = await Promise.all([
    check(async () => {
      const list = await googleGet(
        `${CALENDAR_API}/users/me/calendarList?maxResults=50&fields=items(id,summary,primary)`,
        calendarListSchema,
        signal,
      );
      return { calendars: list.items.length };
    }),
    check(async () => {
      const profile = await googleGet(`${GMAIL_API}/users/me/profile`, gmailProfileSchema, signal);
      return { email: profile.emailAddress };
    }),
  ]);
  return { calendar, gmail };
}
