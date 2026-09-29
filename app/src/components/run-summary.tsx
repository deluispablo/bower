/**
 * A run's counts (spec §5 `run-summary`, R-RUN-2): `stats` is four tiles
 * with zeros greyed; `inline` is one line, "6 filed · 6 new notes · 2
 * updated · 1 needs you", zeros left out. Both read a `RunOutcome`, so a
 * screen never counts for itself. "Needs you" (or, on a partly done run,
 * "Still in your inbox") is amber above zero.
 */

import type { JSX } from 'preact';

import { outcomeCounts } from '../run-outcome.js';
import type { RunOutcome } from '../run-outcome.js';
import '../styles/run-summary.css';

export interface RunSummaryProps {
  outcome: RunOutcome;
  size: 'stats' | 'inline';
  /** Inline only: "new" for "new notes" (RUN-S6). */
  short?: boolean;
}

interface Tile {
  key: string;
  value: number;
  label: string;
  warn: boolean;
}

/** The four tiles of the `stats` size, in order. */
export function summaryTiles(outcome: RunOutcome): Tile[] {
  const partial = outcome.state === 'partial';
  return [
    { key: 'filed', value: outcome.filed, label: 'Filed', warn: false },
    { key: 'new', value: outcome.created, label: 'New notes', warn: false },
    { key: 'updated', value: outcome.updated, label: 'Updated', warn: false },
    {
      key: 'needs',
      value: outcome.needsYou,
      label: partial ? 'Still in your inbox' : 'Needs you',
      warn: outcome.needsYou > 0,
    },
  ];
}

export function RunSummary({
  outcome,
  size,
  short = false,
}: RunSummaryProps): JSX.Element | null {
  if (size === 'inline') {
    const text = outcomeCounts(outcome, { short });
    if (text === '') return null;
    return <span class="run-summary-inline">{text}</span>;
  }

  return (
    <div class="run-summary-box">
      <dl class="run-summary-stats">
        {summaryTiles(outcome).map((tile) => (
          <div
            class={`run-summary-tile${tile.value === 0 ? ' run-summary-zero' : ''}${tile.warn ? ' run-summary-warn' : ''}`}
            key={tile.key}
          >
            <dd class="run-summary-value">{tile.value}</dd>
            <dt class="run-summary-label">{tile.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
