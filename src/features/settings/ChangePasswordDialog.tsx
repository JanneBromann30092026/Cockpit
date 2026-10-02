import { useState, type FormEvent } from 'react';
import { Button, Modal, PasswordInput, toast } from '@/components/ui';
import { MIN_PASSWORD_LENGTH } from '@/core/crypto/passwordStrength';
import { PasswordStrength } from '@/app/lock/PasswordStrength';
import { de } from '@/i18n/de';
import { vault } from '@/services/vault';

const t = de.settings.changePassword;

type FieldError = { field: 'current' | 'next' | 'repeat'; text: string };

export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<FieldError>();
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setCurrent('');
    setNext('');
    setRepeat('');
    setError(undefined);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (Array.from(next).length < MIN_PASSWORD_LENGTH) {
      setError({ field: 'next', text: de.lock.errors.tooShort(MIN_PASSWORD_LENGTH) });
      return;
    }
    if (next !== repeat) {
      setError({ field: 'repeat', text: de.lock.errors.mismatch });
      return;
    }
    setBusy(true);
    try {
      if (!(await vault.changePassword(current, next))) {
        setError({ field: 'current', text: t.wrongCurrent });
        return;
      }
      toast.success(t.done);
      setBusy(false);
      setCurrent('');
      setNext('');
      setRepeat('');
      setError(undefined);
      onClose();
    } catch {
      setError({ field: 'current', text: de.lock.errors.failed });
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (field: FieldError['field']) =>
    error?.field === field ? error.text : undefined;

  return (
    <Modal open={open} onClose={close} title={t.title} description={t.text}>
      <form
        id="change-password"
        method="post"
        onSubmit={(e) => void submit(e)}
        className="flex flex-col gap-4 pb-2"
        noValidate
      >
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={de.lock.username}
          readOnly
          tabIndex={-1}
          aria-hidden
          className="sr-only"
        />
        <PasswordInput
          label={t.current}
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={fieldError('current')}
          data-autofocus
        />
        <div className="flex flex-col gap-2">
          <PasswordInput
            label={t.next}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            error={fieldError('next')}
          />
          <PasswordStrength password={next} />
        </div>
        <PasswordInput
          label={t.repeat}
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          error={fieldError('repeat')}
        />
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            {de.ui.cancel}
          </Button>
          <Button type="submit" loading={busy} disabled={!current || !next || !repeat}>
            {t.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
