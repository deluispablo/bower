/**
 * The one segmented control (spec §3.23, R-SEG-2): a `radiogroup` of
 * `radio` buttons. One tab stop (the checked button); the arrow keys move
 * the choice and the focus, Home and End jump to the ends. A count follows
 * the label ("Originals 1"); an empty segment stays selectable (G-17).
 * Styles in `styles/primitives.css` (`.seg`).
 */

import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Shown after the label; leave out for "All" in folders. */
  count?: number;
}

export interface SegmentedProps<T extends string> {
  /** The group's accessible name ("Show", "Look"). */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** The track's own edge, for a track on a same-colour surface (sheets). */
  outlined?: boolean;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  outlined = false,
}: SegmentedProps<T>): JSX.Element {
  const group = useRef<HTMLDivElement>(null);

  const move = (index: number): void => {
    const option = options[index];
    if (option === undefined) return;
    onChange(option.value);
    const buttons = group.current?.querySelectorAll<HTMLButtonElement>(
      '.seg-button',
    );
    buttons?.[index]?.focus();
  };

  const onKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
    const current = options.findIndex((option) => option.value === value);
    const last = options.length - 1;
    let next: number | undefined;
    if (NEXT_KEYS.has(event.key)) next = current >= last ? 0 : current + 1;
    else if (PREVIOUS_KEYS.has(event.key))
      next = current <= 0 ? last : current - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === undefined) return;
    event.preventDefault();
    move(next);
  };

  return (
    <div
      ref={group}
      class={outlined ? 'seg seg-outlined' : 'seg'}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        // With nothing checked, the first button keeps the tab stop.
        const tabbable =
          checked ||
          (index === 0 && !options.some((other) => other.value === value));
        return (
          <button
            key={option.value}
            type="button"
            class="seg-button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabbable ? 0 : -1}
            onClick={() => {
              onChange(option.value);
            }}
          >
            {option.count === undefined
              ? option.label
              : `${option.label} ${String(option.count)}`}
          </button>
        );
      })}
    </div>
  );
}
