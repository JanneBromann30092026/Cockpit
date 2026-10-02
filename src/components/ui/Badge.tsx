import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'accent' | 'signal' | 'success' | 'danger' | 'warning';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-fg-secondary border border-line',
  accent: 'bg-accent-soft text-accent',
  signal: 'bg-signal-soft text-signal-fg',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
