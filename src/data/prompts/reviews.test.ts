import { describe, expect, it } from 'vitest';
import {
  buildDayReviewMessage,
  buildWeekReviewMessage,
  DAY_REVIEW_SCHEMA,
  parseDayReview,
  parseWeekReview,
  WEEK_REVIEW_SCHEMA,
} from './reviews';

describe('review prompts', () => {
  it('schemas: closed objects, every field required', () => {
    for (const schema of [DAY_REVIEW_SCHEMA, WEEK_REVIEW_SCHEMA]) {
      expect(schema.additionalProperties).toBe(false);
      expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    }
  });

  it('the day message holds events, tasks, note and current points', () => {
    const message = JSON.parse(
      buildDayReviewMessage({
        date: 'Montag, 5. Oktober 2026',
        events: null,
        done: [{ titel: 'Miete', prioritaet: 'hoch' }],
        open: [{ titel: 'Steuer', prioritaet: 'hoch', ueberfaellig_seit_tagen: 2 }],
        note: 'Müde',
        current: { wentWell: ['Sport'], notWell: [], improve: [] },
      }),
    ) as Record<string, unknown>;
    expect(message).toMatchObject({
      tag: 'Montag, 5. Oktober 2026',
      termine: 'nicht verfügbar',
      meine_notiz: 'Müde',
      bisherige_punkte: { gut_gelaufen: ['Sport'] },
    });
    const week = JSON.parse(
      buildWeekReviewMessage({
        week: 'Mo., 28.09. – So., 04.10. 2026',
        days: [],
        doneCount: 4,
        open: [],
        current: { patterns: [], brakes: [], changes: ['A'] },
      }),
    ) as Record<string, unknown>;
    expect(week).toMatchObject({
      erledigte_aufgaben_anzahl: 4,
      bisherige_punkte: { aenderungen: ['A'] },
    });
  });

  it('reads the points: bullets and markdown removed, at most three, duplicates once', () => {
    expect(
      parseDayReview(
        JSON.stringify({
          gut_gelaufen: ['- **Sport** gemacht', 'Sport gemacht', 'A', 'B', 'C'],
          nicht_gut: [],
          besser_machen: ['1. Früher schlafen'],
        }),
      ),
    ).toEqual({ wentWell: ['Sport gemacht', 'A', 'B'], notWell: [], improve: ['Früher schlafen'] });
    expect(
      parseDayReview(JSON.stringify({ gut_gelaufen: [], nicht_gut: [' '], besser_machen: [] })),
    ).toBeNull();
    expect(parseDayReview('kein JSON')).toBeNull();
  });

  it('a week has at most three changes, short enough for a task title', () => {
    const long = 'x'.repeat(260);
    const result = parseWeekReview(
      JSON.stringify({ muster: ['M'], bremsen: [], aenderungen: ['A', 'B', long, 'D'] }),
    );
    expect(result?.changes).toHaveLength(3);
    expect(result?.changes[2]).toHaveLength(200);
    expect(parseWeekReview(JSON.stringify({ muster: [] }))).toBeNull();
  });
});
