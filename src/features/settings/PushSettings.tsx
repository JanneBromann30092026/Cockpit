import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bell,
  BellOff,
  CalendarCheck,
  CircleAlert,
  Copy,
  ExternalLink,
  Moon,
  RefreshCw,
  Send,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Button, ConfirmDialog, toast, type BadgeTone } from '@/components/ui';
import { PUSH_SECRET_NAME, pushServiceName, serializePushConfig } from '@/core/push/config';
import type { LastPush } from '@/core/push/reminders';
import type { PushConfig } from '@/core/push/config';
import type { ScheduledReminder } from '@/core/push/schedule';
import { de } from '@/i18n/de';
import {
  GITHUB_NEW_SECRET_URL,
  GITHUB_PUSH_WORKFLOW_URL,
  PushError,
  disablePush,
  notificationPermission,
  observePushSetup,
  pushSupport,
  readLastPush,
  readPushConfig,
  setupPush,
  showLocalTestNotification,
  subscriptionMatches,
} from '@/services/push';

const t = de.settings.notifications;

const REMINDER_ICONS: Record<ScheduledReminder, LucideIcon> = {
  morning: Sun,
  dayReview: Moon,
  weekReview: CalendarCheck,
};

const lastPushFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

type Status = keyof typeof t.status;

function errorText(error: unknown): string {
  return error instanceof PushError ? t.errors[error.code] : t.errors.SUBSCRIBE_FAILED;
}

function Notice({
  tone,
  children,
  testId,
}: {
  tone: 'warning' | 'danger';
  children: ReactNode;
  testId: string;
}) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={
        tone === 'danger'
          ? 'flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg'
          : 'flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-base text-fg'
      }
      data-testid={testId}
    >
      <CircleAlert
        size={20}
        aria-hidden
        className={
          tone === 'danger' ? 'mt-0.5 shrink-0 text-danger' : 'mt-0.5 shrink-0 text-warning'
        }
      />
      <span>{children}</span>
    </p>
  );
}

function ExternalButton({
  href,
  children,
  testId,
}: {
  href: string;
  children: string;
  testId: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className="focus-ring inline-flex min-h-11 items-center gap-1.5 self-start rounded-full border border-line bg-surface-raised px-4 text-sm font-medium text-fg shadow-soft active:scale-[0.97] [@media(hover:hover)]:hover:border-line-strong"
    >
      {children}
      <ExternalLink size={15} aria-hidden />
    </a>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The three steps at GitHub: copy the key, add the secret, send a test. */
function GithubSteps({ config }: { config: PushConfig }) {
  const [showKey, setShowKey] = useState(false);
  const keyField = useRef<HTMLTextAreaElement>(null);
  const value = serializePushConfig(config);

  useEffect(() => {
    if (showKey) keyField.current?.select();
  }, [showKey]);

  const copyKey = async () => {
    if (await copyText(value)) {
      toast.success(t.keyCopied);
    } else {
      setShowKey(true);
      toast.info(t.copyFailed);
    }
  };

  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-line p-4"
      data-testid="push-github"
    >
      <h3 className="text-base font-semibold text-fg">{t.githubTitle}</h3>
      <ol className="flex flex-col gap-5">
        <li className="flex gap-3">
          <StepNumber n={1} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm text-fg-secondary">{t.step1}</p>
            <Button
              size="sm"
              icon={Copy}
              className="self-start"
              onClick={() => void copyKey()}
              data-testid="push-copy-key"
            >
              {t.copyKey}
            </Button>
            {showKey && (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-fg-secondary">{t.keyLabel}</span>
                <textarea
                  ref={keyField}
                  readOnly
                  value={value}
                  rows={4}
                  spellCheck={false}
                  className="focus-ring w-full resize-none rounded-md bg-surface-sunken px-3 py-2 font-mono text-xs break-all text-fg"
                  data-testid="push-key"
                />
              </label>
            )}
          </div>
        </li>
        <li className="flex gap-3">
          <StepNumber n={2} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm text-fg-secondary">{t.step2}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg-muted">{t.secretName}</span>
              <code
                className="rounded-md bg-surface-sunken px-2.5 py-1.5 font-mono text-sm text-fg"
                data-testid="push-secret-name"
              >
                {PUSH_SECRET_NAME}
              </code>
              <Button
                size="sm"
                variant="ghost"
                icon={Copy}
                onClick={() =>
                  void copyText(PUSH_SECRET_NAME).then((ok) => {
                    if (ok) toast.success(t.nameCopied);
                  })
                }
              >
                {t.copy}
              </Button>
            </div>
            <ExternalButton href={GITHUB_NEW_SECRET_URL} testId="push-open-secret">
              {t.openSecret}
            </ExternalButton>
          </div>
        </li>
        <li className="flex gap-3">
          <StepNumber n={3} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm text-fg-secondary">{t.step3}</p>
            <ExternalButton href={GITHUB_PUSH_WORKFLOW_URL} testId="push-open-workflow">
              {t.openWorkflow}
            </ExternalButton>
          </div>
        </li>
      </ol>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
    >
      {n}
    </span>
  );
}

function LastPushRow({ lastPush }: { lastPush: LastPush | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-base text-fg">{t.lastPush}</span>
      <span className="text-sm text-fg-secondary tabular-nums" data-testid="push-last">
        {lastPush
          ? t.lastPushValue(
              lastPushFormat.format(new Date(lastPush.at)),
              t.lastPushKinds[lastPush.reminder ?? 'unknown'],
            )
          : t.lastPushNone}
      </span>
    </div>
  );
}

/** Push reminders: set up on this iPad, store the key at GitHub, test, switch off. */
export function PushSettings() {
  const support = pushSupport();
  const [permission, setPermission] = useState(notificationPermission);
  const [stored, setStored] = useState<boolean | null>(null);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [matches, setMatches] = useState(true);
  const [lastPush, setLastPush] = useState<LastPush | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'renew' | 'disable' | null>(null);

  useEffect(() => observePushSetup(setStored), []);

  useEffect(() => {
    // After switching off, `active` is false whatever config still holds.
    if (!stored) return;
    let active = true;
    void (async () => {
      const next = await readPushConfig().catch(() => null);
      if (!active) return;
      setConfig(next);
      setMatches(next ? await subscriptionMatches(next) : false);
    })();
    return () => {
      active = false;
    };
  }, [stored]);

  const refreshLastPush = useCallback(() => {
    void readLastPush().then((last) => {
      setLastPush(last);
      setPermission(notificationPermission());
    });
  }, []);

  useEffect(() => {
    refreshLastPush();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshLastPush();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshLastPush]);

  const setup = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await setupPush();
      setConfig(next);
      setMatches(true);
      toast.success(t.setupDone);
    } catch (problem) {
      setError(errorText(problem));
    } finally {
      setPermission(notificationPermission());
      setBusy(false);
    }
  };

  const localTest = async () => {
    setError(null);
    try {
      await showLocalTestNotification();
      toast.success(t.localTestShown);
    } catch (problem) {
      setError(errorText(problem));
    }
  };

  const active = stored === true && config !== null;
  const status: Status =
    support !== 'supported'
      ? support
      : permission === 'denied'
        ? 'denied'
        : active
          ? matches
            ? 'active'
            : 'changed'
          : 'off';
  const tone: BadgeTone =
    status === 'active'
      ? 'success'
      : status === 'changed' || status === 'denied'
        ? 'warning'
        : 'neutral';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 text-sm text-fg-muted">{t.intro}</p>
        <Badge tone={tone}>
          <span data-testid="push-status">{t.status[status]}</span>
        </Badge>
      </div>
      <ul className="flex flex-col gap-2" data-testid="push-reminders">
        {(Object.keys(REMINDER_ICONS) as ScheduledReminder[]).map((reminder) => {
          const Icon = REMINDER_ICONS[reminder];
          return (
            <li key={reminder} className="flex items-center gap-3 text-base text-fg">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal-fg">
                <Icon size={18} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{t.reminders[reminder].title}</span>
                <span className="text-sm text-fg-muted">{t.reminders[reminder].when}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-fg-muted">{t.how}</p>

      {support !== 'supported' ? (
        <Notice tone="warning" testId="push-unsupported">
          {support === 'homeScreenOnly' ? t.homeScreenOnly : t.unsupported}
        </Notice>
      ) : (
        <>
          {permission === 'denied' && (
            <Notice tone="warning" testId="push-denied">
              {t.denied}
            </Notice>
          )}
          {!active ? (
            stored === null ? null : (
              <div className="flex flex-col gap-2">
                <Button
                  icon={Bell}
                  loading={busy}
                  className="self-start"
                  onClick={() => void setup()}
                  data-testid="push-setup"
                >
                  {t.setup}
                </Button>
                <p className="text-sm text-fg-muted">{t.setupHint}</p>
              </div>
            )
          ) : (
            <>
              {!matches && (
                <Notice tone="warning" testId="push-changed">
                  {t.changed}
                </Notice>
              )}
              <GithubSteps config={config} />
              <LastPushRow lastPush={lastPush} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base text-fg">{t.service}</span>
                <span className="text-sm text-fg-secondary" data-testid="push-service">
                  {pushServiceName(config.subscription.endpoint)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Send}
                  className="self-start"
                  onClick={() => void localTest()}
                  data-testid="push-local-test"
                >
                  {t.localTest}
                </Button>
                <p className="text-sm text-fg-muted">{t.localTestHint}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={matches ? 'ghost' : 'primary'}
                  size="sm"
                  icon={RefreshCw}
                  loading={busy}
                  onClick={() => (matches ? setConfirm('renew') : void setup())}
                  data-testid="push-renew"
                >
                  {t.renew}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={BellOff}
                  onClick={() => setConfirm('disable')}
                  data-testid="push-disable"
                >
                  {t.disable}
                </Button>
              </div>
            </>
          )}
        </>
      )}
      {error && (
        <Notice tone="danger" testId="push-error">
          {error}
        </Notice>
      )}
      <ConfirmDialog
        open={confirm === 'renew'}
        onClose={() => setConfirm(null)}
        onConfirm={setup}
        title={t.renewTitle}
        message={t.renewText}
        confirmLabel={t.renew}
        variant="primary"
      />
      <ConfirmDialog
        open={confirm === 'disable'}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await disablePush();
          setLastPush(null);
          toast.success(t.disabled);
        }}
        title={t.disableTitle}
        message={t.disableText}
        confirmLabel={t.disable}
      />
    </div>
  );
}
