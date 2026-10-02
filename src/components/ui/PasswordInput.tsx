import { useId, useState, type ComponentPropsWithRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { de } from '@/i18n/de';
import { cn } from './cn';
import { controlClass } from './controlClass';
import { Field } from './Field';
import { IconButton } from './IconButton';

export interface PasswordInputProps extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  label: string;
  hint?: string;
  error?: string;
  /** "new-password" (setup, change) or "current-password" (unlock) – drives the keychain. */
  autoComplete: 'new-password' | 'current-password';
}

/** Password field with a show/hide button; works with the iPadOS keychain and Face ID. */
export function PasswordInput({ label, hint, error, id, className, ...rest }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  return (
    <Field id={inputId} label={label} hint={hint} error={error}>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${inputId}-desc` : undefined}
          className={cn(controlClass(Boolean(error)), 'min-h-12 pr-14', className)}
          {...rest}
        />
        <IconButton
          icon={visible ? EyeOff : Eye}
          label={visible ? de.ui.hidePassword : de.ui.showPassword}
          onClick={() => setVisible(!visible)}
          className="absolute top-1/2 right-1 -translate-y-1/2"
        />
      </div>
    </Field>
  );
}
