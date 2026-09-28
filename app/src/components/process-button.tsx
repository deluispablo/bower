/**
 * The Tidy up button (#37; moved out of the top bar in #320): it sits on
 * Home's Inbox card and in Add's hint, never in the bar (Phone-Home and
 * Phone-Add boards). A tap goes through the run store's `tidyUp`, which
 * opens the "Is that everything?" confirmation (#337) first; the run only
 * starts once that sheet's "Yes, tidy up" is tapped. During a run, or once
 * the day's limit is reached, a tap brings the working sheet back instead;
 * after a failure the button says Try again and starts a new run (through
 * the same confirmation).
 *
 * The working sheet and the notifications prompt no longer live here: they
 * are mounted once in the shell (`run-sheets.tsx`), since this button now
 * appears on more than one screen.
 */

import type { JSX } from 'preact';

import { offlineReason, useOnline } from '../online.js';
import '../styles/process.css';
import { useRun } from '../run-store.js';
import type { RunPhase } from '../run-store.js';
import { useSession } from '../session.js';
import { IconSparkle } from './icons.js';

export function labelFor(phase: RunPhase): string {
  switch (phase) {
    case 'idle':
    case 'done':
      return 'Tidy up';
    case 'queued':
    case 'running':
      return 'Tidying up…';
    case 'failed':
    case 'stale':
      return 'Try again';
    case 'quota':
      return 'Limit reached';
  }
}

/** Whether a tap in `phase` starts a run (else it reopens the sheet). */
export function startsRun(phase: RunPhase): boolean {
  return (
    phase === 'idle' ||
    phase === 'done' ||
    phase === 'failed' ||
    phase === 'stale'
  );
}

export function ProcessButton(): JSX.Element | null {
  const { me } = useSession();
  const { phase, tidyUp, openSheet } = useRun();
  const online = useOnline();

  // Nothing to tidy before the account has a folder (login, onboarding).
  if (me?.vault == null) return null;

  const starts = startsRun(phase);

  return (
    <div class="process">
      <button
        type="button"
        class="process-button"
        data-phase={phase}
        data-tour="tidy"
        aria-haspopup={starts ? undefined : 'dialog'}
        disabled={!online}
        aria-disabled={!online}
        onClick={starts ? () => tidyUp() : openSheet}
      >
        {phase === 'running' || phase === 'queued' ? (
          <span class="process-spinner" aria-hidden="true" />
        ) : (
          <IconSparkle />
        )}
        <span aria-live="polite">{labelFor(phase)}</span>
      </button>
      {!online && (
        <span class="process-offline-reason">{offlineReason('process')}</span>
      )}
    </div>
  );
}
