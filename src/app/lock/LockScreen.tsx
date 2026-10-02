import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { motion, useAnimate } from 'motion/react';
import { LockKeyhole, ShieldAlert } from 'lucide-react';
import { Button, PasswordInput, Surface, Toggle, useKeyboardInset } from '@/components/ui';
import { E2E_TEST_PASSWORD } from '@/core/devConstants';
import { MIN_PASSWORD_LENGTH } from '@/core/crypto/passwordStrength';
import { remainingUnlockDelayMs } from '@/core/lock';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { useVault, vault } from '@/services/vault';
import { useReducedMotion } from '@/styles/useReducedMotion';
import { Background } from '../Background';
import { useAppStatus } from '../useAppStatus';
import { GaugeMark, type GaugeState } from './GaugeMark';
import { ForgotPasswordDialog } from './ForgotPasswordDialog';
import { PasswordStrength } from './PasswordStrength';

const t = de.lock;

/** Lets the iPad keychain store and fill the password (it needs a username field). */
function KeychainUsername() {
  return (
    <input
      type="text"
      name="username"
      autoComplete="username"
      value={t.username}
      readOnly
      tabIndex={-1}
      aria-hidden
      className="sr-only"
    />
  );
}

function useShake() {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduced = useReducedMotion();
  const shake = () => {
    if (reduced || !scope.current) return;
    void animate(scope.current, { x: [0, -12, 12, -7, 7, 0] }, { duration: 0.42 });
  };
  return { scope, shake };
}

function SetupForm({ onError }: { onError: () => void }) {
  const status = useVault((s) => s.status);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<{ field: 'password' | 'repeat' | 'ack'; text: string }>();
  const busy = status === 'verifying' || status === 'opening';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (Array.from(password).length < MIN_PASSWORD_LENGTH) {
      setError({ field: 'password', text: t.errors.tooShort(MIN_PASSWORD_LENGTH) });
    } else if (password !== repeat) {
      setError({ field: 'repeat', text: t.errors.mismatch });
    } else if (!acknowledged) {
      setError({ field: 'ack', text: t.errors.acknowledge });
    } else {
      setError(undefined);
      try {
        await vault.setup(password);
        return;
      } catch {
        setError({ field: 'password', text: t.errors.failed });
      }
    }
    onError();
  };

  return (
    <form method="post" onSubmit={(e) => void submit(e)} className="flex flex-col gap-5" noValidate>
      <KeychainUsername />
      <div className="flex flex-col gap-2">
        <PasswordInput
          label={t.password}
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(undefined);
          }}
          hint={error?.field === 'password' ? undefined : t.passwordHint(MIN_PASSWORD_LENGTH)}
          error={error?.field === 'password' ? error.text : undefined}
          data-testid="setup-password"
        />
        <PasswordStrength password={password} />
      </div>
      <PasswordInput
        label={t.passwordRepeat}
        name="new-password-repeat"
        autoComplete="new-password"
        value={repeat}
        onChange={(event) => {
          setRepeat(event.target.value);
          setError(undefined);
        }}
        error={error?.field === 'repeat' ? error.text : undefined}
        data-testid="setup-repeat"
      />
      <div className="flex gap-3 rounded-lg bg-signal-soft p-4">
        <ShieldAlert size={22} aria-hidden className="mt-0.5 shrink-0 text-signal-fg" />
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-fg">{t.warningTitle}</p>
          <p className="text-sm text-fg-secondary">{t.warningText}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Toggle
          label={t.acknowledge}
          checked={acknowledged}
          onChange={(value) => {
            setAcknowledged(value);
            setError(undefined);
          }}
        />
        {error?.field === 'ack' && (
          <p role="alert" className="px-1 text-sm text-danger">
            {error.text}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" fullWidth loading={busy} data-testid="setup-submit">
        {busy ? t.working : t.setupSubmit}
      </Button>
    </form>
  );
}

function UnlockForm({ onError }: { onError: () => void }) {
  const status = useVault((s) => s.status);
  const failures = useVault((s) => s.failures);
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const busy = status === 'verifying' || status === 'opening';
  const waitMs = remainingUnlockDelayMs(failures, now);

  useEffect(() => {
    if (waitMs <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [waitMs]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || waitMs > 0 || !password) return;
    try {
      const result = await vault.unlock(password);
      if (result.ok) return;
      setPassword('');
      setWrong(result.reason === 'wrongPassword');
      setNow(Date.now());
    } catch {
      setWrong(true);
    }
    onError();
  };

  const message =
    waitMs > 0 ? t.errors.wait(Math.ceil(waitMs / 1000)) : wrong ? t.errors.wrong : undefined;

  return (
    <>
      <form
        method="post"
        onSubmit={(e) => void submit(e)}
        className="flex flex-col gap-5"
        noValidate
      >
        <KeychainUsername />
        <PasswordInput
          label={t.password}
          name="password"
          autoComplete="current-password"
          // The lock screen exists to type the password.
          autoFocus
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setWrong(false);
          }}
          error={message}
          data-testid="unlock-password"
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          icon={LockKeyhole}
          loading={busy}
          disabled={waitMs > 0 || !password}
          data-testid="unlock-submit"
        >
          {busy ? t.working : t.unlockSubmit}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => setForgotOpen(true)}
        className="focus-ring mx-auto mt-3 min-h-11 rounded-full px-4 text-sm font-medium text-fg-secondary hover:text-fg"
      >
        {t.forgot}
      </button>
      <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </>
  );
}

function Header({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">{title}</h1>
      {text && <p className="max-w-sm text-base text-fg-secondary">{text}</p>}
      {children}
    </div>
  );
}

/** Setup on first start, otherwise unlock. Shown whenever the vault is not open. */
export function LockScreen() {
  const status = useVault((s) => s.status);
  const hasVault = useVault((s) => s.hasVault);
  const lockReason = useVault((s) => s.lockReason);
  const devMode = useSettings((s) => s.devMode);
  const database = useAppStatus((s) => s.database);
  const reduced = useReducedMotion();
  const keyboardInset = useKeyboardInset();
  const { scope, shake } = useShake();
  const [errorAt, setErrorAt] = useState(0);
  const opening = status === 'opening';

  // Unlock moment: the needle swings in and the scale lights up, then the app appears. The password field loses
  // focus first, so the on-screen keyboard closes and no keystroke lands in it.
  useEffect(() => {
    if (!opening) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const timer = window.setTimeout(() => vault.finishOpening(), reduced ? 150 : 1100);
    return () => window.clearTimeout(timer);
  }, [opening, reduced]);

  // The needle only shows the error briefly.
  useEffect(() => {
    if (!errorAt) return;
    const timer = window.setTimeout(() => setErrorAt(0), 600);
    return () => window.clearTimeout(timer);
  }, [errorAt]);

  const onError = () => {
    shake();
    setErrorAt(Date.now());
  };

  const markState: GaugeState = opening
    ? 'success'
    : status === 'verifying'
      ? 'working'
      : errorAt
        ? 'error'
        : 'idle';

  const setup = !hasVault;

  return (
    <div
      className="scroll-area fixed inset-0 z-30 flex flex-col bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
      data-testid="lock-screen"
      data-mode={status === 'unavailable' ? 'unavailable' : setup ? 'setup' : 'unlock'}
    >
      <Background />
      <div className="relative m-auto flex w-full max-w-md flex-col items-center gap-7 px-6 py-10">
        <GaugeMark state={markState} size={setup ? 96 : 120} />

        {status === 'unavailable' ? (
          <Header title={t.unavailable}>
            {database && !database.ok && (
              <p role="alert" className="text-base text-danger">
                {de.database.errors[database.reason]}
              </p>
            )}
          </Header>
        ) : (
          <>
            <Header
              title={setup ? t.setupTitle : t.unlockTitle}
              text={setup ? t.setupText : t.unlockText}
            >
              {!setup && lockReason && lockReason !== 'manual' && status === 'locked' && (
                <p className="text-sm text-fg-muted" data-testid="lock-reason">
                  {t.reasons[lockReason]}
                </p>
              )}
            </Header>
            <motion.div
              ref={scope}
              className="w-full"
              animate={{ opacity: opening ? 0 : 1, y: opening ? 12 : 0 }}
              transition={{ duration: 0.3, delay: opening ? 0.25 : 0 }}
            >
              <Surface className="flex flex-col">
                {setup ? <SetupForm onError={onError} /> : <UnlockForm onError={onError} />}
              </Surface>
            </motion.div>
            {devMode && (
              <p className="text-center text-sm text-fg-muted" data-testid="dev-password-hint">
                {t.devHint(E2E_TEST_PASSWORD)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
