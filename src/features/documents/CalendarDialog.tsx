import { useState } from 'react';
import { CalendarPlus, Share } from 'lucide-react';
import { Button, Modal, toast } from '@/components/ui';
import { buildIcs } from '@/core/calendar/ics';
import { deadlineEvents } from '@/core/documents/calendar';
import { deadlines } from '@/core/documents/contracts';
import { formatDeadlineDate } from '@/core/format';
import type { DocumentRecord } from '@/data/schemas';
import { de } from '@/i18n/de';
import { canShareFile, downloadFile } from '@/services/share';

const t = de.documents.calendar;
const PREVIEW = 5;

function createFile(documents: readonly DocumentRecord[], today: string) {
  const events = deadlineEvents(deadlines(documents, today), {
    summary: t.summary,
    description: t.description,
  });
  const ics = buildIcs(events, new Date(), { alarm: t.alarm });
  return { events, file: new File([ics], t.fileName, { type: 'text/calendar' }) };
}

/**
 * Cancel dates and term ends as .ics file. The file is created when the dialog opens, so
 * sharing runs directly in the tap (iPadOS needs a fresh user gesture).
 */
export function CalendarDialog({
  documents,
  today,
  onClose,
}: {
  documents: readonly DocumentRecord[];
  today: string;
  onClose: () => void;
}) {
  const [{ file, events }] = useState(() => createFile(documents, today));
  const canShare = canShareFile(file);

  const share = () => {
    navigator.share({ files: [file], title: t.title }).then(onClose, (error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast.error(t.shareFailed);
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t.title}
      description={events.length > 0 ? t.text(events.length) : t.none}
      footer={
        events.length > 0 && (
          <>
            <Button
              variant={canShare ? 'secondary' : 'primary'}
              icon={CalendarPlus}
              onClick={() => downloadFile(file, file.name)}
              data-testid="calendar-download"
            >
              {t.download}
            </Button>
            {canShare && (
              <Button icon={Share} onClick={share} data-testid="calendar-share">
                {t.share}
              </Button>
            )}
          </>
        )
      }
    >
      {events.length > 0 && (
        <div className="flex flex-col gap-4" data-testid="calendar-dialog">
          <p className="rounded-lg bg-accent-soft px-4 py-3 text-base text-fg">{t.privacy}</p>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-fg-secondary">{t.preview}</p>
            <ul className="flex flex-col gap-1.5" data-testid="calendar-preview">
              {events.slice(0, PREVIEW).map((event) => (
                <li
                  key={event.uid}
                  className="flex gap-3 rounded-lg bg-surface-sunken px-3 py-2 text-base"
                >
                  <span className="shrink-0 text-fg-secondary tabular-nums">
                    {formatDeadlineDate(event.date, today)}
                  </span>
                  <span className="min-w-0 truncate text-fg">{event.summary}</span>
                </li>
              ))}
            </ul>
            {events.length > PREVIEW && (
              <p className="text-sm text-fg-muted">{t.more(events.length - PREVIEW)}</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
