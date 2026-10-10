import { secretsRepo } from '@/data/repositories';
import { VaultLockedError } from '@/services/crypto/session';
import { API_KEY_SECRET } from './config';
import type { ContractQuestionRequest } from '@/data/prompts/contractQuestion';
import type { DaySummaryRequest } from '@/data/prompts/daySummary';
import type { BrandProfileRequest, BrandWriteRequest } from '@/data/prompts/brand';
import type {
  LibraryKeyPointsRequest,
  LibraryListRequest,
  LibraryQuestionRequest,
} from '@/data/prompts/library';
import type { DayReviewRequest, WeekReviewRequest } from '@/data/prompts/reviews';
import {
  AiError,
  type AiCallOptions,
  type AiProvider,
  type BrandProfileResult,
  type BrandWriteResult,
  type ConnectionTestResult,
  type ContractAnswerResult,
  type ContractExtractRequest,
  type ContractExtractResult,
  type DayReviewResult,
  type DaySummaryResult,
  type LibraryAnswerResult,
  type LibraryKeyPointsResult,
  type LibraryListResult,
  type WeekReviewResult,
} from './types';

export {
  checkApiKey,
  hasApiKey,
  observeApiKey,
  removeApiKey,
  saveApiKey,
  type ApiKeyCheck,
} from './apiKey';
export {
  AI_MODEL_CHOICES,
  AI_MODEL_PATTERN,
  DEFAULT_AI_MODEL,
  isModelChoice,
  type AiModelChoice,
} from './config';
export * from './types';

export interface AiConfig {
  enabled: boolean;
  model: string;
}

function isOnline(): boolean {
  return globalThis.navigator?.onLine ?? true;
}

/**
 * Builds the configured provider. The SDK is loaded on demand (separate chunk), so the app
 * starts without it. Throws AiError DISABLED, LOCKED, NO_API_KEY or OFFLINE when AI cannot
 * be used.
 */
export async function getAiProvider(config: AiConfig): Promise<AiProvider> {
  if (!config.enabled) throw new AiError('DISABLED');
  let apiKey: string | null;
  try {
    apiKey = await secretsRepo.getForInternalUse(API_KEY_SECRET);
  } catch (error: unknown) {
    if (error instanceof VaultLockedError) throw new AiError('LOCKED');
    throw error;
  }
  if (!apiKey) throw new AiError('NO_API_KEY');
  // Every AI call needs the internet; say so before loading anything.
  if (!isOnline()) throw new AiError('OFFLINE');
  // The SDK chunk can fail to load (e.g. connection lost before it was cached).
  const loaded = await import('./anthropicProvider').catch(() => null);
  if (!loaded) throw new AiError(isOnline() ? 'NETWORK' : 'OFFLINE');
  return new loaded.AnthropicProvider({ apiKey, model: config.model });
}

/** The day in three sentences (sends the overview data to Anthropic – only on tap). */
export async function summarizeDayWithAi(
  config: AiConfig,
  input: DaySummaryRequest,
  options?: AiCallOptions,
): Promise<DaySummaryResult> {
  const provider = await getAiProvider(config);
  return provider.summarizeDay(input, options);
}

/** A question about my contracts (sends their structured fields – only on tap). */
export async function askContractsWithAi(
  config: AiConfig,
  input: ContractQuestionRequest,
  options?: AiCallOptions,
): Promise<ContractAnswerResult> {
  const provider = await getAiProvider(config);
  return provider.askContracts(input, options);
}

/** Reads a contract from one original (sends that file – only on tap, after the warning). */
export async function extractContractWithAi(
  config: AiConfig,
  input: ContractExtractRequest,
  options?: AiCallOptions,
): Promise<ContractExtractResult> {
  const provider = await getAiProvider(config);
  return provider.extractContract(input, options);
}

/** Points for the daily review (sends the day's data – only on tap). */
export async function reviewDayWithAi(
  config: AiConfig,
  input: DayReviewRequest,
  options?: AiCallOptions,
): Promise<DayReviewResult> {
  const provider = await getAiProvider(config);
  return provider.reviewDay(input, options);
}

/** Patterns, brakes and three changes for the weekly review (only on tap). */
export async function reviewWeekWithAi(
  config: AiConfig,
  input: WeekReviewRequest,
  options?: AiCallOptions,
): Promise<WeekReviewResult> {
  const provider = await getAiProvider(config);
  return provider.reviewWeek(input, options);
}

/** "Was habe ich zu X gelernt?" (sends titles, topics and key points – only on tap). */
export async function askLibraryWithAi(
  config: AiConfig,
  input: LibraryQuestionRequest,
  options?: AiCallOptions,
): Promise<LibraryAnswerResult> {
  const provider = await getAiProvider(config);
  return provider.askLibrary(input, options);
}

/** A pasted list → library entries (sends that list – only on tap). */
export async function parseLibraryListWithAi(
  config: AiConfig,
  input: LibraryListRequest,
  options?: AiCallOptions,
): Promise<LibraryListResult> {
  const provider = await getAiProvider(config);
  return provider.parseLibraryList(input, options);
}

/** Key points from my thoughts on one entry (sends title, type, author, thoughts – on tap). */
export async function libraryKeyPointsWithAi(
  config: AiConfig,
  input: LibraryKeyPointsRequest,
  options?: AiCallOptions,
): Promise<LibraryKeyPointsResult> {
  const provider = await getAiProvider(config);
  return provider.libraryKeyPoints(input, options);
}

/** Brand profile from the interview (sends the answers – only on tap). */
export async function brandProfileWithAi(
  config: AiConfig,
  input: BrandProfileRequest,
  options?: AiCallOptions,
): Promise<BrandProfileResult> {
  const provider = await getAiProvider(config);
  return provider.brandProfile(input, options);
}

/** A text in the profile's voice (sends brief and profile – only on tap). */
export async function brandWriteWithAi(
  config: AiConfig,
  input: BrandWriteRequest,
  options?: AiCallOptions,
): Promise<BrandWriteResult> {
  const provider = await getAiProvider(config);
  return provider.brandWrite(input, options);
}

/** Checks key, network and model (no tokens are generated, so it costs nothing). */
export async function testAiConnection(
  config: AiConfig,
  options?: AiCallOptions,
): Promise<ConnectionTestResult> {
  const provider = await getAiProvider(config);
  return provider.testConnection(options);
}
