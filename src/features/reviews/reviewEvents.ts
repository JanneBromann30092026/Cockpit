/**
 * Calendar events of a reviewed day: read from Google only while the review is open and
 * kept in memory only (never stored). Cleared when the app locks or Google is disconnected.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import type { CalendarEvent } from '@/core/calendar/events';
import { localIsoDate } from '@/core/dates';
import { de } from '@/i18n/de';
import {
  currentGoogleToken,
  fetchTodayEvents,
  GoogleError,
  useGoogleSession,
  type GoogleErrorCode,
} from '@/services/google';
import { useVault } from '@/services/vault';
import { useToday } from '@/features/today/todayStore';

type DayEvents =
  | { status: 'loading' }
  | { status: 'ready'; events: CalendarEvent[] }
  | { status: 'error'; code: GoogleErrorCode };

export const useReviewEvents = create<Record<string, DayEvents>>(() => ({}));

/** Noon of a calendar date – inside the local day whatever the time zone does. */
function noon(date: string): Date {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

async function load(date: string): Promise<void> {
  useReviewEvents.setState({ [date]: { status: 'loading' } });
  try {
    const events = await fetchTodayEvents(noon(date), de.today.events.untitled);
    useReviewEvents.setState({ [date]: { status: 'ready', events } });
  } catch (error: unknown) {
    const code = error instanceof GoogleError ? error.code : 'API_ERROR';
    useReviewEvents.setState({ [date]: { status: 'error', code } });
  }
}

export type DayEventsState = { status: 'notConnected' } | DayEvents;

/** The events of a day for its review; today reuses what "Heute" already loaded. */
export function useDayEvents(date: string): DayEventsState {
  const connected = useGoogleSession((s) => s.status === 'connected');
  const todayEvents = useToday((s) => s.events);
  const todayDemo = useToday((s) => s.demo);
  const state = useReviewEvents((s) => s[date]);
  const isToday = date === localIsoDate();
  const reuse = isToday && todayEvents !== null && !todayDemo;

  useEffect(() => {
    if (!connected || reuse || state || !currentGoogleToken()) return;
    void load(date);
  }, [connected, reuse, state, date]);

  if (reuse) return { status: 'ready', events: todayEvents };
  if (!connected) return { status: 'notConnected' };
  return state ?? { status: 'loading' };
}

function clear(): void {
  useReviewEvents.setState(() => ({}), true);
}

// Locking removes everything decrypted from memory – Google data included.
useVault.subscribe((state, previous) => {
  if (
    state.status !== previous.status &&
    state.status !== 'unlocked' &&
    state.status !== 'opening'
  ) {
    clear();
  }
});

useGoogleSession.subscribe((state, previous) => {
  if (previous.status === 'connected' && state.status === 'disconnected') clear();
});
