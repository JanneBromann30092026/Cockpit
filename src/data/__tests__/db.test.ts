import { Dexie } from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { classifyOpenError, CockpitDb, db, DB_NAME, openDatabase } from '../db';
import { settingsRepo } from '../repositories';
import { resetDb } from './testDb';

describe('database schema', () => {
  it('opens version 1 under its own name with the settings table', async () => {
    expect(await openDatabase()).toEqual({ ok: true });
    expect(db.name).toBe(DB_NAME);
    expect(DB_NAME).toBe('cockpit');
    expect(db.verno).toBe(1);
    expect(db.tables.map((table) => table.name)).toEqual(['settings']);
    expect(db.settings.schema.primKey.name).toBe('key');
  });
});

describe('open errors', () => {
  it('opens a database with a newer on-disk version (Dexie 4 tolerates app rollbacks)', async () => {
    const newer = new Dexie('cockpit-version-test');
    newer.version(5).stores({ settings: 'key' });
    await newer.open();
    newer.close();
    const older = new CockpitDb('cockpit-version-test');
    expect(await openDatabase(older)).toEqual({ ok: true });
    older.close();
    await Dexie.delete('cockpit-version-test');
  });

  it('classifies wrapped native errors', () => {
    const named = (name: string, inner?: Error) =>
      Object.assign(new Error('open failed'), { name, inner });
    expect(classifyOpenError(named('OpenFailedError', named('QuotaExceededError')))).toBe('quota');
    expect(classifyOpenError(named('OpenFailedError', named('InvalidStateError')))).toBe(
      'unavailable',
    );
    expect(classifyOpenError(named('MissingAPIError'))).toBe('unavailable');
    expect(classifyOpenError(named('VersionError'))).toBe('version');
    expect(classifyOpenError(new Error('boom'))).toBe('unknown');
    expect(classifyOpenError('not an error')).toBe('unknown');
  });
});

describe('settingsRepo', () => {
  beforeEach(resetDb);

  it('returns the fallback until a value is set', async () => {
    expect(await settingsRepo.get('theme', 'system')).toBe('system');
    await settingsRepo.set('theme', 'dark');
    expect(await settingsRepo.get('theme', 'system')).toBe('dark');
    await settingsRepo.remove('theme');
    expect(await settingsRepo.get('theme', 'system')).toBe('system');
  });

  it('falls back when the stored value does not match the schema', async () => {
    await settingsRepo.set('theme', 42);
    const schema = z.enum(['system', 'light', 'dark']);
    expect(await settingsRepo.get('theme', 'system', schema)).toBe('system');
  });

  it('rejects empty keys', async () => {
    await expect(settingsRepo.set(' ', 1)).rejects.toMatchObject({
      field: 'value',
      code: 'required',
    });
  });
});
