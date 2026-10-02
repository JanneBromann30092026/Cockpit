import { beforeEach, describe, expect, it } from 'vitest';
import { recordAad } from '@/core/crypto/format';
import { db } from '@/data/db';
import { libraryRepo, metaRepo, tasksRepo } from '@/data/repositories';
import { useDataStore } from '@/data/store';
import { requireSessionKey, hasSessionKey } from '@/services/crypto/session';
import { decryptJson, encryptJson } from '@/services/crypto/webCrypto';
import { useVault, vault } from '@/services/vault';
import { rawDump, resetDb } from './testDb';

const PASSWORD = 'Cockpit-Test-2026!';

async function freshVault() {
  vault.lock();
  await resetDb();
  await vault.init(true);
  await vault.setup(PASSWORD);
  vault.finishOpening();
}

describe('vault', () => {
  beforeEach(freshVault);

  it('sets up, locks and unlocks with the right password only', async () => {
    expect(useVault.getState().status).toBe('unlocked');
    await tasksRepo.create({ title: 'Steuererklärung abschicken' });

    vault.lock();
    expect(useVault.getState().status).toBe('locked');
    expect(hasSessionKey()).toBe(false);
    expect(useDataStore.getState().tasks).toEqual({});
    expect(tasksRepo.list()).toEqual([]);
    await expect(tasksRepo.create({ title: 'Gesperrt' })).rejects.toThrow('locked');

    expect(await vault.unlock('falsch')).toMatchObject({ ok: false, reason: 'wrongPassword' });
    expect(useVault.getState().failures?.count).toBe(1);
    expect(await vault.unlock(PASSWORD)).toEqual({ ok: true });
    expect(useVault.getState().status).toBe('opening');
    expect(useVault.getState().failures).toBeNull();
    expect(tasksRepo.list().map((task) => task.title)).toEqual(['Steuererklärung abschicken']);
  });

  it('makes you wait after the third wrong password', async () => {
    vault.lock();
    await vault.unlock('falsch 1');
    await vault.unlock('falsch 2');
    expect(await vault.unlock('falsch 3')).toEqual({
      ok: false,
      reason: 'wrongPassword',
      waitMs: 5_000,
    });
    expect(await vault.unlock(PASSWORD)).toMatchObject({ ok: false, reason: 'wait' });
    expect((await metaRepo.getUnlockFailures())?.count).toBe(3);
  });

  it('stores no plaintext anywhere', async () => {
    const task = await tasksRepo.create({
      title: 'Steuererklärung abschicken',
      notes: 'Belege im Ordner Finanzen',
      dueDate: '2026-10-31',
    });
    await libraryRepo.create({
      title: 'Atomic Habits',
      type: 'book',
      author: 'James Clear',
      topics: ['Gewohnheiten'],
    });
    const dump = await rawDump();
    for (const text of ['Steuer', 'Belege', '2026-10-31', 'Atomic', 'Clear', 'Gewohnheiten']) {
      expect(dump).not.toContain(text);
    }
    expect(dump).toContain(task.id);
  });

  it('refuses a second setup', async () => {
    await expect(vault.setup('noch ein Passwort')).rejects.toThrow('Vault already exists');
  });

  it('changes the password and re-encrypts every row, secrets included', async () => {
    const task = await tasksRepo.create({ title: 'Handyvertrag prüfen' });
    await libraryRepo.create({ title: 'Deep Work', type: 'book' });
    const aad = recordAad('secrets', 'apiKey');
    await db.secrets.put({
      key: 'apiKey',
      updatedAt: new Date().toISOString(),
      payload: await encryptJson(requireSessionKey(), 'sk-test', aad),
    });
    const before = (await db.tasks.get(task.id))?.payload.ct;

    expect(await vault.changePassword('falsch', 'Neues-Passwort-2026')).toBe(false);
    expect(await vault.changePassword(PASSWORD, 'Neues-Passwort-2026')).toBe(true);
    const after = (await db.tasks.get(task.id))?.payload.ct;
    expect(Array.from(after ?? [])).not.toEqual(Array.from(before ?? []));
    // The session keeps working with the new key.
    await tasksRepo.update(task.id, { priority: 'high' });

    vault.lock();
    expect(await vault.unlock(PASSWORD)).toMatchObject({ ok: false });
    expect(await vault.unlock('Neues-Passwort-2026')).toEqual({ ok: true });
    expect(tasksRepo.get(task.id)?.priority).toBe('high');
    expect(libraryRepo.list()).toHaveLength(1);
    const secret = await db.secrets.get('apiKey');
    expect(await decryptJson(requireSessionKey(), secret?.payload, aad)).toBe('sk-test');
    expect((await metaRepo.getVault())?.passwordChangedAt).toBeDefined();
  });

  it('resets everything', async () => {
    await tasksRepo.create({ title: 'Wird gelöscht' });
    await vault.resetAll();
    expect(useVault.getState().status).toBe('setup');
    await db.open();
    expect(await db.tasks.count()).toBe(0);
    expect(await metaRepo.getVault()).toBeNull();
  });
});
