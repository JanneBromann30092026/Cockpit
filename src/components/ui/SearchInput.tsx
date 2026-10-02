import type { ComponentPropsWithRef } from 'react';
import { Search, X } from 'lucide-react';
import { controlClass } from './controlClass';
import { IconButton } from './IconButton';
import { cn } from './cn';

export interface SearchInputProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'value' | 'onChange' | 'type'
> {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name (the field has no visible label). */
  label: string;
  clearLabel: string;
}

/** Search field with icon and clear button; Esc clears the query. */
export function SearchInput({
  value,
  onChange,
  label,
  clearLabel,
  className,
  onKeyDown,
  ...rest
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={20}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-muted"
      />
      <input
        type="search"
        aria-label={label}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            event.stopPropagation();
            onChange('');
          }
          onKeyDown?.(event);
        }}
        className={cn(controlClass(false), 'search-input min-h-12 rounded-full pr-12 pl-12')}
        {...rest}
      />
      {value && (
        <IconButton
          icon={X}
          label={clearLabel}
          onClick={() => onChange('')}
          className="absolute top-1/2 right-0.5 -translate-y-1/2"
        />
      )}
    </div>
  );
}
