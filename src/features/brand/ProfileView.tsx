import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CircleAlert, Copy, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Surface, TagInput, Textarea, toast } from '@/components/ui';
import { EditPanel } from '@/app/shell/EditPanel';
import type { BrandAiField } from '@/data/domain';
import { brandActions } from '@/data/repositories';
import type { BrandProfile } from '@/data/schemas';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { AiError, brandProfileWithAi, type AiErrorCode } from '@/services/ai';
import { brandKitText, brandProfileRequest } from './brandKit';

const t = de.brand.profile;

function Part({
  title,
  ai,
  children,
  testId,
}: {
  title: string;
  ai?: boolean;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
        {title}
        {ai && <span className="ml-2 normal-case text-accent">{t.claudeMark}</span>}
      </h3>
      {children}
    </div>
  );
}

function Chips({ items, tone }: { items: readonly string[]; tone?: 'signal' | 'danger' }) {
  if (items.length === 0) return <p className="text-base text-fg-muted">{t.empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} tone={tone ?? 'accent'} className="h-auto min-h-8 py-1 text-sm">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function ProfileEditor({ profile, onClose }: { profile: BrandProfile; onClose: () => void }) {
  const [tone, setTone] = useState(profile.tone ?? '');
  const [values, setValues] = useState<string[]>(profile.values);
  const [wordsUsed, setWordsUsed] = useState<string[]>(profile.wordsUsed);
  const [wordsAvoided, setWordsAvoided] = useState<string[]>(profile.wordsAvoided);
  const [examples, setExamples] = useState(profile.examples.join('\n'));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await brandActions.edit({
        tone: tone.trim() || undefined,
        values,
        wordsUsed,
        wordsAvoided,
        examples: examples
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 3),
      });
      toast.success(t.saved);
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
      title={t.editTitle}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={() => void save()} loading={saving} data-testid="brand-profile-save">
            {t.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5" data-testid="brand-profile-editor">
        <Textarea
          label={t.tone}
          placeholder={t.tonePlaceholder}
          value={tone}
          maxLength={5000}
          onChange={(event) => setTone(event.target.value)}
          data-testid="brand-tone"
        />
        <TagInput
          label={t.values}
          value={values}
          onChange={setValues}
          placeholder={t.listHint}
          removeLabel={t.remove}
        />
        <TagInput
          label={t.wordsUsed}
          value={wordsUsed}
          onChange={setWordsUsed}
          placeholder={t.listHint}
          removeLabel={t.remove}
        />
        <TagInput
          label={t.wordsAvoided}
          value={wordsAvoided}
          onChange={setWordsAvoided}
          placeholder={t.listHint}
          removeLabel={t.remove}
        />
        <Textarea
          label={t.examples}
          hint={t.examplesHint}
          value={examples}
          onChange={(event) => setExamples(event.target.value)}
          data-testid="brand-examples"
        />
      </div>
    </EditPanel>
  );
}

/** Tone, values, words and example sentences – with editing, Claude and the kit as text. */
export function ProfileView({ profile }: { profile: BrandProfile }) {
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);
  const [editing, setEditing] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [working, setWorking] = useState(false);
  const [aiError, setAiError] = useState<AiErrorCode | null>(null);
  const controller = useRef<AbortController | null>(null);
  const ai = (field: BrandAiField) => profile.aiFields.includes(field);

  useEffect(() => () => controller.current?.abort(), []);

  const withClaude = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setWorking(true);
    setAiError(null);
    try {
      const { profile: result } = await brandProfileWithAi(
        { enabled: aiEnabled, model: aiModel },
        brandProfileRequest(profile),
        { signal: current.signal },
      );
      if (current.signal.aborted) return;
      const fields: BrandAiField[] = ['tone', 'values', 'wordsUsed', 'wordsAvoided', 'examples'];
      const colors = result.palette ?? profile.design?.colors;
      const design = colors
        ? {
            colors,
            headingFont: result.headingFont ?? profile.design?.headingFont ?? 'avenir',
            bodyFont: result.bodyFont ?? profile.design?.bodyFont ?? 'inter',
            radius: profile.design?.radius ?? 'soft',
          }
        : undefined;
      const designByClaude = Boolean(result.palette || result.headingFont || result.bodyFont);
      await brandActions.applyAi(
        {
          tone: result.tone,
          values: result.values,
          wordsUsed: result.wordsUsed,
          wordsAvoided: result.wordsAvoided,
          examples: result.examples,
          ...(design ? { design } : {}),
        },
        design && designByClaude ? [...fields, 'design'] : fields,
      );
      toast.success(t.withClaudeDone);
    } catch (error: unknown) {
      if (current.signal.aborted) return;
      setAiError(error instanceof AiError ? error.code : 'API_ERROR');
    } finally {
      if (!current.signal.aborted) setWorking(false);
    }
  };

  const copyKit = async () => {
    try {
      await navigator.clipboard.writeText(brandKitText(profile));
      toast.success(t.kitCopied);
    } catch {
      toast.error(t.copyFailed);
    }
  };

  const anyAi = profile.aiFields.length > 0;

  return (
    <div className="flex flex-col gap-5" data-testid="brand-profile">
      <Surface className="flex flex-col gap-6">
        <Part title={t.tone} ai={ai('tone')} testId="brand-part-tone">
          <p className="text-lg text-fg">
            {profile.tone ?? <span className="text-fg-muted">{t.empty}</span>}
          </p>
        </Part>
        <Part title={t.values} ai={ai('values')} testId="brand-part-values">
          <Chips items={profile.values} />
        </Part>
        <div className="grid gap-6 sm:grid-cols-2">
          <Part title={t.wordsUsed} ai={ai('wordsUsed')} testId="brand-part-words-used">
            <Chips items={profile.wordsUsed} tone="signal" />
          </Part>
          <Part title={t.wordsAvoided} ai={ai('wordsAvoided')} testId="brand-part-words-avoided">
            <Chips items={profile.wordsAvoided} tone="danger" />
          </Part>
        </div>
        <Part title={t.examples} ai={ai('examples')} testId="brand-part-examples">
          {profile.examples.length === 0 ? (
            <p className="text-base text-fg-muted">{t.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {profile.examples.map((example) => (
                <li
                  key={example}
                  className="rounded-r-lg border-l-4 border-signal bg-surface-sunken px-4 py-2.5 text-base text-fg italic"
                >
                  „{example}“
                </li>
              ))}
            </ul>
          )}
        </Part>
        {anyAi && (
          <p className="flex items-start gap-2 text-sm text-fg-muted">
            <Sparkles size={15} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            {t.claudeHint}
          </p>
        )}
      </Surface>

      <div className="flex flex-wrap gap-2">
        <Button icon={Pencil} onClick={() => setEditing(true)} data-testid="brand-profile-edit">
          {t.edit}
        </Button>
        <Button
          variant="secondary"
          icon={Copy}
          onClick={() => void copyKit()}
          data-testid="brand-copy-kit"
        >
          {t.copyKit}
        </Button>
        <Link
          to="/brand/interview"
          className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-full border border-line bg-surface-raised px-5 text-base font-medium text-fg shadow-soft active:scale-[0.97]"
          data-testid="brand-open-interview"
        >
          {t.editInterview}
        </Link>
        <Button
          variant="ghost"
          icon={RotateCcw}
          onClick={() => setRestarting(true)}
          data-testid="brand-restart"
        >
          {t.restart}
        </Button>
      </div>

      {aiEnabled && (
        <Surface className="flex flex-col gap-2">
          <Button
            variant="secondary"
            icon={Sparkles}
            loading={working}
            onClick={() => void withClaude()}
            className="self-start"
            data-testid="brand-profile-claude"
          >
            {working ? t.withClaudeWorking : t.withClaude}
          </Button>
          <p className="text-sm text-fg-muted">{t.withClaudeHint}</p>
          {aiError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
              data-testid="brand-profile-claude-error"
            >
              <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
              {de.settings.ai.errors[aiError]}
            </p>
          )}
        </Surface>
      )}

      {editing && <ProfileEditor profile={profile} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={restarting}
        onClose={() => setRestarting(false)}
        onConfirm={async () => {
          await brandActions.reset();
        }}
        title={t.restartTitle}
        message={t.restartText}
        confirmLabel={t.restartConfirm}
      />
    </div>
  );
}
