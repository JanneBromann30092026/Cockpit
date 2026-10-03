import { useState, type FormEvent, type RefObject } from 'react';
import { Plus } from 'lucide-react';
import { Button, ChoiceChip, Input, toast } from '@/components/ui';
import { addDays } from '@/core/dates';
import { taskActions } from '@/data/repositories';
import { LIMITS } from '@/data/schemas';
import { de } from '@/i18n/de';

const t = de.tasks;

type When = 'today' | 'tomorrow' | null;

/** Title, Enter – done. Optional: due today or tomorrow, high priority. */
export function QuickAdd({
  today,
  inputRef,
}: {
  today: string;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<When>(null);
  const [high, setHigh] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await taskActions.create({
        title: trimmed,
        dueDate: when === 'today' ? today : when === 'tomorrow' ? addDays(today, 1) : undefined,
        priority: high ? 'high' : 'medium',
      });
      // The options apply to this one task; the next starts plain again.
      setTitle('');
      setWhen(null);
      setHigh(false);
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3"
      data-testid="quick-add"
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input
            ref={inputRef}
            aria-label={t.add}
            placeholder={t.quickPlaceholder}
            value={title}
            maxLength={LIMITS.title}
            onChange={(event) => setTitle(event.target.value)}
            enterKeyHint="done"
            data-testid="quick-add-input"
          />
        </div>
        <Button
          type="submit"
          icon={Plus}
          loading={saving}
          disabled={!title.trim()}
          aria-label={t.quickAdd}
          data-testid="quick-add-submit"
        >
          <span className="hidden sm:inline">{t.quickAdd}</span>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.quickOptions}>
        <ChoiceChip
          selected={when === 'today'}
          onToggle={() => setWhen(when === 'today' ? null : 'today')}
        >
          {t.quickToday}
        </ChoiceChip>
        <ChoiceChip
          selected={when === 'tomorrow'}
          onToggle={() => setWhen(when === 'tomorrow' ? null : 'tomorrow')}
        >
          {t.quickTomorrow}
        </ChoiceChip>
        <ChoiceChip selected={high} onToggle={() => setHigh(!high)}>
          {t.quickHigh}
        </ChoiceChip>
      </div>
    </form>
  );
}
