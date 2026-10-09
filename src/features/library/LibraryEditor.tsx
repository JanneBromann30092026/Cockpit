import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert, Sparkles } from 'lucide-react';
import {
  Button,
  Input,
  Select,
  TagInput,
  Textarea,
  toast,
  type SelectOption,
} from '@/components/ui';
import { EditPanel } from '@/app/shell/EditPanel';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { topicCounts } from '@/core/library/library';
import { LIBRARY_TYPES, type LibraryType } from '@/data/domain';
import { libraryActions } from '@/data/repositories';
import { LIMITS, type LibraryEntry } from '@/data/schemas';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { AiError, libraryKeyPointsWithAi, type AiErrorCode } from '@/services/ai';
import { useLibraryEntries } from './useLibrary';

const t = de.library;
const f = t.fields;

const TYPE_OPTIONS: SelectOption<LibraryType>[] = LIBRARY_TYPES.map((value) => ({
  value,
  label: t.types[value],
}));

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function validLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** New library entry or editing one. */
export function LibraryEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry?: LibraryEntry;
  onClose: () => void;
  onSaved?: (entry: LibraryEntry) => void;
}) {
  const today = useLocalDate();
  const all = useLibraryEntries();
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [type, setType] = useState<LibraryType>(entry?.type ?? 'book');
  const [author, setAuthor] = useState(entry?.author ?? '');
  const [link, setLink] = useState(entry?.link ?? '');
  const [consumedAt, setConsumedAt] = useState(entry?.consumedAt ?? (entry ? '' : today));
  const [topics, setTopics] = useState<string[]>(entry?.topics ?? []);
  const [keyPoints, setKeyPoints] = useState(
    (entry?.keyPoints ?? []).map((point) => point.text).join('\n'),
  );
  // Texts phrased by Claude; a point keeps the mark only while it stays unchanged.
  const [claudeTexts, setClaudeTexts] = useState(
    () =>
      new Set(
        (entry?.keyPoints ?? []).filter((point) => point.byClaude).map((point) => point.text),
      ),
  );
  const [thoughts, setThoughts] = useState(entry?.thoughts ?? '');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phrasing, setPhrasing] = useState(false);
  const [aiError, setAiError] = useState<AiErrorCode | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const suggestions = useMemo(
    () =>
      topicCounts(all)
        .map((topic) => topic.topic)
        .slice(0, 12),
    [all],
  );
  const pointLines = lines(keyPoints);
  const tooManyPoints = pointLines.length > LIMITS.items;
  const missingTitle = title.trim() === '';
  const linkInvalid = link.trim() !== '' && !validLink(link.trim());
  const claudeCount = pointLines.filter((line) => claudeTexts.has(line)).length;

  const phrase = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPhrasing(true);
    setAiError(null);
    try {
      const result = await libraryKeyPointsWithAi(
        { enabled: aiEnabled, model: aiModel },
        {
          title: title.trim() || '–',
          type: t.types[type],
          ...(author.trim() ? { author: author.trim() } : {}),
          thoughts: thoughts.trim(),
        },
        { signal: current.signal },
      );
      if (current.signal.aborted) return;
      const fresh = result.points.filter((point) => !pointLines.includes(point));
      if (fresh.length === 0) {
        toast.info(f.fromThoughtsNone);
        return;
      }
      const room = fresh.slice(0, Math.max(0, LIMITS.items - pointLines.length));
      setKeyPoints([...pointLines, ...room].join('\n'));
      setClaudeTexts((previous) => new Set([...previous, ...room]));
      toast.success(f.fromThoughtsAdded(room.length));
    } catch (error: unknown) {
      if (current.signal.aborted) return;
      setAiError(error instanceof AiError ? error.code : 'API_ERROR');
    } finally {
      if (!current.signal.aborted) setPhrasing(false);
    }
  };

  const save = async () => {
    setTouched(true);
    if (missingTitle || linkInvalid || tooManyPoints) return;
    setSaving(true);
    const fields = {
      title: title.trim(),
      type,
      author: author.trim() || undefined,
      link: link.trim() || undefined,
      consumedAt: consumedAt || undefined,
      topics,
      keyPoints: pointLines.map((text) => ({ text, byClaude: claudeTexts.has(text) })),
      thoughts: thoughts.trim() || undefined,
    };
    try {
      const record = entry
        ? await libraryActions.edit(entry.id, fields)
        : await libraryActions.create(fields);
      toast.success(entry ? t.toastSaved : t.toastAdded(record.title));
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
      title={entry ? t.editTitle : t.add}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={() => void save()} loading={saving} data-testid="library-save">
            {t.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5" data-testid="library-editor">
        <Input
          label={f.title}
          placeholder={f.titlePlaceholder}
          value={title}
          maxLength={LIMITS.title}
          onChange={(event) => setTitle(event.target.value)}
          error={touched && missingTitle ? t.required : undefined}
          autoFocus={!entry}
          data-testid="library-title"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={f.type}
            options={TYPE_OPTIONS}
            value={type}
            onChange={setType}
            data-testid="library-type"
          />
          <Input
            type="date"
            label={f.consumedAt}
            value={consumedAt}
            max={today}
            onChange={(event) => setConsumedAt(event.target.value)}
            data-testid="library-consumed"
          />
        </div>
        <Input
          label={f.author}
          placeholder={f.authorPlaceholder}
          value={author}
          maxLength={LIMITS.name}
          onChange={(event) => setAuthor(event.target.value)}
          data-testid="library-author"
        />
        <Input
          label={f.link}
          placeholder={f.linkPlaceholder}
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={link}
          maxLength={LIMITS.url}
          onChange={(event) => setLink(event.target.value)}
          error={touched && linkInvalid ? f.linkInvalid : undefined}
          data-testid="library-link"
        />
        <TagInput
          label={f.topics}
          value={topics}
          onChange={setTopics}
          placeholder={f.topicsPlaceholder}
          suggestions={suggestions.filter(
            (topic) => !topics.some((chosen) => chosen.toLowerCase() === topic.toLowerCase()),
          )}
          suggestionsLabel={f.topicsSuggestions}
          removeLabel={f.removeTopic}
        />
        <div className="flex flex-col gap-2">
          <Textarea
            label={f.keyPoints}
            hint={
              claudeCount > 0
                ? `${f.keyPointsHint} · ${claudeCount} ${f.claudePoint}`
                : f.keyPointsHint
            }
            value={keyPoints}
            onChange={(event) => setKeyPoints(event.target.value)}
            error={tooManyPoints ? f.keyPointsTooMany : undefined}
            data-testid="library-key-points"
          />
        </div>
        <Textarea
          label={f.thoughts}
          placeholder={f.thoughtsPlaceholder}
          value={thoughts}
          maxLength={LIMITS.notes}
          onChange={(event) => setThoughts(event.target.value)}
          data-testid="library-thoughts"
        />
        {aiEnabled && (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-4">
            <Button
              size="sm"
              variant="secondary"
              icon={Sparkles}
              loading={phrasing}
              disabled={!thoughts.trim()}
              onClick={() => void phrase()}
              className="self-start"
              data-testid="library-from-thoughts"
            >
              {phrasing ? f.fromThoughtsWorking : f.fromThoughts}
            </Button>
            <p className="text-sm text-fg-muted">{f.fromThoughtsHint}</p>
            {aiError && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
                data-testid="library-from-thoughts-error"
              >
                <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
                {de.settings.ai.errors[aiError]}
              </p>
            )}
          </div>
        )}
      </div>
    </EditPanel>
  );
}
