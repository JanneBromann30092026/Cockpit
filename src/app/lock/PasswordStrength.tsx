import { passwordScore } from '@/core/crypto/passwordStrength';
import { cn } from '@/components/ui';
import { de } from '@/i18n/de';

const TONES = ['bg-line-strong', 'bg-danger', 'bg-warning', 'bg-signal', 'bg-success'] as const;

/** Four segments that fill with the estimated strength (a hint, never blocking). */
export function PasswordStrength({ password }: { password: string }) {
  const score = passwordScore(password);
  const label = de.lock.strengthLabels[score] ?? '';
  return (
    <div
      className="flex items-center gap-3 px-1"
      data-testid="password-strength"
      data-score={score}
    >
      <div className="flex flex-1 gap-1.5" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors duration-200',
              password && score >= step ? TONES[score] : 'bg-line-strong',
            )}
          />
        ))}
      </div>
      <span className="min-w-20 text-right text-sm text-fg-secondary" aria-live="polite">
        {password ? `${de.lock.strength}: ${label}` : ''}
      </span>
    </div>
  );
}
