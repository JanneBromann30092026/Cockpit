/**
 * An invented day for the developer mode and the screenshots: events and unread mails
 * relative to `now`. Names, addresses and places are made up (example domains only).
 */
import { localDate, sortEvents, type CalendarEvent } from '@/core/calendar/events';
import { classifyMail, sortMails, type Mail, type MailInput } from '@/core/mail/classify';

function at(now: Date, hours: number, minutes: number): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes).toISOString();
}

function tomorrow(now: Date): string {
  return localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

export function demoEvents(now: Date): CalendarEvent[] {
  const timed = (
    id: string,
    title: string,
    from: [number, number],
    to: [number, number],
    location?: string,
  ): CalendarEvent => ({
    id,
    calendarId: 'demo',
    title,
    location,
    start: at(now, ...from),
    end: at(now, ...to),
    allDay: false,
  });
  return sortEvents([
    {
      id: 'demo-birthday',
      calendarId: 'demo',
      title: 'Geburtstag Mia',
      start: localDate(now),
      end: tomorrow(now),
      allDay: true,
    },
    timed('demo-standup', 'Daily Stand-up', [8, 30], [9, 0], 'Videocall'),
    timed('demo-lecture', 'Vorlesung Statistik II', [9, 0], [10, 30], 'Hörsaal 3, Campus Nord'),
    timed('demo-lunch', 'Mittagessen mit Jonas', [12, 30], [13, 15], 'Café Lindgrün'),
    timed('demo-project', 'Projektmeeting Kundenportal', [14, 0], [15, 30], 'Büro, Raum 2.14'),
    timed('demo-shoot', 'Videodreh: Intro fürs Wochenvideo', [15, 40], [16, 30]),
    timed('demo-run', 'Laufen im Park', [18, 30], [19, 15]),
  ]);
}

export function demoMails(now: Date): Mail[] {
  const ago = (minutes: number) => now.getTime() - minutes * 60_000;
  const mail = (input: Omit<MailInput, 'threadId' | 'listUnsubscribe'> & Partial<MailInput>) =>
    classifyMail({ threadId: input.id, listUnsubscribe: false, ...input });
  return sortMails([
    mail({
      id: 'demo-mail-1',
      from: 'Lena Berg <lena.berg@example.com>',
      subject: 'Folien fürs Kundenportal',
      snippet:
        'Hi! Schaffst du es, mir die Folien bis heute 13 Uhr zu schicken? Dann baue ich sie noch in die Präsentation ein.',
      receivedAt: ago(35),
      labelIds: ['INBOX', 'UNREAD', 'IMPORTANT'],
    }),
    mail({
      id: 'demo-mail-2',
      from: 'Prof. Dr. Anna Weber <a.weber@uni.example.org>',
      subject: 'Hausarbeit Statistik: Abgabe bis 15.10.',
      snippet:
        'Liebe Studierende, die Hausarbeit geben Sie bitte bis spätestens 15.10. im Lernportal ab.',
      receivedAt: ago(190),
      labelIds: ['INBOX', 'UNREAD'],
    }),
    mail({
      id: 'demo-mail-3',
      from: 'Jonas Keller <jonas.keller@example.net>',
      subject: 'Mittag',
      snippet: 'Ich hab uns im Lindgrün einen Tisch reserviert, freu mich!',
      receivedAt: ago(80),
      labelIds: ['INBOX', 'UNREAD'],
    }),
    mail({
      id: 'demo-mail-4',
      from: 'Papa <papa@example.com>',
      subject: 'Fotos vom Wochenende',
      snippet: 'Hier sind die Bilder vom Grillen. Das Wetter war echt super.',
      receivedAt: ago(600),
      labelIds: ['INBOX', 'UNREAD'],
    }),
    mail({
      id: 'demo-mail-5',
      from: 'Paketdienst <noreply@paket.example>',
      subject: 'Deine Sendung kommt heute zwischen 14 und 16 Uhr',
      snippet: 'Sendungsnummer 0000 0000 0000 – Zustellung voraussichtlich heute.',
      receivedAt: ago(140),
      labelIds: ['INBOX', 'UNREAD', 'CATEGORY_UPDATES'],
    }),
    mail({
      id: 'demo-mail-6',
      from: 'Lernportal <notifications@uni.example.org>',
      subject: 'Neue Unterlagen in „Statistik II“',
      snippet: 'Im Kurs Statistik II wurden neue Unterlagen hochgeladen.',
      receivedAt: ago(320),
      labelIds: ['INBOX', 'UNREAD', 'CATEGORY_UPDATES'],
    }),
    mail({
      id: 'demo-mail-7',
      from: 'Creator Weekly <newsletter@creatorweekly.example>',
      subject: '5 Hooks für deine nächsten Shorts',
      snippet: 'Diese Woche: Hooks, die in den ersten zwei Sekunden funktionieren.',
      receivedAt: ago(420),
      labelIds: ['INBOX', 'UNREAD', 'CATEGORY_UPDATES'],
      listUnsubscribe: true,
    }),
    mail({
      id: 'demo-mail-8',
      from: 'Modeshop <angebote@shop.example>',
      subject: 'Nur heute: 30 % auf alles',
      snippet: 'Dein Rabattcode wartet – nur bis Mitternacht gültig.',
      receivedAt: ago(500),
      labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'],
      listUnsubscribe: true,
    }),
  ]);
}
