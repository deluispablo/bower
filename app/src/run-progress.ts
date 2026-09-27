/**
 * The Tidying up sheet's progress bar (spec §6, Tidying up row): "n of m
 * filed" with a determinate bar once a run reports both how many it has
 * filed and how many it expects to file in total, an indeterminate bar
 * otherwise. Pure so it's unit-tested without a real run or a real timer.
 *
 * Today's runner (`api/src/runner.ts`) only ever reports the names it has
 * filed, once a run is `done` or `failed` — never a running total while a
 * run is still going. So in practice `progressFor` always returns `null`
 * right now (see the PR's "Left out"); it's written and tested against the
 * full contract so nothing else has to change once a runner reports both.
 */

/** The counts a run may report, when it reports them at all. */
export interface RunCounts {
  /** Items filed so far this run. */
  processed?: number;
  /** Items this run expects to file in total. */
  total?: number;
}

export interface RunProgress {
  filed: number;
  total: number;
  /** `filed / total`, clamped to 1 so a bar never overflows past 100%. */
  ratio: number;
}

/**
 * `null` (indeterminate) unless both counts are present and `total` is a
 * positive number; otherwise `{ filed, total, ratio }`, with `ratio`
 * clamped to 1 for a `filed` count past `total` (a run can pick up more
 * items along the way than it first expected).
 */
export function progressFor(counts: RunCounts): RunProgress | null {
  const { processed, total } = counts;
  if (processed === undefined || total === undefined || total <= 0) {
    return null;
  }
  return { filed: processed, total, ratio: Math.min(1, processed / total) };
}
