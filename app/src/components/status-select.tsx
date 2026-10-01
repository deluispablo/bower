/**
 * The status select (#916, spec §3.33, R-SELECT-1; boards PF-Compare and
 * LI-Compare): one 40 px native select named "Status of <name>", showing
 * the status capitalised ("To view"), and the date line in the accent
 * colour beside it on a phone card or under it in the desktop table
 * ("Viewing Wed 1 Oct"), never inside the select.
 */

import type { JSX } from 'preact';

import { statusOptions } from '../folder-statuses.js';

import '../styles/status-select.css';

export interface StatusSelectProps {
  /** The item's name, for "Status of <name>". */
  name: string;
  /** The note's status, lower case; '' when it has none. */
  value: string;
  /** The folder's statuses (`folderStatuses`); an unknown `value` is added. */
  statuses: readonly string[];
  /** "Viewing Wed 1 Oct", or nothing. */
  dateLine?: string;
  /** `row` beside the select (phone card), `stack` under it (table). */
  layout?: 'row' | 'stack';
  /** The change is being saved: the value shows at 60 % opacity. */
  pending?: boolean;
  onChange: (status: string) => void;
}

/** A status as the select shows it: "to view" reads "To view". */
export function statusText(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function StatusSelect({
  name,
  value,
  statuses,
  dateLine,
  layout = 'row',
  pending = false,
  onChange,
}: StatusSelectProps): JSX.Element {
  const options = statusOptions(statuses, value);
  return (
    <div class={`status-select status-select--${layout}`}>
      <select
        class="status-select-input"
        aria-label={`Status of ${name}`}
        aria-busy={pending ? 'true' : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      >
        {value === '' && <option value="">No status</option>}
        {options.map((status) => (
          <option key={status} value={status}>
            {statusText(status)}
          </option>
        ))}
      </select>
      {dateLine !== undefined && dateLine !== '' && (
        <span class="status-select-date">{dateLine}</span>
      )}
    </div>
  );
}
