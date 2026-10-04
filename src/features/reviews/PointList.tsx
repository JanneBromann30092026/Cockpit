import { useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Plus, X } from 'lucide-react';
import { Button, IconButton, Input, Surface } from '@/components/ui';
import { LIMITS } from '@/data/schemas';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { addPoint } from './reviewText';

const t = de.reviews;

/** Suggestion chips: tapping one adds it. */
export function Suggestions({
  items,
  onPick,
  testId,
}: {
  items: string[];
  onPick: (item: string) => void;
  testId?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <span className="text-sm text-fg-muted">
        {t.suggestions} · {t.suggestionsHint}
      </span>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPick(item)}
            className="focus-ring no-callout inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-dashed border-line-strong px-4 py-2 text-left text-sm text-fg-secondary transition-colors active:bg-accent-soft [@media(hover:hover)]:hover:border-accent [@media(hover:hover)]:hover:text-fg"
            data-testid="review-suggestion"
          >
            <Plus size={15} aria-hidden className="shrink-0 text-accent" />
            <span className="min-w-0 break-words">{item}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** One section of a review: its points, a field to add one and suggestions from the data. */
export function PointList({
  title,
  hint,
  points,
  onChange,
  placeholder,
  suggestions = [],
  icon,
  testId,
}: {
  title: string;
  hint: string;
  points: string[];
  onChange: (points: string[]) => void;
  placeholder: string;
  suggestions?: string[];
  icon?: ReactNode;
  testId: string;
}) {
  const [draft, setDraft] = useState('');
  const open = suggestions.filter((item) => !points.includes(item));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onChange(addPoint(points, draft));
    setDraft('');
  };

  return (
    <Surface className="flex flex-col gap-4" data-testid={testId}>
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-fg">
          {icon}
          {title}
        </h2>
        <p className="text-sm text-fg-muted">{hint}</p>
      </div>
      {points.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="review-points">
          {points.map((point) => (
            <motion.li
              key={point}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.soft}
              className="flex items-start gap-2 rounded-lg bg-surface-sunken py-1 pr-1 pl-3"
              data-testid="review-point"
            >
              <span className="min-w-0 flex-1 py-2 text-base break-words text-fg">{point}</span>
              <IconButton
                icon={X}
                label={t.removePoint(point)}
                onClick={() => onChange(points.filter((entry) => entry !== point))}
              />
            </motion.li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            aria-label={`${title}: ${t.add}`}
            placeholder={placeholder}
            value={draft}
            maxLength={LIMITS.item}
            enterKeyHint="done"
            onChange={(event) => setDraft(event.target.value)}
            data-testid={`${testId}-input`}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          icon={Plus}
          disabled={!draft.trim()}
          aria-label={t.add}
          data-testid={`${testId}-add`}
        >
          <span className="hidden sm:inline">{t.add}</span>
        </Button>
      </form>
      <Suggestions items={open} onPick={(item) => onChange(addPoint(points, item))} />
    </Surface>
  );
}
