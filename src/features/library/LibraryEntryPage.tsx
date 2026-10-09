import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import { ChevronLeft, ExternalLink, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, IconButton, Surface, toast } from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { libraryActions } from '@/data/repositories';
import { useDataStore } from '@/data/store';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { LibraryEditor } from './LibraryEditor';
import { sourceLine, TYPE_ICONS } from './useLibrary';

const t = de.library;
const d = t.detail;

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid={testId}
    >
      <Surface className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {children}
      </Surface>
    </motion.section>
  );
}

/** One entry: source, topics, key points (marked when phrased by Claude) and my thoughts. */
export function LibraryEntryPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const entry = useDataStore((state) => state.library[id]);
  const ready = useDataStore((state) => state.ready);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const back = (
    <IconButton
      icon={ChevronLeft}
      label={d.back}
      onClick={() => void navigate('/library')}
      data-testid="library-back"
    />
  );

  if (!entry) {
    return (
      <Page title={t.title} leading={back}>
        {ready && <EmptyState title={d.notFound} />}
      </Page>
    );
  }

  const Icon = TYPE_ICONS[entry.type];
  const hasClaudePoints = entry.keyPoints.some((point) => point.byClaude);

  return (
    <Page
      title={entry.title}
      leading={back}
      actions={
        <>
          <Button
            size="sm"
            variant="secondary"
            icon={Pencil}
            onClick={() => setEditing(true)}
            aria-label={d.edit}
            data-testid="library-edit"
          >
            <span className="hidden sm:inline">{d.edit}</span>
          </Button>
          <IconButton
            icon={Trash2}
            label={d.delete}
            onClick={() => setDeleting(true)}
            data-testid="library-delete"
          />
        </>
      }
    >
      <div className="flex flex-col gap-5" data-testid="library-entry">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
          className="flex flex-wrap items-center gap-3 px-1"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon size={21} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-base text-fg-secondary" data-testid="library-source">
            {sourceLine(entry) || t.noDate}
          </span>
          {entry.link && (
            <a
              href={entry.link}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface-raised px-4 text-sm font-medium text-fg shadow-soft active:scale-[0.97] [@media(hover:hover)]:hover:border-line-strong"
              data-testid="library-open-link"
            >
              {d.open}
              <ExternalLink size={15} aria-hidden />
            </a>
          )}
        </motion.div>

        {entry.topics.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1" data-testid="library-topics">
            {entry.topics.map((topic) => (
              <Link
                key={topic}
                to={`/library?topic=${encodeURIComponent(topic)}`}
                aria-label={`${d.topicHint}: ${topic}`}
                className="focus-ring inline-flex min-h-11 items-center rounded-full bg-signal-soft px-4 text-sm font-medium text-signal-fg active:scale-[0.97]"
              >
                #{topic}
              </Link>
            ))}
          </div>
        )}

        <Section title={t.fields.keyPoints} testId="library-key-points-section">
          {entry.keyPoints.length === 0 ? (
            <p className="text-base text-fg-muted">{d.noKeyPoints}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {entry.keyPoints.map((point) => (
                <li
                  key={point.text}
                  className="flex gap-3 text-base text-fg"
                  data-testid="library-point"
                >
                  <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-signal" />
                  <span>
                    {point.text}
                    {point.byClaude && (
                      <span className="ml-1.5 text-sm text-fg-muted">{t.byClaude}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hasClaudePoints && (
            <p className="flex items-start gap-2 text-sm text-fg-muted">
              <Sparkles size={15} aria-hidden className="mt-0.5 shrink-0 text-accent" />
              {d.claudeHint}
            </p>
          )}
        </Section>

        <Section title={t.fields.thoughts} testId="library-thoughts-section">
          {entry.thoughts ? (
            <p className="text-base whitespace-pre-line text-fg">{entry.thoughts}</p>
          ) : (
            <p className="text-base text-fg-muted">{d.noThoughts}</p>
          )}
        </Section>
      </div>

      {editing && <LibraryEditor entry={entry} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          const removed = await libraryActions.remove(entry.id);
          void navigate('/library');
          toast.success(d.deleted(removed.title), {
            label: d.undo,
            onSelect: () => {
              void libraryActions.restore(removed).catch(() => toast.error(t.saveFailed));
            },
          });
        }}
        title={d.deleteTitle}
        message={d.deleteText}
        confirmLabel={d.delete}
      />
    </Page>
  );
}
