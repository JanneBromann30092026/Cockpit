import type { ContractExtraction } from '@/core/documents/extract';
import type { DocumentCategory } from '@/data/domain';
import type { ContractAnswer, ContractQuestionRequest } from '@/data/prompts/contractQuestion';
import type { DaySummaryRequest } from '@/data/prompts/daySummary';
import type {
  DayReviewPoints,
  DayReviewRequest,
  WeekReviewPoints,
  WeekReviewRequest,
} from '@/data/prompts/reviews';

export interface ConnectionTestResult {
  model: string;
  /** Human-readable model name, e.g. "Claude Haiku 4.5". */
  displayName: string;
}

export interface DaySummaryResult {
  /** At most three sentences, written by Claude. */
  sentences: string[];
  model: string;
}

export interface ContractAnswerResult extends ContractAnswer {
  model: string;
}

/** An original to read: a PDF or a photo already converted to JPEG/PNG (base64). */
export type ContractSource =
  | { kind: 'pdf'; data: string }
  | { kind: 'image'; mediaType: 'image/jpeg' | 'image/png'; data: string };

export interface ContractExtractRequest {
  /** "JJJJ-MM-TT". */
  today: string;
  source: ContractSource;
}

export interface ContractExtractResult {
  extraction: ContractExtraction<DocumentCategory>;
  model: string;
}

export interface DayReviewResult extends DayReviewPoints {
  model: string;
}

export interface WeekReviewResult extends WeekReviewPoints {
  model: string;
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
  /** The day in three sentences from the given events and mails (only on explicit tap). */
  summarizeDay(input: DaySummaryRequest, options?: AiCallOptions): Promise<DaySummaryResult>;
  /** Answers a question from the structured fields of my contracts (only on explicit tap). */
  askContracts(
    input: ContractQuestionRequest,
    options?: AiCallOptions,
  ): Promise<ContractAnswerResult>;
  /** Reads contract fields from one original (only on explicit tap, after the warning). */
  extractContract(
    input: ContractExtractRequest,
    options?: AiCallOptions,
  ): Promise<ContractExtractResult>;
  /** Points for the daily review from the day's data (only on explicit tap). */
  reviewDay(input: DayReviewRequest, options?: AiCallOptions): Promise<DayReviewResult>;
  /** Patterns, brakes and three changes from the week's daily reviews (only on tap). */
  reviewWeek(input: WeekReviewRequest, options?: AiCallOptions): Promise<WeekReviewResult>;
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
  'TOO_LARGE',
  'REFUSED',
  'INVALID_RESPONSE',
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
