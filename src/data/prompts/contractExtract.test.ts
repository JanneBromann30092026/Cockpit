import { describe, expect, it } from 'vitest';
import { CONTRACT_EXTRACT_SCHEMA, parseContractExtraction } from './contractExtract';

const base = {
  name: ' Hausratversicherung ',
  category: 'insurance',
  provider: 'Musterversicherung AG',
  amount_eur: 89.404,
  interval: 'yearly',
  due_date: '2027-01-11',
  term_end: '2027-01-11',
  notice_period: '3 Monate zum Ablauf',
  summary: ['- Versicherungssumme 45.000 €', 'Fahrrad mitversichert'],
  open_points: ['Glasbruch unklar'],
};

describe('contract extraction', () => {
  it('schema: every object closed, every field required, no numeric limits', () => {
    expect(CONTRACT_EXTRACT_SCHEMA.additionalProperties).toBe(false);
    expect([...CONTRACT_EXTRACT_SCHEMA.required].sort()).toEqual(
      Object.keys(CONTRACT_EXTRACT_SCHEMA.properties).sort(),
    );
    expect(JSON.stringify(CONTRACT_EXTRACT_SCHEMA)).not.toMatch(
      /minimum|maximum|maxItems|minLength/,
    );
  });

  it('reads the fields, trims texts and bullets, rounds the amount', () => {
    expect(parseContractExtraction(JSON.stringify(base))).toEqual({
      name: 'Hausratversicherung',
      category: 'insurance',
      provider: 'Musterversicherung AG',
      amount: 89.4,
      interval: 'yearly',
      dueDate: '2027-01-11',
      termEnd: '2027-01-11',
      noticePeriod: '3 Monate zum Ablauf',
      summary: ['Versicherungssumme 45.000 €', 'Fahrrad mitversichert'],
      openPoints: ['Glasbruch unklar'],
      removed: 0,
    });
  });

  it('leaves out unknown values, invalid dates, wrong amounts and sensitive entries', () => {
    const result = parseContractExtraction(
      JSON.stringify({
        ...base,
        name: null,
        category: 'pets',
        interval: 'weekly',
        amount_eur: -5,
        due_date: '11.01.2027',
        term_end: '2027-02-30',
        summary: ['Beitrag von DE89 3704 0044 0532 0130 00', 'A', 'B', 'C', 'D', 'E', 'F'],
        open_points: ['Versicherungsnummer: 12-345'],
      }),
    );
    expect(result).toMatchObject({
      summary: ['A', 'B', 'C', 'D', 'E'],
      openPoints: [],
      removed: 2,
    });
    for (const key of ['name', 'category', 'interval', 'amount', 'dueDate', 'termEnd'] as const) {
      expect(result?.[key]).toBeUndefined();
    }
  });

  it('rejects answers that are not the structured format', () => {
    expect(parseContractExtraction('Hier ist der Vertrag')).toBeNull();
    expect(parseContractExtraction(JSON.stringify({ name: 'x' }))).toBeNull();
  });
});
