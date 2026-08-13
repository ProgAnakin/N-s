import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { useStrings } from '@/i18n';
import { cn } from '@/utils/cn';

/**
 * Form fields.
 *
 * Labels are always visible — placeholders alone disappear the moment you
 * start typing, which is exactly when you need them. Hints sit under the
 * label; errors replace the hint and are announced.
 */

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  /** Names the control for assistive tech without showing the name. */
  labelHidden?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

function Field({
  label,
  hint,
  error,
  optional = false,
  labelHidden = false,
  children,
  className,
}: FieldShellProps) {
  const s = useStrings();
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Hidden, never absent. A pair of controls under one shared heading —
          "usually up between" [from] [to] — reads fine with eyes and as two
          unnamed selects with a screen reader, so each still gets a name. */}
      <label
        htmlFor={id}
        className={cn(
          'flex items-baseline gap-2 text-sm font-medium text-ink',
          labelHidden && 'sr-only',
        )}
      >
        {label}
        {optional && (
          <span className="text-xs font-normal text-ink-faint">{s.common.optional}</span>
        )}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {(error || hint) && (
        <p
          id={hintId}
          role={error ? 'alert' : undefined}
          className={cn('text-xs leading-relaxed', error ? 'text-cinnabar' : 'text-ink-faint')}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  optional,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn('field', invalid && 'border-cinnabar')}
          {...props}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  optional,
  className,
  rows = 4,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn('field resize-y leading-relaxed', invalid && 'border-cinnabar')}
          {...props}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  labelHidden,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  labelHidden?: boolean;
}) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      labelHidden={labelHidden}
      className={className}
    >
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn('field appearance-none pr-8', invalid && 'border-cinnabar')}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%238a8177' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 0.75rem center',
          }}
          {...props}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

/** A row of mutually exclusive options — used where a select would feel heavy. */
export function ChoiceField<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  hint?: ReactNode;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn('flex flex-col gap-1.5', className)}>
      <legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                'rounded-sm border px-3 py-2 text-left text-sm transition-colors',
                selected
                  ? 'border-cinnabar bg-cinnabar/10 text-ink'
                  : 'border-rule bg-raised text-ink-soft hover:border-ink-faint',
              )}
            >
              <span className="block font-medium">{option.label}</span>
              {option.hint && (
                <span className="mt-0.5 block text-xs text-ink-faint">{option.hint}</span>
              )}
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </fieldset>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  className,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 h-6 w-10 shrink-0 rounded-full border transition-colors',
          checked ? 'border-stamp bg-stamp' : 'border-rule bg-sunk',
        )}
      >
        <span
          className={cn(
            'block h-4 w-4 rounded-full bg-on-stamp shadow-sm transition-transform',
            checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer text-sm text-ink">
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-faint">{hint}</span>}
      </label>
    </div>
  );
}
