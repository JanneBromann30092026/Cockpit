import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { Check, CircleAlert, CloudCheck, Flame, Loader, Sparkles } from 'lucide-react';
import { Badge, Button, Surface } from '@/components/ui';
import { de } from '@/i18n/de';
import type { AiErrorCode } from '@/services/ai';
import { spring } from '@/styles/motion';
import { useReducedMotion } from '@/styles/useReducedMotion';
import type { SaveStatus } from './useReviews';

const t = de.reviews;

export function AutosaveStatus({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const Icon = status === 'saving' ? Loader : status === 'saved' ? CloudCheck : CircleAlert;
  return (
    <span
      className="hidden items-center gap-1.5 text-sm text-fg-muted sm:inline-flex"
      aria-live="polite"
      data-testid="review-autosave"
    >
      <Icon size={15} aria-hidden className={status === 'failed' ? 'text-danger' : undefined} />
      {t.autosave[status]}
    </span>
  );
}

export type ProposalState<P> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; points: P }
  | { status: 'error'; code: AiErrorCode };

/** The optional evaluation by Claude: hint, button, proposal to take over or discard. */
export function AiCard<P>({
  state,
  hint,
  onEvaluate,
  onAccept,
  onDiscard,
  children,
}: {
  state: ProposalState<P>;
  hint: string;
  onEvaluate: () => void;
  onAccept: () => void;
  onDiscard: () => void;
  /** The proposal, rendered by the editor. */
  children?: ReactNode;
}) {
  return (
    <Surface className="flex flex-col gap-3" data-testid="review-ai">
      {state.status === 'done' ? (
        <>
          <div className="flex items-center gap-2">
            <Sparkles size={18} aria-hidden className="text-accent" />
            <h2 className="flex-1 text-lg font-semibold tracking-tight text-fg">{t.ai.proposal}</h2>
            <Badge tone="accent">{de.today.overviewByClaude}</Badge>
          </div>
          <div data-testid="review-proposal">{children}</div>
          <div className="flex flex-wrap gap-2">
            <Button icon={Check} onClick={onAccept} data-testid="review-ai-accept">
              {t.ai.accept}
            </Button>
            <Button variant="ghost" onClick={onDiscard}>
              {t.ai.discard}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Button
            variant="secondary"
            icon={Sparkles}
            loading={state.status === 'loading'}
            onClick={onEvaluate}
            className="self-start"
            data-testid="review-ai-evaluate"
          >
            {state.status === 'loading' ? t.ai.evaluating : t.ai.evaluate}
          </Button>
          {state.status === 'error' ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
              data-testid="review-ai-error"
            >
              <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
              {de.settings.ai.errors[state.code]}
            </p>
          ) : (
            <p className="text-sm text-fg-muted">{hint}</p>
          )}
        </>
      )}
    </Surface>
  );
}

/** A proposed section: title and points. */
export function ProposalSection({ title, points }: { title: string; points: string[] }) {
  if (points.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 pb-3">
      <h3 className="text-sm font-medium text-fg-secondary">{title}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-fg">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </div>
  );
}

/** The key moment: a finished review. */
export function Completed({
  title,
  text,
  streak,
  children,
}: {
  title: string;
  text: string;
  streak?: number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring.soft}
      className="mx-auto flex max-w-xl flex-col items-center gap-5 py-10 text-center"
      data-testid="review-completed"
    >
      <span className="relative flex size-24 items-center justify-center">
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full bg-success-soft"
          initial={{ scale: reduced ? 1 : 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring.bouncy, delay: 0.05 }}
        />
        {!reduced && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-success"
            initial={{ scale: 0.8, opacity: 0.8 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.2 }}
          />
        )}
        <motion.span
          className="relative text-success"
          initial={{ scale: reduced ? 1 : 0, rotate: reduced ? 0 : -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...spring.bouncy, delay: 0.15 }}
        >
          <Check size={48} strokeWidth={2.6} aria-hidden />
        </motion.span>
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-fg">{title}</h2>
        <p className="text-base text-fg-secondary">{text}</p>
      </div>
      {streak !== undefined && streak > 1 && (
        <Badge tone="signal">
          <Flame size={14} aria-hidden />
          <span data-testid="review-streak">{t.streak(streak)}</span>
        </Badge>
      )}
      <div className="flex w-full flex-col items-center gap-3">{children}</div>
    </motion.div>
  );
}
