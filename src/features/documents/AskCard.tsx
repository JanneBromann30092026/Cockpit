import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { CircleAlert, CircleHelp, MessageCircleQuestion, Sparkles } from 'lucide-react';
import { Badge, Button, ChoiceChip, cn, Input, Surface } from '@/components/ui';
import { answerQuestion, type AnswerItem } from '@/core/documents/ask';
import { costs, deadlines } from '@/core/documents/contracts';
import { formatDate, formatDeadlineDate, formatEuro } from '@/core/format';
import type { DocumentCategory } from '@/data/domain';
import type { DocumentRecord } from '@/data/schemas';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { AiError, askContractsWithAi, type AiErrorCode } from '@/services/ai';
import { spring } from '@/styles/motion';
import { questionRequest } from './contractAi';
import { whenLabel } from './useDocuments';

const t = de.documents;
const a = t.ask;

type ClaudeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; text: string; sources: DocumentRecord[] }
  | { status: 'error'; code: AiErrorCode };

function amountText(document: DocumentRecord): string {
  if (document.amount === undefined) return a.costUnknown;
  const base = `${formatEuro(document.amount)}${document.interval ? ` ${t.intervals[document.interval]}` : ''}`;
  const monthly = costs(document).monthly;
  return monthly > 0 && document.interval !== 'monthly'
    ? `${base} · ${t.perMonth(formatEuro(monthly))}`
    : base;
}

/** The answer line of one contract, only from its stored fields. */
function itemText(item: AnswerItem<DocumentRecord>, today: string): string {
  const document = item.contract;
  const date = item.date ? formatDate(item.date) : '';
  const when = item.days !== undefined && item.days >= 0 ? whenLabel(item.days) : '';
  switch (item.intent) {
    case 'cancel':
      if (item.status === 'ok') return a.cancelBy(date, when);
      if (item.status === 'passed') return a.cancelPassed(date);
      if (document.noticePeriod && !document.termEnd)
        return a.cancelNoTermEnd(document.noticePeriod);
      if (document.termEnd) return a.cancelNoNotice(formatDate(document.termEnd));
      return a.cancelUnknown;
    case 'termEnd':
      if (item.status === 'ok') return a.termEnd(date, when);
      if (item.status === 'passed') return a.termEndPassed(date);
      return a.termEndUnknown;
    case 'payment':
      if (item.status === 'unknown') return a.paymentUnknown;
      return document.amount !== undefined
        ? `${a.payment(date, when)} · ${formatEuro(document.amount)}`
        : a.payment(date, when);
    case 'cost':
      return amountText(document);
    case 'provider':
      return document.provider ? a.provider(document.provider) : a.providerUnknown;
    case 'overview': {
      const next = deadlines([document], today)[0];
      return [
        t.categories[document.category],
        document.amount !== undefined ? amountText(document) : null,
        next ? `${t.deadlineKinds[next.kind]} ${formatDeadlineDate(next.date, today)}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    }
  }
}

const DOT: Record<AnswerItem['status'], string> = {
  ok: 'bg-accent',
  passed: 'bg-warning',
  unknown: 'bg-line-strong',
};

function AnswerLine({ item, today }: { item: AnswerItem<DocumentRecord>; today: string }) {
  const unknown = item.status === 'unknown';
  // An upcoming cancel date is the one thing to act on.
  const cancel = item.status === 'ok' && item.intent === 'cancel';
  return (
    <li className="flex items-start gap-3" data-testid="ask-line">
      <span
        aria-hidden
        className={cn('mt-2 size-2 shrink-0 rounded-full', cancel ? 'bg-signal' : DOT[item.status])}
      />
      <span className="flex min-w-0 flex-col">
        <Link
          to={`/documents/${item.contract.id}`}
          className="focus-ring self-start rounded-sm text-base font-semibold text-accent underline-offset-4 [@media(hover:hover)]:hover:underline"
        >
          {item.contract.name}
        </Link>
        <span className={cn('text-base', unknown ? 'text-fg-muted' : 'text-fg')}>
          {itemText(item, today)}
          {unknown && (
            <span className="ml-2 inline-flex items-center gap-1 text-sm text-signal-fg">
              <CircleHelp size={14} aria-hidden />
              {a.openPoint}
            </span>
          )}
        </span>
      </span>
    </li>
  );
}

/** Questions to my contracts: answered by rules from the fields, optionally by Claude. */
export function AskCard({
  documents,
  today,
}: {
  documents: readonly DocumentRecord[];
  today: string;
}) {
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);
  const [input, setInput] = useState('');
  const [question, setQuestion] = useState('');
  const [claude, setClaude] = useState<ClaudeState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const answer = useMemo(
    () => (question ? answerQuestion(question, documents, today) : null),
    [question, documents, today],
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
    const { request, byRef } = questionRequest(question, documents, today);
    try {
      const result = await askContractsWithAi({ enabled: aiEnabled, model: aiModel }, request, {
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

  const intents = answer?.intents ?? [];
  const categories = (answer?.categories ?? []) as DocumentCategory[];

  return (
    <Surface className="flex flex-col gap-4" data-testid="documents-ask">
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
            data-testid="ask-input"
          />
        </div>
        <Button type="submit" disabled={!input.trim()} data-testid="ask-submit">
          {a.submit}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2" role="group" aria-label={a.examplesLabel}>
        {a.examples.map((example) => (
          <ChoiceChip key={example} selected={question === example} onToggle={() => ask(example)}>
            {example}
          </ChoiceChip>
        ))}
      </div>

      {answer && (
        <motion.div
          key={question}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
          className="flex flex-col gap-4 border-t border-line pt-4"
          data-testid="ask-answer"
          aria-live="polite"
        >
          {!answer.understood ? (
            <p className="text-base text-fg-secondary" data-testid="ask-not-understood">
              {a.notUnderstood}
            </p>
          ) : answer.items.length === 0 ? (
            <p className="text-base text-fg-secondary">
              {a.noContract(categories.map((key) => t.categories[key]).join(', '))}
            </p>
          ) : (
            intents.map((intent) => (
              <div key={intent} className="flex flex-col gap-2">
                {intents.length > 1 && (
                  <h3 className="text-sm font-medium text-fg-secondary">{a.intents[intent]}</h3>
                )}
                <ul className="flex flex-col gap-3">
                  {answer.items
                    .filter((item) => item.intent === intent)
                    .map((item) => (
                      <AnswerLine key={item.contract.id} item={item} today={today} />
                    ))}
                </ul>
              </div>
            ))
          )}
          {answer.total && (
            <p className="text-base font-medium text-fg tabular-nums" data-testid="ask-total">
              {a.total(formatEuro(answer.total.monthly), formatEuro(answer.total.yearly))}
            </p>
          )}
          {answer.understood && answer.items.length > 0 && (
            <p className="text-sm text-fg-muted">{a.source}</p>
          )}

          {aiEnabled && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              {claude.status === 'done' ? (
                <div
                  className="flex flex-col gap-2 rounded-lg bg-accent-soft px-4 py-3"
                  data-testid="ask-claude-answer"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} aria-hidden className="text-accent" />
                    <span className="flex-1 text-sm font-medium text-fg-secondary">
                      {a.claudeTitle}
                    </span>
                    <Badge tone="accent">{de.today.overviewByClaude}</Badge>
                  </div>
                  <p className="text-base text-fg">{claude.text}</p>
                  <p className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-fg-secondary">
                    {claude.sources.length > 0 ? (
                      <>
                        <span>{a.sources}</span>
                        {claude.sources.map((source) => (
                          <Link
                            key={source.id}
                            to={`/documents/${source.id}`}
                            className="focus-ring rounded-sm font-medium text-accent underline underline-offset-4"
                            data-testid="ask-claude-source"
                          >
                            {source.name}
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
                    data-testid="ask-claude"
                  >
                    {claude.status === 'loading' ? a.asking : a.askClaude}
                  </Button>
                  {claude.status === 'error' ? (
                    <p
                      role="alert"
                      className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
                      data-testid="ask-claude-error"
                    >
                      <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
                      {de.settings.ai.errors[claude.code]}
                    </p>
                  ) : (
                    <p className="text-sm text-fg-muted">{a.claudeHint(documents.length)}</p>
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
