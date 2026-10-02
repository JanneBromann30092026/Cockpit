import { beforeEach, describe, expect, it } from 'vitest';
import { settingsRepo } from '@/data/repositories';
import { resetDb } from '@/data/__tests__/testDb';
import { BOOT_PREFS_KEY, bootPrefsSchema, isValidSetting, useSettings } from './settingsStore';

describe('settings store', () => {
  beforeEach(resetDb);

  it('keeps a change made while the settings are still loading', async () => {
    await settingsRepo.set('devMode', false);
    await settingsRepo.set('theme', 'dark');
    useSettings.setState({ loaded: false });
    const loading = useSettings.getState().load();
    await useSettings.getState().set('devMode', true);
    await loading;
    expect(useSettings.getState().devMode).toBe(true);
    expect(useSettings.getState().theme).toBe('dark');
    expect(await settingsRepo.get('devMode', false)).toBe(true);
  });

  it('ignores invalid values', async () => {
    expect(isValidSetting('theme', 'sepia')).toBe(false);
    // @ts-expect-error -- deliberately invalid value, as it could come from old storage
    expect(await useSettings.getState().set('theme', 'sepia')).toBe(false);
    expect(await settingsRepo.get('theme', 'unset')).not.toBe('sepia');
  });

  it('uses its own localStorage key and repairs broken boot preferences', () => {
    expect(BOOT_PREFS_KEY.startsWith('cockpit.')).toBe(true);
    expect(bootPrefsSchema.parse({ theme: 'sepia', reduceMotion: 'yes' })).toEqual({
      theme: 'system',
      reduceMotion: false,
    });
  });
});
