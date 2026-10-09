import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, toAiError, type AnthropicClientLike } from './anthropicProvider';
import { AiError } from './types';
import { DAY_SUMMARY_SYSTEM_PROMPT, type DaySummaryRequest } from '@/data/prompts/daySummary';
import {
  CONTRACT_ANSWER_SCHEMA,
  type ContractQuestionRequest,
} from '@/data/prompts/contractQuestion';
import { CONTRACT_EXTRACT_SCHEMA } from '@/data/prompts/contractExtract';
import { BRAND_PROFILE_SCHEMA, BRAND_WRITE_SYSTEM_PROMPT } from '@/data/prompts/brand';
import {
  LIBRARY_ANSWER_SCHEMA,
  LIBRARY_KEY_POINTS_SYSTEM_PROMPT,
  LIBRARY_LIST_SCHEMA,
} from '@/data/prompts/library';
import {
  DAY_REVIEW_SCHEMA,
  DAY_REVIEW_SYSTEM_PROMPT,
  WEEK_REVIEW_SYSTEM_PROMPT,
} from '@/data/prompts/reviews';

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
  tasks: [],
  deadlines: [],
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

const question: ContractQuestionRequest = {
  today: '2026-10-05',
  question: 'Wann kann ich kündigen?',
  contracts: [
    { ref: 'v1', name: 'Fitnessstudio', kategorie: 'Abo', zusammenfassung: [], offene_punkte: [] },
    { ref: 'v2', name: 'Handyvertrag', kategorie: 'Handy', zusammenfassung: [], offene_punkte: [] },
  ],
};

describe('AnthropicProvider.askContracts', () => {
  it('sends the question with structured output and maps known sources', async () => {
    const create = vi.fn(() =>
      Promise.resolve(
        answer(JSON.stringify({ antwort: 'Bis 17.10.2026.', quellen: ['v1', 'v9', 'v1'] })),
      ),
    );
    const result = await provider(notExpected, { create }).askContracts(question);
    expect(result).toEqual({ text: 'Bis 17.10.2026.', sources: ['v1'], model: MODEL });
    const [params] = create.mock.calls[0] as unknown as [Anthropic.MessageCreateParamsNonStreaming];
    expect(params.output_config).toEqual({
      format: { type: 'json_schema', schema: CONTRACT_ANSWER_SCHEMA },
    });
    expect(params.messages[0]?.content).toContain('Fitnessstudio');
  });

  it('reports refusals, cut-off and unusable answers', async () => {
    const refused = vi.fn(() => Promise.resolve(answer('', 'refusal')));
    await expect(
      provider(notExpected, { create: refused }).askContracts(question),
    ).rejects.toMatchObject({ code: 'REFUSED' });
    const cut = vi.fn(() => Promise.resolve(answer('{"antwort": "Bis', 'max_tokens')));
    await expect(
      provider(notExpected, { create: cut }).askContracts(question),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const wrong = vi.fn(() => Promise.resolve(answer('Bis Oktober.')));
    await expect(
      provider(notExpected, { create: wrong }).askContracts(question),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

const extracted = {
  name: 'Handyvertrag',
  category: 'mobile',
  provider: 'Funknetz Beispiel',
  amount_eur: 19.99,
  interval: 'monthly',
  due_date: null,
  term_end: '2027-03-31',
  notice_period: '1 Monat zum Ende der Mindestlaufzeit',
  summary: ['20 GB Datenvolumen'],
  open_points: ['Nächster Zahlungstermin fehlt'],
};

describe('AnthropicProvider.extractContract', () => {
  it('sends the PDF as document block before the instruction', async () => {
    const create = vi.fn(() => Promise.resolve(answer(JSON.stringify(extracted))));
    const result = await provider(notExpected, { create }).extractContract({
      today: '2026-10-05',
      source: { kind: 'pdf', data: 'JVBERi0=' },
    });
    expect(result.extraction).toMatchObject({
      name: 'Handyvertrag',
      category: 'mobile',
      amount: 19.99,
      termEnd: '2027-03-31',
      removed: 0,
    });
    expect(result.extraction.dueDate).toBeUndefined();
    const [params, options] = create.mock.calls[0] as unknown as [
      Anthropic.MessageCreateParamsNonStreaming,
      { timeout: number },
    ];
    const content = params.messages[0]?.content as Anthropic.ContentBlockParam[];
    expect(content[0]).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0=' },
    });
    expect(content[1]).toMatchObject({ type: 'text' });
    expect(JSON.stringify(content[1])).toContain('2026-10-05');
    expect(params.output_config?.format?.schema).toBe(CONTRACT_EXTRACT_SCHEMA);
    expect(options.timeout).toBe(120_000);
  });

  it('sends a photo as image block', async () => {
    const create = vi.fn(() => Promise.resolve(answer(JSON.stringify(extracted))));
    await provider(notExpected, { create }).extractContract({
      today: '2026-10-05',
      source: { kind: 'image', mediaType: 'image/jpeg', data: '/9j/' },
    });
    const [params] = create.mock.calls[0] as unknown as [Anthropic.MessageCreateParamsNonStreaming];
    const content = params.messages[0]?.content as Anthropic.ContentBlockParam[];
    expect(content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/' },
    });
  });

  it('maps a too large request', () => {
    expect(
      toAiError(new Anthropic.APIError(413, {}, 'request too large', headers), false, true).code,
    ).toBe('TOO_LARGE');
  });
});

describe('AnthropicProvider reviews', () => {
  const dayInput = {
    date: 'Montag, 5. Oktober 2026',
    events: null,
    done: [],
    open: [],
    current: { wentWell: [], notWell: [], improve: [] },
  };

  it('day: own system prompt, structured output, parsed points', async () => {
    const create = vi.fn(() =>
      Promise.resolve(
        answer(
          JSON.stringify({
            gut_gelaufen: ['Sport'],
            nicht_gut: [],
            besser_machen: ['Früher ins Bett'],
          }),
        ),
      ),
    );
    const result = await provider(notExpected, { create }).reviewDay(dayInput);
    expect(result).toEqual({
      wentWell: ['Sport'],
      notWell: [],
      improve: ['Früher ins Bett'],
      model: MODEL,
    });
    const [params] = create.mock.calls[0] as unknown as [Anthropic.MessageCreateParamsNonStreaming];
    expect(params.system).toBe(DAY_REVIEW_SYSTEM_PROMPT);
    expect(params.output_config?.format?.schema).toBe(DAY_REVIEW_SCHEMA);
  });

  it('week: three changes; an empty or refused answer is an error', async () => {
    const weekInput = {
      week: 'Mo., 28.09. – So., 04.10. 2026',
      days: [],
      doneCount: 0,
      open: [],
      current: { patterns: [], brakes: [], changes: [] },
    };
    const create = vi.fn(() =>
      Promise.resolve(
        answer(
          JSON.stringify({ muster: [], bremsen: ['Handy'], aenderungen: ['A', 'B', 'C', 'D'] }),
        ),
      ),
    );
    const result = await provider(notExpected, { create }).reviewWeek(weekInput);
    expect(result.changes).toEqual(['A', 'B', 'C']);
    const [params] = create.mock.calls[0] as unknown as [Anthropic.MessageCreateParamsNonStreaming];
    expect(params.system).toBe(WEEK_REVIEW_SYSTEM_PROMPT);
    const empty = vi.fn(() =>
      Promise.resolve(answer(JSON.stringify({ muster: [], bremsen: [], aenderungen: [] }))),
    );
    await expect(
      provider(notExpected, { create: empty }).reviewWeek(weekInput),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const refused = vi.fn(() => Promise.resolve(answer('', 'refusal')));
    await expect(
      provider(notExpected, { create: refused }).reviewDay(dayInput),
    ).rejects.toMatchObject({ code: 'REFUSED' });
  });
});

describe('AnthropicProvider library', () => {
  const params = (create: ReturnType<typeof vi.fn>) =>
    (create.mock.calls[0] as unknown as [Anthropic.MessageCreateParamsNonStreaming])[0];

  it('question: structured answer with known sources only', async () => {
    const create = vi.fn(() =>
      Promise.resolve(answer(JSON.stringify({ antwort: 'Feste Blöcke.', quellen: ['b2', 'b1'] }))),
    );
    const result = await provider(notExpected, { create }).askLibrary({
      question: 'Fokus?',
      entries: [{ ref: 'b1', titel: 'Deep Work', typ: 'Buch', themen: [], kernaussagen: [] }],
    });
    expect(result).toEqual({ text: 'Feste Blöcke.', sources: ['b1'], model: MODEL });
    expect(params(create).output_config).toEqual({
      format: { type: 'json_schema', schema: LIBRARY_ANSWER_SCHEMA },
    });
  });

  it('list: entries from the structured answer; cut-off is an error', async () => {
    const create = vi.fn(() =>
      Promise.resolve(
        answer(
          JSON.stringify({
            eintraege: [
              { titel: 'Sapiens', typ: 'book', autor: null, link: null, datum: null, themen: [] },
            ],
          }),
        ),
      ),
    );
    const result = await provider(notExpected, { create }).parseLibraryList({
      text: 'Sapiens',
      defaultType: 'book',
      today: '2026-10-09',
    });
    expect(result.entries).toEqual([{ title: 'Sapiens', type: 'book', topics: [] }]);
    expect(params(create).output_config).toEqual({
      format: { type: 'json_schema', schema: LIBRARY_LIST_SCHEMA },
    });
    const cut = vi.fn(() => Promise.resolve(answer('{"eintraege": [', 'max_tokens')));
    await expect(
      provider(notExpected, { create: cut }).parseLibraryList({
        text: 'x',
        defaultType: 'book',
        today: '2026-10-09',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('key points: own prompt, only title, type, author and thoughts', async () => {
    const create = vi.fn(() =>
      Promise.resolve(answer(JSON.stringify({ kernaussagen: ['Feste Blöcke helfen.'] }))),
    );
    const result = await provider(notExpected, { create }).libraryKeyPoints({
      title: 'Deep Work',
      type: 'Buch',
      thoughts: 'Blöcke am Morgen',
    });
    expect(result.points).toEqual(['Feste Blöcke helfen.']);
    expect(params(create).system).toBe(LIBRARY_KEY_POINTS_SYSTEM_PROMPT);
    expect(params(create).messages[0]?.content).toContain('Blöcke am Morgen');
  });
});

describe('AnthropicProvider brand', () => {
  const params = (create: ReturnType<typeof vi.fn>) =>
    (create.mock.calls[0] as unknown as [Anthropic.MessageCreateParamsNonStreaming])[0];

  it('profile: structured output from the answers', async () => {
    const create = vi.fn(() =>
      Promise.resolve(
        answer(
          JSON.stringify({
            tonalitaet: 'Locker.',
            werte: ['Mut'],
            woerter_nutzen: [],
            woerter_nie: [],
            beispielsaetze: ['Los.'],
            palette: null,
            schrift_ueberschrift: 'futura',
            schrift_text: 'inter',
          }),
        ),
      ),
    );
    const result = await provider(notExpected, { create }).brandProfile({
      answers: [{ frage: 'Wer?', antwort: 'Ich.' }],
    });
    expect(result.profile).toMatchObject({
      tone: 'Locker.',
      values: ['Mut'],
      headingFont: 'futura',
    });
    expect(params(create).output_config).toEqual({
      format: { type: 'json_schema', schema: BRAND_PROFILE_SCHEMA },
    });
  });

  it('write: own prompt; refusal is reported', async () => {
    const create = vi.fn(() => Promise.resolve(answer(JSON.stringify({ text: 'HOOK\nHey du' }))));
    const result = await provider(notExpected, { create }).brandWrite({
      kind: 'video',
      topic: 'Lernen',
      profile: { werte: [], woerter_nutzen: [], woerter_nie: [], beispielsaetze: [] },
    });
    expect(result.text).toBe('HOOK\nHey du');
    expect(params(create).system).toBe(BRAND_WRITE_SYSTEM_PROMPT);
    const refused = vi.fn(() => Promise.resolve(answer('', 'refusal')));
    await expect(
      provider(notExpected, { create: refused }).brandWrite({
        kind: 'video',
        topic: 'Lernen',
        profile: { werte: [], woerter_nutzen: [], woerter_nie: [], beispielsaetze: [] },
      }),
    ).rejects.toMatchObject({ code: 'REFUSED' });
  });
});
