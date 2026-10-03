import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, Keyboard, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, SegmentedControl, Surface, Toggle } from '@/components/ui';
import { E2E_TEST_PASSWORD } from '@/core/devConstants';
import { useShortcutsHelp } from '@/app/shortcuts/shortcutsStore';
import { Page } from '@/app/shell/Page';
import { de } from '@/i18n/de';
import { vault } from '@/services/vault';
import { AiSettings } from './AiSettings';
import { GoogleSettings } from './GoogleSettings';
import { SecuritySettings } from './SecuritySettings';
import { THEME_PREFERENCES, useSettings } from './settingsStore';
import { AboutInfo, StorageInfo } from './SystemStatus';

const t = de.settings;

const themeOptions = THEME_PREFERENCES.map((value) => ({ value, label: t.themeOptions[value] }));

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">{title}</h2>
      <Surface>{children}</Surface>
    </section>
  );
}

/** Briefly shows "Gespeichert" after every change (keyframes restart via key, no timers). */
function SavedIndicator() {
  const savedAt = useSettings((s) => s.savedAt);
  if (savedAt === null) return null;
  return (
    <motion.span
      key={savedAt}
      role="status"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: [0, 1, 1, 0], y: [4, 0, 0, 0] }}
      transition={{ duration: 2.2, times: [0, 0.1, 0.75, 1] }}
      className="flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-sm font-medium text-success"
    >
      <Check size={15} aria-hidden />
      {t.saved}
    </motion.span>
  );
}

export function SettingsPage() {
  const theme = useSettings((s) => s.theme);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const devMode = useSettings((s) => s.devMode);
  const set = useSettings((s) => s.set);
  const [resetting, setResetting] = useState(false);

  return (
    <Page title={t.title} width="narrow" actions={<SavedIndicator />}>
      <div className="flex flex-col gap-8">
        <Section title={t.appearance} testId="settings-appearance">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-base text-fg">{t.theme}</span>
              <SegmentedControl
                label={t.theme}
                options={themeOptions}
                value={theme}
                onChange={(v) => void set('theme', v)}
              />
            </div>
            <div className="h-px bg-line" />
            <Toggle
              label={t.reduceMotion}
              description={t.reduceMotionHint}
              checked={reduceMotion}
              onChange={(v) => void set('reduceMotion', v)}
            />
            <div className="h-px bg-line" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-base text-fg">{de.shortcuts.title}</span>
              <Button
                variant="secondary"
                size="sm"
                icon={Keyboard}
                onClick={() => useShortcutsHelp.getState().setOpen(true)}
                data-testid="open-shortcuts"
              >
                {de.shortcuts.open}
              </Button>
            </div>
          </div>
        </Section>

        <Section title={t.security.title} testId="settings-security">
          <SecuritySettings />
        </Section>

        <Section title={de.google.title} testId="settings-google">
          <GoogleSettings />
        </Section>

        <Section title={t.ai.title} testId="settings-ai">
          <AiSettings />
        </Section>

        <Section title={t.storage.title} testId="settings-storage">
          <StorageInfo />
        </Section>

        <Section title={t.about} testId="settings-about">
          <AboutInfo />
        </Section>

        <Section title={t.developer} testId="settings-developer">
          <div className="flex flex-col gap-4">
            <Toggle
              label={t.devMode}
              description={t.devModeHint}
              checked={devMode}
              onChange={(v) => void set('devMode', v)}
            />
            {devMode && (
              <>
                <p className="text-sm text-fg-muted">{t.testPassword(E2E_TEST_PASSWORD)}</p>
                <div className="h-px bg-line" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="text-base text-fg">{t.resetDatabase}</span>
                    <span className="text-sm text-fg-muted">{t.resetDatabaseHint}</span>
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={Trash2}
                    onClick={() => setResetting(true)}
                  >
                    {t.resetDatabase}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Section>
        <ConfirmDialog
          open={resetting}
          onClose={() => setResetting(false)}
          onConfirm={async () => {
            await vault.resetAll();
            window.location.reload();
          }}
          title={t.resetTitle}
          message={t.resetText}
          confirmLabel={t.resetConfirm}
        />
      </div>
    </Page>
  );
}
