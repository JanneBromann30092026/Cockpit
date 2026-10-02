import { useEffect } from 'react';
import { backgroundExpired, inactivityExpired } from '@/core/lock';
import { vault } from '@/services/vault';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const CHECK_INTERVAL_MS = 5_000;

/**
 * Locks after `minutes` without input and when the app comes back after more than a
 * minute in the background (iPadOS pauses timers there, so visibility is checked too).
 */
export function useAutoLock(minutes: number): void {
  useEffect(() => {
    const timeoutMs = minutes * 60_000;
    let lastActivityAt = Date.now();
    let hiddenAt: number | null = null;

    const onActivity = () => {
      lastActivityAt = Date.now();
    };
    const check = () => {
      if (inactivityExpired(Date.now(), lastActivityAt, timeoutMs)) vault.lock('inactivity');
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (backgroundExpired(Date.now(), hiddenAt)) {
        vault.lock('background');
        return;
      }
      hiddenAt = null;
      check();
    };

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, onActivity, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, onActivity, { capture: true });
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [minutes]);
}
