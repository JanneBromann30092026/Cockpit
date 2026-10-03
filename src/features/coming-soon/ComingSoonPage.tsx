import { motion } from 'motion/react';
import {
  BookOpen,
  FileText,
  ListChecks,
  NotebookPen,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Surface } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';

export type ComingSoonKey = keyof typeof de.comingSoon.pages;

/** Navigation label, icon and roadmap step of every page that is still a placeholder. */
const PAGES: Record<ComingSoonKey, { title: string; icon: LucideIcon; step: number }> = {
  tasks: { title: de.nav.tasks, icon: ListChecks, step: 5 },
  documents: { title: de.nav.documents, icon: FileText, step: 6 },
  reviews: { title: de.nav.reviews, icon: NotebookPen, step: 7 },
  library: { title: de.nav.library, icon: BookOpen, step: 9 },
  brand: { title: de.nav.brand, icon: Sparkles, step: 10 },
};

/** Friendly placeholder for a page that a later roadmap step fills in. */
export function ComingSoonPage({ page }: { page: ComingSoonKey }) {
  const { title, icon: Icon, step } = PAGES[page];
  const texts = de.comingSoon.pages[page];
  return (
    <Page title={title} width="narrow">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        data-testid={`coming-soon-${page}`}
      >
        <Surface padding="lg" className="relative overflow-hidden">
          <div aria-hidden className="coming-soon-glow pointer-events-none absolute -inset-10" />
          <div className="relative flex flex-col items-center gap-5 py-6 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-accent-soft text-accent ring-8 ring-accent-soft/40">
              <Icon size={34} aria-hidden strokeWidth={1.9} />
            </span>
            <Badge tone="signal">{de.comingSoon.badge(step)}</Badge>
            <div className="flex max-w-lg flex-col gap-2">
              <h2 className="text-2xl font-semibold tracking-tight text-fg">{texts.heading}</h2>
              <p className="text-base text-fg-secondary">{texts.text}</p>
            </div>
          </div>
        </Surface>
      </motion.div>
    </Page>
  );
}
