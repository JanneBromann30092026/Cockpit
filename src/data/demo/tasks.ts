/**
 * Invented tasks for the developer mode and the screenshots, relative to `today`. They are
 * stored encrypted like real tasks but marked as demo, so they can be removed at once.
 */
import { addDays } from '@/core/dates';
import type { TaskInput } from '../repositories';

export function demoTaskInputs(today: string, now: Date = new Date()): TaskInput[] {
  const day = (offset: number) => addDays(today, offset);
  return [
    { title: 'Steuererklärung abschicken', dueDate: day(-2), priority: 'high' },
    { title: 'Folien fürs Kundenportal an Lena schicken', dueDate: day(0), priority: 'high' },
    {
      title: 'Gliederung Hausarbeit Statistik',
      dueDate: day(0),
      priority: 'medium',
      notes: 'Kapitel 2 und 3 grob skizzieren, Quellen aus der Vorlesung sammeln.',
    },
    { title: 'Geschenk für Mia besorgen', dueDate: day(-1), priority: 'medium' },
    { title: 'Videoskript fürs Wochenvideo schreiben', dueDate: day(1), priority: 'medium' },
    { title: 'Handyvertrag vergleichen', dueDate: day(4), priority: 'low' },
    { title: 'Zahnarzttermin vereinbaren', dueDate: day(12), priority: 'medium' },
    { title: 'Lernzettel Statistik ergänzen', priority: 'low' },
    {
      title: 'Miete überweisen',
      dueDate: day(-1),
      priority: 'high',
      status: 'done',
      completedAt: new Date(now.getTime() - 20 * 3_600_000).toISOString(),
    },
  ];
}
