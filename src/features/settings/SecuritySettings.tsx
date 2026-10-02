import { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { Button, Select } from '@/components/ui';
import { LOCK_AFTER_MINUTES, type LockAfterMinutes } from '@/core/lock';
import { de } from '@/i18n/de';
import { useVault, vault } from '@/services/vault';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { useSettings } from './settingsStore';

const t = de.settings.security;

const lockOptions = LOCK_AFTER_MINUTES.map((minutes) => ({
  value: String(minutes) as `${LockAfterMinutes}`,
  label: t.lockAfterOption(minutes),
}));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-base text-fg">{label}</span>
      {children}
    </div>
  );
}

/** Lock now, automatic lock time, password change and the encryption parameters. */
export function SecuritySettings() {
  const lockAfterMinutes = useSettings((s) => s.lockAfterMinutes);
  const devMode = useSettings((s) => s.devMode);
  const set = useSettings((s) => s.set);
  const iterations = useVault((s) => s.iterations);
  const lastDerivationMs = useVault((s) => s.lastDerivationMs);
  const [changing, setChanging] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Row label={t.lockNowLabel}>
        <Button
          variant="secondary"
          size="sm"
          icon={Lock}
          onClick={() => vault.lock('manual')}
          data-testid="lock-now"
        >
          {t.lockNow}
        </Button>
      </Row>
      <div className="h-px bg-line" />
      <Select
        label={t.lockAfter}
        hint={t.lockAfterHint}
        options={lockOptions}
        value={String(lockAfterMinutes) as `${LockAfterMinutes}`}
        onChange={(value) => void set('lockAfterMinutes', Number(value) as LockAfterMinutes)}
        data-testid="lock-after"
      />
      <div className="h-px bg-line" />
      <Row label={t.password}>
        <Button variant="secondary" size="sm" icon={KeyRound} onClick={() => setChanging(true)}>
          {t.changePassword}
        </Button>
      </Row>
      <div className="h-px bg-line" />
      <dl className="flex flex-col gap-1">
        <dt className="text-sm text-fg-secondary">{t.encryption}</dt>
        <dd className="text-sm font-medium text-fg" data-testid="encryption-info">
          {iterations ? t.encryptionValue(iterations) : '–'}
        </dd>
        {devMode && lastDerivationMs !== null && (
          <>
            <dt className="mt-2 text-sm text-fg-secondary">{t.lastDerivation}</dt>
            <dd className="text-sm font-medium text-fg" data-testid="derivation-ms">
              {t.lastDerivationValue(lastDerivationMs)}
            </dd>
          </>
        )}
      </dl>
      <ChangePasswordDialog open={changing} onClose={() => setChanging(false)} />
    </div>
  );
}
