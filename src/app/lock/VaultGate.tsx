import { AnimatePresence, motion } from 'motion/react';
import { useSettings } from '@/features/settings/settingsStore';
import { useVault } from '@/services/vault';
import { easeOut } from '@/styles/motion';
import { Shell } from '../shell/Shell';
import { LockScreen } from './LockScreen';
import { useAutoLock } from './useAutoLock';

function UnlockedApp() {
  useAutoLock(useSettings((s) => s.lockAfterMinutes));
  return <Shell />;
}

/**
 * Shows the app only while the vault is open; otherwise setup or the lock screen. No
 * "wait" mode: the opaque lock screen covers the app at once while it fades out below.
 */
export function VaultGate() {
  const status = useVault((s) => s.status);
  if (status === 'loading') return null;
  return (
    <AnimatePresence initial={false}>
      {status === 'unlocked' ? (
        <motion.div
          key="app"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: 0.35, ease: easeOut } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <UnlockedApp />
        </motion.div>
      ) : (
        <motion.div
          key="lock"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25 } }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
        >
          <LockScreen />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
