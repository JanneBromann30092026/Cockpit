import { useState } from 'react';
import { CircleAlert, CircleCheck, Palette as PaletteIcon, Pencil } from 'lucide-react';
import {
  Button,
  ChoiceChip,
  cn,
  Input,
  SegmentedControl,
  Select,
  Surface,
  toast,
  type SelectOption,
} from '@/components/ui';
import { EditPanel } from '@/app/shell/EditPanel';
import { normalizeHex, paletteChecks, readableOn } from '@/core/brand/color';
import { FONT_STACKS, PALETTE_PRESETS, type PalettePreset } from '@/data/brand/design';
import {
  BRAND_COLOR_ROLES,
  BRAND_FONTS,
  BRAND_RADII,
  type BrandColorRole,
  type BrandFont,
  type BrandRadius,
} from '@/data/domain';
import { brandActions } from '@/data/repositories';
import type { BrandDesign, BrandProfile } from '@/data/schemas';
import { de } from '@/i18n/de';

const t = de.brand.design;

const RADIUS_PX: Record<BrandRadius, string> = { sharp: '4px', soft: '14px', round: '28px' };

const FONT_OPTIONS: SelectOption<BrandFont>[] = BRAND_FONTS.map((value) => ({
  value,
  label: FONT_STACKS[value].name,
}));

const RADIUS_OPTIONS = BRAND_RADII.map((value) => ({ value, label: t.radii[value] }));

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error(de.brand.profile.copyFailed);
  }
}

function Swatch({ role, hex }: { role: BrandColorRole; hex: string }) {
  return (
    <button
      type="button"
      onClick={() => void copy(hex, t.hexCopied(hex))}
      aria-label={t.copyHex(hex)}
      className="focus-ring flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface text-left active:scale-[0.98]"
      data-testid="brand-swatch"
    >
      <span
        className="flex h-20 items-end p-2"
        style={{ backgroundColor: hex, color: readableOn(hex) }}
      >
        <span className="text-xs font-semibold">Aa</span>
      </span>
      <span className="flex flex-col px-3 py-2">
        <span className="truncate text-sm font-medium text-fg">{t.roles[role]}</span>
        <span className="font-mono text-sm text-fg-secondary uppercase">{hex}</span>
      </span>
    </button>
  );
}

/** The design applied to small components (inline styles: the brand's own colours). */
function Preview({ design }: { design: BrandDesign }) {
  const { colors } = design;
  const radius = RADIUS_PX[design.radius];
  const heading = FONT_STACKS[design.headingFont].stack;
  const body = FONT_STACKS[design.bodyFont].stack;
  return (
    <div
      className="flex flex-col gap-5 border border-line p-5"
      style={{ backgroundColor: colors.background, color: colors.text, borderRadius: radius }}
      data-testid="brand-preview"
    >
      <div className="flex flex-col gap-2">
        <p className="text-3xl leading-tight font-semibold" style={{ fontFamily: heading }}>
          {t.sampleHeading}
        </p>
        <p className="text-base leading-relaxed" style={{ fontFamily: body }}>
          {t.sampleBody}{' '}
          <span className="underline underline-offset-4" style={{ color: colors.primary }}>
            {t.link}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3" style={{ fontFamily: body }}>
        <span
          className="inline-flex min-h-11 items-center px-5 text-base font-semibold"
          style={{
            backgroundColor: colors.primary,
            color: readableOn(colors.primary),
            borderRadius: radius,
          }}
        >
          {t.button}
        </span>
        <span
          className="inline-flex min-h-11 items-center border-2 px-5 text-base font-semibold"
          style={{ borderColor: colors.secondary, color: colors.secondary, borderRadius: radius }}
        >
          {t.buttonSecondary}
        </span>
        <span
          className="inline-flex h-7 items-center px-3 text-xs font-bold"
          style={{
            backgroundColor: colors.accent,
            color: readableOn(colors.accent),
            borderRadius: radius,
          }}
        >
          {t.badge}
        </span>
      </div>
      <div
        className="flex flex-col gap-1 border p-4"
        style={{ borderColor: colors.secondary, borderRadius: radius, fontFamily: body }}
      >
        <span
          className="text-lg font-semibold"
          style={{ fontFamily: heading, color: colors.primary }}
        >
          {t.cardTitle}
        </span>
        <span className="text-base">{t.cardText}</span>
      </div>
    </div>
  );
}

function DesignEditor({ design, onClose }: { design: BrandDesign; onClose: () => void }) {
  const [colors, setColors] = useState<Record<BrandColorRole, string>>({ ...design.colors });
  const [texts, setTexts] = useState<Record<BrandColorRole, string>>({ ...design.colors });
  const [headingFont, setHeadingFont] = useState<BrandFont>(design.headingFont);
  const [bodyFont, setBodyFont] = useState<BrandFont>(design.bodyFont);
  const [radius, setRadius] = useState<BrandRadius>(design.radius);
  const [saving, setSaving] = useState(false);

  const setColor = (role: BrandColorRole, value: string) => {
    setTexts((current) => ({ ...current, [role]: value }));
    const hex = normalizeHex(value);
    if (hex) setColors((current) => ({ ...current, [role]: hex }));
  };

  const preset = (key: PalettePreset) => {
    const next = { ...PALETTE_PRESETS[key].colors };
    setColors(next);
    setTexts(next);
  };

  const invalid = BRAND_COLOR_ROLES.some((role) => !normalizeHex(texts[role]));

  const save = async () => {
    if (invalid) return;
    setSaving(true);
    try {
      await brandActions.edit({ design: { colors, headingFont, bodyFont, radius } });
      toast.success(de.brand.profile.saved);
      onClose();
    } catch {
      toast.error(de.brand.profile.saveFailed);
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
            {de.brand.profile.cancel}
          </Button>
          <Button
            onClick={() => void save()}
            loading={saving}
            disabled={invalid}
            data-testid="brand-design-save"
          >
            {de.brand.profile.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5" data-testid="brand-design-editor">
        <div className="flex flex-col gap-2">
          <span className="px-1 text-sm font-medium text-fg-secondary">{t.presets}</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PALETTE_PRESETS) as PalettePreset[]).map((key) => (
              <ChoiceChip
                key={key}
                selected={BRAND_COLOR_ROLES.every(
                  (role) => colors[role] === PALETTE_PRESETS[key].colors[role],
                )}
                onToggle={() => preset(key)}
              >
                {PALETTE_PRESETS[key].name}
              </ChoiceChip>
            ))}
          </div>
        </div>
        {BRAND_COLOR_ROLES.map((role) => (
          <div key={role} className="flex items-end gap-3">
            <input
              type="color"
              aria-label={t.roles[role]}
              value={colors[role]}
              onChange={(event) => setColor(role, event.target.value)}
              className="focus-ring size-12 shrink-0 cursor-pointer rounded-lg border border-line bg-transparent p-1"
              data-testid={`brand-color-${role}`}
            />
            <div className="min-w-0 flex-1">
              <Input
                label={t.hexLabel(t.roles[role])}
                value={texts[role]}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono"
                onChange={(event) => setColor(role, event.target.value)}
                error={normalizeHex(texts[role]) ? undefined : t.hexInvalid}
                data-testid={`brand-hex-${role}`}
              />
            </div>
          </div>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={t.heading}
            options={FONT_OPTIONS}
            value={headingFont}
            onChange={setHeadingFont}
            data-testid="brand-heading-font"
          />
          <Select
            label={t.body}
            options={FONT_OPTIONS}
            value={bodyFont}
            onChange={setBodyFont}
            data-testid="brand-body-font"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-base text-fg">{t.radius}</span>
          <SegmentedControl
            label={t.radius}
            options={RADIUS_OPTIONS}
            value={radius}
            onChange={setRadius}
          />
        </div>
        <Preview design={{ colors, headingFont, bodyFont, radius }} />
      </div>
    </EditPanel>
  );
}

/** Palette with hex codes and contrast, fonts, components – and editing. */
export function DesignView({ profile }: { profile: BrandProfile }) {
  const [editing, setEditing] = useState(false);
  const design = profile.design;

  if (!design) {
    return (
      <Surface className="flex flex-col items-start gap-3" data-testid="brand-design">
        <p className="text-base text-fg-secondary">{t.none}</p>
        <Button
          icon={PaletteIcon}
          onClick={() =>
            void brandActions.edit({
              design: {
                colors: { ...PALETTE_PRESETS.cobalt.colors },
                headingFont: 'avenir',
                bodyFont: 'inter',
                radius: 'soft',
              },
            })
          }
          data-testid="brand-design-start"
        >
          {t.choosePreset}
        </Button>
      </Surface>
    );
  }

  const checks = paletteChecks(design.colors);
  const claude = profile.aiFields.includes('design');

  return (
    <div className="flex flex-col gap-5" data-testid="brand-design">
      <Surface className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-fg">
          {t.palette}
          {claude && (
            <span className="ml-2 text-sm font-medium text-accent">
              {de.brand.profile.claudeMark}
            </span>
          )}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {BRAND_COLOR_ROLES.map((role) => (
            <Swatch key={role} role={role} hex={design.colors[role]} />
          ))}
        </div>
        <h3 className="pt-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">
          {t.contrast}
        </h3>
        <ul className="flex flex-col gap-2" data-testid="brand-contrast">
          {checks.map((check) => (
            <li key={check.key} className="flex flex-wrap items-center gap-2 text-base text-fg">
              {check.ok ? (
                <CircleCheck size={18} aria-hidden className="shrink-0 text-success" />
              ) : (
                <CircleAlert size={18} aria-hidden className="shrink-0 text-warning" />
              )}
              <span className="flex-1">{t.checks[check.key]}</span>
              <span
                className={cn(
                  'text-sm tabular-nums',
                  check.ok ? 'text-fg-secondary' : 'text-warning',
                )}
              >
                {t.ratio(check.ratio, check.required)} · {check.ok ? t.ok : t.weak}
              </span>
            </li>
          ))}
        </ul>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{t.fonts}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-fg-secondary">{t.heading}</span>
            <span
              className="text-2xl font-semibold text-fg"
              style={{ fontFamily: FONT_STACKS[design.headingFont].stack }}
              data-testid="brand-heading-font-name"
            >
              {FONT_STACKS[design.headingFont].name}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-fg-secondary">{t.body}</span>
            <span
              className="text-2xl text-fg"
              style={{ fontFamily: FONT_STACKS[design.bodyFont].stack }}
              data-testid="brand-body-font-name"
            >
              {FONT_STACKS[design.bodyFont].name}
            </span>
          </div>
        </div>
        <p className="text-sm text-fg-muted">{t.fontsHint}</p>
      </Surface>

      <Surface className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{t.components}</h2>
        <Preview design={design} />
      </Surface>

      <Button
        icon={Pencil}
        onClick={() => setEditing(true)}
        className="self-start"
        data-testid="brand-design-edit"
      >
        {t.edit}
      </Button>
      {editing && <DesignEditor design={design} onClose={() => setEditing(false)} />}
    </div>
  );
}
