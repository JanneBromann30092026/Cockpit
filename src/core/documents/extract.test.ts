import { describe, expect, it } from 'vitest';
import {
  changedFields,
  defaultFields,
  extractionPatch,
  looksSensitive,
  nameFromFileName,
  remainingAiFields,
  withoutSensitive,
  type ContractExtraction,
  type ExtractTarget,
} from './extract';

const EMPTY: ExtractTarget = {
  name: 'Scan_0815',
  category: 'other',
  summary: [],
  openPoints: [],
  aiFields: [],
};

const READ: ContractExtraction = {
  name: 'Hausratversicherung',
  category: 'insurance',
  provider: 'Musterversicherung AG',
  amount: 89.4,
  interval: 'yearly',
  termEnd: '2027-01-11',
  noticePeriod: '3 Monate zum Ablauf des Versicherungsjahres',
  summary: ['Versicherungssumme 45.000 €', 'Fahrrad bis 1.000 € mitversichert'],
  openPoints: ['Nächster Zahlungstermin steht nicht im Dokument'],
  removed: 0,
};

describe('sensitive numbers', () => {
  it('recognises IBANs, long numbers, number keywords and birth dates', () => {
    expect(looksSensitive('IBAN DE89 3704 0044 0532 0130 00')).toBe(true);
    expect(looksSensitive('DE89370400440532013000')).toBe(true);
    expect(looksSensitive('Versicherungsschein 12345678')).toBe(true);
    expect(looksSensitive('Policennummer: HR-77/12')).toBe(true);
    expect(looksSensitive('Kunden-Nr. A12')).toBe(true);
    expect(looksSensitive('Steuer-ID beim Arbeitgeber')).toBe(true);
    expect(looksSensitive('geb. 01.02.1990')).toBe(true);
  });

  it('keeps ordinary contract facts', () => {
    expect(looksSensitive('Versicherungssumme 45.000 €')).toBe(false);
    expect(looksSensitive('Laufzeit vom 01.01.2026 bis 31.12.2026')).toBe(false);
    expect(looksSensitive('3 Monate zum Ablauf des Versicherungsjahres')).toBe(false);
    expect(looksSensitive('Bearbeitungsgebühr 25 €')).toBe(false);
    expect(looksSensitive('20 GB Datenvolumen, Allnet-Flat')).toBe(false);
  });

  it('leaves out sensitive entries and counts them', () => {
    const result = withoutSensitive({
      ...READ,
      provider: 'Musterversicherung AG, Kundennummer 991',
      summary: ['Beitrag per Lastschrift von DE89 3704 0044 0532 0130 00', 'Fahrrad mitversichert'],
    });
    expect(result.provider).toBeUndefined();
    expect(result.summary).toEqual(['Fahrrad mitversichert']);
    expect(result.removed).toBe(2);
  });
});

describe('taking over', () => {
  it('offers only differing fields; empty ones and the file name are chosen by default', () => {
    expect(changedFields(EMPTY, READ)).toEqual([
      'name',
      'category',
      'provider',
      'amount',
      'interval',
      'termEnd',
      'noticePeriod',
    ]);
    expect(defaultFields(EMPTY, READ, 'Scan_0815')).toEqual(changedFields(EMPTY, READ));
    const filled: ExtractTarget = { ...EMPTY, name: 'Hausrat', amount: 90, category: 'insurance' };
    expect(changedFields(filled, READ)).toContain('amount');
    expect(defaultFields(filled, READ, 'Scan_0815')).toEqual([
      'provider',
      'interval',
      'termEnd',
      'noticePeriod',
    ]);
  });

  it('builds the change: calculable notice, marked summary, added open points, Claude marks', () => {
    const target: ExtractTarget = { ...EMPTY, openPoints: ['Glasbruch?'], aiFields: ['dueDate'] };
    const patch = extractionPatch(target, READ, {
      fields: ['name', 'noticePeriod', 'termEnd'],
      summary: true,
      openPoints: true,
    });
    expect(patch).toEqual({
      name: 'Hausratversicherung',
      noticePeriod: '3 Monate zum Ablauf des Versicherungsjahres',
      notice: { amount: 3, unit: 'months' },
      termEnd: '2027-01-11',
      summary: [
        'Versicherungssumme 45.000 € (Claude)',
        'Fahrrad bis 1.000 € mitversichert (Claude)',
      ],
      openPoints: ['Glasbruch?', 'Nächster Zahlungstermin steht nicht im Dokument'],
      aiFields: ['dueDate', 'name', 'noticePeriod', 'termEnd'],
    });
  });

  it('keeps summary and open points when not chosen; at most five summary points', () => {
    const many = { ...READ, summary: ['1', '2', '3', '4', '5', '6'] };
    expect(extractionPatch(EMPTY, many, { fields: [], summary: false, openPoints: false })).toEqual(
      {},
    );
    expect(
      extractionPatch(EMPTY, many, { fields: [], summary: true, openPoints: false }).summary,
    ).toHaveLength(5);
  });

  it('a field changed by hand loses its Claude mark', () => {
    const before: ExtractTarget = {
      ...EMPTY,
      amount: 89.4,
      termEnd: '2027-01-11',
      aiFields: ['amount', 'termEnd'],
    };
    expect(remainingAiFields(before, { amount: 89.4, termEnd: '2027-02-11' })).toEqual(['amount']);
    expect(remainingAiFields(before, {})).toEqual(['amount', 'termEnd']);
  });
});

describe('name from the original', () => {
  it('uses the file name without extension and underscores', () => {
    expect(nameFromFileName('Police_Hausrat-2026.pdf', 'Neuer Vertrag')).toBe(
      'Police Hausrat-2026',
    );
    expect(nameFromFileName('IMG_0815.HEIC', 'Neuer Vertrag')).toBe('IMG 0815');
    expect(nameFromFileName('.pdf', 'Neuer Vertrag')).toBe('Neuer Vertrag');
  });
});
