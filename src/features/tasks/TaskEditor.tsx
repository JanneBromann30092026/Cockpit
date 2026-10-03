import { useState } from 'react';
import { Button, ChoiceChip, Input, SegmentedControl, Textarea, toast } from '@/components/ui';
import { EditPanel } from '@/app/shell/EditPanel';
import { addDays } from '@/core/dates';
import { PRIORITIES, type Priority } from '@/data/domain';
import { taskActions } from '@/data/repositories';
import { LIMITS, type Task } from '@/data/schemas';
import { de } from '@/i18n/de';

const t = de.tasks;

const PRIORITY_OPTIONS = PRIORITIES.map((value) => ({ value, label: t.priorities[value] }));

/** New task (optionally with a preset due date) or editing an existing one. */
export function TaskEditor({
  task,
  today,
  defaultDueDate,
  onClose,
}: {
  task?: Task;
  today: string;
  defaultDueDate?: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [dueDate, setDueDate] = useState(task ? (task.dueDate ?? '') : (defaultDueDate ?? ''));
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const missingTitle = title.trim() === '';

  const quickDates = [
    { label: t.quickToday, value: today },
    { label: t.quickTomorrow, value: addDays(today, 1) },
    { label: t.nextWeek, value: addDays(today, 7) },
    { label: t.noDate, value: '' },
  ];

  const save = async () => {
    setTouched(true);
    if (missingTitle) return;
    setSaving(true);
    const fields = {
      title: title.trim(),
      dueDate: dueDate || undefined,
      priority,
      notes: notes.trim() || undefined,
    };
    try {
      if (task) {
        await taskActions.edit(task.id, fields);
        toast.success(t.toastSaved);
      } else {
        await taskActions.create(fields);
        toast.success(t.toastAdded(fields.title));
      }
      onClose();
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditPanel
      open
      onClose={onClose}
      title={task ? t.editTitle : t.add}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={() => void save()} loading={saving} data-testid="task-save">
            {t.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5" data-testid="task-editor">
        <Input
          label={t.titleField}
          placeholder={t.titlePlaceholder}
          value={title}
          maxLength={LIMITS.title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void save();
            }
          }}
          error={touched && missingTitle ? t.required : undefined}
          enterKeyHint="done"
          autoFocus={!task}
          data-testid="task-title-input"
        />
        <div className="flex flex-col gap-2">
          <Input
            type="date"
            label={t.dueDate}
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            data-testid="task-date"
          />
          <div className="flex flex-wrap gap-2">
            {quickDates.map((option) => (
              <ChoiceChip
                key={option.label}
                selected={dueDate === option.value}
                onToggle={() => setDueDate(option.value)}
              >
                {option.label}
              </ChoiceChip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg-secondary">{t.priority}</span>
          <SegmentedControl
            label={t.priority}
            options={PRIORITY_OPTIONS}
            value={priority}
            onChange={setPriority}
            className="self-start"
          />
        </div>
        <Textarea
          label={t.notes}
          value={notes}
          maxLength={LIMITS.text}
          onChange={(event) => setNotes(event.target.value)}
          data-testid="task-notes"
        />
      </div>
    </EditPanel>
  );
}
