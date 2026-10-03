import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoEvents, demoMails } from '@/data/demo/today';
import { GoogleError, useGoogleSession } from '@/services/google';
import type * as GoogleModule from '@/services/google';
import { useVault } from '@/services/vault';

const google = vi.hoisted(() => {
  const state: { token: string | null } = { token: 'token' };
  return Object.assign(state, { fetchTodayEvents: vi.fn(), fetchUnreadMails: vi.fn() });
});

vi.mock('@/services/google', async (importOriginal) => ({
  ...(await importOriginal<typeof GoogleModule>()),
  currentGoogleToken: () => google.token,
  fetchTodayEvents: google.fetchTodayEvents,
  fetchUnreadMails: google.fetchUnreadMails,
}));

const { clearToday, daySummaryRequest, loadDemoDay, refreshToday, useToday } =
  await import('./todayStore');

const now = new Date('2026-10-05T10:20:00');

describe('today store', () => {
  beforeEach(() => {
    clearToday();
    google.token = 'token';
    google.fetchTodayEvents.mockReset();
    google.fetchUnreadMails.mockReset();
  });

  it('loads events and mails and keeps errors per source', async () => {
    google.fetchTodayEvents.mockResolvedValue(demoEvents(now));
    google.fetchUnreadMails.mockRejectedValue(new GoogleError('API_DISABLED'));
    await refreshToday(now);
    const state = useToday.getState();
    expect(state.events).toHaveLength(7);
    expect(state.mails).toBeNull();
    expect(state.calendarError).toBeNull();
    expect(state.gmailError).toBe('API_DISABLED');
    expect(state.loading).toBe(false);
    expect(state.fetchedAt).not.toBeNull();
  });

  it('keeps the shown data when the token runs out during a refresh', async () => {
    loadDemoDay(now);
    useToday.setState({ demo: false });
    google.fetchTodayEvents.mockImplementation(() => {
      google.token = null;
      return Promise.reject(new GoogleError('EXPIRED'));
    });
    google.fetchUnreadMails.mockRejectedValue(new GoogleError('NOT_CONNECTED'));
    await refreshToday(now);
    expect(useToday.getState()).toMatchObject({ loading: false, calendarError: null });
    expect(useToday.getState().mails).toHaveLength(8);
  });

  it('does nothing without a Google token', async () => {
    google.token = null;
    await refreshToday(now);
    expect(google.fetchTodayEvents).not.toHaveBeenCalled();
    expect(useToday.getState().fetchedAt).toBeNull();
  });

  it('forgets everything when the app locks', async () => {
    google.fetchTodayEvents.mockResolvedValue(demoEvents(now));
    google.fetchUnreadMails.mockResolvedValue(demoMails(now));
    useVault.setState({ status: 'unlocked' });
    await refreshToday(now);
    expect(useToday.getState().mails).toHaveLength(8);
    useVault.setState({ status: 'locked' });
    expect(useToday.getState()).toMatchObject({ events: null, mails: null, fetchedAt: null });
  });

  it('forgets real data on disconnect, but keeps it when the token only expired', () => {
    useToday.setState({ events: demoEvents(now), mails: [], demo: false });
    useGoogleSession.setState({ status: 'connected', error: null });
    useGoogleSession.setState({ status: 'disconnected', error: 'EXPIRED' });
    expect(useToday.getState().events).not.toBeNull();
    useGoogleSession.setState({ status: 'connected', error: null });
    useGoogleSession.setState({ status: 'disconnected', error: null });
    expect(useToday.getState().events).toBeNull();
  });

  it('refreshes the demo day without asking Google', async () => {
    loadDemoDay(now);
    await refreshToday(now);
    expect(google.fetchTodayEvents).not.toHaveBeenCalled();
    expect(useToday.getState()).toMatchObject({ demo: true });
  });

  it('sends only what the overview needs to the AI', () => {
    const request = daySummaryRequest(now, demoEvents(now), demoMails(now));
    expect(request.now).toBe('Montag, 5. Oktober 2026 um 10:20 Uhr');
    expect(request.events?.[0]).toEqual({ time: 'Ganztägig', title: 'Geburtstag Mia' });
    expect(request.events?.[1]).toEqual({
      time: '08:30–09:00',
      title: 'Daily Stand-up',
      location: 'Videocall',
    });
    expect(request.mails?.important.map((mail) => mail.from)).toEqual([
      'Lena Berg',
      'Prof. Dr. Anna Weber',
    ]);
    expect(request.mails?.important[0]).toMatchObject({ question: true, deadline: true });
    // Updates without snippet, newsletters and advertising only as a number.
    expect(request.mails?.updates.every((mail) => mail.snippet === undefined)).toBe(true);
    expect(request.mails?.newsletters).toBe(2);
    expect(JSON.stringify(request)).not.toContain('@');
    expect(daySummaryRequest(now, null, null)).toMatchObject({ events: null, mails: null });
  });
});
