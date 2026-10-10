/**
 * Invented daily reviews of the last days and last week's weekly review, relative to
 * `today` (developer mode and screenshots). Marked as demo like all demo data.
 */
import { reviewWeek } from '@/core/reviews/reviews';
import { addDays } from '@/core/dates';
import type { reviewsRepo } from '../repositories/records';

export type DemoReview = Parameters<typeof reviewsRepo.create>[0];

const DAYS: Omit<DemoReview, 'kind' | 'date'>[] = [
  {
    wentWell: ['Gliederung der Hausarbeit steht', 'Mittags 20 Minuten spazieren gewesen'],
    notWell: ['Zu lange am Handy hängen geblieben', 'Meeting hat 30 Minuten überzogen'],
    improve: ['Handy beim Lernen in die Schublade', 'Meetings mit fester Endzeit planen'],
    note: 'Insgesamt ruhiger Tag, abends müde.',
  },
  {
    wentWell: ['Videoskript in einem Rutsch geschrieben', 'Früh angefangen'],
    notWell: ['Mails zu oft zwischendurch gelesen'],
    improve: ['Mails nur um 11 und 16 Uhr', 'Offen: Steuererklärung abschicken'],
  },
  {
    wentWell: ['Sport am Abend', 'Folien für Lena fertig'],
    notWell: ['Handy lag beim Lernen auf dem Tisch', 'Zu spät ins Bett'],
    improve: ['Um 23 Uhr Bildschirm aus'],
    note: 'Gutes Gefühl nach dem Training.',
  },
  {
    wentWell: ['Vorlesung gut vorbereitet', 'Sport gemacht'],
    notWell: ['Meeting ohne Agenda, wenig Ergebnis'],
    improve: ['Vor Meetings drei Ziele notieren'],
  },
  {
    wentWell: ['Wocheneinkauf erledigt', 'Lange mit Mia telefoniert'],
    notWell: ['Nachmittag ohne Plan vertrödelt'],
    improve: ['Abends die drei wichtigsten Aufgaben für morgen festlegen'],
  },
];

/**
 * Finished daily reviews up to yesterday – at least five, and always covering the week that
 * is open for review – plus the weekly review of the week before (the open one stays open).
 */
export function demoReviews(today: string, now: Date = new Date()): DemoReview[] {
  const doneAt = now.toISOString();
  const openWeek = reviewWeek(today);
  const fiveBefore = addDays(today, -DAYS.length);
  const first = addDays(openWeek, -4) < fiveBefore ? addDays(openWeek, -4) : fiveBefore;
  const daily: DemoReview[] = [];
  for (let date = first, index = 0; date < today; date = addDays(date, 1), index += 1) {
    daily.push({ ...DAYS[index % DAYS.length]!, kind: 'daily', date, doneAt });
  }
  const sunday = addDays(openWeek, -7);
  const weekly: DemoReview = {
    kind: 'weekly',
    date: sunday,
    patterns: ['Sport an drei Tagen – danach fiel das Lernen leichter'],
    brakes: ['Handy beim Lernen in Reichweite', 'Meetings ohne Agenda und feste Endzeit'],
    changes: [
      'Handy beim Lernen in die Schublade',
      'Jedes Meeting mit Agenda und Endzeit',
      'Sonntags die Woche in 15 Minuten planen',
    ],
    doneAt,
  };
  return [...daily, weekly];
}
