import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_BRAND_ANSWERS } from '@/data/demo/brand';
import { brandActions, currentBrand, demoActions } from '@/data/repositories';
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

describe('brand profile', () => {
  it('saves answers encrypted and builds the profile when the interview ends', async () => {
    await brandActions.saveAnswer('values', 'Ehrlichkeit, Neugier');
    await brandActions.saveAnswer('tone', 'Locker und direkt');
    await brandActions.saveAnswer('look', 'grün und natürlich');
    await brandActions.saveAnswer('who', '');
    expect(currentBrand()?.answers).toEqual({
      values: 'Ehrlichkeit, Neugier',
      tone: 'Locker und direkt',
      look: 'grün und natürlich',
    });
    const done = await brandActions.finishInterview(new Date('2026-10-09T10:00:00Z'));
    expect(done.interviewDoneAt).toBe('2026-10-09T10:00:00.000Z');
    expect(done.values).toEqual(['Ehrlichkeit', 'Neugier']);
    expect(done.tone).toBe('Locker und direkt');
    expect(done.design?.colors.primary).toBe('#166534');
    expect(await rawDump()).not.toContain('Ehrlichkeit');
  });

  it('keeps parts written by hand; edits remove the Claude mark', async () => {
    await brandActions.applyAi({ tone: 'Von Claude', values: ['A'] }, ['tone', 'values']);
    await brandActions.saveAnswer('tone', 'Anders');
    const finished = await brandActions.finishInterview();
    expect(finished.tone).toBe('Von Claude');
    const edited = await brandActions.edit({ tone: 'Von mir' });
    expect(edited.aiFields).toEqual(['values']);
  });

  it('saves texts (newest first) and deletes them', async () => {
    const first = await brandActions.addDraft({
      kind: 'video',
      topic: 'Eins',
      text: 'A',
      byClaude: false,
    });
    await brandActions.addDraft({ kind: 'instagram', topic: 'Zwei', text: 'B', byClaude: true });
    expect(currentBrand()?.drafts.map((draft) => draft.topic)).toEqual(['Zwei', 'Eins']);
    await brandActions.removeDraft(first.id);
    expect(currentBrand()?.drafts).toHaveLength(1);
    await brandActions.reset();
    expect(currentBrand()).toBeUndefined();
  });

  it('demo profile only when there is none', async () => {
    expect(await demoActions.createBrand(DEMO_BRAND_ANSWERS)).toBe(1);
    expect(currentBrand()?.demo).toBe(true);
    expect(currentBrand()?.examples.length).toBeGreaterThan(0);
    expect(await demoActions.createBrand(DEMO_BRAND_ANSWERS)).toBe(0);
    await demoActions.removeAll();
    expect(currentBrand()).toBeUndefined();
  });
});
