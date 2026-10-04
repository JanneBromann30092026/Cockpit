/**
 * Invented contracts for the developer mode and the screenshots, relative to `today`.
 * Providers and amounts are made up; no account, policy or customer numbers.
 */
import { addDays, addMonths } from '@/core/dates';
import type { DocumentInput } from '../repositories';
import { demoPdf } from './pdf';

export interface DemoDocument {
  input: DocumentInput;
  /** An invented original as PDF (title and lines). */
  pdf?: { name: string; title: string; lines: string[] };
}

/** The first day of the next month. */
function nextFirst(today: string): string {
  return `${addMonths(today, 1).slice(0, 7)}-01`;
}

export function demoDocuments(today: string): DemoDocument[] {
  const day = (offset: number) => addDays(today, offset);
  const hausratEnd = addMonths(day(6), 3);
  return [
    {
      input: {
        name: 'Hausratversicherung',
        category: 'insurance',
        provider: 'Musterversicherung AG',
        amount: 89.4,
        interval: 'yearly',
        dueDate: hausratEnd,
        termEnd: hausratEnd,
        noticePeriod: '3 Monate zum Ablauf des Versicherungsjahres',
        notice: { amount: 3, unit: 'months' },
        summary: [
          'Versicherungssumme 45.000 € für die Wohnung',
          'Fahrraddiebstahl bis 1.000 € mitversichert',
          'Selbstbeteiligung 150 € je Schaden',
          'Verlängert sich jeweils um ein Jahr',
        ],
        openPoints: ['Ist Glasbruch mitversichert?'],
      },
      pdf: {
        name: 'Hausrat-Police (Demo).pdf',
        title: 'Musterversicherung AG – Demo',
        lines: [
          'Hausratversicherung (erfundenes Beispiel)',
          'Beitrag: 89,40 € jährlich',
          `Versicherungsjahr endet am ${hausratEnd.split('-').reverse().join('.')}`,
          'Kündigung: 3 Monate zum Ablauf des Versicherungsjahres',
        ],
      },
    },
    {
      input: {
        name: 'Fitnessstudio',
        category: 'subscription',
        provider: 'Studio Beispiel',
        amount: 29.9,
        interval: 'monthly',
        dueDate: day(12),
        termEnd: day(40),
        noticePeriod: '4 Wochen zum Ende der Laufzeit',
        notice: { amount: 4, unit: 'weeks' },
        summary: ['Mindestlaufzeit 12 Monate', 'Danach monatlich kündbar'],
      },
    },
    {
      input: {
        name: 'Handyvertrag',
        category: 'mobile',
        provider: 'Funknetz Beispiel',
        amount: 19.99,
        interval: 'monthly',
        dueDate: day(3),
        termEnd: day(200),
        noticePeriod: '1 Monat zum Ende der Mindestlaufzeit',
        notice: { amount: 1, unit: 'months' },
        summary: ['20 GB Datenvolumen', 'Allnet-Flat', 'Mindestlaufzeit 24 Monate'],
      },
    },
    {
      input: {
        name: 'Mietvertrag Wohnung',
        category: 'housing',
        provider: 'Wohnbau Beispiel GmbH',
        amount: 850,
        interval: 'monthly',
        dueDate: nextFirst(today),
        noticePeriod: '3 Monate zum Monatsende',
        summary: [
          'Kaltmiete 720 €, Nebenkosten 130 €',
          'Kaution: drei Monatskaltmieten',
          'Unbefristet',
        ],
      },
    },
    {
      input: {
        name: 'Stromvertrag',
        category: 'energy',
        provider: 'Stadtwerke Beispiel',
        amount: 64,
        interval: 'monthly',
        dueDate: day(9),
        termEnd: day(300),
        noticePeriod: '6 Wochen zum Ende der Erstlaufzeit',
        notice: { amount: 6, unit: 'weeks' },
        openPoints: ['Bis wann gilt die Preisgarantie?'],
      },
    },
    {
      input: {
        name: 'Streaming-Abo',
        category: 'subscription',
        amount: 13.99,
        interval: 'monthly',
        dueDate: day(20),
        noticePeriod: 'jederzeit zum Ende des Abrechnungszeitraums',
      },
    },
  ];
}

export function demoDocumentPdf(demo: DemoDocument): Uint8Array<ArrayBuffer> | null {
  return demo.pdf ? demoPdf(demo.pdf.title, demo.pdf.lines) : null;
}
