import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { CircleAlert, Keyboard, Mic, Play, Sparkles, Square } from 'lucide-react';
import { Button, Textarea, toast } from '@/components/ui';
import { EditPanel } from '@/app/shell/EditPanel';
import { parseCommand, type Command, type OpenTarget } from '@/core/commands/parse';
import { addDays, localIsoDate } from '@/core/dates';
import { focusActions, taskActions } from '@/data/repositories';
import { de } from '@/i18n/de';
import {
  isSpeechSupported,
  startDictation,
  type Dictation,
  type SpeechProblem,
} from '@/services/speech';
import { spring } from '@/styles/motion';
import { useReducedMotion } from '@/styles/useReducedMotion';

const t = de.commands;

const ROUTES: Record<OpenTarget, string> = {
  today: '/today',
  tasks: '/tasks',
  documents: '/documents',
  reviews: '/reviews',
  dayReview: '/reviews/day/today',
  weekReview: '/reviews/week/current',
  library: '/library',
  brand: '/brand',
  settings: '/settings',
  backup: '/settings#backup',
  focus: '/focus',
};

function describe(command: Command): string {
  switch (command.kind) {
    case 'focus':
      return command.activities.length > 0
        ? t.focusWith(command.activities.map((activity) => activity.name).join(', '))
        : t.focusNone;
    case 'task': {
      const extras = [
        command.due ? t.taskDue[command.due] : null,
        command.important ? t.taskImportant : null,
      ].filter(Boolean);
      return `${t.task(command.title)}${extras.length > 0 ? ` · ${extras.join(' · ')}` : ''}`;
    }
    case 'open':
      return t.openTarget(t.targets[command.target]);
    case 'unknown':
      return t.unknown;
  }
}

/** "Sprechen" in "Heute": a spoken or typed wish → one of a few fixed actions. */
export function CommandPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const [supported] = useState(isSpeechSupported);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<SpeechProblem | null>(null);
  const [command, setCommand] = useState<Command | null>(null);
  const [running, setRunning] = useState(false);
  const dictation = useRef<Dictation | null>(null);
  const base = useRef('');

  /** Closing starts the next wish from scratch. */
  const close = () => {
    dictation.current?.abort();
    setText('');
    setCommand(null);
    setProblem(null);
    onClose();
  };

  useEffect(() => () => dictation.current?.abort(), []);

  const blocked = !supported || problem === 'denied' || problem === 'unavailable';

  const record = () => {
    setProblem(null);
    setCommand(null);
    base.current = text;
    const started = startDictation({
      onText: (final, interim) =>
        setText([base.current, final, interim].filter(Boolean).join(' ').trim()),
      onProblem: setProblem,
      onEnd: () => {
        setListening(false);
        dictation.current = null;
      },
    });
    dictation.current = started;
    setListening(started !== null);
  };

  const understand = () => {
    dictation.current?.stop();
    setCommand(parseCommand(text));
  };

  const run = async () => {
    if (!command) return;
    setRunning(true);
    try {
      if (command.kind === 'focus') {
        await focusActions.addWishes(command.activities);
        close();
        void navigate('/focus');
      } else if (command.kind === 'task') {
        const today = localIsoDate();
        const dueDate =
          command.due === 'today'
            ? today
            : command.due === 'tomorrow'
              ? addDays(today, 1)
              : command.due === 'dayAfter'
                ? addDays(today, 2)
                : undefined;
        await taskActions.create({
          title: command.title,
          priority: command.important ? 'high' : 'medium',
          ...(dueDate ? { dueDate } : {}),
        });
        toast.success(t.taskCreated);
        close();
      } else if (command.kind === 'open') {
        close();
        void navigate(ROUTES[command.target]);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <EditPanel
      open={open}
      onClose={close}
      title={t.title}
      description={t.intro}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t.cancel}
          </Button>
          {command && command.kind !== 'unknown' ? (
            <Button
              icon={Play}
              loading={running}
              onClick={() => void run()}
              data-testid="command-run"
            >
              {t.run}
            </Button>
          ) : (
            <Button
              icon={Sparkles}
              disabled={!text.trim()}
              onClick={understand}
              data-testid="command-understand"
            >
              {t.understand}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="command-panel">
        {!blocked ? (
          <div className="flex flex-wrap items-center gap-3">
            {listening ? (
              <Button
                variant="danger"
                icon={Square}
                onClick={() => dictation.current?.stop()}
                data-testid="command-stop"
              >
                {t.stop}
              </Button>
            ) : (
              <Button variant="secondary" icon={Mic} onClick={record} data-testid="command-record">
                {text ? t.more : t.record}
              </Button>
            )}
            {listening && (
              <span
                className="flex items-center gap-2 text-sm text-fg-secondary"
                aria-live="polite"
              >
                <motion.span
                  aria-hidden
                  className="size-2.5 rounded-full bg-danger"
                  animate={reduced ? undefined : { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                {t.listening}
              </span>
            )}
          </div>
        ) : (
          <p className="flex items-start gap-2 rounded-lg bg-accent-soft px-4 py-3 text-sm text-fg">
            <Keyboard size={17} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            {t.keyboardHint}
          </p>
        )}
        <Textarea
          label={t.textLabel}
          placeholder={t.textPlaceholder}
          value={text}
          maxLength={2000}
          onChange={(event) => {
            setText(event.target.value);
            setCommand(null);
          }}
          data-testid="command-text"
        />
        {command && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
            role="status"
            className={
              command.kind === 'unknown'
                ? 'flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-base text-fg'
                : 'flex flex-col gap-1 rounded-lg bg-accent-soft px-4 py-3 text-base text-fg'
            }
            data-testid="command-result"
          >
            {command.kind === 'unknown' ? (
              <>
                <CircleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                {describe(command)}
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-fg-secondary">{t.understood}</span>
                <span className="font-medium">{describe(command)}</span>
              </>
            )}
          </motion.p>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg-secondary">{t.examplesTitle}</span>
          <ul className="flex flex-col gap-2">
            {t.examples.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => {
                    setText(example);
                    setCommand(parseCommand(example));
                  }}
                  className="focus-ring min-h-11 w-full rounded-lg border border-line px-4 py-2 text-left text-base text-fg-secondary active:bg-accent-soft"
                >
                  „{example}“
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </EditPanel>
  );
}
