import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, toAiError, type AnthropicClientLike } from './anthropicProvider';
import { AiError } from './types';
import { DAY_SUMMARY_SYSTEM_PROMPT, type DaySummaryRequest } from '@/data/prompts/daySummary';

const MODEL = 'claude-haiku-4-5-20251001';

const modelInfo = {
  id: MODEL,
  display_name: 'Claude Haiku 4.5',
  type: 'model',
  created_at: '2025-10-01T00:00:00Z',
} as unknown as Anthropic.ModelInfo;

const notExpected = () => Promise.reject(new Error('not expected in this test'));

function provider(
  retrieve: AnthropicClientLike['models']['retrieve'],
  overrides: {
    model?: string;
    timeoutMs?: number;
    online?: boolean;
    apiKey?: string;
    create?: AnthropicClientLike['messages']['create'];
    betaCreate?: AnthropicClientLike['beta']['messages']['create'];
  } = {},
) {
  return new AnthropicProvider({
    apiKey: overrides.apiKey ?? 'sk-ant-test-key-0000000000',
    model: overrides.model ?? MODEL,
    timeoutMs: overrides.timeoutMs,
    isOnline: () => overrides.online ?? true,
    createClient: () => ({
      models: { retrieve },
      messages: { create: overrides.create ?? notExpected },
      beta: { messages: { create: overrides.betaCreate ?? notExpected } },
    }),
  });
}

const headers = new Headers();

describe('AnthropicProvider.testConnection', () => {
  it('looks up the model without generating tokens', async () => {
    const retrieve = vi.fn(() => Promise.resolve(modelInfo));
    expect(await provider(retrieve).testConnection()).toEqual({
      model: MODEL,
      displayName: 'Claude Haiku 4.5',
    });
    const [id, params, options] = retrieve.mock.calls[0] as unknown as [
      string,
      undefined,
      { signal: AbortSignal; timeout: number; maxRetries: number },
    ];
    expect(id).toBe(MODEL);
    expect(params).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options).toMatchObject({ timeout: 15_000, maxRetries: 1 });
  });

  it('fails early without key or network', async () => {
    const retrieve = vi.fn(() => Promise.resolve(modelInfo));
    await expect(provider(retrieve, { apiKey: '  ' }).testConnection()).rejects.toMatchObject({
      code: 'NO_API_KEY',
    });
    await expect(provider(retrieve, { online: false }).testConnection()).rejects.toMatchObject({
      code: 'OFFLINE',
    });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('times out and aborts the request', async () => {
    let seenSignal: AbortSignal | undefined;
    const retrieve = vi.fn(
      (_id: string, _params?: undefined, options?: { signal?: AbortSignal }) =>
        new Promise<Anthropic.ModelInfo>((_resolve, reject) => {
          seenSignal = options?.signal;
          options?.signal?.addEventListener('abort', () =>
            reject(new Anthropic.APIUserAbortError()),
          );
        }),
    );
    await expect(provider(retrieve, { timeoutMs: 20 }).testConnection()).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    expect(seenSignal?.aborted).toBe(true);
  });

  it('passes a cancellation through', async () => {
    const controller = new AbortController();
    const retrieve = vi.fn(
      (_id: string, _params?: undefined, options?: { signal?: AbortSignal }) =>
        new Promise<Anthropic.ModelInfo>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new Anthropic.APIUserAbortError()),
          );
        }),
    );
    const pending = provider(retrieve).testConnection({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('error mapping', () => {
  const map = (error: unknown, online = true) => toAiError(error, false, online).code;

  it('maps the API errors to stable codes', () => {
    expect(map(new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', headers))).toBe(
      'AUTH',
    );
    expect(map(new Anthropic.PermissionDeniedError(403, {}, 'forbidden', headers))).toBe('AUTH');
    expect(map(new Anthropic.NotFoundError(404, {}, 'model: claude-nope', headers))).toBe(
      'MODEL_NOT_FOUND',
    );
    expect(map(new Anthropic.RateLimitError(429, {}, 'rate limited', headers))).toBe('RATE_LIMIT');
    expect(map(new Anthropic.InternalServerError(529, {}, 'overloaded', headers))).toBe(
      'OVERLOADED',
    );
    expect(map(new Anthropic.InternalServerError(500, {}, 'boom', headers))).toBe('API_ERROR');
  });

  it('distinguishes offline from an unreachable API', () => {
    const connection = new Anthropic.APIConnectionError({ message: 'fetch failed' });
    expect(map(connection, true)).toBe('NETWORK');
    expect(map(connection, false)).toBe('OFFLINE');
    expect(map(new Anthropic.APIConnectionTimeoutError())).toBe('TIMEOUT');
  });

  it('never puts the key into the error', () => {
    const error = toAiError(
      new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key sk-ant-secret', headers),
      false,
      true,
    );
    expect(error).toBeInstanceOf(AiError);
    expect(error.message).not.toContain('sk-ant');
  });
});

const day: DaySummaryRequest = {
  now: 'Montag, 5. Oktober 2026, 09:00 Uhr',
  events: [{ time: '10:00–11:30', title: 'Vorlesung' }],
  mails: { important: [], people: [], updates: [], newsletters: 3 },
};

function answer(text: string, stopReason = 'end_turn'): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content: [{ type: 'text', text, citations: null }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

describe('AnthropicProvider.summarizeDay', () => {
  it('asks for three sentences with the overview data only', async () => {
    const create = vi.fn(() =>
      Promise.resolve(answer('Wichtig ist die Vorlesung. Danach ist Luft. Drei Newsletter.')),
    );
    const result = await provider(notExpected, { create }).summarizeDay(day);
    expect(result).toEqual({
      sentences: ['Wichtig ist die Vorlesung.', 'Danach ist Luft.', 'Drei Newsletter.'],
      model: MODEL,
    });
    const [params, options] = create.mock.calls[0] as unknown as [
      Anthropic.MessageCreateParamsNonStreaming,
      { timeout: number },
    ];
    expect(params.system).toBe(DAY_SUMMARY_SYSTEM_PROMPT);
    expect(params.model).toBe(MODEL);
    expect(params.messages[0]?.content).toContain('Vorlesung');
    expect(options.timeout).toBe(45_000);
  });

  it('uses the server-side fallback for models that can decline', async () => {
    const betaCreate = vi.fn<
      (
        params: Anthropic.Beta.MessageCreateParamsNonStreaming,
      ) => Promise<Anthropic.Beta.BetaMessage>
    >(() => Promise.resolve(answer('Ein Satz.') as unknown as Anthropic.Beta.BetaMessage));
    await provider(notExpected, { model: 'claude-opus-5-5', betaCreate }).summarizeDay(day);
    expect(betaCreate.mock.calls[0]?.[0]).toMatchObject({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  });

  it('reports refusals and empty answers', async () => {
    const refused = vi.fn(() => Promise.resolve(answer('', 'refusal')));
    await expect(
      provider(notExpected, { create: refused }).summarizeDay(day),
    ).rejects.toMatchObject({ code: 'REFUSED' });
    const empty = vi.fn(() => Promise.resolve(answer('   ', 'max_tokens')));
    await expect(provider(notExpected, { create: empty }).summarizeDay(day)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});
