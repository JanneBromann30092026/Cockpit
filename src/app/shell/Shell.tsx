import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Spinner } from '@/components/ui';
import { ComingSoonPage } from '@/features/coming-soon/ComingSoonPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { TodayPage } from '@/features/today/TodayPage';
import { de } from '@/i18n/de';
import { easeOut } from '@/styles/motion';
import { useReducedMotion } from '@/styles/useReducedMotion';
import { ShortcutsOverlay } from '../shortcuts/ShortcutsOverlay';
import { useAppStatus } from '../useAppStatus';
import { useHotkeys } from '../hooks/useHotkeys';
import { useMediaQuery, WIDE_LAYOUT_QUERY } from '../hooks/useMediaQuery';
import { useFocusMode } from './focusMode';
import { MAIN_NAV_ITEMS } from './navItems';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';

// Developer tools are rarely used: own chunk, loaded on demand.
const DevUiPage = lazy(() => import('@/features/dev/DevUiPage'));

function DatabaseErrorBanner() {
  const database = useAppStatus((s) => s.database);
  if (!database || database.ok) return null;
  return (
    <p
      role="alert"
      data-testid="database-error"
      className="mx-4 mt-[max(1rem,env(safe-area-inset-top))] rounded-lg bg-danger-soft px-4 py-3 text-base text-danger"
    >
      {de.database.errors[database.reason]}
    </p>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  const reduced = useReducedMotion();
  const offset = reduced ? 0 : 10;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="h-full"
        initial={{ opacity: 0, y: offset }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: easeOut } }}
        exit={{ opacity: 0, y: -offset / 2, transition: { duration: 0.12, ease: 'easeIn' } }}
      >
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-fg-muted">
              <Spinner size={28} label={de.ui.loading} />
            </div>
          }
        >
          <Routes location={location}>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/documents" element={<ComingSoonPage page="documents" />} />
            <Route path="/reviews" element={<ComingSoonPage page="reviews" />} />
            <Route path="/library" element={<ComingSoonPage page="library" />} />
            <Route path="/brand" element={<ComingSoonPage page="brand" />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/dev/ui" element={<DevUiPage />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

/** Hardware keyboard: 1–7 open the main sections (not in text fields or open dialogs). */
function useSectionShortcuts() {
  const navigate = useNavigate();
  useHotkeys(
    MAIN_NAV_ITEMS.map((item, index) => ({
      combo: String(index + 1),
      handler: () => {
        if (document.querySelector('[aria-modal="true"]')) return;
        void navigate(item.to);
      },
    })),
  );
}

export function Shell() {
  useSectionShortcuts();
  const wide = useMediaQuery(WIDE_LAYOUT_QUERY);
  const focus = useFocusMode();
  const reduced = useReducedMotion();

  return (
    <div
      className="relative flex h-dvh overflow-hidden"
      data-layout={wide ? 'wide' : 'narrow'}
      data-focus={focus || undefined}
    >
      <AnimatePresence initial={false}>
        {wide && !focus && (
          <motion.div
            key="sidebar"
            className="flex shrink-0"
            initial={{ opacity: 0, x: reduced ? 0 : -24 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.25, ease: easeOut } }}
            exit={{ opacity: 0, x: reduced ? 0 : -24, transition: { duration: 0.15 } }}
          >
            <Sidebar />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <DatabaseErrorBanner />
        <main className="relative min-h-0 flex-1">
          <AnimatedRoutes />
        </main>
        <AnimatePresence initial={false}>
          {!wide && !focus && (
            <motion.div
              key="tabbar"
              initial={{ opacity: 0, y: reduced ? 0 : 24 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: easeOut } }}
              exit={{ opacity: 0, y: reduced ? 0 : 24, transition: { duration: 0.15 } }}
            >
              <TabBar />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ShortcutsOverlay />
    </div>
  );
}
