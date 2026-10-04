import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { CalendarPlus, CircleHelp, Paperclip, Plus } from 'lucide-react';
import { Badge, Button, ChoiceChip, EmptyState, SearchInput, Surface } from '@/components/ui';
import { useHotkeys } from '@/app/hooks/useHotkeys';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { Page } from '@/app/shell/Page';
import {
  cancelBy,
  deadlines,
  totalCosts,
  upcomingDeadlines,
  type Deadline,
} from '@/core/documents/contracts';
import { formatDeadlineDate, formatEuro } from '@/core/format';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/data/domain';
import type { DocumentRecord } from '@/data/schemas';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { CalendarDialog } from './CalendarDialog';
import { DeadlineList } from './DeadlineList';
import { DocumentEditor } from './DocumentEditor';
import { CATEGORY_ICONS, DEADLINE_TONES, useDocuments } from './useDocuments';

const t = de.documents;

function matches(document: DocumentRecord, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('de');
  if (!needle) return true;
  return [document.name, document.provider ?? '', t.categories[document.category]]
    .join(' ')
    .toLocaleLowerCase('de')
    .includes(needle);
}

function DocumentCard({
  document,
  next,
  today,
}: {
  document: DocumentRecord;
  next?: Deadline<DocumentRecord>;
  today: string;
}) {
  const Icon = CATEGORY_ICONS[document.category];
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid="document-card"
    >
      <Link
        to={`/documents/${document.id}`}
        className="focus-ring flex h-full items-start gap-4 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors active:bg-accent-soft [@media(hover:hover)]:hover:border-line-strong"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon size={21} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-base font-semibold break-words text-fg">{document.name}</span>
          <span className="truncate text-sm text-fg-secondary">
            {[document.provider, t.categories[document.category]].filter(Boolean).join(' · ')}
          </span>
          {document.amount !== undefined && (
            <span className="text-sm text-fg tabular-nums">
              {formatEuro(document.amount)}
              {document.interval && ` ${t.intervals[document.interval]}`}
            </span>
          )}
          <span className="flex flex-wrap gap-1.5 pt-1">
            {next && (
              <Badge tone={DEADLINE_TONES[next.kind]}>
                {t.deadlineKinds[next.kind]} {formatDeadlineDate(next.date, today)}
              </Badge>
            )}
            {document.files.length > 0 && (
              <Badge>
                <Paperclip size={12} aria-hidden />
                {t.files(document.files.length)}
              </Badge>
            )}
            {document.openPoints.length > 0 && (
              <Badge tone="signal">
                <CircleHelp size={12} aria-hidden />
                {t.openPointsCount(document.openPoints.length)}
              </Badge>
            )}
          </span>
        </span>
      </Link>
    </motion.li>
  );
}

/** My contracts: costs, what is coming up, search and categories. */
export function DocumentsPage() {
  const today = useLocalDate();
  const documents = useDocuments();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<DocumentCategory | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);

  const costs = useMemo(() => totalCosts(documents), [documents]);
  const upcoming = useMemo(() => upcomingDeadlines(documents, today), [documents, today]);
  const nextByDocument = useMemo(() => {
    const map = new Map<string, Deadline<DocumentRecord>>();
    for (const deadline of deadlines(documents, today)) {
      // The next cancel date matters most; otherwise the earliest date.
      const current = map.get(deadline.contract.id);
      if (!current || (deadline.kind === 'cancel' && current.kind !== 'cancel')) {
        map.set(deadline.contract.id, deadline);
      }
    }
    return map;
  }, [documents, today]);
  const present = DOCUMENT_CATEGORIES.filter((key) =>
    documents.some((document) => document.category === key),
  );
  const visible = documents.filter(
    (document) => (!category || document.category === category) && matches(document, query),
  );
  const hasCalendarDates = documents.some(
    (document) => cancelBy(document) !== null || document.termEnd !== undefined,
  );

  useHotkeys([
    {
      combo: 'n',
      handler: () => {
        if (document.querySelector('[aria-modal="true"]')) return;
        setAdding(true);
      },
    },
  ]);

  return (
    <Page
      title={t.title}
      actions={
        <>
          {hasCalendarDates && (
            <Button
              variant="secondary"
              size="sm"
              icon={CalendarPlus}
              onClick={() => setExporting(true)}
              aria-label={t.exportAll}
              data-testid="documents-export"
            >
              <span className="hidden sm:inline">{t.exportAll}</span>
            </Button>
          )}
          <Button
            size="sm"
            icon={Plus}
            onClick={() => setAdding(true)}
            aria-label={t.add}
            data-testid="documents-add"
          >
            <span className="hidden sm:inline">{t.add}</span>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6" data-testid="documents-page">
        {documents.length === 0 ? (
          <EmptyState
            title={t.empty}
            text={t.emptyText}
            action={
              <Button icon={Plus} onClick={() => setAdding(true)}>
                {t.add}
              </Button>
            }
          />
        ) : (
          <>
            <div className="-mt-1 flex flex-col gap-1 px-1">
              <p className="text-base text-fg-secondary" data-testid="documents-summary">
                {t.count(documents.length)}
                {costs.monthly > 0 &&
                  ` · ${t.perMonth(formatEuro(costs.monthly))} · ${t.perYear(formatEuro(costs.yearly))}`}
              </p>
              {costs.monthly > 0 && <p className="text-sm text-fg-muted">{t.costsHint}</p>}
            </div>

            {upcoming.length > 0 && (
              <Surface className="flex flex-col gap-3" data-testid="documents-upcoming">
                <h2 className="text-lg font-semibold tracking-tight text-fg">{t.upcoming}</h2>
                <DeadlineList deadlines={upcoming} />
              </Surface>
            )}

            <div className="flex flex-col gap-3">
              <SearchInput
                value={query}
                onChange={setQuery}
                label={t.search}
                clearLabel={de.ui.clear}
                placeholder={t.searchPlaceholder}
                data-testid="documents-search"
              />
              {present.length > 1 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t.filter}>
                  <ChoiceChip selected={category === null} onToggle={() => setCategory(null)}>
                    {t.allCategories}
                  </ChoiceChip>
                  {present.map((key) => (
                    <ChoiceChip
                      key={key}
                      selected={category === key}
                      onToggle={() => setCategory(category === key ? null : key)}
                    >
                      {t.categories[key]}
                    </ChoiceChip>
                  ))}
                </div>
              )}
            </div>

            {visible.length === 0 ? (
              <p className="px-1 text-base text-fg-muted">{t.emptyFiltered}</p>
            ) : (
              <ul className="grid gap-3 wide:grid-cols-2" data-testid="document-list">
                {visible.map((document) => (
                  <DocumentCard
                    key={document.id}
                    document={document}
                    next={nextByDocument.get(document.id)}
                    today={today}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {adding && <DocumentEditor onClose={() => setAdding(false)} />}
      {exporting && (
        <CalendarDialog documents={documents} today={today} onClose={() => setExporting(false)} />
      )}
    </Page>
  );
}
