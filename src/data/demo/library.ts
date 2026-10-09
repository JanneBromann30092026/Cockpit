/**
 * Invented library entries for the developer mode and the screenshots (dates relative to
 * `today`). Titles are well-known public works; key points and thoughts are made up.
 */
import { addDays } from '@/core/dates';
import type { LibraryInput } from '../repositories';

const point = (text: string, byClaude = false) => ({ text, byClaude });

export function demoLibraryInputs(today: string): LibraryInput[] {
  const day = (offset: number) => addDays(today, offset);
  return [
    {
      title: 'Atomic Habits',
      type: 'book',
      author: 'James Clear',
      consumedAt: day(-12),
      topics: ['Gewohnheiten', 'Produktivität'],
      keyPoints: [
        point('Kleine Verbesserungen summieren sich wie Zinseszins.'),
        point('Systeme schlagen Ziele: Ich werde auf das Niveau meiner Systeme fallen.'),
        point('Gewohnheiten an bestehende Routinen hängen („Nach dem Kaffee …“).'),
        point('Umgebung so gestalten, dass das Gute der einfache Weg ist.'),
      ],
      thoughts: 'Handy abends in die Küche legen. Lernzettel direkt neben die Kaffeemaschine.',
    },
    {
      title: 'Deep Work',
      type: 'book',
      author: 'Cal Newport',
      consumedAt: day(-45),
      topics: ['Fokus', 'Produktivität', 'Studium'],
      keyPoints: [
        point('Tiefe Arbeit braucht feste, geschützte Blöcke ohne Ablenkung.'),
        point('Langeweile aushalten trainiert die Konzentration.'),
        point('Flache Aufgaben bündeln und begrenzen.', true),
      ],
      thoughts: 'Zwei Fokusblöcke à 90 Minuten vor 12 Uhr ausprobieren.',
    },
    {
      title: 'How to Take Smart Notes',
      type: 'book',
      author: 'Sönke Ahrens',
      consumedAt: day(-80),
      topics: ['Notizen', 'Studium', 'Schreiben'],
      keyPoints: [
        point('Notizen in eigenen Worten schreiben, nicht kopieren.'),
        point('Jede Notiz mit bestehenden Notizen verknüpfen.'),
      ],
    },
    {
      title: 'Die 4-Stunden-Woche – was davon heute noch gilt',
      type: 'article',
      author: 'Zeit Online',
      link: 'https://www.zeit.de/',
      consumedAt: day(-6),
      topics: ['Produktivität', 'Arbeit'],
      keyPoints: [point('Automatisieren vor Delegieren vor Erledigen.')],
    },
    {
      title: 'Wie YouTube-Thumbnails wirklich funktionieren',
      type: 'video',
      author: 'Paddy Galloway',
      link: 'https://www.youtube.com/',
      consumedAt: day(-3),
      topics: ['YouTube', 'Video'],
      keyPoints: [
        point('Ein klares Motiv, höchstens drei Wörter Text.'),
        point('Neugier wecken, ohne den Inhalt zu verraten.'),
        point('Titel und Thumbnail erzählen zusammen eine Geschichte.', true),
      ],
      thoughts: 'Fürs nächste Wochenvideo: Gesicht + ein Wort testen.',
    },
    {
      title: 'Hooks in den ersten fünf Sekunden',
      type: 'video',
      author: 'Ali Abdaal',
      link: 'https://www.youtube.com/',
      consumedAt: day(-20),
      topics: ['Video', 'Storytelling'],
      keyPoints: [point('Mit dem Ergebnis anfangen, dann den Weg zeigen.')],
    },
    {
      title: 'Hard Fork: KI im Alltag',
      type: 'podcast',
      author: 'The New York Times',
      consumedAt: day(-2),
      topics: ['KI', 'Gewohnheiten'],
      keyPoints: [point('Neue Gewohnheit: Recherche zuerst mit KI, dann Quellen prüfen.')],
    },
    {
      title: 'Lenny’s Newsletter: Wie man Prioritäten setzt',
      type: 'newsletter',
      author: 'Lenny Rachitsky',
      link: 'https://www.lennysnewsletter.com/',
      consumedAt: day(-9),
      topics: ['Prioritäten', 'Arbeit'],
      keyPoints: [
        point('Erst das Problem schärfen, dann Lösungen sammeln.'),
        point('Weniger, aber wichtigere Dinge gleichzeitig.'),
      ],
    },
    {
      title: 'Der Statistik-Podcast: Hypothesentests verständlich',
      type: 'podcast',
      topics: ['Studium', 'Statistik'],
      keyPoints: [point('p-Wert ist nicht die Wahrscheinlichkeit, dass die Hypothese stimmt.')],
    },
  ];
}
