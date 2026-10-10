import { motion } from 'motion/react';
import { Share, X } from 'lucide-react';
import { IconButton, Surface } from '@/components/ui';
import { useAppStatus } from '@/app/useAppStatus';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';

const t = de.today.install;

/** In a Safari tab: how to add Cockpit to the home screen (and that its data is separate). */
export function InstallCard() {
  const standalone = useAppStatus((s) => s.standalone);
  const dismissed = useSettings((s) => s.installHintDismissed);
  const loaded = useSettings((s) => s.loaded);
  const set = useSettings((s) => s.set);
  if (standalone || !loaded || dismissed) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid="install-card"
    >
      <Surface className="flex flex-col gap-3">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Share size={20} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="text-lg font-semibold tracking-tight text-fg">{t.title}</h2>
            <p className="text-sm text-fg-secondary">{t.text}</p>
          </div>
          <IconButton
            icon={X}
            label={t.dismiss}
            onClick={() => void set('installHintDismissed', true)}
            data-testid="install-dismiss"
          />
        </div>
        <ol className="flex flex-col gap-2 pl-15">
          {t.steps.map((step, index) => (
            <li key={step} className="flex items-baseline gap-3 text-base text-fg">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-signal text-xs font-semibold text-on-signal">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <p className="pl-15 text-sm text-fg-muted">{t.separate}</p>
      </Surface>
    </motion.div>
  );
}
