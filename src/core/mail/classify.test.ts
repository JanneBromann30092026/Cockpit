import { describe, expect, it } from 'vitest';
import {
  classifyMail,
  decodeEntities,
  mailGroup,
  parseSender,
  sortMails,
  type MailInput,
} from './classify';

function mail(overrides: Partial<MailInput>): MailInput {
  return {
    id: overrides.id ?? 'm',
    threadId: 't',
    from: 'Lena Berg <lena@example.com>',
    subject: 'Hallo',
    snippet: 'Wie geht es dir',
    receivedAt: 1_000,
    labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
    listUnsubscribe: false,
    ...overrides,
  };
}

describe('mail classification', () => {
  it('reads sender names and addresses', () => {
    expect(parseSender('Lena Berg <Lena@Example.com>')).toEqual({
      name: 'Lena Berg',
      email: 'lena@example.com',
    });
    expect(parseSender('"Berg, Lena" <lena@example.com>')).toEqual({
      name: 'Berg, Lena',
      email: 'lena@example.com',
    });
    expect(parseSender('ben@example.com')).toEqual({ name: 'ben', email: 'ben@example.com' });
  });

  it('decodes Gmail snippets', () => {
    expect(decodeEntities('Geht&#39;s dir gut? &quot;Ja&quot; &amp; &lt;3 &#8364;')).toBe(
      'Geht\'s dir gut? "Ja" & <3 €',
    );
  });

  it('sorts by Gmail category and headers', () => {
    expect(classifyMail(mail({})).category).toBe('person');
    expect(classifyMail(mail({ labelIds: ['CATEGORY_PROMOTIONS'] })).category).toBe('promotion');
    expect(classifyMail(mail({ labelIds: ['CATEGORY_SOCIAL'] })).category).toBe('social');
    expect(classifyMail(mail({ labelIds: ['CATEGORY_FORUMS'] })).category).toBe('newsletter');
    expect(classifyMail(mail({ listUnsubscribe: true })).category).toBe('newsletter');
    expect(classifyMail(mail({ precedence: 'bulk' })).category).toBe('newsletter');
    expect(classifyMail(mail({ labelIds: ['CATEGORY_UPDATES'] })).category).toBe('update');
    expect(classifyMail(mail({ from: 'Bank <no-reply@bank.example>' })).category).toBe('update');
    expect(classifyMail(mail({ from: 'Shop <info@shop.example>' })).category).toBe('update');
  });

  it('moves questions and deadlines of real people to the top', () => {
    const question = classifyMail(mail({ id: 'q', snippet: 'Hast du morgen Zeit?' }));
    expect(question).toMatchObject({ question: true, deadline: false, rank: 0 });
    const deadline = classifyMail(mail({ id: 'd', subject: 'Unterlagen bis Freitag' }));
    expect(deadline).toMatchObject({ deadline: true, rank: 0 });
    expect(classifyMail(mail({ snippet: 'Abgabe am 12.10.' })).deadline).toBe(true);
    // A newsletter with a question stays at the bottom.
    expect(classifyMail(mail({ listUnsubscribe: true, subject: 'Schon gesehen?' }))).toMatchObject({
      question: false,
      rank: 4,
    });
    const sorted = sortMails([
      classifyMail(mail({ id: 'ad', labelIds: ['CATEGORY_PROMOTIONS'], receivedAt: 9 })),
      classifyMail(mail({ id: 'plain', receivedAt: 5 })),
      deadline,
      { ...question, receivedAt: 2_000 },
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['q', 'd', 'plain', 'ad']);
    expect(sorted.map(mailGroup)).toEqual(['important', 'important', 'people', 'bulk']);
  });
});
