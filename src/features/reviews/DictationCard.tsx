import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, CircleAlert, Keyboard, ListTree, Mic, Square } from 'lucide-react';
import { Button, SegmentedControl, Surface, Textarea, type SegmentOption } from '@/components/ui';
import {
  sortDictation,
  type DictationSection,
  type SortedSentence,
} from '@/core/reviews/dictation';
import { LIMITS } from '@/data/schemas';
import { de } from '@/i18n/de';
import {
  isSpeechSupported,
  startDictation,
  type Dictation,
  type SpeechProblem,
} from '@/services/speech';
import { spring } from '@/styles/motion';
import { useReducedMotion } from '@/styles/useReducedMotion';

const t = de.reviews.dictation;
const SECTIONS: DictationSection[] = ['wentWell', 'notWell', 'improve', 'note'];

/** Recording stops for these; typing with the keyboard microphone still works. */
const BLOCKING: readonly SpeechProblem[] = ['denied', 'unavailable'];

function join(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Speak instead of type: the browser's speech recognition writes along (or the keyboard
 * microphone), then the sentences are pre-sorted into the review sections to adjust and
 * take over. No audio is kept – only the text that is taken over.
 */
export function DictationCard({
  variant,
  onApply,
}: {
  variant: 'day' | 'week';
  onApply: (sentences: SortedSentence[]) => void;
}) {
  const reduced = useReducedMotion();
  const [supported] = useState(isSpeechSupported);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<SpeechProblem | null>(null);
  const [sorted, setSorted] = useState<SortedSentence[] | null>(null);
  const dictation = useRef<Dictation | null>(null);
  const base = useRef('');

  useEffect(() => () => dictation.current?.abort(), []);

  const labels = t[variant];
  const options: SegmentOption<DictationSection>[] = SECTIONS.map((value) => ({
    value,
    label: labels[value],
  }));
  const blocked = !supported || (problem !== null && BLOCKING.includes(problem));

  const record = () => {
    setProblem(null);
    setSorted(null);
    base.current = text;
    const started = startDictation({
      onText: (final, interim) => setText(join(base.current, final, interim)),
      onProblem: setProblem,
      onEnd: () => {
        setListening(false);
        dictation.current = null;
      },
    });
    dictation.current = started;
    setListening(started !== null);
  };

  const stop = () => dictation.current?.stop();

  const sort = () => {
    stop();
    setSorted(sortDictation(text));
  };

  const apply = () => {
    if (!sorted) return;
    onApply(sorted);
    setSorted(null);
    setText('');
  };

  return (
    <Surface className="flex flex-col gap-4" data-testid="dictation-card">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-fg">
          <Mic size={19} aria-hidden className="text-accent" />
          {t.title}
        </h2>
        <p className="text-sm text-fg-muted">{variant === 'day' ? t.introDay : t.introWeek}</p>
      </div>

      {!blocked && (
        <div className="flex flex-wrap items-center gap-3">
          {listening ? (
            <Button variant="danger" icon={Square} onClick={stop} data-testid="dictation-stop">
              {t.stop}
            </Button>
          ) : (
            <Button variant="secondary" icon={Mic} onClick={record} data-testid="dictation-record">
              {text ? t.more : t.record}
            </Button>
          )}
          {listening && (
            <span className="flex items-center gap-2 text-sm text-fg-secondary" aria-live="polite">
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
      )}
      {blocked && (
        <p
          className="flex items-start gap-2 rounded-lg bg-accent-soft px-4 py-3 text-sm text-fg"
          data-testid="dictation-hint"
        >
          <Keyboard size={17} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          {problem === 'denied' ? t.problems.denied : t.keyboardHint}
        </p>
      )}
      {problem && !BLOCKING.includes(problem) && (
        <p
          role="alert"
          className="flex items-start gap-2 text-sm text-fg-secondary"
          data-testid="dictation-problem"
        >
          <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          {t.problems[problem]}
        </p>
      )}

      <Textarea
        label={t.textLabel}
        placeholder={t.textPlaceholder}
        value={text}
        maxLength={LIMITS.notes}
        onChange={(event) => {
          setText(event.target.value);
          setSorted(null);
        }}
        data-testid="dictation-text"
      />

      {sorted === null ? (
        <Button
          variant="secondary"
          icon={ListTree}
          onClick={sort}
          disabled={!text.trim()}
          className="self-start"
          data-testid="dictation-sort"
        >
          {t.sort}
        </Button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
          className="flex flex-col gap-3"
          data-testid="dictation-sorted"
        >
          <div className="flex flex-col gap-0.5">
            <h3 className="text-base font-semibold text-fg">{t.sortedTitle}</h3>
            <p className="text-sm text-fg-muted">{sorted.length > 0 ? t.sortHint : t.empty}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {sorted.map((sentence, index) => (
              <li
                key={`${index}-${sentence.text}`}
                className="flex flex-col gap-2 rounded-lg bg-surface-sunken p-3"
                data-testid="dictation-row"
              >
                <span className="text-base break-words text-fg">{sentence.text}</span>
                <SegmentedControl
                  label={t.sectionLabel(sentence.text)}
                  options={options}
                  value={sentence.section}
                  onChange={(section) =>
                    setSorted(
                      sorted.map((entry, position) =>
                        position === index ? { ...entry, section } : entry,
                      ),
                    )
                  }
                  className="self-start"
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              icon={Check}
              onClick={apply}
              disabled={sorted.length === 0}
              data-testid="dictation-apply"
            >
              {t.apply}
            </Button>
            <Button variant="ghost" onClick={() => setSorted(null)}>
              {t.discard}
            </Button>
          </div>
        </motion.div>
      )}
      <p className="text-xs text-fg-muted">{t.privacy}</p>
    </Surface>
  );
}
