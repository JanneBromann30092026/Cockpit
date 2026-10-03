import Anthropic from '@anthropic-ai/sdk';
import { AI_TIMEOUT_MS } from './config';
import { AiError, type AiCallOptions, type AiProvider, type ConnectionTestResult } from './types';

interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
}

/** The part of the SDK client the provider uses (injectable for tests). */
export interface AnthropicClientLike {
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
  ): Promise<T> {
    if (!this.apiKey) throw new AiError('NO_API_KEY');
    if (!this.isOnline()) throw new AiError('OFFLINE');
    if (outer?.aborted) throw new AiError('ABORTED');

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const onOuterAbort = () => controller.abort();
    outer?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      return await run({ signal: controller.signal, timeout: this.timeoutMs, maxRetries: 1 });
    } catch (error: unknown) {
      throw toAiError(error, timedOut, this.isOnline());
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    }
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
