import { beforeEach, describe, expect, it } from 'vitest';
import { rawDump, resetDb } from '@/data/__tests__/testDb';
import { secretsRepo } from '@/data/repositories';
import { vault } from '@/services/vault';
import { API_KEY_SECRET } from './config';
import {
  checkApiKey,
  getAiProvider,
  hasApiKey,
  isModelChoice,
  observeApiKey,
  removeApiKey,
  saveApiKey,
} from './index';

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';

beforeEach(async () => {
  vault.lock();
  await resetDb();
  await vault.init(true);
  await vault.setup('Cockpit-Test-2026!');
  vault.finishOpening();
});

describe('API key', () => {
  it('validates the format', () => {
    expect(checkApiKey('')).toBe('empty');
    expect(checkApiKey('hello')).toBe('format');
    expect(checkApiKey('sk-ant-short')).toBe('format');
    expect(checkApiKey(`  ${KEY}\n`)).toBe('ok');
  });

  it('stores only valid keys, encrypted and without surrounding whitespace', async () => {
    expect(await saveApiKey('not a key')).toBe('format');
    expect(await hasApiKey()).toBe(false);
    expect(await saveApiKey(` ${KEY}\n`)).toBe('ok');
    expect(await hasApiKey()).toBe(true);
    expect(await secretsRepo.getForInternalUse(API_KEY_SECRET)).toBe(KEY);
    const dump = await rawDump();
    expect(dump).not.toContain('sk-ant');
    expect(dump).not.toContain('abcdefghijklmnop');
    await removeApiKey();
    expect(await hasApiKey()).toBe(false);
  });

  it('cannot be read while locked', async () => {
    await saveApiKey(KEY);
    vault.lock();
    await expect(secretsRepo.getForInternalUse(API_KEY_SECRET)).rejects.toThrow('locked');
    await expect(getAiProvider({ enabled: true, model: 'claude-haiku-4-5' })).rejects.toMatchObject(
      { code: 'LOCKED' },
    );
  });

  it('reports changes to observers', async () => {
    const seen: boolean[] = [];
    const stop = observeApiKey((stored) => seen.push(stored));
    const until = async (value: boolean) => {
      for (let i = 0; i < 100 && seen.at(-1) !== value; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(seen.at(-1)).toBe(value);
    };
    await until(false);
    await saveApiKey(KEY);
    await until(true);
    await removeApiKey();
    await until(false);
    stop();
  });
});

describe('AI provider', () => {
  it('refuses to start when AI is off or no key is set', async () => {
    await expect(getAiProvider({ enabled: false, model: 'x' })).rejects.toMatchObject({
      code: 'DISABLED',
    });
    await expect(
      getAiProvider({ enabled: true, model: 'claude-haiku-4-5-20251001' }),
    ).rejects.toMatchObject({ code: 'NO_API_KEY' });
  });

  it('reports offline before loading the SDK', async () => {
    await saveApiKey(KEY);
    const online = Object.getOwnPropertyDescriptor(globalThis.navigator, 'onLine');
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
    try {
      await expect(
        getAiProvider({ enabled: true, model: 'claude-haiku-4-5' }),
      ).rejects.toMatchObject({ code: 'OFFLINE' });
    } finally {
      if (online) Object.defineProperty(globalThis.navigator, 'onLine', online);
      else delete (globalThis.navigator as { onLine?: boolean }).onLine;
    }
  });

  it('builds the Anthropic provider with the configured model', async () => {
    await saveApiKey(KEY);
    const provider = await getAiProvider({ enabled: true, model: 'claude-sonnet-5-5' });
    expect(provider.id).toBe('anthropic');
    expect(provider.model).toBe('claude-sonnet-5-5');
  });

  it('knows the suggested models', () => {
    expect(isModelChoice('claude-haiku-4-5-20251001')).toBe(true);
    expect(isModelChoice('claude-opus-5-5')).toBe(true);
    expect(isModelChoice('claude-irgendwas')).toBe(false);
  });
});
