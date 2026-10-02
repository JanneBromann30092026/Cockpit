import { useEffect } from 'react';
import { HashRouter } from 'react-router';
import { MotionConfig } from 'motion/react';
import { Toaster } from '@/components/ui';
import { useSettings } from '@/features/settings/settingsStore';
import { vault } from '@/services/vault';
import { Background } from './Background';
import { ErrorBoundary } from './ErrorBoundary';
import { VaultGate } from './lock/VaultGate';
import { applyReduceMotion, applyTheme, onSystemThemeChange } from './theme';
import { UpdatePrompt } from './UpdatePrompt';
import { useAppStatus } from './useAppStatus';

function useStartup() {
  const init = useAppStatus((s) => s.init);
  const loadSettings = useSettings((s) => s.load);
  useEffect(() => {
    void (async () => {
      await init();
      const databaseOk = useAppStatus.getState().database?.ok === true;
      // Settings are not encrypted: theme and lock time apply before unlocking.
      if (databaseOk) await loadSettings();
      await vault.init(databaseOk);
    })();
  }, [init, loadSettings]);
}

function useThemeSync() {
  const theme = useSettings((s) => s.theme);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    return onSystemThemeChange(() => applyTheme('system'));
  }, [theme]);
  useEffect(() => applyReduceMotion(reduceMotion), [reduceMotion]);
}

export function App() {
  useStartup();
  useThemeSync();
  const reduceMotion = useSettings((s) => s.reduceMotion);

  return (
    <ErrorBoundary>
      {/* "user" follows the system setting; the app setting forces reduced motion. */}
      <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
        <HashRouter>
          <Background />
          <VaultGate />
          <Toaster />
          <UpdatePrompt />
        </HashRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}
