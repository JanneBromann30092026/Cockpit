import { describe, expect, it } from 'vitest';
import { deadlineEvents } from '../documents/calendar';
import { deadlines } from '../documents/contracts';
import { buildIcs, escapeText, foldLine } from './ics';

describe('calendar file', () => {
  it('escapes text and folds long lines at 75 octets', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const folded = foldLine(`SUMMARY:${'ä'.repeat(60)}`);
    for (const line of folded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('exports cancel dates and term ends with two reminders, never payments or amounts', () => {
    const contracts = [
      {
        id: 'gym',
        name: 'Fitnessstudio',
        amount: 29.9,
        interval: 'monthly' as const,
        dueDate: '2026-10-17',
        termEnd: '2026-11-14',
        notice: { amount: 4, unit: 'weeks' as const },
      },
    ];
    const events = deadlineEvents(deadlines(contracts, '2026-10-05'), {
      summary: {
        cancel: (name) => `Kündigen bis: ${name}`,
        termEnd: (name) => `Laufzeit endet: ${name}`,
        payment: (name) => `Zahlung: ${name}`,
      },
      description: 'Aus Cockpit',
    });
    expect(events.map((event) => [event.summary, event.date])).toEqual([
      ['Kündigen bis: Fitnessstudio', '2026-10-17'],
      ['Laufzeit endet: Fitnessstudio', '2026-11-14'],
    ]);
    const ics = buildIcs(events, new Date('2026-10-05T08:00:00Z'), { alarm: 'Frist' });
    expect(ics).toContain('UID:gym-cancel@cockpit');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261017');
    expect(ics).toContain('DTEND;VALUE=DATE:20261018');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(4);
    expect(ics).toContain('TRIGGER:-PT159H');
    expect(ics).toContain('TRIGGER:-PT15H');
    expect(ics).not.toContain('29');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
