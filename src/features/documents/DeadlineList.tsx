import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { Badge, cn } from '@/components/ui';
import type { Deadline } from '@/core/documents/contracts';
import { formatShortDate } from '@/core/format';
import type { DocumentRecord } from '@/data/schemas';
import { de } from '@/i18n/de';
import { CATEGORY_ICONS, DEADLINE_TONES, whenLabel } from './useDocuments';

const t = de.documents;

/** Upcoming contract dates; each row opens the contract. */
export function DeadlineList({
  deadlines,
  className,
}: {
  deadlines: readonly Deadline<DocumentRecord>[];
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-col gap-2', className)} data-testid="deadline-list">
      {deadlines.map(({ contract, kind, date, days }) => {
        const Icon = CATEGORY_ICONS[contract.category];
        return (
          <li key={`${contract.id}-${kind}`} data-testid="deadline" data-kind={kind}>
            <Link
              to={`/documents/${contract.id}`}
              className="focus-ring flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface-sunken px-3 py-2 transition-colors active:bg-accent-soft [@media(hover:hover)]:hover:border-line-strong"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Icon size={19} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm text-fg-secondary">{t.deadlineKinds[kind]}</span>
                <span className="truncate text-base font-medium text-fg">{contract.name}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={DEADLINE_TONES[kind]}>{whenLabel(days)}</Badge>
                <span className="text-xs text-fg-muted tabular-nums">{formatShortDate(date)}</span>
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-fg-muted" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
