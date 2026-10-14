import { beforeEach, describe, expect, it } from 'vitest';
import { parseBackup } from '@/core/backup/format';
import { currentFocus, focusActions } from '@/data/repositories';
import { createBackup, restoreBackup } from '@/services/backup';
import { vault } from '@/services/vault';
import { rawDump, resetDb } from './testDb';

const PASSWORD = 'Cockpit-Test-2026!';

beforeEach(async () => {
  vault.lock();
  await resetDb();
  await vault.init(true);
  await vault.setup(PASSWORD);
  vault.finishOpening();
});

describe('focus profile', () => {
  it('takes over spoken wishes once, encrypted', async () => {
    await focusActions.addWishes([
      { name: 'Uni nacharbeiten', minutesPerWeek: 180, blockMinutes: 90 },
      { name: 'Instagram', blockMinutes: 60 },
    ]);
    await focusActions.addWishes([{ name: 'instagram', dayPart: 'evening' }]);
    const profile = currentFocus();
    expect(profile?.activities.map((a) => [a.name, a.blockMinutes, a.dayPart])).toEqual([
      ['Uni nacharbeiten', 90, 'any'],
      ['Instagram', 60, 'evening'],
    ]);
    expect(profile).toMatchObject({ dayStart: '08:00', dayEnd: '20:00', bufferMinutes: 15 });
    expect(await rawDump()).not.toContain('Instagram');
  });

  it('saves settings and is part of the backup', async () => {
    await focusActions.save({ dayStart: '07:30', weekdays: [4, 0, 0] });
    expect(currentFocus()).toMatchObject({ dayStart: '07:30', weekdays: [0, 4] });
    const backup = parseBackup(await (await createBackup()).file.text());
    expect(backup.tables.focus).toHaveLength(1);
    await resetDb();
    vault.lock();
    await vault.init(true);
    await vault.setup('Ein anderes Passwort 2026');
    vault.finishOpening();
    await restoreBackup(backup, PASSWORD, 'merge');
    expect(currentFocus()?.dayStart).toBe('07:30');
  });
});
