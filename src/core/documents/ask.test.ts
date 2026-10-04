import { describe, expect, it } from 'vitest';
import { answerQuestion, questionContracts, questionIntents, type AskContract } from './ask';

const TODAY = '2026-10-05';

const hausrat: AskContract = {
  id: 'h',
  name: 'Hausratversicherung',
  category: 'insurance',
  provider: 'Musterversicherung AG',
  amount: 89.4,
  interval: 'yearly',
  dueDate: '2027-01-11',
  termEnd: '2027-01-11',
  noticePeriod: '3 Monate zum Ablauf',
  notice: { amount: 3, unit: 'months' },
};
const haftpflicht: AskContract = {
  id: 'p',
  name: 'Privathaftpflicht',
  category: 'insurance',
  amount: 60,
  interval: 'yearly',
};
const gym: AskContract = {
  id: 'g',
  name: 'Fitnessstudio',
  category: 'subscription',
  provider: 'Studio Beispiel',
  amount: 29.9,
  interval: 'monthly',
  dueDate: '2026-10-17',
  termEnd: '2026-11-14',
  noticePeriod: '4 Wochen zum Ende der Laufzeit',
  notice: { amount: 4, unit: 'weeks' },
};
const phone: AskContract = {
  id: 'm',
  name: 'Handyvertrag',
  category: 'mobile',
  provider: 'Funknetz Beispiel',
  amount: 19.99,
  interval: 'monthly',
  dueDate: '2026-10-08',
  termEnd: '2026-08-31',
  notice: { amount: 1, unit: 'months' },
};
const rent: AskContract = {
  id: 'r',
  name: 'Mietvertrag Wohnung',
  category: 'housing',
  amount: 850,
  interval: 'monthly',
  dueDate: '2026-11-01',
  noticePeriod: '3 Monate zum Monatsende',
};
const streaming: AskContract = {
  id: 's',
  name: 'Streaming-Abo',
  category: 'subscription',
  amount: 13.99,
  interval: 'monthly',
};
const ALL = [hausrat, haftpflicht, gym, phone, rent, streaming];

const names = (items: { contract: AskContract }[]) => items.map((item) => item.contract.name);

describe('intents', () => {
  it('recognises the questions of the guide', () => {
    expect(questionIntents('Wann kann ich spätestens kündigen?')).toEqual(['cancel']);
    expect(questionIntents('Wann ist meine Versicherung fällig?')).toEqual(['payment']);
    expect(questionIntents('Wie lange läuft mein Handyvertrag noch?')).toEqual(['termEnd']);
    expect(questionIntents('Welche Kündigungsfrist hat das Fitnessstudio?')).toEqual(['cancel']);
  });

  it('tells payment dates from costs', () => {
    expect(questionIntents('Wann wird die Miete abgebucht?')).toEqual(['payment']);
    expect(questionIntents('Bis wann muss ich die Miete zahlen?')).toEqual(['payment']);
    expect(questionIntents('Wie viel zahle ich im Monat?')).toEqual(['cost']);
    expect(questionIntents('Was kostet das Fitnessstudio?')).toEqual(['cost']);
    expect(questionIntents('Wie hoch ist der Beitrag?')).toEqual(['cost']);
    expect(questionIntents('Wann ist der nächste Beitrag fällig?')).toEqual(['payment']);
  });

  it('recognises the provider and several intents at once', () => {
    expect(questionIntents('Bei wem bin ich versichert?')).toEqual(['provider']);
    expect(questionIntents('Was kostet das Abo und wann kann ich kündigen?')).toEqual([
      'cancel',
      'cost',
    ]);
    expect(questionIntents('Hallo')).toEqual([]);
  });
});

describe('contracts of a question', () => {
  it('a word with the whole name names exactly that contract', () => {
    const result = questionContracts('Was kostet das Fitnessstudio?', ALL);
    expect(result.scope).toBe('named');
    expect(names(result.contracts.map((contract) => ({ contract })))).toEqual(['Fitnessstudio']);
  });

  it('a category word selects all contracts of the category', () => {
    const result = questionContracts('Wann ist meine Versicherung fällig?', ALL);
    expect(result.scope).toBe('category');
    expect(result.categories).toEqual(['insurance']);
    expect(result.contracts.map((contract) => contract.id)).toEqual(['h', 'p']);
    expect(questionContracts('Was kosten meine Abos?', ALL).contracts.map((c) => c.id)).toEqual([
      'g',
      's',
    ]);
    expect(questionContracts('Wann zahle ich die Miete?', ALL).contracts).toEqual([rent]);
  });

  it('part of a name names that contract; nothing recognised means all', () => {
    expect(questionContracts('Wann endet Stream?', ALL).contracts).toEqual([streaming]);
    expect(questionContracts('Was kostet Streaming?', ALL).contracts).toEqual([streaming]);
    expect(questionContracts('Was zahle ich bei Funknetz?', ALL).contracts).toEqual([phone]);
    const all = questionContracts('Wann kann ich spätestens kündigen?', ALL);
    expect(all.scope).toBe('all');
    expect(all.contracts).toHaveLength(ALL.length);
    // "automatisch" is not the category word "Auto".
    expect(questionContracts('Was verlängert sich automatisch?', ALL).scope).toBe('all');
  });
});

describe('answers', () => {
  it('latest cancel days: upcoming first, passed, then unknown', () => {
    const answer = answerQuestion('Wann kann ich spätestens kündigen?', ALL, TODAY);
    expect(answer.understood).toBe(true);
    expect(answer.items.map((item) => [item.contract.id, item.status, item.date])).toEqual([
      ['h', 'ok', '2026-10-11'],
      ['g', 'ok', '2026-10-17'],
      ['m', 'passed', '2026-07-31'],
      ['r', 'unknown', undefined],
      ['p', 'unknown', undefined],
      ['s', 'unknown', undefined],
    ]);
    expect(answer.items[0]?.days).toBe(6);
  });

  it('payments of a category with the next date', () => {
    const answer = answerQuestion('Wann ist meine Versicherung fällig?', ALL, TODAY);
    expect(answer.scope).toBe('category');
    expect(answer.items).toEqual([
      { intent: 'payment', contract: hausrat, status: 'ok', date: '2027-01-11', days: 98 },
      { intent: 'payment', contract: haftpflicht, status: 'unknown' },
    ]);
  });

  it('costs: most expensive first, with the total of several contracts', () => {
    const answer = answerQuestion('Was kosten meine Abos im Monat?', ALL, TODAY);
    expect(names(answer.items)).toEqual(['Fitnessstudio', 'Streaming-Abo']);
    expect(answer.total?.monthly).toBeCloseTo(43.89);
    expect(answerQuestion('Was kostet das Fitnessstudio?', ALL, TODAY).total).toBeUndefined();
  });

  it('a named contract without intent shows its key facts', () => {
    const answer = answerQuestion('Handyvertrag', ALL, TODAY);
    expect(answer.intents).toEqual(['overview']);
    expect(answer.items).toEqual([{ intent: 'overview', contract: phone, status: 'ok' }]);
  });

  it('a past term end is "passed"; nothing recognised is not understood', () => {
    const answer = answerQuestion('Wann endet mein Handyvertrag?', ALL, TODAY);
    expect(answer.items).toEqual([
      { intent: 'termEnd', contract: phone, status: 'passed', date: '2026-08-31', days: -35 },
    ]);
    expect(answerQuestion('Wie ist das Wetter?', ALL, TODAY)).toEqual({
      understood: false,
      scope: 'all',
      intents: [],
      items: [],
      categories: [],
    });
  });

  it('a named category without contracts gives an empty answer', () => {
    const answer = answerQuestion('Wann kann ich mein Auto kündigen?', ALL, TODAY);
    expect(answer.understood).toBe(true);
    expect(answer.categories).toEqual(['mobility']);
    expect(answer.items).toEqual([]);
  });
});
