import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Share, X } from 'lucide-react';
import { Button, IconButton, Spinner, toast } from '@/components/ui';
import { Portal } from '@/components/ui/Portal';
import { useEscape } from '@/components/ui/hooks/useEscape';
import { useFocusTrap } from '@/components/ui/hooks/useFocusTrap';
import { documentActions } from '@/data/repositories';
import type { FileMeta } from '@/data/schemas';
import { de } from '@/i18n/de';
import { shareFile } from '@/services/share';
import { spring } from '@/styles/motion';

const t = de.documents.file;

/**
 * Full-screen view of a decrypted original: photos as image, PDFs in a frame. The
 * decrypted content exists only as a temporary blob URL while the viewer is open.
 */
export function FileViewer({
  documentId,
  file,
  onClose,
}: {
  documentId: string;
  file: FileMeta;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ url: string; blob: Blob } | 'loading' | 'error'>('loading');
  useFocusTrap(panel, true);
  useEscape(onClose, true);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    documentActions.readFile(documentId, file.id).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ url, blob });
      },
      () => {
        if (!cancelled) setState('error');
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentId, file.id]);

  const share = () => {
    if (typeof state !== 'object') return;
    shareFile(new File([state.blob], file.name, { type: file.type })).catch(() =>
      toast.error(t.shareFailed),
    );
  };

  const isPdf = file.type === 'application/pdf';

  return (
    <Portal>
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={file.name}
        className="fixed inset-0 z-50 flex flex-col bg-bg"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={spring.default}
        data-testid="file-viewer"
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-[max(1rem,env(safe-area-inset-left))] pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-fg">{file.name}</h2>
          <Button
            size="sm"
            variant="secondary"
            icon={Share}
            onClick={share}
            disabled={typeof state !== 'object'}
            data-testid="file-share"
          >
            {t.share}
          </Button>
          <IconButton icon={X} label={t.close} onClick={onClose} data-testid="file-close" />
        </header>
        <div className="relative min-h-0 flex-1 bg-surface-sunken">
          {state === 'loading' && (
            <div className="flex h-full items-center justify-center text-fg-muted">
              <Spinner size={28} label={t.loading} />
            </div>
          )}
          {state === 'error' && (
            <p role="alert" className="p-6 text-base text-danger">
              {t.failed}
            </p>
          )}
          {typeof state === 'object' &&
            (isPdf ? (
              <iframe
                src={state.url}
                title={file.name}
                className="h-full w-full border-0 bg-white"
                data-testid="file-pdf"
              />
            ) : (
              <img
                src={state.url}
                alt={file.name}
                className="h-full w-full object-contain"
                data-testid="file-image"
              />
            ))}
        </div>
        {isPdf && (
          <p className="shrink-0 border-t border-line px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-sm text-fg-muted">
            {t.pdfHint}
          </p>
        )}
      </motion.div>
    </Portal>
  );
}
