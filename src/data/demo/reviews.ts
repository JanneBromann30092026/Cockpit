/**
 * Invented daily reviews of the last days and last week's weekly review, relative to
 * `today` (developer mode and screenshots). Marked as demo like all demo data.
 */
import { reviewWeek } from '@/core/reviews/reviews';
import { addDays, weekday } from '@/core/dates';
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

/** Five finished daily reviews before today and the weekly review of last week. */
export function demoReviews(today: string, now: Date = new Date()): DemoReview[] {
  const doneAt = now.toISOString();
  const daily: DemoReview[] = DAYS.map((fields, index) => ({
    ...fields,
    kind: 'daily',
    date: addDays(today, index - DAYS.length),
    doneAt,
  }));
  // Last week's Sunday: on a Sunday the current week is still to be reviewed.
  const sunday = weekday(today) === 6 ? addDays(today, -7) : reviewWeek(today);
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
