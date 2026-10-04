/**
 * What a question to Claude about my contracts contains: only the structured fields
 * (no notes, no originals, no file names), each contract as "v1", "v2" …
 */
import { cancelBy, nextPayment } from '@/core/documents/contracts';
import type { ContractQuestionRequest, QuestionContract } from '@/data/prompts/contractQuestion';
import type { DocumentRecord } from '@/data/schemas';
import { de } from '@/i18n/de';

const t = de.documents;

export function questionRequest(
  question: string,
  documents: readonly DocumentRecord[],
  today: string,
): { request: ContractQuestionRequest; byRef: Map<string, DocumentRecord> } {
  const byRef = new Map<string, DocumentRecord>();
  const contracts = documents.map((document, index): QuestionContract => {
    const ref = `v${index + 1}`;
    byRef.set(ref, document);
    return {
      ref,
      name: document.name,
      kategorie: t.categories[document.category],
      anbieter: document.provider,
      betrag_eur: document.amount,
      zahlweise: document.interval && t.intervals[document.interval],
      naechste_zahlung: nextPayment(document.dueDate, document.interval, today) ?? undefined,
      laufzeit_endet: document.termEnd,
      kuendigungsfrist: document.noticePeriod,
      spaetestens_kuendigen_bis: cancelBy(document) ?? undefined,
      zusammenfassung: document.summary,
      offene_punkte: document.openPoints,
    };
  });
  return { request: { today, question: question.trim(), contracts }, byRef };
}
