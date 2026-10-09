import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import s from './ui.module.css';

interface Props<T extends string> {
  /** The group's accessible name. */
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

/**
 * The one segmented control (Settings' appearance, Tell Bower's request or rule). A radio group as the
 * WAI-ARIA Authoring Practices describe it: one tab stop on the checked radio, arrows move and check.
 * Each segment is at least 44 px tall on the phone (WCAG 2.5.5), in `ui.module.css`.
 */
export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  const group = useRef<HTMLDivElement>(null);
  const move = (e: KeyboardEvent, from: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const to = (from + step + options.length) % options.length;
    const next = options[to];
    if (!next) return;
    onChange(next.value);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
  };
  return (
    <div ref={group} className={s.segmented} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={s.segment}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => move(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
