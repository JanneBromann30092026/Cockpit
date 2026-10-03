import { z } from 'zod';
import { create } from 'zustand';
import { DEFAULT_LOCK_AFTER_MINUTES, LOCK_AFTER_MINUTES } from '@/core/lock';
import { settingsRepo } from '@/data/repositories';
import { GOOGLE_CLIENT_ID_PATTERN } from '@/core/google/oauth';
import { AI_MODEL_PATTERN, DEFAULT_AI_MODEL } from '@/services/ai/config';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * Mirror of theme/motion preferences for the synchronous boot in main.tsx (before IndexedDB
 * is open). Own prefix: Kompass and Synapse share the origin (GitHub Pages) and use
 * "kompass.*" / "synapse.*". Never store personal data here – localStorage is not encrypted.
 */
export const BOOT_PREFS_KEY = 'cockpit.bootPrefs';

const schemas = {
  // Appearance
  theme: z.enum(THEME_PREFERENCES),
  reduceMotion: z.boolean(),
  sidebarCollapsed: z.boolean(),
  // Security (needed before unlocking, therefore a plain setting)
  lockAfterMinutes: z.literal(LOCK_AFTER_MINUTES),
  // Optional AI (off by default; the key itself lives encrypted in the secrets table)
  aiEnabled: z.boolean(),
  aiModel: z.string().trim().regex(AI_MODEL_PATTERN),
  // Google: public OAuth client ID ("" until it is set up)
  googleClientId: z.union([z.literal(''), z.string().trim().regex(GOOGLE_CLIENT_ID_PATTERN)]),
  // Developer
  devMode: z.boolean(),
};

export type SettingsValues = { [K in keyof typeof schemas]: z.output<(typeof schemas)[K]> };
export type SettingKey = keyof SettingsValues;

export const SETTINGS_DEFAULTS: SettingsValues = {
  theme: 'system',
  reduceMotion: false,
  sidebarCollapsed: false,
  lockAfterMinutes: DEFAULT_LOCK_AFTER_MINUTES,
  aiEnabled: false,
  aiModel: DEFAULT_AI_MODEL,
  googleClientId: '',
  devMode: false,
};

const KEYS = Object.keys(schemas) as SettingKey[];

export const bootPrefsSchema = z.object({
  theme: schemas.theme.catch('system'),
  reduceMotion: schemas.reduceMotion.catch(false),
});
export type BootPrefs = z.output<typeof bootPrefsSchema>;

function writeBootPrefs(values: BootPrefs): void {
  try {
    localStorage.setItem(BOOT_PREFS_KEY, JSON.stringify(values));
  } catch {
    // Private mode or storage disabled: the app still works, only the boot may flash.
  }
}

export function readBootPrefs(): BootPrefs {
  try {
    const raw = localStorage.getItem(BOOT_PREFS_KEY);
    return bootPrefsSchema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    return { theme: 'system', reduceMotion: false };
  }
}

/** Validates a value for a setting. */
export function isValidSetting<K extends SettingKey>(
  key: K,
  value: unknown,
): value is SettingsValues[K] {
  return schemas[key].safeParse(value).success;
}

interface SettingsState extends SettingsValues {
  loaded: boolean;
  /** Time of the last successful save (drives the subtle "Gespeichert" hint). */
  savedAt: number | null;
  load: () => Promise<void>;
  /** Updates the UI immediately and persists; invalid values are ignored (returns false). */
  set: <K extends SettingKey>(key: K, value: SettingsValues[K]) => Promise<boolean>;
}

async function loadSetting<K extends SettingKey>(key: K): Promise<SettingsValues[K]> {
  const schema = schemas[key] as unknown as z.ZodType<SettingsValues[K]>;
  return settingsRepo.get(key, SETTINGS_DEFAULTS[key], schema);
}

/** Keys set before load() finished; load() must not overwrite them with older values. */
const changedWhileLoading = new Set<SettingKey>();

/**
 * Central settings store: loaded from the settings table at startup, every change is
 * persisted immediately. Theme and reduced motion are mirrored to localStorage for a
 * flash-free boot.
 */
export const useSettings = create<SettingsState>((setState, getState) => ({
  ...SETTINGS_DEFAULTS,
  ...readBootPrefs(),
  loaded: false,
  savedAt: null,
  load: async () => {
    const values = await Promise.all(
      KEYS.map(async (key) => [key, await loadSetting(key)] as const),
    );
    // A change made while loading (a tap during a slow start) wins over the stored value.
    const loaded = Object.fromEntries(
      values.filter(([key]) => !changedWhileLoading.has(key)),
    ) as Partial<SettingsValues>;
    changedWhileLoading.clear();
    setState({ ...loaded, loaded: true });
    const { theme, reduceMotion } = getState();
    writeBootPrefs({ theme, reduceMotion });
  },
  set: async (key, value) => {
    if (!isValidSetting(key, value)) return false;
    if (!getState().loaded) changedWhileLoading.add(key);
    setState({ [key]: value } as Pick<SettingsValues, typeof key>);
    const { theme, reduceMotion } = getState();
    writeBootPrefs({ theme, reduceMotion });
    await settingsRepo.set(key, value);
    setState({ savedAt: Date.now() });
    return true;
  },
}));
