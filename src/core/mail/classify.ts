/**
 * Sorting unread mails without AI: Gmail categories and headers decide whether a mail is
 * from a real person; questions and deadlines move it to the top. Pure logic.
 */

export type MailCategory = 'person' | 'update' | 'social' | 'newsletter' | 'promotion';

export interface MailInput {
  id: string;
  threadId: string;
  /** Raw From header, e.g. "Lena Berg <lena@example.com>". */
  from: string;
  subject: string;
  snippet: string;
  /** Epoch milliseconds (Gmail internalDate). */
  receivedAt: number;
  labelIds: readonly string[];
  /** A List-Unsubscribe header is present (mailing lists, newsletters). */
  listUnsubscribe: boolean;
  /** Precedence header ("bulk", "list" …), if any. */
  precedence?: string;
}

export interface Mail extends MailInput {
  category: MailCategory;
  senderName: string;
  senderEmail: string;
  question: boolean;
  deadline: boolean;
  /** 0 = person with question or deadline … 5 = advertising (lower is more important). */
  rank: number;
}

const AUTOMATED_SENDER =
  /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|notifications?|newsletter|news|mailer|marketing|info|service|support|team|hello|kontakt|bounce)([._+-]|@)/i;

const DEADLINE =
  /\b(frist|deadline|spätestens|bis (zum|spätestens|morgen|heute|ende|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)|fällig|dringend|asap|eilt|due)\b|\b\d{1,2}\.\d{1,2}\.(\d{2,4})?(?!\d)/i;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/** Gmail snippets come HTML-escaped. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)));
}

/** "Lena Berg <lena@example.com>" → name and address (name falls back to the address). */
export function parseSender(from: string): { name: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  const email = (match?.[2] ?? from).trim().toLowerCase();
  const name = (match?.[1] ?? '').trim() || email.split('@')[0] || email;
  return { name, email };
}

function categoryOf(mail: MailInput, email: string): MailCategory {
  const labels = new Set(mail.labelIds);
  if (labels.has('CATEGORY_PROMOTIONS')) return 'promotion';
  if (labels.has('CATEGORY_SOCIAL')) return 'social';
  if (labels.has('CATEGORY_FORUMS')) return 'newsletter';
  if (mail.listUnsubscribe || /^(bulk|list|junk)$/i.test(mail.precedence ?? '')) {
    return 'newsletter';
  }
  if (labels.has('CATEGORY_UPDATES') || AUTOMATED_SENDER.test(email)) return 'update';
  return 'person';
}

const RANK: Record<MailCategory, number> = {
  person: 1,
  update: 2,
  social: 3,
  newsletter: 4,
  promotion: 5,
};

export function classifyMail(input: MailInput): Mail {
  const { name, email } = parseSender(input.from);
  const snippet = decodeEntities(input.snippet);
  const subject = decodeEntities(input.subject);
  const category = categoryOf(input, email);
  const text = `${subject} ${snippet}`;
  const question = category === 'person' && text.includes('?');
  const deadline = category === 'person' && DEADLINE.test(text);
  return {
    ...input,
    subject,
    snippet,
    category,
    senderName: name,
    senderEmail: email,
    question,
    deadline,
    rank: question || deadline ? 0 : RANK[category],
  };
}

/** Most important first; within a rank the newest first. */
export function sortMails(mails: readonly Mail[]): Mail[] {
  return [...mails].sort((a, b) => a.rank - b.rank || b.receivedAt - a.receivedAt);
}

export type MailGroup = 'important' | 'people' | 'updates' | 'bulk';

export function mailGroup(mail: Mail): MailGroup {
  if (mail.rank === 0) return 'important';
  if (mail.category === 'person') return 'people';
  if (mail.category === 'update' || mail.category === 'social') return 'updates';
  return 'bulk';
}
