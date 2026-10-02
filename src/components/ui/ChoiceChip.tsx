import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';

export interface ChoiceChipProps {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}

/** Pill that toggles a filter or option (aria-pressed); 44 px touch target. */
export function ChoiceChip({ selected, onToggle, children, className }: ChoiceChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'focus-ring no-callout inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors duration-150',
        selected
          ? 'border-transparent bg-accent text-on-accent'
          : 'border-line bg-surface-raised text-fg hover:border-line-strong',
        className,
      )}
    >
      {selected && <Check size={15} aria-hidden strokeWidth={2.6} />}
      {children}
    </button>
  );
}
