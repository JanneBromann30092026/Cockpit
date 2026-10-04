/**
 * Questions to my contracts without AI ("Wann kann ich spätestens kündigen?", "Wann ist
 * meine Versicherung fällig?"): the question is matched against intents (German word
 * stems) and contracts (name, provider, category), the answer comes only from the stored
 * fields – every line names its contract as source, missing facts stay "unknown".
 */
import { daysBetween } from '../dates';
import { cancelBy, costs, nextPayment, totalCosts, type ContractInfo } from './contracts';

export type AskIntent = 'cancel' | 'termEnd' | 'payment' | 'cost' | 'provider';

/** Fields of a contract the answers need. */
export interface AskContract extends ContractInfo {
  category: string;
  provider?: string;
  noticePeriod?: string;
}

export interface AnswerItem<C extends AskContract = AskContract> {
  /** `overview`: the question named a contract but no intent – its key facts. */
  intent: AskIntent | 'overview';
  contract: C;
  /** ok: answered; passed: the date lies in the past; unknown: the fact is missing. */
  status: 'ok' | 'passed' | 'unknown';
  date?: string;
  /** Days from today (negative when passed). */
  days?: number;
}

export interface Answer<C extends AskContract = AskContract> {
  /** False: no intent and no contract recognised – the rules cannot answer. */
  understood: boolean;
  /** Which contracts the question is about. */
  scope: 'named' | 'category' | 'all';
  intents: (AskIntent | 'overview')[];
  items: AnswerItem<C>[];
  /** Costs of all contracts in scope (only for cost questions about several contracts). */
  total?: { monthly: number; yearly: number };
  /** Categories the question named (also when no contract has them). */
  categories: string[];
}

/** Word stems per intent, matched at the start of a word (phrases anywhere). */
const INTENT_STEMS: Record<AskIntent, readonly string[]> = {
  cancel: ['kündig', 'kuendig', 'frist', 'loswerd', 'beend', 'aussteig', 'raus'],
  termEnd: ['laufzeit', 'mindestlaufzeit', 'läuft', 'lauft', 'ende', 'verläng', 'ablauf'],
  payment: ['fällig', 'faellig', 'abbuch', 'abgebucht'],
  cost: [
    'kost',
    'teuer',
    'preis',
    'euro',
    'wie viel',
    'wieviel',
    'ausgab',
    'gebühr',
    'summe',
    'im monat',
    'im jahr',
    'pro monat',
    'pro jahr',
  ],
  provider: ['anbieter', 'bei wem', 'welche firma', 'welcher firma', 'vertragspartner'],
};

/** Payment words only mean "when" together with a when-word ("Wann wird bezahlt?"). */
const PAYMENT_WORDS = ['zahl', 'bezahl', 'überweis', 'beitrag', 'rate', 'betrag'];
const WHEN_WORDS = ['wann', 'nächst', 'datum', 'termin'];
/** Amount words count as a cost question when nothing asks for a date. */
const AMOUNT_WORDS = ['betrag', 'beitrag', 'monatlich', 'jährlich', 'zahle'];

/**
 * Words for the categories. Short words (≤ 4 letters) must match the whole word (plural
 * with "s"), longer ones the start of a word ("versicher" → "Versicherungen").
 */
export const CATEGORY_WORDS: Record<string, readonly string[]> = {
  housing: ['miete', 'mietvertrag', 'wohnung', 'vermieter', 'nebenkosten'],
  insurance: ['versicher', 'police', 'haftpflicht', 'hausrat', 'kasko'],
  mobile: ['handy', 'mobilfunk', 'smartphone', 'telefon'],
  internet: ['internet', 'wlan', 'dsl', 'glasfaser', 'router'],
  energy: ['strom', 'energie', 'gas', 'heizung', 'fernwärme'],
  subscription: ['abo', 'abonnement', 'streaming', 'mitgliedschaft', 'zeitung', 'zeitschrift'],
  mobility: ['auto', 'kfz', 'leasing', 'bahn', 'ticket', 'fahrrad', 'carsharing'],
  finance: ['kredit', 'darlehen', 'bank', 'konto', 'depot', 'sparplan', 'bauspar'],
};

/** Words that never point to a contract name. */
const IGNORED = new Set([
  'mein',
  'meine',
  'meinen',
  'meinem',
  'meiner',
  'meines',
  'welche',
  'welcher',
  'welches',
  'wann',
  'kann',
  'könnte',
  'muss',
  'spätestens',
  'bitte',
  'alle',
  'allen',
  'zeig',
  'zeige',
  'eigentlich',
  'nächste',
  'nächsten',
  'nächster',
  'vertrag',
  'verträge',
  'vertrags',
  'vertrages',
  'verträgen',
  'wird',
  'werden',
  'habe',
  'haben',
  'noch',
  'gmbh',
]);

const INTENT_ORDER: AskIntent[] = ['cancel', 'termEnd', 'payment', 'cost', 'provider'];

function words(text: string): string[] {
  return (
    text
      .toLocaleLowerCase('de')
      .normalize('NFC')
      .match(/[\p{L}\d€]+/gu) ?? []
  );
}

function hasStem(questionWords: readonly string[], text: string, stem: string): boolean {
  return stem.includes(' ')
    ? text.includes(stem)
    : questionWords.some((word) => word.startsWith(stem));
}

/** The intents of a question, in a fixed order. */
export function questionIntents(question: string): AskIntent[] {
  const text = ` ${words(question).join(' ')} `;
  const list = words(question);
  const found = new Set<AskIntent>();
  for (const intent of INTENT_ORDER) {
    if (INTENT_STEMS[intent].some((stem) => hasStem(list, text, stem))) found.add(intent);
  }
  const asksWhen = WHEN_WORDS.some((stem) => hasStem(list, text, stem));
  if (asksWhen && PAYMENT_WORDS.some((stem) => hasStem(list, text, stem))) {
    found.add('payment');
  }
  // "Wann" with the term or a payment is a date question; otherwise amounts mean costs.
  if (!asksWhen && AMOUNT_WORDS.some((stem) => hasStem(list, text, stem))) found.add('cost');
  return INTENT_ORDER.filter((intent) => found.has(intent));
}

function isIntentWord(word: string): boolean {
  return Object.values(INTENT_STEMS).some((stems) =>
    stems.some((stem) => !stem.includes(' ') && word.startsWith(stem)),
  );
}

function categoryOf(word: string): string | null {
  for (const [category, list] of Object.entries(CATEGORY_WORDS)) {
    const hit = list.some((entry) =>
      entry.length <= 4 ? word === entry || word === `${entry}s` : word.startsWith(entry),
    );
    if (hit) return category;
  }
  return null;
}

/** Name and provider words worth matching (4 letters or more, nothing generic). */
function nameTokens(contract: AskContract): string[] {
  return words(`${contract.name} ${contract.provider ?? ''}`).filter(
    (word) => word.length >= 4 && !IGNORED.has(word),
  );
}

/**
 * Which contracts a question is about: a word containing a contract's name ("Fitnessstudio")
 * names it; a category word ("Versicherung") selects the category; a word that is part of
 * a name ("Handy" in "Handyvertrag") names that contract. Nothing recognised → all.
 */
export function questionContracts<C extends AskContract>(
  question: string,
  contracts: readonly C[],
): { scope: Answer['scope']; contracts: C[]; categories: string[] } {
  const named = new Set<C>();
  const categories = new Set<string>();
  const candidates = words(question).filter(
    (word) => word.length >= 3 && !IGNORED.has(word) && !isIntentWord(word),
  );
  for (const word of candidates) {
    const whole = contracts.filter((contract) =>
      nameTokens(contract).some((token) => word.includes(token)),
    );
    if (whole.length > 0) {
      whole.forEach((contract) => named.add(contract));
      continue;
    }
    const category = categoryOf(word);
    if (category) {
      categories.add(category);
      continue;
    }
    if (word.length < 5) continue;
    contracts
      .filter((contract) => nameTokens(contract).some((token) => token.includes(word)))
      .forEach((contract) => named.add(contract));
  }
  if (named.size === 0 && categories.size === 0) {
    return { scope: 'all', contracts: [...contracts], categories: [] };
  }
  const selected = contracts.filter(
    (contract) => named.has(contract) || categories.has(contract.category),
  );
  return {
    scope: named.size > 0 ? 'named' : 'category',
    contracts: selected,
    categories: [...categories],
  };
}

function dated<C extends AskContract>(
  intent: AnswerItem['intent'],
  contract: C,
  date: string | null | undefined,
  today: string,
): AnswerItem<C> {
  if (!date) return { intent, contract, status: 'unknown' };
  const days = daysBetween(today, date);
  return { intent, contract, status: days < 0 ? 'passed' : 'ok', date, days };
}

function itemFor<C extends AskContract>(
  intent: AnswerItem['intent'],
  contract: C,
  today: string,
): AnswerItem<C> {
  switch (intent) {
    case 'cancel':
      return dated(intent, contract, cancelBy(contract), today);
    case 'termEnd':
      return dated(intent, contract, contract.termEnd, today);
    case 'payment':
      return dated(
        intent,
        contract,
        nextPayment(contract.dueDate, contract.interval, today),
        today,
      );
    case 'cost':
      return { intent, contract, status: contract.amount === undefined ? 'unknown' : 'ok' };
    case 'provider':
      return { intent, contract, status: contract.provider ? 'ok' : 'unknown' };
    case 'overview':
      return { intent, contract, status: 'ok' };
  }
}

const STATUS_ORDER: Record<AnswerItem['status'], number> = { ok: 0, passed: 1, unknown: 2 };

function compareItems(a: AnswerItem, b: AnswerItem): number {
  const status = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (status !== 0) return status;
  if (a.intent === 'cost' && b.intent === 'cost') {
    const difference = costs(b.contract).monthly - costs(a.contract).monthly;
    if (difference !== 0) return difference;
  }
  if (a.date && b.date && a.date !== b.date) {
    // Upcoming: earliest first; passed: most recent first.
    return a.status === 'passed' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  }
  return a.contract.name.localeCompare(b.contract.name, 'de');
}

/** Answers a question from the stored contract fields only. */
export function answerQuestion<C extends AskContract>(
  question: string,
  contracts: readonly C[],
  today: string,
): Answer<C> {
  const intents = questionIntents(question);
  const target = questionContracts(question, contracts);
  if (intents.length === 0 && target.scope === 'all') {
    return { understood: false, scope: 'all', intents: [], items: [], categories: [] };
  }
  const asked: AnswerItem['intent'][] = intents.length > 0 ? intents : ['overview'];
  const items = asked.flatMap((intent) =>
    target.contracts.map((contract) => itemFor(intent, contract, today)).sort(compareItems),
  );
  const answer: Answer<C> = {
    understood: true,
    scope: target.scope,
    intents: asked,
    items,
    categories: target.categories,
  };
  if (intents.includes('cost') && target.contracts.length > 1) {
    answer.total = totalCosts(target.contracts);
  }
  return answer;
}
