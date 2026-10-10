import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { CircleAlert, Download, HardDriveDownload, RotateCcw, Upload } from 'lucide-react';
import {
  Button,
  Modal,
  PasswordInput,
  Select,
  toast,
  Toggle,
  type SelectOption,
} from '@/components/ui';
import {
  BACKUP_REMINDER_DAYS,
  BackupFormatError,
  type BackupFile,
  type BackupReminderDays,
} from '@/core/backup/format';
import { daysBetween, localIsoDate } from '@/core/dates';
import { formatBytes, formatDate } from '@/core/format';
import { de } from '@/i18n/de';
import {
  createBackup,
  readBackupFile,
  restoreBackup,
  WrongBackupPasswordError,
  type CreatedBackup,
} from '@/services/backup';
import { shareFile } from '@/services/share';
import { useSettings } from './settingsStore';

const t = de.settings.backup;

const REMINDER_OPTIONS: SelectOption<`${BackupReminderDays}`>[] = BACKUP_REMINDER_DAYS.map(
  (days) => ({ value: `${days}`, label: t.reminderOptions[days] }),
);

function RestoreDialog({ backup, onClose }: { backup: BackupFile; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = Object.values(backup.tables).reduce((sum, list) => sum + list.length, 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const result = await restoreBackup(backup, password, replace ? 'replace' : 'merge');
      const restored = Object.values(result.restored).reduce((sum, n) => sum + n, 0);
      toast.success(t.done(restored, result.kept));
      if (result.unreadable > 0) toast.info(t.unreadable(result.unreadable));
      onClose();
    } catch (problem: unknown) {
      setError(problem instanceof WrongBackupPasswordError ? t.wrongPassword : t.restoreFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t.restoreTitle}>
      <form
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-4"
        data-testid="backup-restore"
      >
        <div className="flex flex-col gap-1 rounded-lg bg-surface-sunken px-4 py-3">
          <span className="text-base font-medium text-fg" data-testid="backup-file-info">
            {t.fileInfo(formatDate(localIsoDate(new Date(backup.createdAt))), backup.appVersion)}
          </span>
          <span className="text-sm text-fg-secondary">
            {t.fileContents(rows, backup.files.length)}
          </span>
        </div>
        <PasswordInput
          label={t.password}
          hint={t.passwordHint}
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          data-testid="backup-password"
        />
        <Toggle
          label={t.replace}
          description={t.replaceHint}
          checked={replace}
          onChange={setReplace}
        />
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
            data-testid="backup-error"
          >
            <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            type="submit"
            icon={RotateCcw}
            loading={busy}
            disabled={!password}
            variant={replace ? 'danger' : 'primary'}
            data-testid="backup-restore-start"
          >
            {busy ? t.restoring : t.start}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Encrypted backup file: create and save it, restore one, reminder interval. */
export function BackupSettings() {
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const reminderDays = useSettings((s) => s.backupReminderDays);
  const set = useSettings((s) => s.set);
  const [creating, setCreating] = useState(false);
  const [ready, setReady] = useState<CreatedBackup | null>(null);
  const [opened, setOpened] = useState<BackupFile | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const create = async () => {
    setCreating(true);
    try {
      setReady(await createBackup());
    } catch {
      toast.error(t.failed);
    } finally {
      setCreating(false);
    }
  };

  // A second tap: the share sheet needs a fresh user gesture, the file is ready by now.
  const save = async () => {
    if (!ready) return;
    const outcome = await shareFile(ready.file);
    if (outcome === 'cancelled') return;
    await set('lastBackupAt', new Date().toISOString());
    toast.success(outcome === 'shared' ? t.saved : t.downloaded);
    setReady(null);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setOpened(await readBackupFile(file));
    } catch (problem: unknown) {
      toast.error(
        problem instanceof BackupFormatError ? t.problems[problem.problem] : t.problems.damaged,
      );
    }
  };

  const today = localIsoDate();
  const lastDate = lastBackupAt ? localIsoDate(new Date(lastBackupAt)) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t.intro}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base text-fg">{t.last}</span>
        <span className="text-sm text-fg-secondary" data-testid="backup-last">
          {lastDate ? t.lastValue(formatDate(lastDate), daysBetween(lastDate, today)) : t.never}
        </span>
      </div>
      {ready ? (
        <div
          className="flex flex-col gap-2 rounded-lg border border-line p-4"
          data-testid="backup-ready"
        >
          <span className="text-base font-medium text-fg">
            {t.ready(formatBytes(ready.file.size))}
          </span>
          <span className="text-sm text-fg-muted">{t.readyHint}</span>
          <Button
            icon={Download}
            className="self-start"
            onClick={() => void save()}
            data-testid="backup-save"
          >
            {t.save}
          </Button>
        </div>
      ) : (
        <Button
          icon={HardDriveDownload}
          loading={creating}
          className="self-start"
          onClick={() => void create()}
          data-testid="backup-create"
        >
          {creating ? t.creating : t.create}
        </Button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base text-fg">{t.reminder}</span>
        <div className="w-44">
          <Select
            aria-label={t.reminder}
            options={REMINDER_OPTIONS}
            value={`${reminderDays}`}
            onChange={(value) =>
              void set('backupReminderDays', Number(value) as BackupReminderDays)
            }
            data-testid="backup-reminder"
          />
        </div>
      </div>
      <p className="text-sm text-fg-muted">{t.notIncluded}</p>
      <div className="h-px bg-line" />
      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          icon={Upload}
          className="self-start"
          onClick={() => input.current?.click()}
          data-testid="backup-open"
        >
          {t.restore}
        </Button>
        <p className="text-sm text-fg-muted">{t.restoreHint}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void onFile(event)}
        data-testid="backup-file-input"
      />
      {opened && <RestoreDialog backup={opened} onClose={() => setOpened(null)} />}
    </div>
  );
}
