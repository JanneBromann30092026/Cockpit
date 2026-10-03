import { secretsRepo } from '@/data/repositories';
import { VaultLockedError } from '@/services/crypto/session';
import { API_KEY_SECRET } from './config';
import { AiError, type AiCallOptions, type AiProvider, type ConnectionTestResult } from './types';

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

/** Checks key, network and model (no tokens are generated, so it costs nothing). */
export async function testAiConnection(
  config: AiConfig,
  options?: AiCallOptions,
): Promise<ConnectionTestResult> {
  const provider = await getAiProvider(config);
  return provider.testConnection(options);
}
