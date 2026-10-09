import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { Button, IconButton, ProgressBar, Surface, Textarea, toast } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { INTERVIEW } from '@/data/brand/interview';
import { brandActions } from '@/data/repositories';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { useBrand } from './useBrand';

const t = de.brand.interview;
const SAVE_DELAY_MS = 600;

/** Ten questions, one after the other; every answer is saved (encrypted) while typing. */
export function InterviewPage() {
  const navigate = useNavigate();
  const brand = useBrand();
  const [params, setParams] = useSearchParams();
  const index = Math.min(Math.max(Number(params.get('q') ?? '0') || 0, 0), INTERVIEW.length - 1);
  const question = INTERVIEW[index] ?? INTERVIEW[0]!;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ key: string; text: string } | null>(null);

  const value = drafts[question.key] ?? brand?.answers[question.key] ?? '';

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) await brandActions.saveAnswer(next.key, next.text);
  };

  // Nothing typed gets lost when leaving the page.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const next = pending.current;
      if (next) void brandActions.saveAnswer(next.key, next.text);
    },
    [],
  );

  const onChange = (text: string) => {
    setDrafts((current) => ({ ...current, [question.key]: text }));
    pending.current = { key: question.key, text };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  const go = async (next: number) => {
    await flush();
    setParams({ q: String(next) }, { replace: true });
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await flush();
      await brandActions.finishInterview();
      toast.success(t.done);
      void navigate('/brand');
    } catch {
      toast.error(de.brand.profile.saveFailed);
      setFinishing(false);
    }
  };

  const last = index === INTERVIEW.length - 1;

  return (
    <Page
      title={t.title}
      width="narrow"
      leading={
        <IconButton
          icon={X}
          label={t.close}
          onClick={() => void flush().then(() => navigate('/brand'))}
          data-testid="interview-close"
        />
      }
    >
      <div className="flex flex-col gap-5" data-testid="interview">
        <div className="flex flex-col gap-2 px-1">
          <span className="text-sm font-medium text-fg-secondary" data-testid="interview-progress">
            {t.progress(index + 1, INTERVIEW.length)}
          </span>
          <ProgressBar
            value={(index + 1) / INTERVIEW.length}
            label={t.progress(index + 1, INTERVIEW.length)}
          />
        </div>
        <motion.div
          key={question.key}
          // No exit animation: typing must always reach the current question.
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={spring.soft}
        >
          <Surface className="flex flex-col gap-4">
            <h2
              className="text-2xl font-semibold tracking-tight text-fg"
              data-testid="interview-question"
            >
              {question.question}
            </h2>
            <p className="text-base text-fg-secondary">{question.hint}</p>
            <Textarea
              aria-label={t.answerLabel}
              placeholder={question.placeholder}
              value={value}
              rows={5}
              maxLength={5000}
              autoFocus
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void (last ? finish() : go(index + 1));
                }
              }}
              data-testid="interview-answer"
            />
            <p className="text-sm text-fg-muted">{t.dictateHint}</p>
          </Surface>
        </motion.div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            icon={ArrowLeft}
            disabled={index === 0}
            onClick={() => void go(index - 1)}
            data-testid="interview-back"
          >
            {t.back}
          </Button>
          <div className="flex flex-wrap gap-2">
            {!last && !value.trim() && (
              <Button
                variant="secondary"
                onClick={() => void go(index + 1)}
                data-testid="interview-skip"
              >
                {t.skip}
              </Button>
            )}
            {last ? (
              <Button
                icon={Check}
                loading={finishing}
                onClick={() => void finish()}
                data-testid="interview-finish"
              >
                {t.finish}
              </Button>
            ) : (
              value.trim() && (
                <Button
                  icon={ArrowRight}
                  onClick={() => void go(index + 1)}
                  data-testid="interview-next"
                >
                  {t.next}
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
