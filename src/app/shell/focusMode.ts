import { useEffect } from 'react';
import { create } from 'zustand';

interface FocusModeState {
  /** Number of mounted requests; the navigation is hidden while it is above 0. */
  requests: number;
  acquire: () => void;
  release: () => void;
}

/**
 * Focus mode hides the sidebar and tab bar (e.g. the brand interview or a full-screen
 * review later). Pages request it with useFocusModeRequest; leaving the page
 * ends it automatically.
 */
export const useFocusModeStore = create<FocusModeState>((set) => ({
  requests: 0,
  acquire: () => set((state) => ({ requests: state.requests + 1 })),
  release: () => set((state) => ({ requests: Math.max(0, state.requests - 1) })),
}));

export function useFocusMode(): boolean {
  return useFocusModeStore((s) => s.requests > 0);
}

/** Hides the navigation while `active` is true and the calling component is mounted. */
export function useFocusModeRequest(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { acquire, release } = useFocusModeStore.getState();
    acquire();
    return release;
  }, [active]);
}
