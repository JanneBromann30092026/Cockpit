import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Surface, toast } from '@/components/ui';
import { DATA_TABLES } from '@/data/db';
import { PRIORITIES } from '@/data/domain';
import { tasksRepo } from '@/data/repositories';
import { devRepo, type RawPreview } from '@/data/repositories/devRepo';
import { useDataStore } from '@/data/store';
import { de } from '@/i18n/de';

const t = de.dev.vault;

function pick<T>(list: readonly T[], index: number): T {
  return list[index % list.length] as T;
}

/** Calendar date "JJJJ-MM-TT" in local time, `days` from today. */
function localDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-surface-sunken px-4 py-3">
      <span className="truncate text-sm text-fg-secondary">{label}</span>
      <span className="text-xl font-semibold text-fg tabular-nums" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

/** Creates, changes and deletes invented tasks to check encryption and sync. */
export function VaultDevSection() {
  const state = useDataStore();
  const tasks = state.tasks;
  const [raw, setRaw] = useState<RawPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const list = Object.values(tasks).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const newest = list[0];

  // Refresh the raw view whenever the decrypted data changes (also from other tabs).
  useEffect(() => {
    let cancelled = false;
    void devRepo.newestRow('tasks').then((row) => {
      if (!cancelled) setRaw(row);
    });
    return () => {
      cancelled = true;
    };
  }, [tasks]);

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      toast.success(await action());
    } catch {
      toast.error(de.lock.errors.failed);
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const index = list.length;
      const task = await tasksRepo.create({
        title: pick(t.testTitles, index),
        priority: pick(PRIORITIES, index),
        dueDate: localDate(index % 5),
        demo: true,
      });
      return t.created(task.title);
    });

  const update = () =>
    run(async () => {
      if (!newest) return '';
      const next = pick(PRIORITIES, PRIORITIES.indexOf(newest.priority) + 1);
      const updated = await tasksRepo.update(newest.id, { priority: next });
      return t.updated(updated.title);
    });

  const remove = () =>
    run(async () => {
      if (!newest) return '';
      await tasksRepo.remove(newest.id);
      return t.removed(newest.title);
    });

  return (
    <section className="flex flex-col gap-3" data-testid="dev-section-vault">
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">
        {t.title}
      </h2>
      <Surface className="flex flex-col gap-5">
        <p className="text-base text-fg-secondary">{t.hint}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {DATA_TABLES.map((table) => (
            <Stat
              key={table}
              label={t.tables[table]}
              value={Object.keys(state[table]).length}
              testId={`vault-count-${table}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button icon={Plus} onClick={() => void create()} loading={busy}>
            {t.create}
          </Button>
          <Button
            variant="secondary"
            icon={Pencil}
            onClick={() => void update()}
            disabled={!newest || busy}
          >
            {t.update}
          </Button>
          <Button
            variant="secondary"
            icon={Trash2}
            onClick={() => void remove()}
            disabled={!newest || busy}
          >
            {t.remove}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg-secondary">{t.decrypted}</h3>
            {list.length === 0 && <p className="text-sm text-fg-muted">{t.empty}</p>}
            <ul className="flex flex-col gap-1.5" data-testid="vault-tasks">
              {list.slice(0, 5).map((task) => (
                <li key={task.id} className="flex items-center gap-2 text-base text-fg">
                  <Badge tone={task.priority === 'high' ? 'signal' : 'neutral'}>
                    {t.priorities[task.priority]}
                  </Badge>
                  <span className="min-w-0 truncate">{task.title}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg-secondary">{t.stored}</h3>
            {raw ? (
              <dl
                className="flex flex-col gap-1 font-mono text-xs break-all text-fg-secondary"
                data-testid="vault-raw"
              >
                <dt className="text-fg-muted">id</dt>
                <dd>{raw.id}</dd>
                <dt className="text-fg-muted">{t.iv}</dt>
                <dd>{raw.iv}</dd>
                <dt className="text-fg-muted">
                  {t.ciphertext} ({t.bytes(raw.bytes)})
                </dt>
                <dd>{raw.ciphertext}…</dd>
              </dl>
            ) : (
              <p className="text-sm text-fg-muted">{t.empty}</p>
            )}
          </div>
        </div>
      </Surface>
    </section>
  );
}
