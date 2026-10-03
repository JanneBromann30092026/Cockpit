import { useState } from 'react';
import { Button, Input, Modal } from '@/components/ui';
import { de } from '@/i18n/de';

const t = de.tasks;

/** Postponing to a chosen date. */
export function DateDialog({
  initial,
  onClose,
  onConfirm,
}: {
  initial: string;
  onClose: () => void;
  onConfirm: (date: string) => void;
}) {
  const [date, setDate] = useState(initial);
  return (
    <Modal
      open
      onClose={onClose}
      title={t.postponeTitle}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            onClick={() => date && onConfirm(date)}
            disabled={!date}
            data-testid="date-confirm"
          >
            {t.save}
          </Button>
        </>
      }
    >
      <Input
        type="date"
        label={t.dueDate}
        value={date}
        onChange={(event) => setDate(event.target.value)}
        data-testid="date-input"
      />
    </Modal>
  );
}
