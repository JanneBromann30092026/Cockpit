import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { ListPlus, Plus, Sparkles } from 'lucide-react';
import { Badge, Button, ChoiceChip, EmptyState, SearchInput } from '@/components/ui';
import { useHotkeys } from '@/app/hooks/useHotkeys';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { Page } from '@/app/shell/Page';
import { libraryStats, searchEntries, topicCounts } from '@/core/library/library';
import { LIBRARY_TYPES, type LibraryType } from '@/data/domain';
import type { LibraryEntry } from '@/data/schemas';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { ImportPanel } from './ImportPanel';
import { LibraryAskCard } from './LibraryAskCard';
import { LibraryEditor } from './LibraryEditor';
import { sourceLine, TYPE_ICONS, useLibraryEntries } from './useLibrary';

const t = de.library;

/** Topic chips shown before "+ n Themen". */
const VISIBLE_TOPICS = 10;

function EntryCard({ entry }: { entry: LibraryEntry }) {
  const Icon = TYPE_ICONS[entry.type];
  const claude = entry.keyPoints.some((point) => point.byClaude);
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid="library-card"
    >
      <Link
        to={`/library/${entry.id}`}
        className="focus-ring flex h-full items-start gap-4 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors active:bg-accent-soft [@media(hover:hover)]:hover:border-line-strong"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon size={21} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-base font-semibold break-words text-fg">{entry.title}</span>
          <span className="truncate text-sm text-fg-secondary">{sourceLine(entry)}</span>
          {entry.keyPoints[0] && (
            <span className="line-clamp-2 text-sm text-fg">{entry.keyPoints[0].text}</span>
          )}
          {(entry.topics.length > 0 || entry.keyPoints.length > 1) && (
            <span className="flex flex-wrap gap-1.5 pt-1">
              {entry.topics.slice(0, 3).map((topic) => (
                <Badge key={topic} tone="signal">
                  #{topic}
                </Badge>
              ))}
              {entry.keyPoints.length > 1 && (
                <Badge>
                  {claude && <Sparkles size={12} aria-hidden />}
                  {t.keyPointsCount(entry.keyPoints.length)}
                </Badge>
              )}
            </span>
          )}
        </span>
      </Link>
    </motion.li>
  );
}

/** Life library: questions with sources, search, types and topics, adding one or a list. */
export function LibraryPage() {
  const today = useLocalDate();
  const entries = useLibraryEntries();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [type, setType] = useState<LibraryType | null>(null);
  const topic = params.get('topic');
  const [allTopics, setAllTopics] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const stats = useMemo(() => libraryStats(entries, today), [entries, today]);
  const topics = useMemo(() => topicCounts(entries), [entries]);
  const visible = useMemo(
    () => searchEntries(entries, query, { type, topic }),
    [entries, query, type, topic],
  );
  const presentTypes = LIBRARY_TYPES.filter((key) => (stats.byType[key] ?? 0) > 0);
  const shownTopics = allTopics ? topics : topics.slice(0, VISIBLE_TOPICS);

  const setTopic = (next: string | null) => {
    const updated = new URLSearchParams(params);
    if (next) updated.set('topic', next);
    else updated.delete('topic');
    setParams(updated, { replace: true });
  };

  useHotkeys([
    {
      combo: 'n',
      handler: () => {
        if (document.querySelector('[aria-modal="true"]')) return;
        setAdding(true);
      },
    },
    {
      combo: 'l',
      handler: () => {
        if (document.querySelector('[aria-modal="true"]')) return;
        setImporting(true);
      },
    },
  ]);

  return (
    <Page
      title={t.title}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            icon={ListPlus}
            onClick={() => setImporting(true)}
            aria-label={t.addList}
            data-testid="library-import-open"
          >
            <span className="hidden sm:inline">{t.addList}</span>
          </Button>
          <Button
            size="sm"
            icon={Plus}
            onClick={() => setAdding(true)}
            aria-label={t.add}
            data-testid="library-add"
          >
            <span className="hidden sm:inline">{t.add}</span>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6" data-testid="library-page">
        {entries.length === 0 ? (
          <EmptyState
            title={t.empty}
            text={t.emptyText}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={Plus} onClick={() => setAdding(true)}>
                  {t.add}
                </Button>
                <Button
                  variant="secondary"
                  icon={ListPlus}
                  onClick={() => setImporting(true)}
                  data-testid="library-import-empty"
                >
                  {t.addList}
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <p className="-mt-1 px-1 text-base text-fg-secondary" data-testid="library-summary">
              {t.count(stats.total)}
              {stats.thisYear > 0 && ` · ${t.thisYear(stats.thisYear)}`}
            </p>

            <LibraryAskCard
              entries={entries}
              onShowAll={(terms) => {
                setQuery(terms);
                setType(null);
                setTopic(null);
              }}
            />

            <div className="flex flex-col gap-3">
              <SearchInput
                value={query}
                onChange={setQuery}
                label={t.search}
                clearLabel={de.ui.clear}
                placeholder={t.searchPlaceholder}
                data-testid="library-search"
              />
              {presentTypes.length > 1 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t.filterTypes}>
                  <ChoiceChip selected={type === null} onToggle={() => setType(null)}>
                    {t.allTypes}
                  </ChoiceChip>
                  {presentTypes.map((key) => (
                    <ChoiceChip
                      key={key}
                      selected={type === key}
                      onToggle={() => setType(type === key ? null : key)}
                    >
                      {`${t.typesPlural[key]} · ${stats.byType[key] ?? 0}`}
                    </ChoiceChip>
                  ))}
                </div>
              )}
              {topics.length > 0 && (
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label={t.filterTopics}
                  data-testid="library-topic-filter"
                >
                  <ChoiceChip selected={topic === null} onToggle={() => setTopic(null)}>
                    {t.allTopics}
                  </ChoiceChip>
                  {shownTopics.map((item) => (
                    <ChoiceChip
                      key={item.topic}
                      selected={topic?.toLowerCase() === item.topic.toLowerCase()}
                      onToggle={() =>
                        setTopic(
                          topic?.toLowerCase() === item.topic.toLowerCase() ? null : item.topic,
                        )
                      }
                    >
                      {`#${item.topic}`}
                    </ChoiceChip>
                  ))}
                  {topics.length > VISIBLE_TOPICS && (
                    <Button size="sm" variant="ghost" onClick={() => setAllTopics(!allTopics)}>
                      {allTopics ? t.fewerTopics : t.moreTopics(topics.length - VISIBLE_TOPICS)}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {visible.length === 0 ? (
              <p className="px-1 text-base text-fg-muted">{t.emptyFiltered}</p>
            ) : (
              <ul className="grid gap-3 wide:grid-cols-2" data-testid="library-list">
                {visible.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {adding && <LibraryEditor onClose={() => setAdding(false)} />}
      {importing && <ImportPanel onClose={() => setImporting(false)} />}
    </Page>
  );
}
