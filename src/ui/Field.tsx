import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import s from './ui.module.css';

/** For a wrapper (a label, form or button) that holds an icon and a typing part: the wrapper draws the edge. */
export function fieldBox(opts: { pill?: boolean; stack?: boolean } = {}): string {
  return [s.fieldBox, opts.pill ? s.pill : '', opts.stack ? s.stack : ''].join(' ');
}

interface Invalid {
  /** The field is wrong: it says so to a screen reader and draws the error edge. */
  invalid?: boolean;
  /** The id of the message that explains it (a `FieldError`). */
  errorId?: string;
  /** Inside a `fieldBox`: the box draws the edge, so this part draws none. */
  inBox?: boolean;
}

/** The ids a field is described by: what is always there, then the error while it shows. */
function describedBy(
  always: string | undefined,
  { invalid, errorId }: Invalid,
): string | undefined {
  const ids = [always, invalid ? errorId : undefined].filter(Boolean).join(' ');
  return ids || undefined;
}

/** A line of text to type in. `aria-invalid` and `aria-describedby` for an error live here, once. */
export function Input({
  invalid,
  errorId,
  inBox,
  className = '',
  ...rest
}: Invalid & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      {...rest}
      className={inBox ? className : `${s.field} ${className}`}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(rest['aria-describedby'], { invalid, errorId })}
    />
  );
}

/** Several lines of text to type in. */
export function Textarea({
  invalid,
  errorId,
  inBox,
  className = '',
  ...rest
}: Invalid & TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <textarea
      {...rest}
      className={inBox ? className : `${s.field} ${className}`}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(rest['aria-describedby'], { invalid, errorId })}
    />
  );
}

/** The message under a field, in the danger colour; the field points to it with `errorId`. */
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={s.fieldError} role="alert">
      {children}
    </p>
  );
}

/** A switch: on or off, announced as such. */
export function Switch({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={s.switch}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}

/** A tick box, drawn here so its unticked edge shows; still a native checkbox. */
export function Checkbox({
  className = '',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input {...rest} type="checkbox" className={`${s.taskBox} ${className}`} />;
}
