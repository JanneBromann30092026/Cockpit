import Anthropic from '@anthropic-ai/sdk';
import {
  buildContractExtractText,
  CONTRACT_EXTRACT_SCHEMA,
  CONTRACT_EXTRACT_SYSTEM_PROMPT,
  parseContractExtraction,
} from '@/data/prompts/contractExtract';
import {
  buildContractQuestionMessage,
  CONTRACT_ANSWER_SCHEMA,
  CONTRACT_QUESTION_SYSTEM_PROMPT,
  parseContractAnswer,
  type ContractQuestionRequest,
} from '@/data/prompts/contractQuestion';
import {
  buildDayReviewMessage,
  buildWeekReviewMessage,
  DAY_REVIEW_SCHEMA,
  DAY_REVIEW_SYSTEM_PROMPT,
  parseDayReview,
  parseWeekReview,
  WEEK_REVIEW_SCHEMA,
  WEEK_REVIEW_SYSTEM_PROMPT,
  type DayReviewRequest,
  type WeekReviewRequest,
} from '@/data/prompts/reviews';
import {
  buildDaySummaryMessage,
  DAY_SUMMARY_SYSTEM_PROMPT,
  parseDaySummary,
  type DaySummaryRequest,
} from '@/data/prompts/daySummary';
import { AI_TIMEOUT_MS } from './config';
import {
  AiError,
  type AiCallOptions,
  type AiProvider,
  type ConnectionTestResult,
  type ContractAnswerResult,
  type ContractExtractRequest,
  type ContractExtractResult,
  type DayReviewResult,
  type DaySummaryResult,
  type WeekReviewResult,
} from './types';

interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
}

/** The part of the SDK client the provider uses (injectable for tests). */
export interface AnthropicClientLike {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: RequestOptions,
    ): Promise<Anthropic.Message>;
  };
  beta: {
    messages: {
      create(
        params: Anthropic.Beta.MessageCreateParamsNonStreaming,
        options?: RequestOptions,
      ): Promise<Anthropic.Beta.BetaMessage>;
    };
  };
  models: {
    retrieve(
      modelId: string,
      params?: undefined,
      options?: RequestOptions,
    ): Promise<Anthropic.ModelInfo>;
  };
}

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  /** Defaults to navigator.onLine. */
  isOnline?: () => boolean;
  createClient?: (apiKey: string) => AnthropicClientLike;
}

/**
 * Models that can decline a request through their safety classifiers: they get the
 * server-side fallback, so a refused request is answered by a fallback model instead.
 */
const FALLBACK_MODELS = /^claude-(fable-5-1|opus-5-5|sonnet-5-5)/;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Thinking models (always on for Opus 5.5) need room beyond the short answer. */
const SUMMARY_MAX_TOKENS = 4096;
/** Writing takes longer than the model lookup of the connection test. */
const SUMMARY_TIMEOUT_MS = 45_000;
/** Reading a whole contract (many pages, scans) takes longest. */
const EXTRACT_MAX_TOKENS = 8192;
const EXTRACT_TIMEOUT_MS = 120_000;

function defaultClient(apiKey: string): AnthropicClientLike {
  // The key comes from this device's encrypted storage; requests go straight to
  // api.anthropic.com (the SDK then sends the direct-browser-access header).
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

function browserOnline(): boolean {
  return globalThis.navigator?.onLine ?? true;
}

/** Maps SDK errors to stable codes (most specific first). Never includes request data. */
export function toAiError(error: unknown, timedOut: boolean, online: boolean): AiError {
  if (error instanceof AiError) return error;
  if (timedOut || error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError('TIMEOUT');
  }
  if (error instanceof Anthropic.APIUserAbortError) return new AiError('ABORTED');
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiError('AUTH', 'authentication failed', error.status);
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiError('MODEL_NOT_FOUND', 'model not found', error.status);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('RATE_LIMIT', 'rate limited', error.status);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError(online ? 'NETWORK' : 'OFFLINE');
  }
  if (error instanceof Anthropic.APIError) {
    const status: number | undefined = typeof error.status === 'number' ? error.status : undefined;
    if (status === 529) return new AiError('OVERLOADED', 'overloaded', status);
    if (status === 413) return new AiError('TOO_LARGE', 'request too large', status);
    return new AiError('API_ERROR', `api error ${status ?? ''}`.trim(), status);
  }
  return new AiError('API_ERROR', error instanceof Error ? error.name : 'unknown error');
}

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly isOnline: () => boolean;
  private readonly client: AnthropicClientLike;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey.trim();
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;
    this.isOnline = options.isOnline ?? browserOnline;
    this.client = (options.createClient ?? defaultClient)(this.apiKey);
  }

  /** Runs one SDK call with the overall timeout, the caller's signal and error mapping. */
  private async call<T>(
    run: (options: RequestOptions) => Promise<T>,
    outer?: AbortSignal,
    timeoutMs: number = this.timeoutMs,
  ): Promise<T> {
    if (!this.apiKey) throw new AiError('NO_API_KEY');
    if (!this.isOnline()) throw new AiError('OFFLINE');
    if (outer?.aborted) throw new AiError('ABORTED');

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onOuterAbort = () => controller.abort();
    outer?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      return await run({ signal: controller.signal, timeout: timeoutMs, maxRetries: 1 });
    } catch (error: unknown) {
      throw toAiError(error, timedOut, this.isOnline());
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    }
  }

  /** Sends the request; refusable models get the server-side fallback. */
  private create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    options: RequestOptions,
  ): Promise<Anthropic.Message | Anthropic.Beta.BetaMessage> {
    if (!FALLBACK_MODELS.test(this.model)) return this.client.messages.create(params, options);
    return this.client.beta.messages.create(
      { ...params, betas: [FALLBACK_BETA], fallbacks: 'default' },
      options,
    );
  }

  /** The day in three sentences; only the data of the overview is sent. */
  async summarizeDay(
    input: DaySummaryRequest,
    options: AiCallOptions = {},
  ): Promise<DaySummaryResult> {
    const timeoutMs = Math.max(this.timeoutMs, SUMMARY_TIMEOUT_MS);
    const message = await this.call(
      (requestOptions) =>
        this.create(
          {
            model: this.model,
            max_tokens: SUMMARY_MAX_TOKENS,
            system: DAY_SUMMARY_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildDaySummaryMessage(input) }],
          },
          requestOptions,
        ),
      options.signal,
      timeoutMs,
    );
    // Check why the model stopped before reading the content.
    if (message.stop_reason === 'refusal') throw new AiError('REFUSED');
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join(' ');
    const sentences = parseDaySummary(text);
    if (sentences.length === 0) throw new AiError('INVALID_RESPONSE');
    return { sentences, model: message.model || this.model };
  }

  /** Runs a request with structured output and returns the JSON text of the answer. */
  private async structured(
    params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>,
    options: AiCallOptions,
    timeoutMs: number,
  ): Promise<{ json: string; model: string }> {
    const message = await this.call(
      (requestOptions) => this.create({ ...params, model: this.model }, requestOptions),
      options.signal,
      Math.max(this.timeoutMs, timeoutMs),
    );
    // Check why the model stopped before reading the content.
    if (message.stop_reason === 'refusal') throw new AiError('REFUSED');
    if (message.stop_reason === 'max_tokens') throw new AiError('INVALID_RESPONSE');
    const json = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('');
    return { json, model: message.model || this.model };
  }

  /** A question about my contracts; only their structured fields are sent. */
  async askContracts(
    input: ContractQuestionRequest,
    options: AiCallOptions = {},
  ): Promise<ContractAnswerResult> {
    const { json, model } = await this.structured(
      {
        max_tokens: SUMMARY_MAX_TOKENS,
        system: CONTRACT_QUESTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildContractQuestionMessage(input) }],
        output_config: { format: { type: 'json_schema', schema: CONTRACT_ANSWER_SCHEMA } },
      },
      options,
      SUMMARY_TIMEOUT_MS,
    );
    const answer = parseContractAnswer(
      json,
      input.contracts.map((contract) => contract.ref),
    );
    if (!answer) throw new AiError('INVALID_RESPONSE');
    return { ...answer, model };
  }

  /** Reads contract fields from one original (PDF or photo). */
  async extractContract(
    input: ContractExtractRequest,
    options: AiCallOptions = {},
  ): Promise<ContractExtractResult> {
    const file: Anthropic.ContentBlockParam =
      input.source.kind === 'pdf'
        ? {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: input.source.data },
          }
        : {
            type: 'image',
            source: { type: 'base64', media_type: input.source.mediaType, data: input.source.data },
          };
    const { json, model } = await this.structured(
      {
        max_tokens: EXTRACT_MAX_TOKENS,
        system: CONTRACT_EXTRACT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [file, { type: 'text', text: buildContractExtractText(input.today) }],
          },
        ],
        output_config: { format: { type: 'json_schema', schema: CONTRACT_EXTRACT_SCHEMA } },
      },
      options,
      EXTRACT_TIMEOUT_MS,
    );
    const extraction = parseContractExtraction(json);
    if (!extraction) throw new AiError('INVALID_RESPONSE');
    return { extraction, model };
  }

  /** Points for the daily review; only the day's data and the user's points are sent. */
  async reviewDay(input: DayReviewRequest, options: AiCallOptions = {}): Promise<DayReviewResult> {
    const { json, model } = await this.structured(
      {
        max_tokens: SUMMARY_MAX_TOKENS,
        system: DAY_REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildDayReviewMessage(input) }],
        output_config: { format: { type: 'json_schema', schema: DAY_REVIEW_SCHEMA } },
      },
      options,
      SUMMARY_TIMEOUT_MS,
    );
    const points = parseDayReview(json);
    if (!points) throw new AiError('INVALID_RESPONSE');
    return { ...points, model };
  }

  /** Patterns, brakes and three changes from the week's daily reviews. */
  async reviewWeek(
    input: WeekReviewRequest,
    options: AiCallOptions = {},
  ): Promise<WeekReviewResult> {
    const { json, model } = await this.structured(
      {
        max_tokens: SUMMARY_MAX_TOKENS,
        system: WEEK_REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildWeekReviewMessage(input) }],
        output_config: { format: { type: 'json_schema', schema: WEEK_REVIEW_SCHEMA } },
      },
      options,
      SUMMARY_TIMEOUT_MS,
    );
    const points = parseWeekReview(json);
    if (!points) throw new AiError('INVALID_RESPONSE');
    return { ...points, model };
  }

  /** Looks up the configured model: validates key, network and model without generating tokens. */
  async testConnection(options: AiCallOptions = {}): Promise<ConnectionTestResult> {
    const info = await this.call(
      (requestOptions) => this.client.models.retrieve(this.model, undefined, requestOptions),
      options.signal,
    );
    return { model: info.id, displayName: info.display_name || info.id };
  }
}
