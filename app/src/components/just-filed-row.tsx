/**
 * The "Just filed · N" row (#616, R-JUST-1) for the Notes tab and the desktop
 * sidebar, and the hook both it and the Just filed screen read the latest
 * tidy-up through. The row shows while the last tidy-up has items this device
 * has not opened; it opens `/just-filed`.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import { cardWhen } from '../activity.js';
import { getRuns } from '../api.js';
import type { Run } from '../api.js';
import {
  earlierRuns,
  filedCount,
  hasDestinations,
  JUST_FILED_PATH,
  latestRun,
  rowLabel,
  rowSub,
  unseenIds,
} from '../just-filed.js';
import { useRun } from '../run-store.js';
import { getSeen, loadSeenSet, subscribeSeen } from '../seen.js';
import { useVault } from '../vault-store.js';
import { IconChevronRight } from './icons.js';

import '../styles/just-filed.css';

export interface JustFiledState {
  /** The tidy-up the screen opens, `null` before any. */
  latest: Run | null;
  /** The finished tidy-ups after it, newest first (`withRuns` only). */
  earlier: Run[];
  /** `GET /runs` has answered (or was not needed). */
  loaded: boolean;
  /** Ids of the latest tidy-up's items this device has not opened. */
  unseen: ReadonlySet<string>;
  now: number;
}

/**
 * The latest tidy-up, what is new in it and, with `withRuns`, the earlier
 * ones. `GET /runs` is only read when it is needed: for the earlier list, or
 * because the run store has no finished run yet (the demo, a new device).
 */
export function useJustFiled(withRuns = false): JustFiledState {
  const { lastFinished, now } = useRun();
  const { index } = useVault();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [seen, setSeen] = useState<ReadonlySet<string>>(getSeen);

  useEffect(() => {
    const unsubscribe = subscribeSeen(() => setSeen(getSeen()));
    void loadSeenSet();
    return unsubscribe;
  }, []);

  const needRuns = withRuns || lastFinished === null;
  const finishedKey = lastFinished?.finishedAt ?? null;
  useEffect(() => {
    if (!needRuns) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    getRuns()
      .then((response) => {
        if (cancelled) return;
        setRuns(response.runs);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(err);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needRuns, finishedKey]);

  const latest = latestRun(lastFinished, runs);
  const unseen = useMemo(
    () =>
      latest === null ? new Set<string>() : unseenIds(latest, index, seen),
    [latest, index, seen],
  );
  const earlier = useMemo(() => earlierRuns(latest, runs), [latest, runs]);
  return { latest, earlier, loaded, unseen, now };
}

export function JustFiledRow({
  variant,
}: {
  variant: 'sidebar' | 'page';
}): JSX.Element | null {
  const { latest, unseen, now } = useJustFiled();
  if (latest === null || !hasDestinations(latest) || unseen.size === 0) {
    return null;
  }
  const when = cardWhen(latest.finishedAt ?? latest.requestedAt, now);
  return (
    <a class="just-filed-row" href={JUST_FILED_PATH}>
      <span class="just-filed-row-text">
        <span class="just-filed-row-label">{rowLabel(filedCount(latest))}</span>
        <span class="just-filed-row-sub">
          {rowSub(when, variant === 'sidebar')}
        </span>
      </span>
      <IconChevronRight />
    </a>
  );
}
