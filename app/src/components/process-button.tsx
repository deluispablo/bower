/**
 * The header's Process button (#37). Reads run status from `useRun()` and
 * the pending count from `useVault()`'s file listing; starts a run on tap
 * (idle), or reopens the working sheet on tap once it stopped (failed /
 * stale / over quota) to show the bird confused with the reason (#147).
 * `done` announces itself with a toast from the run store (#304).
 *
 * It also renders the working sheet (#38, redesigned in #147). Whether the
 * sheet is open lives in the run store (#304): it opens by itself once per
 * run, closes on dismiss, and a tap on the button in any non-idle phase
 * reopens it. So the button is no longer disabled during a run; a tap then
 * never starts a second run.
 */

import { useState } from 'preact/hooks';

import { offlineReason, useOnline } from '../online.js';
import '../styles/process.css';
import { pendingCount, useRun } from '../run-store.js';
import type { RunPhase } from '../run-store.js';
import { useSession } from '../session.js';
import { useVault } from '../vault-store.js';
import { PushPrompt } from './push-prompt.js';
import { WorkingSheet } from './working-sheet.js';

export function labelFor(phase: RunPhase, pending: number): string {
  switch (phase) {
    case 'idle':
      return pending > 0 ? `Tidy up (${pending})` : 'Tidy up';
    case 'queued':
    case 'running':
      return 'Tidying up…';
    case 'done':
      return 'Done ✓';
    case 'failed':
    case 'stale':
      return 'Failed';
    case 'quota':
      return 'Limit reached';
  }
}

export function ProcessButton() {
  const { me } = useSession();
  const { phase, run, message, process, sheetOpen, openSheet, dismissSheet } =
    useRun();
  const { files } = useVault();
  const online = useOnline();
  // Bumped whenever a tap deliberately brings the sheet back, so the sheet
  // re-measures its linger window even if the phase itself hasn't changed
  // (e.g. tapping "Failed" again after it already lingered and faded).
  const [reopenKey, setReopenKey] = useState(0);

  function onClick(): void {
    if (phase === 'idle') {
      openSheet();
      void process();
      return;
    }
    // Any other phase brings the sheet back, even if it had already
    // lingered away: queued/running shows progress, done shows off,
    // failed/stale/quota shows the bird confused with today's message.
    openSheet();
    setReopenKey((key) => key + 1);
  }

  const reopens = phase !== 'idle';
  // Offline is the only reason to disable: during a run a tap reopens the sheet.
  const disabled = !online;

  // Nothing to process before the account has a folder (login, onboarding).
  if (me?.vault == null) return null;

  return (
    <div class="process">
      <button
        type="button"
        class="process-button"
        data-phase={phase}
        data-tour="tidy"
        aria-haspopup={reopens ? 'dialog' : undefined}
        disabled={disabled}
        aria-disabled={disabled}
        onClick={onClick}
      >
        {phase === 'running' && (
          <span class="process-spinner" aria-hidden="true" />
        )}
        <span aria-live="polite">{labelFor(phase, pendingCount(files))}</span>
      </button>
      {!online && (
        <span class="process-offline-reason">{offlineReason('process')}</span>
      )}
      <PushPrompt />
      <WorkingSheet
        phase={phase}
        run={run}
        message={message}
        open={sheetOpen}
        onDismiss={dismissSheet}
        reopenKey={reopenKey}
      />
    </div>
  );
}
