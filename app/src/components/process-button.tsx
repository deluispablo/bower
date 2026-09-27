/**
 * The header's Process button (#37). Reads run status from `useRun()` and
 * the pending count from `useVault()`'s file listing; starts a run on tap
 * (idle), or reopens the working sheet on tap once it stopped (failed /
 * stale / over quota) to show the bird confused with the reason (#147).
 * `done` also announces itself with a toast, without a tap.
 *
 * It also owns the working sheet (#38, redesigned in #147): the sheet opens
 * by itself when a run starts, closes on dismiss, and a tap on the button in
 * any non-idle phase reopens it. So the button is no longer disabled during
 * a run; a tap then never starts a second run.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { ANSWERS_FOLDER } from '../home.js';
import { offlineReason, useOnline } from '../online.js';
import '../styles/process.css';
import { pendingCount, useRun } from '../run-store.js';
import type { RunPhase } from '../run-store.js';
import { useSession } from '../session.js';
import { useVault } from '../vault-store.js';
import { PushPrompt } from './push-prompt.js';
import { Toast } from './toast.js';
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
  const { phase, run, message, process } = useRun();
  const { files } = useVault();
  const online = useOnline();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Bumped whenever a tap deliberately brings the sheet back, so the sheet
  // re-measures its linger window even if the phase itself hasn't changed
  // (e.g. tapping "Done" again after it already lingered and faded).
  const [reopenKey, setReopenKey] = useState(0);
  const prevPhase = useRef<RunPhase>(phase);

  // The sheet opens when a run starts (here or on another device), lingers
  // through a failure, a stale run or the day's quota running out exactly
  // as it does for `done` (`sheetVisible`), and is closed again once the
  // button is back to idle.
  useEffect(() => {
    const wasActive =
      prevPhase.current === 'queued' || prevPhase.current === 'running';
    prevPhase.current = phase;
    if ((phase === 'queued' || phase === 'running') && !wasActive) {
      setSheetOpen(true);
    }
    if (phase === 'idle') setSheetOpen(false);
  }, [phase]);

  const closeSheet = useCallback((): void => {
    setSheetOpen(false);
  }, []);

  // A finished run announces itself without waiting for a tap.
  useEffect(() => {
    if (phase !== 'done' || message === undefined) return;
    setToastMessage(message);
    setToastKey((key) => key + 1);
  }, [phase, message]);

  function onClick(): void {
    if (phase === 'idle') {
      setSheetOpen(true);
      void process();
      return;
    }
    // Any other phase brings the sheet back, even if it had already
    // lingered away: queued/running shows progress, done shows off,
    // failed/stale/quota shows the bird confused with today's message.
    setSheetOpen(true);
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
      <Toast
        message={toastMessage}
        messageKey={toastKey}
        linkHref={`/#folder=${ANSWERS_FOLDER}`}
      />
      <PushPrompt />
      <WorkingSheet
        phase={phase}
        run={run}
        message={message}
        open={sheetOpen}
        onDismiss={closeSheet}
        reopenKey={reopenKey}
      />
    </div>
  );
}
