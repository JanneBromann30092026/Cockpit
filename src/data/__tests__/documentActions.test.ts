import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { demoDocuments } from '@/data/demo/documents';
import { demoActions, documentActions, FileRejectedError } from '@/data/repositories';
import { useDataStore } from '@/data/store';
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

const bytes = (text: string) => new TextEncoder().encode(text);

describe('contracts and their originals', () => {
  it('stores originals encrypted with their own key and opens them again', async () => {
    const contract = await documentActions.create({ name: 'Hausrat', category: 'insurance' });
    const meta = await documentActions.addFile(contract.id, {
      name: 'Police.pdf',
      type: 'application/pdf',
      data: bytes('%PDF-1.4 Geheimer Vertragstext'),
    });
    expect(meta).toMatchObject({ name: 'Police.pdf', type: 'application/pdf', size: 30 });
    expect(useDataStore.getState().documents[contract.id]?.files).toHaveLength(1);
    const row = await db.files.get(meta.id);
    expect(Object.keys(row ?? {}).sort()).toEqual(['documentId', 'id', 'payload', 'updatedAt']);
    expect(await rawDump()).not.toContain('Geheimer Vertragstext');
    expect(await rawDump()).not.toContain('Police.pdf');
    const blob = await documentActions.readFile(contract.id, meta.id);
    expect(blob.type).toBe('application/pdf');
    expect(await blob.text()).toBe('%PDF-1.4 Geheimer Vertragstext');
  });

  it('keeps originals readable after a password change (only contracts are re-encrypted)', async () => {
    const contract = await documentActions.create({ name: 'Handy' });
    const meta = await documentActions.addFile(contract.id, {
      name: 'Foto.jpg',
      type: 'image/jpeg',
      data: bytes('jpeg-bytes'),
    });
    const before = await db.files.get(meta.id);
    await vault.changePassword(PASSWORD, 'Ein ganz neues Passwort 2026');
    const after = await db.files.get(meta.id);
    expect(after?.payload.ct).toEqual(before?.payload.ct);
    vault.lock();
    await vault.unlock('Ein ganz neues Passwort 2026');
    vault.finishOpening();
    const blob = await documentActions.readFile(contract.id, meta.id);
    expect(await blob.text()).toBe('jpeg-bytes');
  });

  it('rejects other file types, too large files and removes originals with the contract', async () => {
    const contract = await documentActions.create({ name: 'Strom' });
    await expect(
      documentActions.addFile(contract.id, {
        name: 'x.exe',
        type: 'application/x-msdownload',
        data: bytes('x'),
      }),
    ).rejects.toBeInstanceOf(FileRejectedError);
    await expect(
      documentActions.addFile(contract.id, {
        name: 'big.pdf',
        type: 'application/pdf',
        data: new Uint8Array(25 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ reason: 'tooLarge' });
    const first = await documentActions.addFile(contract.id, {
      name: 'a.pdf',
      type: 'application/pdf',
      data: bytes('a'),
    });
    await documentActions.addFile(contract.id, {
      name: 'b.png',
      type: 'image/png',
      data: bytes('b'),
    });
    await documentActions.removeFile(contract.id, first.id);
    expect(await db.files.count()).toBe(1);
    expect(useDataStore.getState().documents[contract.id]?.files.map((f) => f.name)).toEqual([
      'b.png',
    ]);
    await documentActions.remove(contract.id);
    expect(await db.files.count()).toBe(0);
    expect(await db.documents.count()).toBe(0);
  });

  it('creates demo contracts with an invented PDF and removes them completely', async () => {
    const real = await documentActions.create({ name: 'Echter Vertrag' });
    expect(await demoActions.createDocuments(demoDocuments('2026-10-05'))).toBe(6);
    expect(await db.files.count()).toBe(1);
    const withPdf = Object.values(useDataStore.getState().documents).find((d) => d.files.length);
    const blob = await documentActions.readFile(withPdf?.id ?? '', withPdf?.files[0]?.id ?? '');
    expect((await blob.text()).startsWith('%PDF-1.4')).toBe(true);
    expect(await demoActions.removeAll()).toBe(6);
    expect(await db.files.count()).toBe(0);
    expect(Object.keys(useDataStore.getState().documents)).toEqual([real.id]);
  });
});

describe('contracts from originals and Claude', () => {
  it('creates a contract from its original; nothing stays when the file is rejected', async () => {
    const created = await documentActions.createFromFile('Police Hausrat', {
      name: 'Police_Hausrat.pdf',
      type: 'application/pdf',
      data: bytes('%PDF-1.4'),
    });
    expect(created.document).toMatchObject({ name: 'Police Hausrat', category: 'other' });
    expect(created.document.files.map((file) => file.id)).toEqual([created.file.id]);
    await expect(
      documentActions.createFromFile('Programm', {
        name: 'Programm.exe',
        type: 'application/x-msdownload',
        data: bytes('MZ'),
      }),
    ).rejects.toBeInstanceOf(FileRejectedError);
    expect(Object.keys(useDataStore.getState().documents)).toEqual([created.document.id]);
  });

  it('takes over the chosen fields with Claude marks; editing by hand removes a mark', async () => {
    const contract = await documentActions.create({
      name: 'Scan 0815',
      openPoints: ['Glasbruch?'],
    });
    const updated = await documentActions.applyExtraction(
      contract.id,
      {
        name: 'Hausratversicherung',
        category: 'insurance',
        amount: 89.4,
        interval: 'yearly',
        termEnd: '2027-01-11',
        noticePeriod: '3 Monate zum Ablauf',
        summary: ['Fahrrad mitversichert'],
        openPoints: ['Zahlungstermin fehlt'],
        removed: 0,
      },
      {
        fields: ['name', 'category', 'amount', 'termEnd', 'noticePeriod'],
        summary: true,
        openPoints: true,
      },
    );
    expect(updated).toMatchObject({
      name: 'Hausratversicherung',
      category: 'insurance',
      amount: 89.4,
      termEnd: '2027-01-11',
      notice: { amount: 3, unit: 'months' },
      summary: ['Fahrrad mitversichert (Claude)'],
      openPoints: ['Glasbruch?', 'Zahlungstermin fehlt'],
      aiFields: ['name', 'category', 'amount', 'termEnd', 'noticePeriod'],
    });
    expect(updated.interval).toBeUndefined();
    expect(await rawDump()).not.toContain('Hausratversicherung');
  });
});
