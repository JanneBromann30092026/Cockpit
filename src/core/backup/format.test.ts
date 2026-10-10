import { describe, expect, it } from 'vitest';
import {
  BackupFormatError,
  backupDue,
  backupFileName,
  fromBase64,
  parseBackup,
  serializeBackup,
  toBase64,
} from './format';

const bytes = (length: number, fill = 1) => new Uint8Array(length).fill(fill);
const payload = { v: 1 as const, iv: bytes(12, 2), ct: bytes(20, 3) };

function sample() {
  return serializeBackup({
    vault: {
      v: 1,
      kdf: { alg: 'PBKDF2-SHA-256', iterations: 800_000, salt: bytes(16, 4) },
      check: payload,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    appVersion: '0.11.0',
    createdAt: '2026-10-09T18:00:00.000Z',
    tables: {
      tasks: [{ id: 't1', updatedAt: '2026-10-09T17:00:00.000Z', payload }],
      documents: [],
      reviews: [],
      library: [],
      brand: [],
    },
    files: [{ id: 'f1', documentId: 'd1', updatedAt: '2026-10-09T17:00:00.000Z', payload }],
  });
}

describe('backup file format', () => {
  it('round-trips base64, also for large data', () => {
    const data = new Uint8Array(100_000).map((_, index) => index % 256);
    expect(fromBase64(toBase64(data))).toEqual(data);
  });

  it('serialises rows as stored and parses them back', () => {
    const text = sample();
    expect(text).not.toContain('"payload":{"v":1,"iv":{');
    const backup = parseBackup(text);
    expect(backup.kdf.iterations).toBe(800_000);
    expect(backup.kdf.salt).toEqual(bytes(16, 4));
    expect(backup.tables.tasks[0]?.payload.ct).toEqual(bytes(20, 3));
    expect(backup.files[0]?.documentId).toBe('d1');
    expect(backup.tables.library).toEqual([]);
  });

  it('names the problem: no backup, other version, damaged', () => {
    const problem = (text: string) => {
      try {
        parseBackup(text);
        return 'ok';
      } catch (error) {
        return error instanceof BackupFormatError ? error.problem : 'other';
      }
    };
    expect(problem('kein json')).toBe('notBackup');
    expect(problem('{"format":"anderes"}')).toBe('notBackup');
    expect(problem(sample().replace('"v":1,"createdAt"', '"v":2,"createdAt"'))).toBe('version');
    const damaged = JSON.parse(sample()) as { kdf: { iterations: number } };
    damaged.kdf.iterations = 1000;
    expect(problem(JSON.stringify(damaged))).toBe('damaged');
    const shortIv = JSON.parse(sample()) as { check: { iv: string } };
    shortIv.check.iv = toBase64(bytes(4));
    expect(problem(JSON.stringify(shortIv))).toBe('damaged');
  });

  it('names the file after the local date', () => {
    expect(backupFileName('2026-10-09')).toBe('Cockpit-Backup-2026-10-09.json');
  });

  it('reminds when there is data and the last backup is old enough', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const base = { days: 14 as const, hasData: true, now };
    expect(backupDue({ ...base, lastBackupAt: '' })).toBe(true);
    expect(backupDue({ ...base, lastBackupAt: '2026-10-10T10:00:00Z' })).toBe(false);
    expect(backupDue({ ...base, lastBackupAt: '2026-10-06T10:00:00Z' })).toBe(true);
    expect(backupDue({ ...base, hasData: false, lastBackupAt: '' })).toBe(false);
    expect(backupDue({ ...base, days: 0, lastBackupAt: '' })).toBe(false);
  });
});
