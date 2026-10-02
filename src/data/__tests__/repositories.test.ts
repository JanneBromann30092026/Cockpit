import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { RecordNotFoundError, ValidationError } from '@/data/errors';
import { brandRepo, documentsRepo, libraryRepo, reviewsRepo, tasksRepo } from '@/data/repositories';
import { decryptRow } from '@/data/repositories/rows';
import { vault } from '@/services/vault';
import { resetDb } from './testDb';

beforeEach(async () => {
  vault.lock();
  await resetDb();
  await vault.init(true);
  await vault.setup('Cockpit-Test-2026!');
  vault.finishOpening();
});

describe('record repositories', () => {
  it('fills defaults, trims text and validates input', async () => {
    const task = await tasksRepo.create({ title: '  Zahnarzt anrufen ', notes: '' });
    expect(task).toMatchObject({
      title: 'Zahnarzt anrufen',
      status: 'open',
      priority: 'medium',
      demo: false,
    });
    expect(task.notes).toBeUndefined();
    expect(task.createdAt).toBe(task.updatedAt);
    await expect(tasksRepo.create({ title: ' ' })).rejects.toBeInstanceOf(ValidationError);
    await expect(tasksRepo.create({ title: 'X', dueDate: '31.10.2026' })).rejects.toMatchObject({
      field: 'dueDate',
    });
    await expect(
      libraryRepo.create({ title: 'X', type: 'book', link: 'kein-link' }),
    ).rejects.toMatchObject({ field: 'link' });
  });

  it('writes encrypted rows with only technical fields readable', async () => {
    const task = await tasksRepo.create({ title: 'Steuererklärung', dueDate: '2026-10-31' });
    const row = await db.tasks.get(task.id);
    expect(Object.keys(row ?? {}).sort()).toEqual(['id', 'payload', 'updatedAt']);
    expect(row?.payload.v).toBe(1);
    expect(await decryptRow('tasks', row!)).toEqual(task);
  });

  it('updates with a strictly newer timestamp and keeps managed fields', async () => {
    const task = await tasksRepo.create({ title: 'Lernzettel' });
    const updated = await tasksRepo.update(task.id, { status: 'done', priority: 'high' });
    expect(updated.id).toBe(task.id);
    expect(updated.createdAt).toBe(task.createdAt);
    expect(updated.updatedAt > task.updatedAt).toBe(true);
    expect(tasksRepo.get(task.id)).toEqual(updated);
    await expect(tasksRepo.update(task.id, { title: '' })).rejects.toBeInstanceOf(ValidationError);
    expect(tasksRepo.get(task.id)?.title).toBe('Lernzettel');
  });

  it('removes records and rejects unknown ids', async () => {
    const task = await tasksRepo.create({ title: 'Weg damit' });
    await tasksRepo.remove(task.id);
    expect(tasksRepo.list()).toEqual([]);
    expect(await db.tasks.count()).toBe(0);
    await expect(tasksRepo.remove(task.id)).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('stores contracts, reviews, library entries and the brand profile', async () => {
    const contract = await documentsRepo.create({
      name: 'Hausratversicherung',
      category: 'insurance',
      amount: 7.5,
      summary: ['Versicherungssumme 50.000 €', 'Versicherungssumme 50.000 €'],
    });
    expect(contract.summary).toEqual(['Versicherungssumme 50.000 €']);
    await expect(
      documentsRepo.create({ name: 'Zu lang', summary: ['1', '2', '3', '4', '5', '6'] }),
    ).rejects.toMatchObject({ field: 'summary' });

    const review = await reviewsRepo.create({
      kind: 'weekly',
      date: '2026-10-04',
      changes: ['Früher schlafen', 'Handy aus dem Schlafzimmer', 'Montags planen'],
    });
    expect(review.wentWell).toEqual([]);
    await expect(
      reviewsRepo.create({ kind: 'weekly', date: '2026-10-04', changes: ['1', '2', '3', '4'] }),
    ).rejects.toMatchObject({ field: 'changes' });

    const entry = await libraryRepo.create({
      title: 'Deep Work',
      type: 'book',
      keyPoints: [{ text: 'Tiefe Arbeit braucht Blöcke' }],
    });
    expect(entry.keyPoints[0]?.byClaude).toBe(false);

    const brand = await brandRepo.create({ answers: { audience: 'Studierende' } });
    expect(brand.values).toEqual([]);
  });
});
