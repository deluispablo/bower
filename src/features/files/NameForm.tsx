import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { Button } from '@/ui/Button';
import { FieldError, Input } from '@/ui/Field';
import { nameRules } from './name-rules';
import s from './files.module.css';

/** Both name boxes use the same rules and accessible inline error. Source refusals stay in the source. */
export function NameField({ failure, ...props }: ComponentProps<typeof Input> & { failure?: string | null }) {
  const id = useId();
  const error = failure || nameRules(String(props.value ?? '')).notice;
  return <>
    <Input {...props} invalid={!!error} errorId={id} />
    {error && <FieldError id={id}>{error}</FieldError>}
  </>;
}

/** The name box, fresh for each ask (a rename starts from the name it has, selected). */
export function NameForm({ start, label, links, onSave, onCancel }: { start: string; label: string; links: string | null; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(start);
  const field = useRef<HTMLInputElement>(null);
  const ids = useId();
  // The start is already the name without its extension (thingName), so selecting it all is the platform convention:
  // Finder, Explorer and Android Files select the name and leave ".pdf" out.
  useEffect(() => field.current?.select(), []);
  return (
    <form
      className={s.nameForm}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name);
      }}
    >
      <NameField
        ref={field}
        autoFocus
        aria-label="Name"
        placeholder="Name"
        value={name}
        aria-describedby={links ? `${ids}-links` : undefined}
        onChange={(e) => setName(e.target.value)}
      />
      {links && (
        <p id={`${ids}-links`} className="muted">
          {links}
        </p>
      )}
      <div className={s.nameActions}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {label}
        </Button>
      </div>
    </form>
  );
}
