/**
 * The brand interview: ten questions, one after the other (reference data, CLAUDE.md).
 * `field` says which profile part an answer fills when the profile is built without AI.
 */
export const INTERVIEW_KEYS = [
  'who',
  'audience',
  'promise',
  'different',
  'values',
  'tone',
  'wordsUsed',
  'wordsAvoided',
  'examples',
  'look',
] as const;
export type InterviewKey = (typeof INTERVIEW_KEYS)[number];

export interface InterviewQuestion {
  key: InterviewKey;
  question: string;
  hint: string;
  placeholder: string;
}

export const INTERVIEW: readonly InterviewQuestion[] = [
  {
    key: 'who',
    question: 'Wer bist du und was machst du?',
    hint: 'Zwei, drei Sätze – so, wie du es jemandem beim Kaffee erzählen würdest.',
    placeholder: 'Ich studiere BWL, arbeite nebenbei im Marketing und mache YouTube-Videos über …',
  },
  {
    key: 'audience',
    question: 'Für wen machst du das?',
    hint: 'Beschreibe deine Zielgruppe: Alter, Situation, was sie beschäftigt.',
    placeholder: 'Studierende, die neben dem Studium arbeiten und …',
  },
  {
    key: 'promise',
    question: 'Was bekommen sie von dir?',
    hint: 'Welches Problem löst du, welches Gefühl oder Ergebnis nehmen sie mit?',
    placeholder: 'Ehrliche Tipps, wie man Studium, Job und Content unter einen Hut bekommt.',
  },
  {
    key: 'different',
    question: 'Was machst du anders als andere?',
    hint: 'Dein Blickwinkel, deine Geschichte, deine Art.',
    placeholder: 'Ich zeige auch, was nicht klappt – ohne Hochglanz.',
  },
  {
    key: 'values',
    question: 'Welche drei bis fünf Werte sind dir wichtig?',
    hint: 'Mit Komma oder Zeilenumbruch trennen.',
    placeholder: 'Ehrlichkeit, Leichtigkeit, Neugier',
  },
  {
    key: 'tone',
    question: 'Wie sollen deine Texte klingen?',
    hint: 'Zum Beispiel locker, direkt, ruhig, witzig, nahbar, fachlich.',
    placeholder: 'Locker und direkt, wie ein guter Freund – aber mit Substanz.',
  },
  {
    key: 'wordsUsed',
    question: 'Welche Wörter oder Sätze sagst du oft?',
    hint: 'Deine typischen Begriffe, Begrüßungen, Lieblingssätze.',
    placeholder: 'ehrlich gesagt, Schritt für Schritt, Hey du',
  },
  {
    key: 'wordsAvoided',
    question: 'Welche Wörter willst du nie benutzen?',
    hint: 'Floskeln, Buzzwords, alles, was nicht nach dir klingt.',
    placeholder: 'Hustle, Gamechanger, krass',
  },
  {
    key: 'examples',
    question: 'Schreib zwei, drei Sätze, die typisch für dich sind.',
    hint: 'Gern so, wie du sie in einem Post oder Video sagen würdest.',
    placeholder: 'Du musst nicht alles schaffen. Du musst nur heute anfangen.',
  },
  {
    key: 'look',
    question: 'Wie soll deine Marke aussehen?',
    hint: 'Farben, Stimmung, Vorbilder – z. B. „dunkelblau, ruhig, modern“.',
    placeholder: 'Dunkelblau mit einem warmen Gelb, klar und modern.',
  },
];
