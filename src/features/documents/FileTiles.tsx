import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Eye, FileText, Paperclip, Share, Sparkles, Trash2 } from 'lucide-react';
import {
  ActionMenuButton,
  Button,
  ConfirmDialog,
  toast,
  type ActionMenuItem,
} from '@/components/ui';
import { formatBytes, formatShortDate } from '@/core/format';
import { documentActions, FileRejectedError } from '@/data/repositories';
import type { DocumentRecord, FileMeta } from '@/data/schemas';
import { de } from '@/i18n/de';
import { shareFile } from '@/services/share';
import { FileViewer } from './FileViewer';

const t = de.documents.file;

/** Thumbnail of a photo, decrypted for as long as the tile is shown. */
function Thumbnail({ documentId, file }: { documentId: string; file: FileMeta }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let created: string | null = null;
    let cancelled = false;
    documentActions.readFile(documentId, file.id).then(
      (blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [documentId, file.id]);
  return url ? (
    <img src={url} alt="" className="size-full object-cover" />
  ) : (
    <span className="size-full animate-pulse bg-surface-sunken" />
  );
}

function rejectionText(error: unknown): string {
  if (error instanceof FileRejectedError) return t[error.reason];
  return t.saveFailed;
}

/**
 * The originals of a contract: open, share/save, read with Claude (when AI is on), remove –
 * and attach new ones.
 */
export function FileTiles({
  document,
  onExtract,
}: {
  document: DocumentRecord;
  onExtract?: (fileId: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<FileMeta | null>(null);
  const [removing, setRemoving] = useState<FileMeta | null>(null);

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setAdding(true);
    for (const file of files) {
      try {
        await documentActions.addFile(document.id, {
          name: file.name,
          type: file.type,
          data: new Uint8Array(await file.arrayBuffer()),
        });
        toast.success(t.added(file.name));
      } catch (error: unknown) {
        toast.error(rejectionText(error));
      }
    }
    setAdding(false);
  };

  const share = async (file: FileMeta) => {
    try {
      const blob = await documentActions.readFile(document.id, file.id);
      await shareFile(new File([blob], file.name, { type: file.type }));
    } catch {
      toast.error(t.failed);
    }
  };

  const items = (file: FileMeta): ActionMenuItem[] => [
    { id: 'open', label: t.open, icon: Eye, onSelect: () => setViewing(file) },
    ...(onExtract
      ? [
          {
            id: 'extract',
            label: de.documents.extract.action,
            icon: Sparkles,
            onSelect: () => onExtract(file.id),
          },
        ]
      : []),
    { id: 'share', label: t.share, icon: Share, onSelect: () => void share(file) },
    {
      id: 'remove',
      label: t.remove,
      icon: Trash2,
      danger: true,
      onSelect: () => setRemoving(file),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {document.files.length === 0 ? (
        <p className="text-base text-fg-muted">{de.documents.detail.filesEmpty}</p>
      ) : (
        <ul
          className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3"
          data-testid="file-tiles"
        >
          {document.files.map((file) => {
            const image = file.type.startsWith('image/');
            return (
              <li
                key={file.id}
                className="relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface-raised"
                data-testid="file-tile"
              >
                <button
                  type="button"
                  onClick={() => setViewing(file)}
                  className="focus-ring flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-sunken text-accent"
                  aria-label={`${t.open}: ${file.name}`}
                >
                  {image ? (
                    <Thumbnail documentId={document.id} file={file} />
                  ) : (
                    <FileText size={40} aria-hidden strokeWidth={1.6} />
                  )}
                </button>
                <div className="flex items-start gap-1 py-1.5 pr-1 pl-3">
                  <div className="flex min-w-0 flex-1 flex-col py-1">
                    <span className="truncate text-sm font-medium text-fg">{file.name}</span>
                    <span className="truncate text-xs text-fg-muted">
                      {image ? t.kinds.image : t.kinds.pdf} · {formatBytes(file.size)} ·{' '}
                      {formatShortDate(file.addedAt.slice(0, 10))}
                    </span>
                  </div>
                  <ActionMenuButton items={items(file)} label={t.actions(file.name)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        multiple
        className="hidden"
        onChange={(event) => void onFiles(event)}
        data-testid="file-input"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={Paperclip}
          loading={adding}
          onClick={() => input.current?.click()}
          data-testid="file-add"
        >
          {adding ? de.documents.detail.adding : de.documents.detail.addFile}
        </Button>
        {onExtract && document.files.length > 0 && (
          <Button
            variant="secondary"
            icon={Sparkles}
            onClick={() => onExtract(document.files[0]?.id ?? '')}
            data-testid="file-extract"
          >
            {de.documents.extract.action}
          </Button>
        )}
      </div>
      {viewing && (
        <FileViewer documentId={document.id} file={viewing} onClose={() => setViewing(null)} />
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await documentActions.removeFile(document.id, removing.id);
          toast.success(t.removed);
        }}
        title={t.removeTitle}
        message={t.removeText}
        confirmLabel={t.remove}
        variant="danger"
      />
    </div>
  );
}
