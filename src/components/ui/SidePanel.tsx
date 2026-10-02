import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { X } from 'lucide-react';
import { de } from '@/i18n/de';
import { fade, spring } from '@/styles/motion';
import { cn } from './cn';
import { useEscape } from './hooks/useEscape';
import { useFocusTrap } from './hooks/useFocusTrap';
import { useKeyboardInset } from './hooks/useKeyboardInset';
import { IconButton } from './IconButton';
import { Portal } from './Portal';

export interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Panel sliding in from the right (wide layout): editing next to the content. */
export function SidePanel({ open, onClose, ...rest }: SidePanelProps) {
  return (
    <Portal>
      <AnimatePresence>
        {open && <Panel key="side-panel" onClose={onClose} {...rest} />}
      </AnimatePresence>
    </Portal>
  );
}

function Panel({ onClose, title, description, children, footer }: Omit<SidePanelProps, 'open'>) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const isPresent = useIsPresent();
  useFocusTrap(panel, true);
  useEscape(onClose, true);
  const keyboardInset = useKeyboardInset();

  // The keyboard covers the lower part: keep the focused field in view.
  useEffect(() => {
    if (!keyboardInset) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && panel.current?.contains(active)) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [keyboardInset]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex justify-end pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        !isPresent && 'pointer-events-none',
      )}
      style={keyboardInset ? { paddingBottom: keyboardInset + 12 } : undefined}
    >
      <motion.div
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        initial={{ x: '105%' }}
        animate={{ x: 0 }}
        exit={{ x: '105%' }}
        transition={spring.default}
        className="relative flex h-full w-[min(30rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface-raised shadow-float outline-none"
      >
        <header className="flex items-start gap-3 px-6 pt-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2">
            <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight text-fg">
              {title}
            </h2>
            {description && (
              <p id={`${id}-desc`} className="text-base text-fg-secondary">
                {description}
              </p>
            )}
          </div>
          <IconButton icon={X} label={de.ui.close} onClick={onClose} className="-mr-2" />
        </header>
        <div className="scroll-area min-h-0 flex-1 px-6 pt-4 pb-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-6 pt-4 pb-5">
            {footer}
          </footer>
        )}
      </motion.div>
    </div>
  );
}
