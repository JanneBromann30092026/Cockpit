/**
 * Text templates of "Damit bauen" without AI (reference data, CLAUDE.md): the structure of
 * a newsletter, landing page, Instagram post or video script, filled with what the profile
 * and the brief already say. Everything unknown stays a [placeholder] – nothing invented.
 */
import type { BrandDraftKind } from '../domain';

export interface TemplateProfile {
  answers: Partial<Record<string, string>>;
  tone?: string;
  values: readonly string[];
  wordsUsed: readonly string[];
  wordsAvoided: readonly string[];
  examples: readonly string[];
}

export interface Brief {
  /** Topic or occasion (required). */
  topic: string;
  /** What it is about, key message, notes. */
  details?: string;
  /** What readers or viewers should do. */
  cta?: string;
}

const GREETING = /^(hey|hi|hallo|moin|servus|liebe|lieber|hallöchen|na)\b/i;

function greeting(profile: TemplateProfile): string {
  return profile.wordsUsed.find((word) => GREETING.test(word)) ?? 'Hallo';
}

function firstSentence(text: string | undefined): string | undefined {
  return text
    ?.split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find(Boolean);
}

function styleNote(profile: TemplateProfile): string {
  const lines = [
    profile.tone ? `Ton: ${profile.tone}` : null,
    profile.wordsUsed.length > 0 ? `Deine Wörter: ${profile.wordsUsed.join(', ')}` : null,
    profile.wordsAvoided.length > 0 ? `Vermeiden: ${profile.wordsAvoided.join(', ')}` : null,
  ].filter(Boolean);
  return lines.length > 0 ? `\n\n—\n${lines.join('\n')}` : '';
}

const p = (text: string) => `[${text}]`;

export function buildTemplate(
  kind: BrandDraftKind,
  brief: Brief,
  profile: TemplateProfile,
): string {
  const topic = brief.topic.trim();
  const details = brief.details?.trim();
  const cta = brief.cta?.trim();
  const hook = profile.examples[0];
  const closing = profile.examples[1];
  const audience = firstSentence(profile.answers.audience);
  const promise = firstSentence(profile.answers.promise);
  const different = firstSentence(profile.answers.different);

  switch (kind) {
    case 'newsletter':
      return (
        [
          `Betreff: ${topic}`,
          '',
          `${greeting(profile)},`,
          '',
          hook ?? p('Ein erster Satz, der neugierig macht'),
          '',
          details ?? p('Worum es heute geht – in zwei, drei Sätzen'),
          '',
          'Das nimmst du mit:',
          `– ${p('Punkt 1')}`,
          `– ${p('Punkt 2')}`,
          `– ${p('Punkt 3')}`,
          '',
          cta ?? p('Was sollen Leserinnen und Leser jetzt tun?'),
          '',
          closing ?? p('Dein Abschiedssatz'),
          p('Dein Name'),
        ].join('\n') + styleNote(profile)
      );

    case 'landing':
      return (
        [
          `Überschrift: ${topic}`,
          `Unterzeile: ${details ?? promise ?? p('Das Versprechen in einem Satz')}`,
          '',
          `Für wen: ${audience ?? p('Deine Zielgruppe')}`,
          '',
          'Das bekommst du:',
          `– ${p('Nutzen 1')}`,
          `– ${p('Nutzen 2')}`,
          `– ${p('Nutzen 3')}`,
          '',
          `Warum ich: ${different ?? p('Was du anders machst')}`,
          ...(profile.values.length > 0
            ? ['', `Wofür ich stehe: ${profile.values.join(' · ')}`]
            : []),
          '',
          `Button: ${cta ?? p('Jetzt starten')}`,
        ].join('\n') + styleNote(profile)
      );

    case 'instagram':
      return (
        [
          hook ?? p('Hook – der erste Satz entscheidet'),
          '',
          `${topic}${details ? `: ${details}` : ''}`,
          '',
          `1. ${p('Tipp oder Gedanke')}`,
          `2. ${p('Tipp oder Gedanke')}`,
          `3. ${p('Tipp oder Gedanke')}`,
          '',
          cta ?? p('Frage oder Aufforderung an deine Community'),
          '',
          p('#Hashtags'),
        ].join('\n') + styleNote(profile)
      );

    case 'video':
      return (
        [
          `Titel: ${topic}`,
          '',
          'HOOK (0–10 s)',
          hook ?? p('Ein Satz, der zeigt, worum es geht und warum es sich lohnt'),
          '',
          'INTRO (10–30 s)',
          p('Wer du bist und was die Zuschauer gleich mitnehmen'),
          '',
          'HAUPTTEIL',
          `1. ${p('Punkt 1 – mit Beispiel aus deinem Alltag')}`,
          `2. ${p('Punkt 2')}`,
          `3. ${p('Punkt 3')}`,
          ...(details ? ['', `Notizen: ${details}`] : []),
          '',
          'CALL TO ACTION',
          cta ?? p('Abonnieren, Kommentar-Frage …'),
          '',
          'OUTRO',
          closing ?? p('Dein typischer Abschluss'),
        ].join('\n') + styleNote(profile)
      );
  }
}
