import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import {
  CalendarPlus,
  ChevronLeft,
  CircleAlert,
  CircleHelp,
  Pencil,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  ActionMenuButton,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Surface,
  toast,
} from '@/components/ui';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { Page } from '@/app/shell/Page';
import {
  cancelBy,
  cancelMissed,
  costs,
  nextPayment,
  termEndPassed,
} from '@/core/documents/contracts';
import { daysBetween } from '@/core/dates';
import { formatDate, formatEuro } from '@/core/format';
import type { DocumentAiField } from '@/data/domain';
import { documentActions } from '@/data/repositories';
import { useDataStore } from '@/data/store';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { CalendarDialog } from './CalendarDialog';
import { DocumentEditor } from './DocumentEditor';
import type { FromFileState } from './DocumentsPage';
import { ExtractPanel } from './ExtractPanel';
import { FileTiles } from './FileTiles';
import { CATEGORY_ICONS, whenLabel } from './useDocuments';

const t = de.documents;
const d = t.detail;

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid={testId}
    >
      <Surface className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {children}
      </Surface>
    </motion.section>
  );
}

/** Small mark for a value Claude read from the original. */
function AiMark() {
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
      data-testid="ai-mark"
    >
      <Sparkles size={11} aria-hidden />
      {t.extract.mark}
    </span>
  );
}

function Row({
  label,
  children,
  testId,
  ai,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
  ai?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line pb-3 last:border-0 last:pb-0">
      <dt className="text-sm text-fg-secondary">
        {label}
        {ai && <AiMark />}
      </dt>
      <dd className="text-base text-fg" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

function isFromFileState(value: unknown): value is FromFileState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).fromFile === 'string' &&
    typeof (value as Record<string, unknown>).placeholder === 'string'
  );
}

function Note({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-fg">
      <Icon size={17} aria-hidden className="mt-0.5 shrink-0 text-warning" />
      {children}
    </p>
  );
}

/** One contract: dates and the latest day to cancel, summary, open points, originals. */
export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const today = useLocalDate();
  const document = useDataStore((state) => state.documents[id]);
  const ready = useDataStore((state) => state.ready);
  const aiEnabled = useSettings((s) => s.aiEnabled);
  // Just created from an original: read it with Claude (or fill in the fields by hand).
  const [fromFile] = useState(() => (isFromFileState(location.state) ? location.state : null));
  const [editing, setEditing] = useState(() => fromFile !== null && !aiEnabled);
  const [exporting, setExporting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [extracting, setExtracting] = useState<{ fileId?: string; placeholder?: string } | null>(
    () =>
      fromFile && aiEnabled
        ? { fileId: fromFile.fromFile, placeholder: fromFile.placeholder }
        : null,
  );

  // Opened once: going back or reloading does not open it again.
  useEffect(() => {
    if (isFromFileState(location.state)) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const back = (
    <IconButton
      icon={ChevronLeft}
      label={d.back}
      onClick={() => void navigate('/documents')}
      data-testid="document-back"
    />
  );

  if (!document) {
    return (
      <Page title={t.title} leading={back}>
        {ready && <EmptyState title={d.notFound} />}
      </Page>
    );
  }

  const Icon = CATEGORY_ICONS[document.category];
  const lastCancelDay = cancelBy(document);
  const payment = nextPayment(document.dueDate, document.interval, today);
  const cost = costs(document);
  const missed = cancelMissed(document, today);
  const passed = termEndPassed(document, today);
  const ai = (field: DocumentAiField) => document.aiFields.includes(field);

  return (
    <Page
      title={document.name}
      leading={back}
      actions={
        <>
          <Button
            size="sm"
            variant="secondary"
            icon={Pencil}
            onClick={() => setEditing(true)}
            aria-label={d.edit}
            data-testid="document-edit"
          >
            <span className="hidden sm:inline">{d.edit}</span>
          </Button>
          <ActionMenuButton
            testId="document-menu"
            items={[
              {
                id: 'calendar',
                label: d.calendar,
                icon: CalendarPlus,
                onSelect: () => setExporting(true),
              },
              {
                id: 'delete',
                label: d.remove,
                icon: Trash2,
                danger: true,
                onSelect: () => setRemoving(true),
              },
            ]}
          />
        </>
      }
    >
      <div className="flex flex-col gap-6" data-testid="document-detail">
        <div className="-mt-1 flex flex-wrap items-center gap-2 px-1">
          <Badge tone="accent">
            <Icon size={13} aria-hidden />
            {t.categories[document.category]}
          </Badge>
          {document.provider && (
            <span className="text-base text-fg-secondary">{document.provider}</span>
          )}
          {(ai('name') || ai('category')) && <AiMark />}
        </div>
        {document.aiFields.length > 0 && (
          <p
            className="-mt-2 flex items-start gap-2 px-1 text-sm text-fg-secondary"
            data-testid="ai-mark-hint"
          >
            <Sparkles size={15} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            {t.extract.markHint}
          </p>
        )}

        <div className="grid items-start gap-6 wide:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-6">
            <Section title={d.dates} testId="document-dates">
              {lastCancelDay && (
                <div
                  className="flex flex-col gap-1 rounded-lg bg-signal-soft px-4 py-3"
                  data-testid="document-cancel-by"
                >
                  <span className="text-sm font-medium text-signal-fg">{d.cancelBy}</span>
                  <span className="text-2xl font-semibold tracking-tight text-fg tabular-nums">
                    {formatDate(lastCancelDay)}
                    {lastCancelDay >= today && (
                      <span className="ml-2 text-base font-medium text-fg-secondary">
                        ({whenLabel(daysBetween(today, lastCancelDay))})
                      </span>
                    )}
                  </span>
                  {document.notice && document.termEnd && (
                    <span className="text-sm text-fg-secondary">
                      {d.cancelByCalc(
                        t.notice(document.notice.amount, document.notice.unit),
                        formatDate(document.termEnd),
                      )}
                    </span>
                  )}
                </div>
              )}
              {missed && <Note icon={CircleAlert}>{d.cancelMissed}</Note>}
              {passed && <Note icon={CircleAlert}>{d.termEndPassed}</Note>}
              <dl className="flex flex-col gap-3">
                <Row label={d.nextPayment} testId="document-next-payment" ai={ai('dueDate')}>
                  {payment ? formatDate(payment) : d.missing}
                </Row>
                <Row label={d.termEnd} testId="document-term-end-value" ai={ai('termEnd')}>
                  {document.termEnd ? formatDate(document.termEnd) : d.missing}
                </Row>
                <Row label={d.noticePeriod} ai={ai('noticePeriod')}>
                  {document.noticePeriod ?? d.missing}
                </Row>
              </dl>
              {!lastCancelDay && (document.noticePeriod || document.termEnd) && (
                <p className="text-sm text-fg-muted">{d.noCalc}</p>
              )}
              <p className="text-sm text-fg-muted" data-testid="document-check-original">
                {d.checkOriginal}
              </p>
            </Section>

            <Section title={d.overview} testId="document-overview">
              <dl className="flex flex-col gap-3">
                <Row
                  label={d.amount}
                  testId="document-amount-value"
                  ai={ai('amount') || ai('interval')}
                >
                  {document.amount !== undefined ? (
                    <>
                      {formatEuro(document.amount)}
                      {document.interval && ` ${t.intervals[document.interval]}`}
                      {cost.monthly > 0 && document.interval !== 'monthly' && (
                        <span className="text-fg-secondary">
                          {' '}
                          · {t.perMonth(formatEuro(cost.monthly))}
                        </span>
                      )}
                    </>
                  ) : (
                    d.missing
                  )}
                </Row>
                <Row label={t.fields.provider} ai={ai('provider')}>
                  {document.provider ?? d.missing}
                </Row>
              </dl>
            </Section>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {document.summary.length > 0 && (
              <Section title={d.summary} testId="document-summary-list">
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-base text-fg">
                  {document.summary.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </Section>
            )}
            {document.openPoints.length > 0 && (
              <Section title={d.openPoints} testId="document-open-points-list">
                <ul className="flex flex-col gap-2">
                  {document.openPoints.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-base text-fg">
                      <CircleHelp
                        size={18}
                        aria-hidden
                        className="mt-0.5 shrink-0 text-signal-fg"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {document.notes && (
              <Section title={d.notes} testId="document-notes-text">
                <p className="text-base whitespace-pre-line text-fg">{document.notes}</p>
              </Section>
            )}
            <Section title={d.files} testId="document-files">
              <FileTiles
                document={document}
                onExtract={aiEnabled ? (fileId) => setExtracting({ fileId }) : undefined}
              />
            </Section>
          </div>
        </div>
      </div>

      {editing && <DocumentEditor document={document} onClose={() => setEditing(false)} />}
      {extracting && (
        <ExtractPanel
          document={document}
          fileId={extracting.fileId}
          placeholderName={extracting.placeholder}
          onClose={() => setExtracting(null)}
        />
      )}
      {exporting && (
        <CalendarDialog documents={[document]} today={today} onClose={() => setExporting(false)} />
      )}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          const name = document.name;
          await documentActions.remove(document.id);
          toast.success(t.toastDeleted(name));
          void navigate('/documents');
        }}
        title={d.removeTitle}
        message={d.removeText(document.files.length)}
        confirmLabel={d.remove}
        variant="danger"
      />
    </Page>
  );
}
