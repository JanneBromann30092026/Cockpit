import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, CircleAlert, CircleCheck, Copy, LogIn, Unplug, Wifi } from 'lucide-react';
import { Badge, Button, cn, Input, Skeleton, toast } from '@/components/ui';
import { de } from '@/i18n/de';
import {
  appOrigin,
  connectWithPopup,
  disconnectGoogle,
  oauthRedirectUri,
  testGoogleConnection,
  useGoogleSession,
  type GoogleConnectionTest,
  type GoogleErrorCode,
} from '@/services/google';
import { spring } from '@/styles/motion';
import { isValidSetting, useGoogleClientId, useSettings } from './settingsStore';

const t = de.google;

const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

function errorText(code: GoogleErrorCode): string {
  return t.errors[code];
}

/** Copies a value the user has to enter in the Google Cloud console. */
function CopyRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t.copied);
    } catch {
      toast.info(t.copyFailed);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-fg-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 rounded-md bg-surface-sunken px-3 py-2 font-mono text-sm break-all text-fg"
          data-testid={testId}
        >
          {value}
        </code>
        <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copy()}>
          {t.copy}
        </Button>
      </div>
    </div>
  );
}

function SetupGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="focus-ring flex min-h-11 items-center justify-between gap-3 rounded-md text-left text-base font-medium text-fg"
      >
        {t.setupTitle}
        <ChevronDown
          size={20}
          aria-hidden
          className={cn('shrink-0 text-fg-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-4" data-testid="google-setup">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-fg-secondary">
            {t.setupSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <CopyRow label={t.originLabel} value={appOrigin()} testId="google-origin" />
          <CopyRow label={t.redirectLabel} value={oauthRedirectUri()} testId="google-redirect" />
          <p className="text-sm text-fg-muted">{t.unverifiedHint}</p>
        </div>
      )}
    </div>
  );
}

/** Developer mode: an own public OAuth client ID (empty = built-in), saved on blur or Enter. */
function ClientIdField() {
  const clientId = useSettings((s) => s.googleClientId);
  const set = useSettings((s) => s.set);
  const [draft, setDraft] = useState(clientId);
  const [error, setError] = useState<string | undefined>();

  const commit = () => {
    const next = draft.trim();
    if (next === clientId) return;
    if (!isValidSetting('googleClientId', next)) {
      setError(t.clientIdInvalid);
      return;
    }
    setError(undefined);
    void set('googleClientId', next).then((ok) => {
      if (ok) toast.success(t.clientIdSaved);
    });
  };

  return (
    <Input
      label={t.clientId}
      hint={t.clientIdHint}
      placeholder={t.clientIdPlaceholder}
      value={draft}
      className="font-mono text-sm"
      onChange={(event) => {
        setDraft(event.target.value);
        setError(undefined);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          commit();
        }
      }}
      error={error}
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      enterKeyHint="done"
      data-testid="google-client-id"
    />
  );
}

type TestState =
  { status: 'idle' } | { status: 'testing' } | { status: 'done'; result: GoogleConnectionTest };

function ResultLine({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CircleCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-success" />
      ) : (
        <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
      )}
      <span>{children}</span>
    </li>
  );
}

function ConnectionTest() {
  const [state, setState] = useState<TestState>({ status: 'idle' });
  const run = async () => {
    setState({ status: 'testing' });
    setState({ status: 'done', result: await testGoogleConnection() });
  };
  const result = state.status === 'done' ? state.result : null;
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        icon={Wifi}
        loading={state.status === 'testing'}
        onClick={() => void run()}
        className="self-start"
      >
        {state.status === 'testing' ? t.testing : t.test}
      </Button>
      <AnimatePresence initial={false}>
        {result && (
          <motion.ul
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.default}
            className="flex flex-col gap-2 rounded-lg bg-surface-sunken px-4 py-3 text-base text-fg"
            data-testid="google-test-result"
          >
            <ResultLine ok={result.calendar.ok}>
              {result.calendar.ok
                ? t.calendarOk(result.calendar.value.calendars)
                : t.calendarFailed(errorText(result.calendar.error.code))}
            </ResultLine>
            <ResultLine ok={result.gmail.ok}>
              {result.gmail.ok
                ? t.gmailOk(result.gmail.value.email)
                : t.gmailFailed(errorText(result.gmail.error.code))}
            </ResultLine>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Google Calendar and Gmail (read-only): sign-in, access test; setup in developer mode. */
export function GoogleSettings() {
  const clientId = useGoogleClientId();
  const loaded = useSettings((s) => s.loaded);
  const devMode = useSettings((s) => s.devMode);
  const status = useGoogleSession((s) => s.status);
  const expiresAt = useGoogleSession((s) => s.expiresAt);
  const error = useGoogleSession((s) => s.error);
  const connected = status === 'connected';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 text-sm text-fg-muted">{t.intro}</p>
        <Badge tone={connected ? 'success' : 'neutral'}>
          <span data-testid="google-status">
            {connected && expiresAt
              ? t.connectedUntil(timeFormat.format(expiresAt))
              : t.status[status]}
          </span>
        </Badge>
      </div>
      {devMode && (
        <>
          {loaded ? <ClientIdField /> : <Skeleton className="h-20 w-full" />}
          <SetupGuide />
          <div className="h-px bg-line" />
        </>
      )}
      {!connected ? (
        <div className="flex flex-col gap-3">
          <Button
            icon={LogIn}
            loading={status === 'connecting'}
            onClick={() => connectWithPopup(clientId)}
            className="self-start"
          >
            {t.connectPopup}
          </Button>
          <p className="text-sm text-fg-muted">{t.connectHint}</p>
        </div>
      ) : (
        <>
          <ConnectionTest />
          <Button
            variant="ghost"
            icon={Unplug}
            className="self-start"
            onClick={() => void disconnectGoogle()}
          >
            {t.disconnect}
          </Button>
        </>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
          data-testid="google-error"
        >
          <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
          {errorText(error)}
        </p>
      )}
    </div>
  );
}
