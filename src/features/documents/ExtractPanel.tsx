import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, ShieldAlert, Sparkles } from 'lucide-react';
import { Button, cn, Select, Spinner, toast, type SelectOption } from '@/components/ui';
import { EditPanel } from '@/app/shell/EditPanel';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import {
  AI_MARK,
  changedFields,
  defaultFields,
  type ContractExtraction,
  type ExtractField,
} from '@/core/documents/extract';
import { formatDate, formatEuro } from '@/core/format';
import type { DocumentCategory } from '@/data/domain';
import { documentActions } from '@/data/repositories';
import type { DocumentRecord } from '@/data/schemas';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { AiError, extractContractWithAi } from '@/services/ai';
import { ContractSourceError, prepareContractSource } from '@/services/contractSource';

const t = de.documents;
const x = t.extract;

const FIELD_LABELS: Record<ExtractField, string> = {
  name: t.fields.name,
  category: t.fields.category,
  provider: t.fields.provider,
  amount: t.fields.amount,
  interval: t.fields.interval,
  dueDate: t.fields.dueDate,
  termEnd: t.fields.termEnd,
  noticePeriod: t.detail.noticePeriod,
};

type Extraction = ContractExtraction<DocumentCategory>;

type Step =
  | { step: 'confirm' }
  | { step: 'reading' }
  | {
      step: 'review';
      extraction: Extraction;
      fields: ExtractField[];
      summary: boolean;
      openPoints: boolean;
    }
  | { step: 'error'; message: string };

function fieldValue(
  field: ExtractField,
  source: Pick<DocumentRecord, ExtractField> | Extraction,
): string | null {
  switch (field) {
    case 'category':
      return source.category ? t.categories[source.category] : null;
    case 'amount':
      return source.amount !== undefined ? formatEuro(source.amount) : null;
    case 'interval':
      return source.interval ? t.intervals[source.interval] : null;
    case 'dueDate':
    case 'termEnd': {
      const date = source[field];
      return date ? formatDate(date) : null;
    }
    default:
      return source[field] ?? null;
  }
}

function CheckRow({
  checked,
  onChange,
  label,
  children,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  children?: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'focus-ring flex min-h-11 w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
      )}
      data-testid={testId}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2',
          checked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
        )}
      >
        {checked && <Check size={16} strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm text-fg-secondary">{label}</span>
        {children}
      </span>
    </button>
  );
}

function toggle<T>(list: T[], item: T, on: boolean): T[] {
  return on ? [...list, item] : list.filter((entry) => entry !== item);
}

/**
 * Reads a contract from one original with Claude: warning and explicit tap first, then
 * the fields to choose from. Nothing is taken over without "Übernehmen".
 */
export function ExtractPanel({
  document,
  fileId,
  placeholderName,
  onClose,
}: {
  document: DocumentRecord;
  fileId?: string;
  /** The contract was just created from this original and still has its file name. */
  placeholderName?: string;
  onClose: () => void;
}) {
  const today = useLocalDate();
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);
  const [selected, setSelected] = useState(fileId ?? document.files[0]?.id ?? '');
  const [state, setState] = useState<Step>({ step: 'confirm' });
  const [saving, setSaving] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const fileOptions: SelectOption<string>[] = document.files.map((file) => ({
    value: file.id,
    label: file.name,
  }));

  const send = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setState({ step: 'reading' });
    try {
      let blob: Blob;
      try {
        blob = await documentActions.readFile(document.id, selected);
      } catch {
        throw new Error(x.failed);
      }
      const source = await prepareContractSource(blob);
      const { extraction } = await extractContractWithAi(
        { enabled: aiEnabled, model: aiModel },
        { today, source },
        { signal: current.signal },
      );
      if (current.signal.aborted) return;
      setState({
        step: 'review',
        extraction,
        fields: defaultFields(document, extraction, placeholderName),
        summary: extraction.summary.length > 0 && document.summary.length === 0,
        openPoints: extraction.openPoints.length > 0,
      });
    } catch (error: unknown) {
      if (current.signal.aborted) return;
      let message: string = x.failed;
      if (error instanceof AiError) message = de.settings.ai.errors[error.code];
      else if (error instanceof ContractSourceError) message = x[error.reason];
      setState({ step: 'error', message });
    }
  };

  const cancel = () => {
    controller.current?.abort();
    onClose();
  };

  const apply = async () => {
    if (state.step !== 'review') return;
    setSaving(true);
    try {
      await documentActions.applyExtraction(document.id, state.extraction, {
        fields: state.fields,
        summary: state.summary,
        openPoints: state.openPoints,
      });
      toast.success(x.applied);
      onClose();
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const review = state.step === 'review' ? state : null;
  const offered = review ? changedFields(document, review.extraction) : [];
  const nothing =
    review !== null &&
    offered.length === 0 &&
    review.extraction.summary.length === 0 &&
    review.extraction.openPoints.length === 0;
  const anything =
    review !== null && (review.fields.length > 0 || review.summary || review.openPoints);

  const footer = (
    <>
      <Button variant="ghost" onClick={cancel}>
        {t.cancel}
      </Button>
      {state.step === 'confirm' && (
        <Button
          icon={Sparkles}
          onClick={() => void send()}
          disabled={!selected}
          data-testid="extract-send"
        >
          {x.send}
        </Button>
      )}
      {state.step === 'error' && (
        <Button icon={Sparkles} onClick={() => void send()} data-testid="extract-retry">
          {x.retry}
        </Button>
      )}
      {review && !nothing && (
        <Button
          onClick={() => void apply()}
          loading={saving}
          disabled={!anything}
          data-testid="extract-apply"
        >
          {x.apply}
        </Button>
      )}
    </>
  );

  return (
    <EditPanel open onClose={cancel} title={review ? x.reviewTitle : x.title} footer={footer}>
      <div className="flex flex-col gap-5" data-testid="extract-panel">
        {state.step === 'confirm' && (
          <>
            {fileOptions.length > 1 && (
              <Select
                label={x.chooseFile}
                options={fileOptions}
                value={selected}
                onChange={setSelected}
                data-testid="extract-file"
              />
            )}
            <div
              className="flex items-start gap-3 rounded-lg bg-warning-soft px-4 py-3"
              data-testid="extract-warning"
            >
              <ShieldAlert size={22} aria-hidden className="mt-0.5 shrink-0 text-warning" />
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold text-fg">{x.warnTitle}</p>
                <p className="text-base text-fg">{x.warn}</p>
                <p className="text-sm text-fg-secondary">{x.howTo}</p>
              </div>
            </div>
            <p className="text-sm text-fg-secondary">{x.sends(aiModel)}</p>
          </>
        )}

        {state.step === 'reading' && (
          <div className="flex flex-col items-center gap-3 py-10 text-center" aria-live="polite">
            <Spinner />
            <p className="text-base font-medium text-fg">{x.reading}</p>
            <p className="text-sm text-fg-muted">{x.readingHint}</p>
          </div>
        )}

        {state.step === 'error' && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
            data-testid="extract-error"
          >
            <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
            {state.message}
          </p>
        )}

        {review && (
          <>
            <p className="text-sm text-fg-secondary">{x.reviewHint}</p>
            {nothing && <p className="text-base text-fg">{x.nothing}</p>}
            {offered.length > 0 && (
              <div className="flex flex-col gap-2" data-testid="extract-fields">
                {offered.map((field) => {
                  // "Sonstiges" and the file name are not worth mentioning.
                  const placeholder =
                    (field === 'category' && document.category === 'other') ||
                    (field === 'name' && document.name === placeholderName);
                  const before = placeholder ? null : fieldValue(field, document);
                  return (
                    <CheckRow
                      key={field}
                      label={FIELD_LABELS[field]}
                      checked={review.fields.includes(field)}
                      onChange={(on) =>
                        setState({ ...review, fields: toggle(review.fields, field, on) })
                      }
                      testId={`extract-field-${field}`}
                    >
                      <span className="text-base font-medium break-words text-fg">
                        {fieldValue(field, review.extraction)}
                      </span>
                      {before && <span className="text-sm text-fg-muted">{x.before(before)}</span>}
                    </CheckRow>
                  );
                })}
              </div>
            )}
            {review.extraction.summary.length > 0 && (
              <CheckRow
                label={document.summary.length > 0 ? x.summaryReplace : x.summary}
                checked={review.summary}
                onChange={(on) => setState({ ...review, summary: on })}
                testId="extract-summary"
              >
                <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-fg">
                  {review.extraction.summary.map((point) => (
                    <li key={point}>
                      {point} <span className="text-fg-muted">{AI_MARK}</span>
                    </li>
                  ))}
                </ul>
              </CheckRow>
            )}
            {review.extraction.openPoints.length > 0 && (
              <CheckRow
                label={x.openPoints}
                checked={review.openPoints}
                onChange={(on) => setState({ ...review, openPoints: on })}
                testId="extract-open-points"
              >
                <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-fg">
                  {review.extraction.openPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </CheckRow>
            )}
            {review.extraction.removed > 0 && (
              <p className="text-sm text-fg-muted" data-testid="extract-removed">
                {x.removed(review.extraction.removed)}
              </p>
            )}
          </>
        )}
      </div>
    </EditPanel>
  );
}
