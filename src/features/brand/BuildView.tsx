import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  CircleAlert,
  Copy,
  FileText,
  Save,
  Share2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import {
  Badge,
  Button,
  ChoiceChip,
  IconButton,
  Input,
  Surface,
  Textarea,
  toast,
} from '@/components/ui';
import { avoidedWordsIn } from '@/core/brand/profile';
import { formatDate } from '@/core/format';
import { buildTemplate } from '@/data/brand/templates';
import { BRAND_DRAFT_KINDS, type BrandDraftKind } from '@/data/domain';
import { brandActions } from '@/data/repositories';
import type { BrandDraft, BrandProfile } from '@/data/schemas';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { AiError, brandWriteWithAi, type AiErrorCode } from '@/services/ai';
import { shareText } from '@/services/share';
import { spring } from '@/styles/motion';
import { brandWriteRequest } from './brandKit';

const t = de.brand.build;

interface Result {
  kind: BrandDraftKind;
  topic: string;
  text: string;
  byClaude: boolean;
}

function DraftRow({ draft, onOpen }: { draft: BrandDraft; onOpen: () => void }) {
  return (
    <li
      className="flex items-center gap-3 rounded-lg border border-line p-3"
      data-testid="brand-draft"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
        <FileText size={18} aria-hidden />
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="focus-ring flex min-h-11 min-w-0 flex-1 flex-col rounded-md text-left"
      >
        <span className="truncate text-base font-medium text-fg">{draft.topic}</span>
        <span className="text-sm text-fg-secondary">
          {t.kinds[draft.kind]} · {formatDate(draft.createdAt.slice(0, 10))}
          {draft.byClaude ? ` · ${t.byClaude}` : ''}
        </span>
      </button>
      <IconButton
        icon={Trash2}
        label={t.deleteDraft}
        onClick={() => void brandActions.removeDraft(draft.id).then(() => toast.success(t.deleted))}
      />
    </li>
  );
}

/** Texts in the profile's voice: a template with [placeholders] or written by Claude. */
export function BuildView({ profile }: { profile: BrandProfile | undefined }) {
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);
  const [kind, setKind] = useState<BrandDraftKind>('video');
  const [topic, setTopic] = useState('');
  const [details, setDetails] = useState('');
  const [cta, setCta] = useState('');
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [working, setWorking] = useState(false);
  const [aiError, setAiError] = useState<AiErrorCode | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const avoided = useMemo(
    () => (result ? avoidedWordsIn(result.text, profile?.wordsAvoided ?? []) : []),
    [result, profile],
  );
  const missingTopic = !topic.trim();
  const brief = {
    topic: topic.trim(),
    ...(details.trim() ? { details: details.trim() } : {}),
    ...(cta.trim() ? { cta: cta.trim() } : {}),
  };

  const template = () => {
    setTouched(true);
    if (missingTopic) return;
    setAiError(null);
    setResult({
      kind,
      topic: brief.topic,
      byClaude: false,
      text: buildTemplate(kind, brief, {
        answers: profile?.answers ?? {},
        tone: profile?.tone,
        values: profile?.values ?? [],
        wordsUsed: profile?.wordsUsed ?? [],
        wordsAvoided: profile?.wordsAvoided ?? [],
        examples: profile?.examples ?? [],
      }),
    });
  };

  const withClaude = async () => {
    setTouched(true);
    if (missingTopic) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setWorking(true);
    setAiError(null);
    try {
      const written = await brandWriteWithAi(
        { enabled: aiEnabled, model: aiModel },
        brandWriteRequest(profile, { kind, ...brief }),
        { signal: current.signal },
      );
      if (current.signal.aborted) return;
      setResult({ kind, topic: brief.topic, text: written.text, byClaude: true });
    } catch (error: unknown) {
      if (current.signal.aborted) return;
      setAiError(error instanceof AiError ? error.code : 'API_ERROR');
    } finally {
      if (!current.signal.aborted) setWorking(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      toast.success(t.copied);
    } catch {
      toast.error(de.brand.profile.copyFailed);
    }
  };

  const share = async () => {
    if (!result) return;
    const outcome = await shareText(result.text, result.topic);
    if (outcome === 'unsupported') await copy();
  };

  const save = async () => {
    if (!result) return;
    try {
      await brandActions.addDraft(result);
      toast.success(t.savedToast);
    } catch {
      toast.error(de.brand.profile.saveFailed);
    }
  };

  const drafts = profile?.drafts ?? [];

  return (
    <div className="flex flex-col gap-5" data-testid="brand-build">
      <Surface className="flex flex-col gap-4">
        <p className="text-base text-fg-secondary">{t.intro}</p>
        {!profile?.interviewDoneAt && <p className="text-sm text-signal-fg">{t.needsProfile}</p>}
        <div className="flex flex-wrap gap-2" role="group" aria-label={t.kindLabel}>
          {BRAND_DRAFT_KINDS.map((key) => (
            <ChoiceChip key={key} selected={kind === key} onToggle={() => setKind(key)}>
              {t.kinds[key]}
            </ChoiceChip>
          ))}
        </div>
        <Input
          label={t.topic}
          placeholder={t.topicPlaceholder}
          value={topic}
          maxLength={200}
          onChange={(event) => setTopic(event.target.value)}
          error={touched && missingTopic ? t.topicRequired : undefined}
          data-testid="brand-topic"
        />
        <Textarea
          label={t.details}
          placeholder={t.detailsPlaceholder}
          value={details}
          maxLength={5000}
          onChange={(event) => setDetails(event.target.value)}
          data-testid="brand-details"
        />
        <Input
          label={t.cta}
          placeholder={t.ctaPlaceholder}
          value={cta}
          maxLength={200}
          onChange={(event) => setCta(event.target.value)}
          data-testid="brand-cta"
        />
        <div className="flex flex-wrap gap-2">
          <Button icon={FileText} onClick={template} data-testid="brand-template">
            {t.template}
          </Button>
          {aiEnabled && (
            <Button
              variant="secondary"
              icon={Sparkles}
              loading={working}
              onClick={() => void withClaude()}
              data-testid="brand-write-claude"
            >
              {working ? t.claudeWorking : t.claude}
            </Button>
          )}
        </div>
        {aiEnabled && <p className="text-sm text-fg-muted">{t.claudeHint}</p>}
        {aiError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
            data-testid="brand-write-error"
          >
            <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
            {de.settings.ai.errors[aiError]}
          </p>
        )}
      </Surface>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
        >
          <Surface className="flex flex-col gap-3" data-testid="brand-result">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-lg font-semibold tracking-tight text-fg">
                {t.result} · {t.kinds[result.kind]}
              </h2>
              {result.byClaude && <Badge tone="accent">{t.byClaude}</Badge>}
            </div>
            {!result.byClaude && <p className="text-sm text-fg-muted">{t.placeholders}</p>}
            <Textarea
              aria-label={t.result}
              value={result.text}
              rows={12}
              maxHeight={640}
              onChange={(event) => setResult({ ...result, text: event.target.value })}
              data-testid="brand-result-text"
            />
            {avoided.length > 0 && (
              <p
                className="flex items-start gap-2 rounded-lg bg-warning-soft px-4 py-3 text-sm text-fg"
                data-testid="brand-avoided"
              >
                <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                {t.avoided(avoided.join(', '))}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={Copy} onClick={() => void copy()} data-testid="brand-copy">
                {t.copy}
              </Button>
              <Button size="sm" variant="secondary" icon={Share2} onClick={() => void share()}>
                {t.share}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={Save}
                onClick={() => void save()}
                data-testid="brand-save-draft"
              >
                {t.save}
              </Button>
            </div>
          </Surface>
        </motion.div>
      )}

      <Surface className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{t.drafts}</h2>
        {drafts.length === 0 ? (
          <p className="text-base text-fg-muted">{t.noDrafts}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="brand-drafts">
            {drafts.map((draft) => (
              <DraftRow
                key={draft.id}
                draft={draft}
                onOpen={() =>
                  setResult({
                    kind: draft.kind,
                    topic: draft.topic,
                    text: draft.text,
                    byClaude: draft.byClaude,
                  })
                }
              />
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
