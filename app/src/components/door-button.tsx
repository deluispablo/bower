/**
 * The door button (spec §3.25, R-BTN-2, board AD-Main): one way in to the
 * pile, an icon over a short label, 64 high on a phone and 76 on desktop,
 * the secondary look, flex 1 in a row of four (Photo, Files, Drive, Link).
 * Its name says what it does ("Choose files"); the label is the short word.
 */

import type { ComponentChildren, JSX } from 'preact';

export interface DoorButtonProps {
  /** The short word under the icon ("Files"). */
  label: string;
  /** The accessible name ("Choose files"). */
  name: string;
  icon: ComponentChildren;
  onClick: () => void;
  disabled?: boolean;
  /** The Link door opens the link box: `aria-expanded`. */
  expanded?: boolean;
}

export function DoorButton({
  label,
  name,
  icon,
  onClick,
  disabled = false,
  expanded,
}: DoorButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class="door-button"
      aria-label={name}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span class="door-button-label">{label}</span>
    </button>
  );
}
