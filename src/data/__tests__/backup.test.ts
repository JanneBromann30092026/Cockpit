import { beforeEach, describe, expect, it } from 'vitest';
import { parseBackup } from '@/core/backup/format';
import { db } from '@/data/db';
import { documentActions, libraryRepo, tasksRepo } from '@/data/repositories';
import { secretsRepo } from '@/data/repositories/secretsRepo';
import { useDataStore } from '@/data/store';
import { createBackup, restoreBackup, WrongBackupPasswordError } from '@/services/backup';
import { vault } from '@/services/vault';
import { resetDb } from './testDb';

const PASSWORD = 'Cockpit-Test-2026!';
const OTHER = 'Ein anderes Passwort 2026';

async function freshVault(password: string) {
  vault.lock();
  await resetDb();
  await vault.init(true);
  await vault.setup(password);
  vault.finishOpening();
}

beforeEach(() => freshVault(PASSWORD));

const tasks = () => Object.values(useDataStore.getState().tasks);

describe('encrypted backups', () => {
  it('exports only ciphertext and no secrets', async () => {
    await tasksRepo.create({ title: 'Steuererklärung abgeben' });
    await secretsRepo.set('anthropicApiKey', 'sk-ant-geheim');
    const { file, rows } = await createBackup(new Date('2026-10-09T18:00:00Z'));
    const text = await file.text();
    expect(file.name).toBe('Cockpit-Backup-2026-10-09.json');
    expect(rows).toBe(1);
    expect(text).not.toContain('Steuererklärung');
    expect(text).not.toContain('sk-ant');
    expect(text).not.toContain('secrets');
  });

  it('restores on a device with another password, including originals', async () => {
    await tasksRepo.create({ title: 'Miete prüfen' });
    await libraryRepo.create({ title: 'Atomic Habits', type: 'book' });
    const contract = await documentActions.create({ name: 'Hausrat' });
    const meta = await documentActions.addFile(contract.id, {
      name: 'Police.pdf',
      type: 'application/pdf',
      data: new TextEncoder().encode('%PDF Inhalt'),
    });
    const backup = parseBackup(await (await createBackup()).file.text());

    await freshVault(OTHER);
    expect(tasks()).toHaveLength(0);
    await expect(restoreBackup(backup, OTHER, 'merge')).rejects.toBeInstanceOf(
      WrongBackupPasswordError,
    );
    const result = await restoreBackup(backup, PASSWORD, 'merge');
    expect(result).toMatchObject({ kept: 0, unreadable: 0, files: 1 });
    expect(result.restored).toMatchObject({ tasks: 1, library: 1, documents: 1 });
    expect(tasks()[0]?.title).toBe('Miete prüfen');

    // Written with today's key: still readable after locking and unlocking.
    vault.lock();
    await vault.unlock(OTHER);
    vault.finishOpening();
    expect(tasks()[0]?.title).toBe('Miete prüfen');
    const blob = await documentActions.readFile(contract.id, meta.id);
    expect(await blob.text()).toBe('%PDF Inhalt');
  });

  it('merge keeps newer local versions and local-only records; replace deletes them', async () => {
    const task = await tasksRepo.create({ title: 'Alt' });
    const backup = parseBackup(await (await createBackup()).file.text());
    await tasksRepo.update(task.id, { title: 'Neuer auf dem Gerät' });
    await tasksRepo.create({ title: 'Nur auf dem Gerät' });

    const merged = await restoreBackup(backup, PASSWORD, 'merge');
    expect(merged.kept).toBe(1);
    expect(
      tasks()
        .map((t) => t.title)
        .sort(),
    ).toEqual(['Neuer auf dem Gerät', 'Nur auf dem Gerät']);

    const replaced = await restoreBackup(backup, PASSWORD, 'replace');
    expect(replaced.restored.tasks).toBe(1);
    expect(tasks().map((t) => t.title)).toEqual(['Alt']);
  });

  it('replace removes originals of contracts that are gone; damaged rows are counted', async () => {
    const backup = parseBackup(await (await createBackup()).file.text());
    const contract = await documentActions.create({ name: 'Handy' });
    await documentActions.addFile(contract.id, {
      name: 'a.pdf',
      type: 'application/pdf',
      data: new Uint8Array([1, 2, 3]),
    });
    await restoreBackup(backup, PASSWORD, 'replace');
    expect(await db.files.count()).toBe(0);
    expect(Object.keys(useDataStore.getState().documents)).toHaveLength(0);

    await tasksRepo.create({ title: 'X' });
    const withTask = parseBackup(await (await createBackup()).file.text());
    const row = withTask.tables.tasks[0]!;
    row.payload.ct[0] = (row.payload.ct[0] ?? 0) ^ 1;
    const result = await restoreBackup(withTask, PASSWORD, 'replace');
    expect(result.unreadable).toBe(1);
  });
});
