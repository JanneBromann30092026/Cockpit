import { useState } from 'react';
import { FilePlus, ListPlus, NotebookPen, Trash2 } from 'lucide-react';
import { Badge, Button, Surface, toast } from '@/components/ui';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { demoDocuments } from '@/data/demo/documents';
import { demoReviews } from '@/data/demo/reviews';
import { demoTaskInputs } from '@/data/demo/tasks';
import { demoActions } from '@/data/repositories';
import { useDataStore } from '@/data/store';
import { de } from '@/i18n/de';

const t = de.dev.demoData;

/** Invented, encrypted demo records (marked as demo) – and removing exactly those. */
export function DemoDataSection() {
  const today = useLocalDate();
  const [busy, setBusy] = useState(false);
  // Re-render on every data change; the count itself comes from the repository.
  useDataStore((state) => state.tasks);
  useDataStore((state) => state.documents);
  useDataStore((state) => state.reviews);
  const count = demoActions.count();

  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      toast.success(await action());
    } catch {
      toast.error(de.tasks.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3" data-testid="dev-section-demo">
      <h2 className="px-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">
        {t.title}
      </h2>
      <Surface className="flex flex-col gap-4">
        <p className="text-base text-fg-secondary">{t.hint}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            icon={ListPlus}
            loading={busy}
            onClick={() =>
              void run(async () => t.created(await demoActions.createTasks(demoTaskInputs(today))))
            }
            data-testid="dev-demo-tasks"
          >
            {t.createTasks}
          </Button>
          <Button
            variant="secondary"
            icon={FilePlus}
            loading={busy}
            onClick={() =>
              void run(async () =>
                t.createdDocuments(await demoActions.createDocuments(demoDocuments(today))),
              )
            }
            data-testid="dev-demo-documents"
          >
            {t.createDocuments}
          </Button>
          <Button
            variant="secondary"
            icon={NotebookPen}
            loading={busy}
            onClick={() =>
              void run(async () =>
                t.createdReviews(await demoActions.createReviews(demoReviews(today))),
              )
            }
            data-testid="dev-demo-reviews"
          >
            {t.createReviews}
          </Button>
          <Button
            variant="secondary"
            icon={Trash2}
            disabled={busy || count === 0}
            onClick={() => void run(async () => t.removed(await demoActions.removeAll()))}
            data-testid="dev-demo-remove"
          >
            {t.removeAll}
          </Button>
          <Badge>
            <span data-testid="dev-demo-count">{t.count(count)}</span>
          </Badge>
        </div>
      </Surface>
    </section>
  );
}
