import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button, Input, Select, Textarea, toast, type SelectOption } from '@/components/ui';
import { EditPanel } from '@/app/shell/EditPanel';
import { cancelBy, parseNotice } from '@/core/documents/contracts';
import { amountInput, formatDate, parseAmount } from '@/core/format';
import {
  DOCUMENT_CATEGORIES,
  NOTICE_UNITS,
  PAYMENT_INTERVALS,
  type DocumentCategory,
  type NoticeUnit,
  type PaymentInterval,
} from '@/data/domain';
import { documentActions } from '@/data/repositories';
import { LIMITS, type DocumentRecord } from '@/data/schemas';
import { de } from '@/i18n/de';

const t = de.documents;
const f = t.fields;

const CATEGORY_OPTIONS: SelectOption<DocumentCategory>[] = DOCUMENT_CATEGORIES.map((value) => ({
  value,
  label: t.categories[value],
}));

const INTERVAL_OPTIONS: SelectOption<PaymentInterval | ''>[] = [
  { value: '', label: f.noInterval },
  ...PAYMENT_INTERVALS.map((value) => ({ value, label: t.intervals[value] })),
];

const UNIT_OPTIONS: SelectOption<NoticeUnit | ''>[] = [
  { value: '', label: f.noNotice },
  ...NOTICE_UNITS.map((value) => ({ value, label: t.noticeUnits[value] })),
];

/** One entry per line, empty lines dropped. */
function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** New contract or editing one. Only facts from the contract – unknowns go to "Offene Punkte". */
export function DocumentEditor({
  document,
  onClose,
  onSaved,
}: {
  document?: DocumentRecord;
  onClose: () => void;
  onSaved?: (record: DocumentRecord) => void;
}) {
  const [name, setName] = useState(document?.name ?? '');
  const [category, setCategory] = useState<DocumentCategory>(document?.category ?? 'other');
  const [provider, setProvider] = useState(document?.provider ?? '');
  const [amount, setAmount] = useState(amountInput(document?.amount));
  const [interval, setPaymentInterval] = useState<PaymentInterval | ''>(document?.interval ?? '');
  const [dueDate, setDueDate] = useState(document?.dueDate ?? '');
  const [termEnd, setTermEnd] = useState(document?.termEnd ?? '');
  const [noticePeriod, setNoticePeriod] = useState(document?.noticePeriod ?? '');
  const [noticeAmount, setNoticeAmount] = useState(String(document?.notice?.amount ?? ''));
  const [noticeUnit, setNoticeUnit] = useState<NoticeUnit | ''>(document?.notice?.unit ?? '');
  // Once the numbers were set by hand, the text no longer overwrites them.
  const [noticeTouched, setNoticeTouched] = useState(document?.notice !== undefined);
  const [summary, setSummary] = useState((document?.summary ?? []).join('\n'));
  const [openPoints, setOpenPoints] = useState((document?.openPoints ?? []).join('\n'));
  const [notes, setNotes] = useState(document?.notes ?? '');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedAmount = amount.trim() ? parseAmount(amount) : null;
  const amountInvalid = amount.trim() !== '' && parsedAmount === null;
  const summaryLines = lines(summary);
  const summaryInvalid = summaryLines.length > LIMITS.summaryPoints;
  const missingName = name.trim() === '';
  const noticeNumber = Number(noticeAmount);
  const notice =
    noticeUnit && Number.isInteger(noticeNumber) && noticeNumber >= 1 && noticeNumber <= 36
      ? { amount: noticeNumber, unit: noticeUnit }
      : undefined;
  const preview = cancelBy({ id: '', name, termEnd: termEnd || undefined, notice });

  const onNoticeText = (text: string) => {
    setNoticePeriod(text);
    if (noticeTouched) return;
    const parsed = parseNotice(text);
    setNoticeAmount(parsed ? String(parsed.amount) : '');
    setNoticeUnit(parsed?.unit ?? '');
  };

  const save = async () => {
    setTouched(true);
    if (missingName || amountInvalid || summaryInvalid) return;
    setSaving(true);
    const fields = {
      name: name.trim(),
      category,
      provider: provider.trim() || undefined,
      amount: parsedAmount ?? undefined,
      interval: interval || undefined,
      dueDate: dueDate || undefined,
      termEnd: termEnd || undefined,
      noticePeriod: noticePeriod.trim() || undefined,
      notice,
      summary: summaryLines,
      openPoints: lines(openPoints),
      notes: notes.trim() || undefined,
    };
    try {
      const record = document
        ? await documentActions.edit(document.id, fields)
        : await documentActions.create(fields);
      toast.success(document ? t.toastSaved : t.toastAdded(record.name));
      onSaved?.(record);
      onClose();
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditPanel
      open
      onClose={onClose}
      title={document ? t.editTitle : t.add}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={() => void save()} loading={saving} data-testid="document-save">
            {t.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5" data-testid="document-editor">
        <p className="flex items-start gap-2 rounded-lg bg-accent-soft px-4 py-3 text-sm text-fg">
          <ShieldAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          {f.privacy}
        </p>
        <Input
          label={f.name}
          placeholder={f.namePlaceholder}
          value={name}
          maxLength={LIMITS.name}
          onChange={(event) => setName(event.target.value)}
          error={touched && missingName ? t.required : undefined}
          autoFocus={!document}
          data-testid="document-name"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={f.category}
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={setCategory}
            data-testid="document-category"
          />
          <Input
            label={f.provider}
            value={provider}
            maxLength={LIMITS.name}
            onChange={(event) => setProvider(event.target.value)}
            data-testid="document-provider"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={f.amount}
            placeholder={f.amountPlaceholder}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={touched && amountInvalid ? t.amountInvalid : undefined}
            data-testid="document-amount"
          />
          <Select
            label={f.interval}
            options={INTERVAL_OPTIONS}
            value={interval}
            onChange={setPaymentInterval}
            data-testid="document-interval"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            type="date"
            label={f.dueDate}
            hint={f.dueDateHint}
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            data-testid="document-due"
          />
          <Input
            type="date"
            label={f.termEnd}
            hint={f.termEndHint}
            value={termEnd}
            onChange={(event) => setTermEnd(event.target.value)}
            data-testid="document-term-end"
          />
        </div>
        <Input
          label={f.noticePeriod}
          placeholder={f.noticePlaceholder}
          value={noticePeriod}
          maxLength={LIMITS.short}
          onChange={(event) => onNoticeText(event.target.value)}
          data-testid="document-notice-text"
        />
        <div className="flex flex-col gap-2 rounded-lg border border-line p-4">
          <span className="text-sm font-medium text-fg-secondary">{f.notice}</span>
          <div className="grid grid-cols-2 gap-3">
            <Input
              aria-label={f.noticeAmount}
              inputMode="numeric"
              value={noticeAmount}
              onChange={(event) => {
                setNoticeTouched(true);
                setNoticeAmount(event.target.value.replace(/\D/g, '').slice(0, 2));
              }}
              data-testid="document-notice-amount"
            />
            <Select
              aria-label={f.noticeUnit}
              options={UNIT_OPTIONS}
              value={noticeUnit}
              onChange={(value) => {
                setNoticeTouched(true);
                setNoticeUnit(value);
              }}
              data-testid="document-notice-unit"
            />
          </div>
          <p className="text-sm text-fg-muted" data-testid="document-notice-preview">
            {preview ? `${t.detail.cancelBy}: ${formatDate(preview)}` : f.noticeHint}
          </p>
        </div>
        <Textarea
          label={f.summary}
          hint={f.summaryHint}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          error={summaryInvalid ? f.summaryHint : undefined}
          data-testid="document-summary"
        />
        <Textarea
          label={f.openPoints}
          hint={f.openPointsHint}
          value={openPoints}
          onChange={(event) => setOpenPoints(event.target.value)}
          data-testid="document-open-points"
        />
        <Textarea
          label={f.notes}
          value={notes}
          maxLength={LIMITS.notes}
          onChange={(event) => setNotes(event.target.value)}
          data-testid="document-notes"
        />
      </div>
    </EditPanel>
  );
}
