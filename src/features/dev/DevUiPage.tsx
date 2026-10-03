import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Check,
  Copy,
  Info,
  Maximize2,
  Minimize2,
  Pencil,
  Plus,
  Share,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  ActionMenu,
  ActionMenuButton,
  Badge,
  BottomSheet,
  Button,
  ChoiceChip,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  ProgressRing,
  SearchInput,
  SegmentedControl,
  Select,
  SidePanel,
  Skeleton,
  Slider,
  Spinner,
  Surface,
  TagInput,
  Textarea,
  toast,
  Toggle,
  Tooltip,
  useLongPress,
  type ActionMenuItem,
  type BadgeTone,
  type MenuAnchor,
} from '@/components/ui';
import { useEscape } from '@/components/ui/hooks/useEscape';
import { useFocusModeRequest } from '@/app/shell/focusMode';
import { Page } from '@/app/shell/Page';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { loadDemoDay } from '@/features/today/todayStore';
import { VaultDevSection } from './VaultDevSection';

const t = de.dev;
const d = de.dev.demo;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" data-testid={`dev-section-${id}`}>
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">{title}</h2>
      <Surface className="flex flex-col gap-5">{children}</Surface>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function ButtonsDemo() {
  return (
    <>
      <Row>
        <Button>{d.primary}</Button>
        <Button variant="secondary">{d.secondary}</Button>
        <Button variant="ghost">{d.ghost}</Button>
        <Button variant="danger" icon={Trash2}>
          {d.danger}
        </Button>
        <Button variant="success" icon={Check}>
          {d.success}
        </Button>
      </Row>
      <Row>
        <Button size="sm">{d.small}</Button>
        <Button size="md">{d.medium}</Button>
        <Button size="lg">{d.large}</Button>
        <Button icon={Plus} variant="secondary">
          {d.withIcon}
        </Button>
        <Button loading>{d.loading}</Button>
        <Button disabled variant="secondary">
          {d.disabled}
        </Button>
      </Row>
      <Row>
        <IconButton icon={Plus} label={d.add} variant="primary" />
        <IconButton icon={Pencil} label={d.edit} variant="secondary" />
        <IconButton icon={Share} label={d.call} />
        <IconButton icon={Trash2} label={d.menu.delete} variant="danger" />
        <IconButton icon={Plus} label={d.add} variant="primary" size="lg" />
      </Row>
    </>
  );
}

function InputsDemo() {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [topics, setTopics] = useState<string[]>([d.tagSuggestions[0]]);
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <SearchInput
        label={d.searchLabel}
        clearLabel={d.searchClear}
        placeholder={d.searchPlaceholder}
        value={query}
        onChange={setQuery}
        className="sm:col-span-2"
      />
      <Input
        label={d.inputLabel}
        placeholder={d.inputPlaceholder}
        hint={d.inputHint}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Input
        label={d.inputLabel}
        placeholder={d.inputPlaceholder}
        error={d.inputError}
        defaultValue=""
      />
      <Textarea
        label={d.textareaLabel}
        placeholder={d.textareaPlaceholder}
        hint={d.textareaHint}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="sm:col-span-2"
      />
      <TagInput
        label={d.tagsLabel}
        placeholder={d.tagsPlaceholder}
        value={topics}
        onChange={setTopics}
        suggestions={[...d.tagSuggestions]}
        suggestionsLabel={d.tagsSuggestions}
        removeLabel={d.tagsRemove}
        className="sm:col-span-2"
      />
    </div>
  );
}

type CategoryDemo = keyof typeof d.selectOptions;
type PriorityDemo = keyof typeof d.segmentOptions;
type ChipDemo = keyof typeof d.chips;

function ControlsDemo() {
  const [category, setCategory] = useState<CategoryDemo>('insurance');
  const [priority, setPriority] = useState<PriorityDemo>('high');
  const [reminder, setReminder] = useState(true);
  const [lockMinutes, setLockMinutes] = useState(5);
  const [chips, setChips] = useState<ChipDemo[]>(['book']);
  const categoryOptions = (Object.keys(d.selectOptions) as CategoryDemo[]).map((value) => ({
    value,
    label: d.selectOptions[value],
  }));
  const priorityOptions = (Object.keys(d.segmentOptions) as PriorityDemo[]).map((value) => ({
    value,
    label: d.segmentOptions[value],
  }));
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Select
        label={d.selectLabel}
        options={categoryOptions}
        value={category}
        onChange={setCategory}
      />
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-sm font-medium text-fg-secondary">{d.segmentLabel}</span>
        <SegmentedControl
          label={d.segmentLabel}
          options={priorityOptions}
          value={priority}
          onChange={setPriority}
        />
      </div>
      <Toggle
        label={d.toggleLabel}
        description={d.toggleHint}
        checked={reminder}
        onChange={setReminder}
      />
      <Slider
        label={d.sliderLabel}
        value={lockMinutes}
        onChange={setLockMinutes}
        min={1}
        max={30}
        step={1}
        format={d.sliderValue}
      />
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <span className="px-1 text-sm font-medium text-fg-secondary">{d.chipsLabel}</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(d.chips) as ChipDemo[]).map((chip) => (
            <ChoiceChip
              key={chip}
              selected={chips.includes(chip)}
              onToggle={() =>
                setChips(chips.includes(chip) ? chips.filter((c) => c !== chip) : [...chips, chip])
              }
            >
              {d.chips[chip]}
            </ChoiceChip>
          ))}
        </div>
      </div>
    </div>
  );
}

const BADGE_TONES: BadgeTone[] = ['neutral', 'accent', 'signal', 'success', 'danger', 'warning'];

function FeedbackDemo() {
  return (
    <>
      <Row>
        {BADGE_TONES.map((tone) => (
          <Badge key={tone} tone={tone}>
            {d.badges[tone]}
          </Badge>
        ))}
        <Tooltip content={d.tooltipText} showOnTap>
          <IconButton icon={Info} label={d.tooltipTrigger} variant="secondary" />
        </Tooltip>
      </Row>
      <Row>
        <Button variant="secondary" onClick={() => toast.info(d.toastInfoText)}>
          {d.toastInfo}
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.success(d.toastSuccessText, {
              label: d.toastUndo,
              onSelect: () => toast.info(d.menuSelected(d.toastUndo)),
            })
          }
        >
          {d.toastSuccess}
        </Button>
        <Button variant="secondary" onClick={() => toast.error(d.toastErrorText)}>
          {d.toastError}
        </Button>
      </Row>
      <Row>
        <span className="text-accent">
          <Spinner size={28} label={de.ui.loading} />
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </Row>
    </>
  );
}

function ProgressDemo() {
  return (
    <div className="flex flex-wrap items-center gap-8">
      <ProgressRing value={0.3} label="30 %" size={96} />
      <ProgressRing value={0.65} label="65 %" size={96} />
      <ProgressRing value={1} label="100 %" size={120} />
      <div className="flex min-w-48 flex-1 flex-col gap-3">
        <ProgressBar value={0.25} label="25 %" />
        <ProgressBar value={0.6} label="60 %" tone="warning" />
        <ProgressBar value={0.9} label="90 %" tone="success" />
      </div>
    </div>
  );
}

function OverlaysDemo() {
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sidePanel, setSidePanel] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const longPress = useLongPress((point) => setMenuAnchor(point));
  const items: ActionMenuItem[] = [
    {
      id: 'edit',
      label: d.menu.edit,
      icon: Pencil,
      onSelect: () => toast.info(d.menuSelected(d.menu.edit)),
    },
    {
      id: 'duplicate',
      label: d.menu.duplicate,
      icon: Copy,
      onSelect: () => toast.info(d.menuSelected(d.menu.duplicate)),
    },
    {
      id: 'delete',
      label: d.menu.delete,
      icon: Trash2,
      danger: true,
      onSelect: () => setConfirm(true),
    },
  ];
  return (
    <>
      <Row>
        <Button variant="secondary" onClick={() => setModal(true)}>
          {d.openModal}
        </Button>
        <Button variant="secondary" onClick={() => setSheet(true)}>
          {d.openSheet}
        </Button>
        <Button variant="secondary" onClick={() => setSidePanel(true)}>
          {d.openSidePanel}
        </Button>
        <Button variant="secondary" onClick={() => setConfirm(true)}>
          {d.openConfirm}
        </Button>
      </Row>
      <Row>
        <ActionMenuButton items={items} />
        <div
          {...longPress.handlers}
          className="no-callout flex min-h-20 flex-1 items-center justify-center rounded-lg border border-dashed border-line-strong text-fg-secondary"
        >
          {d.longPressArea}
        </div>
      </Row>
      <p className="text-sm text-fg-muted">{d.menuHint}</p>

      <ActionMenu
        open={menuAnchor !== null}
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        items={items}
      />
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={d.modalTitle}
        description={d.modalText}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>
              {de.ui.cancel}
            </Button>
            <Button onClick={() => setModal(false)}>{d.success}</Button>
          </>
        }
      >
        <Input label={d.inputLabel} placeholder={d.inputPlaceholder} />
      </Modal>
      <BottomSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={d.sheetTitle}
        description={d.sheetText}
        footer={
          <Button size="lg" fullWidth onClick={() => setSheet(false)}>
            {d.success}
          </Button>
        }
      >
        <Toggle label={d.toggleLabel} checked onChange={() => undefined} />
      </BottomSheet>
      <SidePanel
        open={sidePanel}
        onClose={() => setSidePanel(false)}
        title={d.sidePanelTitle}
        description={d.sidePanelText}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSidePanel(false)}>
              {de.ui.cancel}
            </Button>
            <Button onClick={() => setSidePanel(false)}>{d.success}</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label={d.inputLabel} placeholder={d.inputPlaceholder} />
          <Textarea label={d.textareaLabel} placeholder={d.textareaPlaceholder} />
        </div>
      </SidePanel>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void toast.success(d.toastSuccessText)}
        title={d.confirmTitle}
        message={d.confirmText}
        confirmLabel={d.confirmAction}
      />
    </>
  );
}

/** Hides the navigation like a full-screen page would; Esc or the button ends it. */
function FocusDemo() {
  const [focus, setFocus] = useState(false);
  useFocusModeRequest(focus);
  useEscape(() => setFocus(false), focus);
  return (
    <>
      <p className="text-base text-fg-secondary">{d.focusHint}</p>
      <Row>
        <Button variant="secondary" icon={Maximize2} onClick={() => setFocus(true)}>
          {d.focusStart}
        </Button>
      </Row>
      {focus && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Button icon={Minimize2} onClick={() => setFocus(false)} data-testid="focus-end">
            {d.focusEnd}
          </Button>
        </div>
      )}
    </>
  );
}

const SWATCHES = [
  { token: 'accent', label: d.colors.accent, fill: 'bg-accent', soft: 'bg-accent-soft' },
  { token: 'signal', label: d.colors.signal, fill: 'bg-signal', soft: 'bg-signal-soft' },
  { token: 'success', label: d.colors.success, fill: 'bg-success', soft: 'bg-success-soft' },
  { token: 'warning', label: d.colors.warning, fill: 'bg-warning', soft: 'bg-warning-soft' },
  { token: 'danger', label: d.colors.danger, fill: 'bg-danger', soft: 'bg-danger-soft' },
] as const;

/** Identity colors side by side: accent, signal yellow and status colors must stay distinct. */
function ColorsDemo() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {SWATCHES.map((swatch) => (
        <div key={swatch.token} className="flex flex-col gap-2">
          <div className={`flex h-16 items-end rounded-lg p-2 ${swatch.soft}`}>
            <span className={`size-8 rounded-full ${swatch.fill}`} />
          </div>
          <span className="px-1 text-sm font-medium text-fg">{swatch.label}</span>
          <code className="px-1 text-xs text-fg-muted">--{swatch.token}</code>
        </div>
      ))}
    </div>
  );
}

/** Component overview in all variants (only with developer mode). */
export default function DevUiPage() {
  const devMode = useSettings((s) => s.devMode);
  const loaded = useSettings((s) => s.loaded);
  const navigate = useNavigate();

  if (!devMode) {
    return (
      <Page title={t.title}>
        {loaded && (
          <EmptyState
            title={t.disabledTitle}
            text={t.disabledText}
            action={<Button onClick={() => void navigate('/settings')}>{t.openSettings}</Button>}
          />
        )}
      </Page>
    );
  }

  return (
    <Page title={t.title}>
      <div className="flex flex-col gap-8">
        <VaultDevSection />
        <Section id="today" title={t.today.title}>
          <p className="text-base text-fg-secondary">{t.today.hint}</p>
          <Row>
            <Button
              icon={Sun}
              onClick={() => {
                loadDemoDay();
                void navigate('/today');
              }}
              data-testid="dev-demo-day"
            >
              {t.today.load}
            </Button>
          </Row>
        </Section>
        <Section id="buttons" title={t.sections.buttons}>
          <ButtonsDemo />
        </Section>
        <Section id="inputs" title={t.sections.inputs}>
          <InputsDemo />
        </Section>
        <Section id="controls" title={t.sections.controls}>
          <ControlsDemo />
        </Section>
        <Section id="feedback" title={t.sections.feedback}>
          <FeedbackDemo />
        </Section>
        <Section id="progress" title={t.sections.progress}>
          <ProgressDemo />
        </Section>
        <Section id="overlays" title={t.sections.overlays}>
          <OverlaysDemo />
        </Section>
        <Section id="focus" title={t.sections.focus}>
          <FocusDemo />
        </Section>
        <Section id="colors" title={t.sections.colors}>
          <ColorsDemo />
        </Section>
        <Section id="empty" title={t.sections.empty}>
          <EmptyState
            title={d.emptyTitle}
            text={d.emptyText}
            action={<Button icon={Plus}>{d.emptyAction}</Button>}
          />
        </Section>
      </div>
    </Page>
  );
}
