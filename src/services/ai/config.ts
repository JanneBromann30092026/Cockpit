/** AI configuration shared by settings and provider (no SDK import – keeps the SDK out of the main chunk). */

/** Default model (fast and inexpensive); configurable in the settings. */
export const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001';

/** Suggested models in the settings; any other valid model ID can be entered as "custom". */
export const AI_MODEL_CHOICES = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5-5',
  'claude-opus-5-5',
] as const;
export type AiModelChoice = (typeof AI_MODEL_CHOICES)[number];

export function isModelChoice(model: string): model is AiModelChoice {
  return (AI_MODEL_CHOICES as readonly string[]).includes(model);
}

/** Model IDs: lower-case letters, digits, dots, dashes (e.g. claude-haiku-4-5-20251001). */
export const AI_MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{2,99}$/;

/** Anthropic API keys start with this prefix. */
export const API_KEY_PREFIX = 'sk-ant-';

/** Name of the API key in the encrypted secrets table. */
export const API_KEY_SECRET = 'anthropicApiKey';

export const AI_TIMEOUT_MS = 15_000;
