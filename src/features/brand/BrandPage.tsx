import { Link, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Check, MessageSquareText } from 'lucide-react';
import { Button, EmptyState, ProgressBar, SegmentedControl, Surface } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { INTERVIEW } from '@/data/brand/interview';
import { brandActions } from '@/data/repositories';
import { useDataStore } from '@/data/store';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { BuildView } from './BuildView';
import { DesignView } from './DesignView';
import { ProfileView } from './ProfileView';
import { useBrand } from './useBrand';

const t = de.brand;
const TABS = ['profile', 'design', 'build'] as const;
type Tab = (typeof TABS)[number];
const TAB_OPTIONS = TABS.map((value) => ({ value, label: t.tabs[value] }));

const startLink =
  'focus-ring inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 text-base font-medium text-on-accent shadow-[0_8px_24px_-10px_var(--accent-glow)] active:scale-[0.97]';

/** Brand profile: interview → profile, design system and texts in my voice. */
export function BrandPage() {
  const profile = useBrand();
  const ready = useDataStore((state) => state.ready);
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'profile';

  if (!ready) return <Page title={t.title}>{null}</Page>;

  const answered = INTERVIEW.filter((question) => profile?.answers[question.key]?.trim()).length;

  if (!profile?.interviewDoneAt) {
    return (
      <Page title={t.title} width="narrow">
        {answered === 0 ? (
          <EmptyState
            title={t.empty}
            text={t.emptyText}
            action={
              <Link to="/brand/interview" className={startLink} data-testid="brand-start">
                <MessageSquareText size={18} aria-hidden />
                {t.start}
              </Link>
            }
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.soft}
          >
            <Surface className="flex flex-col gap-4" data-testid="brand-continue">
              <h2 className="text-xl font-semibold tracking-tight text-fg">{t.continueTitle}</h2>
              <p className="text-base text-fg-secondary">
                {t.continueText(answered, INTERVIEW.length)}
              </p>
              <ProgressBar
                value={answered / INTERVIEW.length}
                label={t.continueText(answered, INTERVIEW.length)}
              />
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/brand/interview?q=${Math.min(answered, INTERVIEW.length - 1)}`}
                  className={startLink}
                  data-testid="brand-continue-link"
                >
                  {t.continue}
                  <ArrowRight size={18} aria-hidden />
                </Link>
                <Button
                  variant="secondary"
                  icon={Check}
                  onClick={() => void brandActions.finishInterview()}
                  data-testid="brand-finish-now"
                >
                  {t.finishNow}
                </Button>
              </div>
            </Surface>
          </motion.div>
        )}
      </Page>
    );
  }

  return (
    <Page title={t.title}>
      <div className="flex flex-col gap-5" data-testid="brand-page">
        <SegmentedControl
          label={t.tabsLabel}
          options={TAB_OPTIONS}
          value={tab}
          onChange={(next) => setParams({ tab: next }, { replace: true })}
          className="self-start"
        />
        {tab === 'profile' && <ProfileView profile={profile} />}
        {tab === 'design' && <DesignView profile={profile} />}
        {tab === 'build' && <BuildView profile={profile} />}
      </div>
    </Page>
  );
}
