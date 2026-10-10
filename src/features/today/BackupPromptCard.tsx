import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { HardDriveDownload } from 'lucide-react';
import { Button, Surface } from '@/components/ui';
import { backupDue } from '@/core/backup/format';
import { backupRepo } from '@/data/repositories';
import { useDataStore } from '@/data/store';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';

const t = de.today.backupPrompt;

/** Regular reminder to save an encrypted backup (CLAUDE.md: forgotten password = data lost). */
export function BackupPromptCard({ now }: { now: Date }) {
  const navigate = useNavigate();
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const days = useSettings((s) => s.backupReminderDays);
  const loaded = useSettings((s) => s.loaded);
  // Re-render when data appears (the check itself reads the store).
  useDataStore((state) => state.ready);
  useDataStore((state) => state.tasks);
  if (!loaded || !backupDue({ lastBackupAt, days, hasData: backupRepo.hasData(), now }))
    return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid="backup-prompt"
    >
      <Surface className="flex flex-wrap items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <HardDriveDownload size={21} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight text-fg">{t.title}</h2>
          <p className="text-sm text-fg-secondary">{lastBackupAt ? t.text : t.textFirst}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void navigate('/settings#backup')}
          data-testid="backup-prompt-open"
        >
          {t.open}
        </Button>
      </Surface>
    </motion.div>
  );
}
