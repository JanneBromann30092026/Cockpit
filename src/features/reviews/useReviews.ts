import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewKind } from '@/data/domain';
import { reviewActions, type ReviewDraft } from '@/data/repositories';
import type { Review } from '@/data/schemas';
import { useDataStore } from '@/data/store';

/** All decrypted reviews, newest first (empty while locked). */
export function useReviews(): Review[] {
  const reviews = useDataStore((state) => state.reviews);
  return useMemo(
    () =>
      Object.values(reviews).sort(
        (a, b) => b.date.localeCompare(a.date) || (a.kind === 'weekly' ? -1 : 1),
      ),
    [reviews],
  );
}

export function useReview(kind: ReviewKind, date: string): Review | undefined {
  const reviews = useDataStore((state) => state.reviews);
  return useMemo(
    () => Object.values(reviews).find((review) => review.kind === kind && review.date === date),
    [reviews, kind, date],
  );
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/** Waits this long after the last change before saving. */
const AUTOSAVE_MS = 800;

/**
 * Saves the draft shortly after every change (encrypted, like everything) – so nothing is
 * lost when the app locks while writing. Saves run one after another.
 */
export function useAutosave(kind: ReviewKind, date: string, fields: ReviewDraft, dirty: boolean) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const chain = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(fields);
  useEffect(() => {
    latest.current = fields;
  }, [fields]);

  const save = useCallback(() => {
    chain.current = chain.current.then(async () => {
      setStatus('saving');
      try {
        await reviewActions.saveDraft(kind, date, latest.current);
        setStatus('saved');
      } catch {
        setStatus('failed');
      }
    });
    return chain.current;
  }, [kind, date]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [fields, dirty, save]);

  /** Waits for running saves (before finishing). */
  const settle = useCallback(() => chain.current, []);
  return { status, settle };
}
