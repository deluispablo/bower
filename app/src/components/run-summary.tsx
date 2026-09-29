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

/**
 * The tiles of the `stats` size, in order: filed, new notes, updated, then
 * "needs you" (or, on a partly done run, "still in your inbox" and, only if
 * some things were set aside, their own "needs you" tile). The numbers are the
 * ones the inline line shows. Labels are lower case: the accessible text of a
 * tile is "{n} {label}".
 */
export function summaryTiles(outcome: RunOutcome): Tile[] {
  const tiles: Tile[] = [
    { key: 'filed', value: outcome.filed, label: 'filed', warn: false },
    {
      key: 'new',
      value: outcome.created,
      label: outcome.created === 1 ? 'new note' : 'new notes',
      warn: false,
    },
    { key: 'updated', value: outcome.updated, label: 'updated', warn: false },
  ];
  if (outcome.state === 'partial') {
    tiles.push({
      key: 'left',
      value: outcome.left,
      label: 'still in your inbox',
      warn: outcome.left > 0,
    });
    const setAside = outcome.needsYou - outcome.left;
    if (setAside > 0) {
      tiles.push({
        key: 'needs',
        value: setAside,
        label: 'needs you',
        warn: true,
      });
    }
  } else {
    tiles.push({
      key: 'needs',
      value: outcome.needsYou,
      label: 'needs you',
      warn: outcome.needsYou > 0,
    });
  }
  return tiles;
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

  const tiles = summaryTiles(outcome);
  return (
    <div class="run-summary-box">
      <ul
        class={`run-summary-stats run-summary-stats-${tiles.length}`}
        aria-label="What this tidy-up did"
      >
        {tiles.map((tile) => (
          <li
            class={`run-summary-tile${tile.value === 0 ? ' run-summary-zero' : ''}${tile.warn ? ' run-summary-warn' : ''}`}
            key={tile.key}
          >
            <span class="run-summary-value">{tile.value}</span>{' '}
            <span class="run-summary-label">{tile.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
