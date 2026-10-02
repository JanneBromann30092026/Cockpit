import { useState } from 'react';
import { Button, Input, Modal } from '@/components/ui';
import { de } from '@/i18n/de';
import { vault } from '@/services/vault';

const t = de.lock;

/** The only way out without the password: delete everything (typed confirmation). */
export function ForgotPasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const confirmed = word.trim().toLocaleUpperCase('de-DE') === t.resetConfirmWord;

  const reset = async () => {
    setBusy(true);
    await vault.resetAll();
    window.location.reload();
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={t.forgotTitle}
      description={t.forgotText}
      size="sm"
      role="alertdialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {de.ui.cancel}
          </Button>
          <Button
            variant="danger"
            disabled={!confirmed}
            loading={busy}
            onClick={() => void reset()}
          >
            {t.resetSubmit}
          </Button>
        </>
      }
    >
      <Input
        label={t.resetConfirmLabel}
        value={word}
        onChange={(event) => setWord(event.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        data-testid="reset-confirm"
      />
    </Modal>
  );
}
