import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CircleAlert,
  CircleCheck,
  ClipboardPaste,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react';
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  Select,
  Skeleton,
  toast,
  Toggle,
  type SelectOption,
} from '@/components/ui';
import { de } from '@/i18n/de';
import {
  AI_MODEL_CHOICES,
  AiError,
  isModelChoice,
  observeApiKey,
  removeApiKey,
  saveApiKey,
  testAiConnection,
  type AiModelChoice,
} from '@/services/ai';
import { spring } from '@/styles/motion';
import { isValidSetting, useSettings } from './settingsStore';

const t = de.settings.ai;
const CONSOLE_URL = 'https://console.anthropic.com/settings/keys';

/** Masks the typed characters (WebKit/Blink; not in React's style types). */
const MASKED = { WebkitTextSecurity: 'disc' } as CSSProperties;

type ModelOption = AiModelChoice | 'custom';

const modelOptions: SelectOption<ModelOption>[] = [
  ...AI_MODEL_CHOICES.map((value) => ({ value, label: t.modelOptions[value] })),
  { value: 'custom', label: t.modelOptions.custom },
];

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

function errorMessage(error: unknown): string {
  return error instanceof AiError ? t.errors[error.code] : t.errors.API_ERROR;
}

/** Whether an API key is stored (null while checking); follows changes from other tabs. */
function useApiKeyStored(): boolean | null {
  const [stored, setStored] = useState<boolean | null>(null);
  useEffect(() => observeApiKey(setStored), []);
  return stored;
}

/** API key: can be set, replaced and removed – but never shown again. */
function ApiKeyField({ stored }: { stored: boolean | null }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveApiKey(draft);
      if (result === 'ok') {
        setDraft('');
        setError(undefined);
        toast.success(t.keySaved);
      } else {
        setError(t.keyErrors[result]);
      }
    } catch {
      toast.error(de.lock.errors.failed);
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setDraft(text.trim());
      setError(undefined);
    } catch {
      toast.info(t.pasteFailed);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-base text-fg">
          <KeyRound size={18} aria-hidden className="text-fg-muted" />
          {t.key}
        </span>
        {stored === null ? (
          <Skeleton className="h-7 w-32 rounded-full" />
        ) : (
          <Badge tone={stored ? 'success' : 'neutral'}>
            <span data-testid="api-key-status">{stored ? t.keyStored : t.keyMissing}</span>
          </Badge>
        )}
      </div>
      <Input
        // A text field with masked characters: a real password field would make Safari
        // offer the keychain (and the app password) here.
        type="text"
        aria-label={t.key}
        className="font-mono"
        style={MASKED}
        placeholder={t.keyPlaceholder}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(undefined);
        }}
        error={error}
        hint={stored ? t.keyReplaceHint : undefined}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        data-1p-ignore
        data-lpignore="true"
        data-testid="api-key-input"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" icon={KeyRound} loading={busy} disabled={!draft.trim()}>
          {t.saveKey}
        </Button>
        <Button size="sm" variant="secondary" icon={ClipboardPaste} onClick={() => void paste()}>
          {t.paste}
        </Button>
        {stored && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmRemove(true)}>
            {t.removeKey}
          </Button>
        )}
      </div>
      <p className="text-sm text-fg-muted">
        {t.keyHint}{' '}
        <a
          href={CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex items-center gap-1 rounded-sm font-medium text-accent"
        >
          {t.consoleLink}
          <ExternalLink size={13} aria-hidden />
        </a>
      </p>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={async () => {
          await removeApiKey();
          toast.success(t.keyRemoved);
        }}
        title={t.removeTitle}
        message={t.removeText}
        confirmLabel={t.removeKey}
      />
    </form>
  );
}

/** Suggested models in a picker; "Andere Modell-ID" opens a field saved on blur or Enter. */
function ModelField() {
  const model = useSettings((s) => s.aiModel);
  const set = useSettings((s) => s.set);
  const [custom, setCustom] = useState(() => !isModelChoice(model));
  const [draft, setDraft] = useState(() => (isModelChoice(model) ? '' : model));
  const [error, setError] = useState<string | undefined>();
  const selected: ModelOption = custom || !isModelChoice(model) ? 'custom' : model;

  const commit = (value: string) => {
    const next = value.trim();
    if (!next || next === model) return;
    if (!isValidSetting('aiModel', next)) {
      setError(t.modelInvalid);
      return;
    }
    setError(undefined);
    void set('aiModel', next);
  };

  return (
    <div className="flex flex-col gap-3">
      <Select
        label={t.model}
        hint={t.modelHint}
        options={modelOptions}
        value={selected}
        onChange={(value) => {
          setError(undefined);
          if (value === 'custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          setDraft('');
          void set('aiModel', value);
        }}
        data-testid="ai-model"
      />
      {selected === 'custom' && (
        <Input
          label={t.customModel}
          value={draft}
          className="font-mono"
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              commit(draft);
            }
          }}
          error={error}
          hint={t.customModelHint}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          data-testid="ai-custom-model"
        />
      )}
    </div>
  );
}

function ConnectionTest() {
  const enabled = useSettings((s) => s.aiEnabled);
  const model = useSettings((s) => s.aiModel);
  const [state, setState] = useState<TestState>({ status: 'idle' });

  const run = async () => {
    setState({ status: 'testing' });
    try {
      const result = await testAiConnection({ enabled, model });
      setState({ status: 'ok', message: t.testOk(result.displayName) });
    } catch (error: unknown) {
      setState({ status: 'error', message: errorMessage(error) });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          icon={Wifi}
          loading={state.status === 'testing'}
          onClick={() => void run()}
        >
          {state.status === 'testing' ? t.testing : t.test}
        </Button>
        <span className="text-sm text-fg-muted">{t.testHint}</span>
      </div>
      <AnimatePresence initial={false}>
        {(state.status === 'ok' || state.status === 'error') && (
          <motion.div
            key={`${state.status}-${state.message}`}
            role={state.status === 'error' ? 'alert' : 'status'}
            data-testid="connection-result"
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring.default}
            className={
              state.status === 'ok'
                ? 'flex items-start gap-3 rounded-lg bg-success-soft px-4 py-3 text-base text-fg'
                : 'flex items-start gap-3 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg'
            }
          >
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...spring.snappy, delay: 0.08 }}
              className={state.status === 'ok' ? 'text-success' : 'text-danger'}
            >
              {state.status === 'ok' ? (
                <CircleCheck size={22} aria-hidden />
              ) : (
                <CircleAlert size={22} aria-hidden />
              )}
            </motion.span>
            <span>{state.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Optional AI: off by default; key, model and a free connection test when switched on. */
export function AiSettings() {
  const enabled = useSettings((s) => s.aiEnabled);
  const loaded = useSettings((s) => s.loaded);
  const set = useSettings((s) => s.set);
  const stored = useApiKeyStored();

  return (
    <div className="flex flex-col gap-4">
      <Toggle
        label={t.enabled}
        description={t.enabledHint}
        checked={enabled}
        onChange={(value) => void set('aiEnabled', value)}
      />
      {!enabled ? (
        stored && <p className="text-sm text-fg-muted">{t.offKeyHint}</p>
      ) : (
        <>
          <div className="flex gap-3 rounded-lg bg-accent-soft p-4" data-testid="ai-privacy">
            <ShieldCheck size={22} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            <div className="flex flex-col gap-1">
              <p className="text-base font-semibold text-fg">{t.privacyTitle}</p>
              <p className="text-sm text-fg-secondary">{t.privacyText}</p>
            </div>
          </div>
          <div className="h-px bg-line" />
          <ApiKeyField stored={stored} />
          <div className="h-px bg-line" />
          {/* Only after loading: the model field starts from the stored value. */}
          {loaded ? <ModelField /> : <Skeleton className="h-20 w-full" />}
          <ConnectionTest />
        </>
      )}
    </div>
  );
}
