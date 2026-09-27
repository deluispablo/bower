/**
 * A settings switch (spec §6, Settings row): a real `<input type="checkbox"
 * role="switch">` styled as a track and thumb (`styles/toggle.css`), always
 * paired with a visible label — never an icon alone. Every caller keeps its
 * own preference key and semantics; this component only draws the control.
 */

import type { JSX } from 'preact';

import '../styles/toggle.css';

export interface ToggleProps {
  /** Shown next to the switch; also its accessible name (no `for`/`id` needed — the input is nested inside the label). */
  label: string;
  /** A short line under the label, e.g. what the switch affects. */
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: ToggleProps): JSX.Element {
  return (
    <label class="toggle-row">
      <span class="toggle-text">
        <span class="toggle-label">{label}</span>
        {hint !== undefined && <span class="toggle-hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        class="toggle-input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.currentTarget.checked);
        }}
      />
    </label>
  );
}
