import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CircleAlert, ListChecks, Sparkles } from 'lucide-react';
import { Badge, Button, cn, Select, Textarea, toast, type SelectOption } from '@/components/ui';
import { EditPanel } from '@/app/shell/EditPanel';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { formatDate } from '@/core/format';
import { sameTitle } from '@/core/library/library';
import { parseList, withoutFutureDate, type ListItem } from '@/core/library/list';
import { LIBRARY_TYPES, type LibraryType } from '@/data/domain';
import { LIBRARY_LIST_MAX_CHARS } from '@/data/prompts/library';
import { libraryActions } from '@/data/repositories';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { AiError, parseLibraryListWithAi, type AiErrorCode } from '@/services/ai';
import { TYPE_ICONS, useLibraryEntries } from './useLibrary';

const t = de.library;
const i = t.import;

const TYPE_OPTIONS: SelectOption<LibraryType>[] = LIBRARY_TYPES.map((value) => ({
  value,
  label: t.types[value],
}));

interface Row {
  key: string;
  item: ListItem;
  include: boolean;
  duplicate: boolean;
}

type Preview = { rows: Row[]; skipped: number; byClaude: boolean };

function RowItem({
  row,
  onToggle,
  onType,
}: {
  row: Row;
  onToggle: () => void;
  onType: (type: LibraryType) => void;
}) {
  const Icon = TYPE_ICONS[row.item.type];
  const details = [
    row.item.author,
    row.item.consumedAt ? formatDate(row.item.consumedAt) : undefined,
    ...row.item.topics.map((topic) => `#${topic}`),
  ].filter(Boolean);
  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-lg border border-line p-3 transition-opacity',
        !row.include && 'opacity-60',
      )}
      data-testid="import-row"
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={row.include}
        aria-label={i.include(row.item.title)}
        onClick={onToggle}
        className={cn(
          'focus-ring flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors',
          row.include
            ? 'border-accent bg-accent text-on-accent'
            : 'border-line-strong bg-surface text-transparent',
        )}
        data-testid="import-include"
      >
        <Check size={18} aria-hidden />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-base font-medium break-words text-fg">
          <Icon size={16} aria-hidden className="shrink-0 text-accent" />
          {row.item.title}
        </span>
        {details.length > 0 && (
          <span className="text-sm break-words text-fg-secondary">{details.join(' · ')}</span>
        )}
        {row.item.link && <span className="truncate text-sm text-fg-muted">{row.item.link}</span>}
        {row.duplicate && (
          <Badge tone="signal" className="self-start">
            {i.duplicate}
          </Badge>
        )}
      </div>
      <div className="w-32 shrink-0">
        <Select
          aria-label={i.typeFor(row.item.title)}
          options={TYPE_OPTIONS}
          value={row.item.type}
          onChange={onType}
          data-testid="import-type"
        />
      </div>
    </li>
  );
}

/** "Vergangenes in einem Rutsch nachtragen": a list → preview → entries. */
export function ImportPanel({ onClose }: { onClose: () => void }) {
  const today = useLocalDate();
  const entries = useLibraryEntries();
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);
  const [text, setText] = useState('');
  const [defaultType, setDefaultType] = useState<LibraryType>('book');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiError, setAiError] = useState<AiErrorCode | 'TOO_LONG' | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const toRows = (items: ListItem[]): Row[] =>
    items.map((item, index) => {
      const duplicate = entries.some((entry) => sameTitle(entry.title, item.title));
      return { key: `${index}:${item.title}`, item, include: !duplicate, duplicate };
    });

  const recognize = () => {
    const parsed = parseList(text, defaultType);
    setAiError(null);
    setPreview({
      rows: toRows(parsed.items.map((item) => withoutFutureDate(item, today))),
      skipped: parsed.skipped,
      byClaude: false,
    });
  };

  const withClaude = async () => {
    if (text.length > LIBRARY_LIST_MAX_CHARS) {
      setAiError('TOO_LONG');
      return;
    }
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setWorking(true);
    setAiError(null);
    try {
      const result = await parseLibraryListWithAi(
        { enabled: aiEnabled, model: aiModel },
        { text, defaultType, today },
        { signal: current.signal },
      );
      if (current.signal.aborted) return;
      setPreview({
        rows: toRows(result.entries.map((entry) => ({ ...entry, line: '' }))),
        skipped: 0,
        byClaude: true,
      });
    } catch (error: unknown) {
      if (current.signal.aborted) return;
      setAiError(error instanceof AiError ? error.code : 'API_ERROR');
    } finally {
      if (!current.signal.aborted) setWorking(false);
    }
  };

  const update = (key: string, change: (row: Row) => Row) =>
    setPreview((current) =>
      current
        ? { ...current, rows: current.rows.map((row) => (row.key === key ? change(row) : row)) }
        : current,
    );

  const chosen = useMemo(() => preview?.rows.filter((row) => row.include) ?? [], [preview]);

  const apply = async () => {
    if (chosen.length === 0) return;
    setSaving(true);
    try {
      await libraryActions.createMany(
        chosen.map(({ item }) => ({
          title: item.title,
          type: item.type,
          author: item.author,
          link: item.link,
          consumedAt: item.consumedAt,
          topics: item.topics,
        })),
      );
      toast.success(i.applied(chosen.length));
      onClose();
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const footer = preview ? (
    <>
      <Button variant="ghost" onClick={() => setPreview(null)} data-testid="import-back">
        {i.back}
      </Button>
      <Button
        icon={ListChecks}
        onClick={() => void apply()}
        loading={saving}
        disabled={chosen.length === 0}
        data-testid="import-apply"
      >
        {i.apply(chosen.length)}
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>
        {t.cancel}
      </Button>
      <Button onClick={recognize} disabled={!text.trim()} data-testid="import-recognize">
        {i.recognize}
      </Button>
    </>
  );

  return (
    <EditPanel open onClose={onClose} title={i.title} footer={footer}>
      <div className="flex flex-col gap-5" data-testid="library-import">
        {!preview ? (
          <>
            <p className="text-sm text-fg-secondary">{i.intro}</p>
            <Textarea
              label={i.label}
              placeholder={i.placeholder}
              value={text}
              rows={8}
              maxHeight={420}
              onChange={(event) => setText(event.target.value)}
              data-testid="import-text"
            />
            <Select
              label={i.defaultType}
              options={TYPE_OPTIONS}
              value={defaultType}
              onChange={setDefaultType}
              data-testid="import-default-type"
            />
            {aiEnabled && (
              <div className="flex flex-col gap-2 rounded-lg border border-line p-4">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Sparkles}
                  loading={working}
                  disabled={!text.trim()}
                  onClick={() => void withClaude()}
                  className="self-start"
                  data-testid="import-claude"
                >
                  {working ? i.working : i.withClaude}
                </Button>
                <p className="text-sm text-fg-muted">{i.withClaudeHint}</p>
              </div>
            )}
            {aiError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
                data-testid="import-error"
              >
                <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
                {aiError === 'TOO_LONG' ? i.tooLong : de.settings.ai.errors[aiError]}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium text-fg" data-testid="import-count">
                {i.preview(preview.rows.length)}
              </p>
              {preview.skipped > 0 && (
                <p className="text-sm text-fg-muted">{i.skipped(preview.skipped)}</p>
              )}
              {preview.byClaude && (
                <p className="flex items-center gap-2 text-sm text-fg-secondary">
                  <Sparkles size={14} aria-hidden className="text-accent" />
                  {i.byClaude}
                </p>
              )}
            </div>
            {preview.rows.length === 0 ? (
              <p className="text-base text-fg-secondary">{i.none}</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="import-rows">
                {preview.rows.map((row) => (
                  <RowItem
                    key={row.key}
                    row={row}
                    onToggle={() => update(row.key, (r) => ({ ...r, include: !r.include }))}
                    onType={(type) => update(row.key, (r) => ({ ...r, item: { ...r.item, type } }))}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </EditPanel>
  );
}
