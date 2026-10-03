import { useSyncExternalStore } from 'react';
import { localIsoDate } from '@/core/dates';

function subscribe(onChange: () => void): () => void {
  // Midnight passes while the app is open or in the background.
  const timer = setInterval(onChange, 60_000);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onChange);
  };
}

/** Today as "JJJJ-MM-TT" (local time); updates after midnight. */
export function useLocalDate(): string {
  return useSyncExternalStore(subscribe, () => localIsoDate());
}
