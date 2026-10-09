import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { CircleAlert, MessageCircleQuestion, Sparkles } from 'lucide-react';
import { Badge, Button, ChoiceChip, Input, Surface } from '@/components/ui';
import { answerLibraryQuestion, exampleTopics } from '@/core/library/ask';
import type { LibraryEntry } from '@/data/schemas';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { AiError, askLibraryWithAi, type AiErrorCode } from '@/services/ai';
import { spring } from '@/styles/motion';
import { libraryQuestionRequest, MAX_QUESTION_ENTRIES } from './libraryAi';
import { sourceLine, TYPE_ICONS } from './useLibrary';

const t = de.library;
const a = t.ask;

type ClaudeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; text: string; sources: LibraryEntry[] }
  | { status: 'error'; code: AiErrorCode };

/** "Was habe ich zu X gelernt?": quotes from my entries, optionally summed up by Claude. */
export function LibraryAskCard({
  entries,
  onShowAll,
}: {
  entries: readonly LibraryEntry[];
  /** Shows the matching entries in the list below (search for the question's words). */
  onShowAll: (terms: string) => void;
}) {
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);
  const [input, setInput] = useState('');
  const [question, setQuestion] = useState('');
  const [claude, setClaude] = useState<ClaudeState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const answer = useMemo(
    () => (question ? answerLibraryQuestion(question, entries) : null),
    [question, entries],
  );
  const examples = useMemo(
    () => exampleTopics(entries).map((topic) => a.example(topic)),
    [entries],
  );

  const ask = (text: string) => {
    controller.current?.abort();
    setInput(text);
    setQuestion(text.trim());
    setClaude({ status: 'idle' });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (input.trim()) ask(input);
  };

  const askClaude = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setClaude({ status: 'loading' });
    // The rule matches first: with a big library they are surely among the entries sent.
    const matched = answer?.items.map((item) => item.entry) ?? [];
    const ordered = [...matched, ...entries.filter((entry) => !matched.includes(entry))];
    const { request, byRef } = libraryQuestionRequest(question, ordered);
    try {
      const result = await askLibraryWithAi({ enabled: aiEnabled, model: aiModel }, request, {
        signal: current.signal,
      });
      if (current.signal.aborted) return;
      setClaude({
        status: 'done',
        text: result.text,
        sources: result.sources.flatMap((ref) => byRef.get(ref) ?? []),
      });
    } catch (error: unknown) {
      if (current.signal.aborted) return;
      setClaude({ status: 'error', code: error instanceof AiError ? error.code : 'API_ERROR' });
    }
  };

  const terms = answer?.terms.join(' ') ?? '';

  return (
    <Surface className="flex flex-col gap-4" data-testid="library-ask">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-fg">
        <MessageCircleQuestion size={20} aria-hidden className="text-accent" />
        {a.title}
      </h2>
      <form onSubmit={submit} className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            aria-label={a.label}
            placeholder={a.placeholder}
            value={input}
            maxLength={300}
            enterKeyHint="search"
            onChange={(event) => setInput(event.target.value)}
            data-testid="library-ask-input"
          />
        </div>
        <Button type="submit" disabled={!input.trim()} data-testid="library-ask-submit">
          {a.submit}
        </Button>
      </form>
      {examples.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={a.examplesLabel}>
          {examples.map((example) => (
            <ChoiceChip key={example} selected={question === example} onToggle={() => ask(example)}>
              {example}
            </ChoiceChip>
          ))}
        </div>
      )}

      {answer && (
        <motion.div
          key={question}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
          className="flex flex-col gap-4 border-t border-line pt-4"
          data-testid="library-answer"
          aria-live="polite"
        >
          {answer.terms.length === 0 ? (
            <p className="text-base text-fg-secondary">{a.noTerms}</p>
          ) : answer.items.length === 0 ? (
            <p className="text-base text-fg-secondary" data-testid="library-answer-nothing">
              {a.nothing(terms)}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-fg-secondary">
                {a.found(answer.items.length)}
              </p>
              <ul className="flex flex-col gap-4">
                {answer.items.map((item) => {
                  const Icon = TYPE_ICONS[item.entry.type];
                  return (
                    <li
                      key={item.entry.id}
                      className="flex gap-3"
                      data-testid="library-answer-item"
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                        <Icon size={16} aria-hidden />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex flex-col">
                          <Link
                            to={`/library/${item.entry.id}`}
                            className="focus-ring self-start rounded-sm text-base font-semibold text-accent underline-offset-4 [@media(hover:hover)]:hover:underline"
                          >
                            {item.entry.title}
                          </Link>
                          <span className="text-sm text-fg-muted">{sourceLine(item.entry)}</span>
                        </div>
                        {item.points.length > 0 ? (
                          <ul className="flex flex-col gap-1">
                            {item.points.map((point) => (
                              <li
                                key={point.text}
                                className="flex gap-2 text-base text-fg"
                                data-testid="library-answer-point"
                              >
                                <span
                                  aria-hidden
                                  className="mt-2.5 size-1.5 shrink-0 rounded-full bg-signal"
                                />
                                <span>
                                  {point.text}
                                  {point.byClaude && (
                                    <span className="ml-1 text-sm text-fg-muted">{t.byClaude}</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-fg-muted">{a.noPoints}</p>
                        )}
                        {item.thoughts && (
                          <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-fg-secondary">
                            <span className="font-medium">{a.myThoughts}: </span>
                            {item.thoughts}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-fg-muted">
                  {answer.more > 0 ? `${a.more(answer.more)} · ` : ''}
                  {a.source}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onShowAll(terms)}
                  data-testid="library-answer-show-all"
                >
                  {a.showAll}
                </Button>
              </div>
            </>
          )}

          {aiEnabled && answer.terms.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              {claude.status === 'done' ? (
                <div
                  className="flex flex-col gap-2 rounded-lg bg-accent-soft px-4 py-3"
                  data-testid="library-claude-answer"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} aria-hidden className="text-accent" />
                    <span className="flex-1 text-sm font-medium text-fg-secondary">
                      {a.claudeTitle}
                    </span>
                    <Badge tone="accent">{t.byClaude}</Badge>
                  </div>
                  <p className="text-base text-fg">{claude.text}</p>
                  <p className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-fg-secondary">
                    {claude.sources.length > 0 ? (
                      <>
                        <span>{a.sources}</span>
                        {claude.sources.map((source) => (
                          <Link
                            key={source.id}
                            to={`/library/${source.id}`}
                            className="focus-ring rounded-sm font-medium text-accent underline underline-offset-4"
                            data-testid="library-claude-source"
                          >
                            {source.title}
                          </Link>
                        ))}
                      </>
                    ) : (
                      a.noSources
                    )}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={Sparkles}
                    loading={claude.status === 'loading'}
                    onClick={() => void askClaude()}
                    className="self-start"
                    data-testid="library-ask-claude"
                  >
                    {claude.status === 'loading' ? a.asking : a.askClaude}
                  </Button>
                  {claude.status === 'error' ? (
                    <p
                      role="alert"
                      className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
                      data-testid="library-claude-error"
                    >
                      <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
                      {de.settings.ai.errors[claude.code]}
                    </p>
                  ) : (
                    <p className="text-sm text-fg-muted">
                      {a.claudeHint(Math.min(entries.length, MAX_QUESTION_ENTRIES))}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </Surface>
  );
}
