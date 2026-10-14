import { describe, expect, it } from 'vitest';
import { focusWishes, parseCommand } from './parse';

const SPOKEN =
  'Ja, ich hätte gern Fokusblöcke. Sport ist schon eingetragen, meine Uni ist schon eingetragen. ' +
  'Was noch fehlt, ist Zeit fürs Nacharbeiten, Vorarbeiten von der Uni und Zeit, die ich für Instagram aufbringe.';

describe('spoken commands', () => {
  it('turns the focus wish into activities, leaving out what is already in the calendar', () => {
    const command = parseCommand(SPOKEN);
    expect(command.kind).toBe('focus');
    if (command.kind !== 'focus') return;
    expect(command.activities.map((a) => a.name)).toEqual([
      'Uni nacharbeiten',
      'Uni vorarbeiten',
      'Instagram',
    ]);
  });

  it('"Sport, der ist schon eingetragen" is not planned either', () => {
    const names = focusWishes(
      'Fokusblöcke bitte. Sport, der ist schon eingetragen. Zeit für Lernen.',
    ).map((a) => a.name);
    expect(names).toEqual(['Lernen']);
  });

  it('reads hours and the part of the day', () => {
    const [instagram] = focusWishes('Fokusblöcke: 2 Stunden Instagram abends');
    expect(instagram).toMatchObject({ name: 'Instagram', minutesPerWeek: 120, dayPart: 'evening' });
    const [reading] = focusWishes('Fokuszeit, drei Stunden lesen morgens');
    expect(reading).toMatchObject({ name: 'Lesen', minutesPerWeek: 180, dayPart: 'morning' });
  });

  it('names unknown activities after "Zeit für"', () => {
    expect(focusWishes('Fokusblöcke und Zeit für Steuererklärung').map((a) => a.name)).toEqual([
      'Steuererklärung',
    ]);
  });

  it('tasks with due day and priority', () => {
    expect(parseCommand('Aufgabe Miete überweisen morgen, wichtig')).toEqual({
      kind: 'task',
      title: 'Miete überweisen',
      due: 'tomorrow',
      important: true,
    });
    expect(parseCommand('Erinnere mich daran, heute Mama anzurufen')).toMatchObject({
      kind: 'task',
      title: 'Mama anzurufen',
      due: 'today',
    });
    expect(parseCommand('Ich muss die Hausarbeit abgeben')).toMatchObject({
      kind: 'task',
      title: 'Die Hausarbeit abgeben',
      important: false,
    });
  });

  it('opens sections', () => {
    expect(parseCommand('Öffne den Wochen-Review')).toEqual({ kind: 'open', target: 'weekReview' });
    expect(parseCommand('Zeig meine Verträge')).toEqual({ kind: 'open', target: 'documents' });
    expect(parseCommand('Backup')).toEqual({ kind: 'open', target: 'backup' });
    expect(parseCommand('Öffne Fokus')).toEqual({ kind: 'open', target: 'focus' });
  });

  it('anything else is unknown', () => {
    expect(parseCommand('Wie wird das Wetter?')).toEqual({ kind: 'unknown' });
    expect(parseCommand('')).toEqual({ kind: 'unknown' });
  });
});
