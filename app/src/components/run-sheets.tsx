/**
 * The run's sheets, mounted once in the shell (#320): the "Is that
 * everything?" confirmation (#337), the working sheet (#38, #147) and the
 * one-time notifications prompt (#39). They used to hang off the top bar's
 * pill; the Tidy up button now sits on more than one screen, so the sheets
 * live here instead, and the run store (#304) decides when each is open.
 */

import type { JSX } from 'preact';

import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import { activeItems } from '../upload-queue.js';
import { PushPrompt } from './push-prompt.js';
import { useUploadItems } from './upload-chip.js';
import { lazyOverlay } from '../lazy-overlay.js';

const LazyConfirm = lazyOverlay(() =>
  import('./tidy-confirm-sheet.js').then((m) => m.TidyConfirmSheet),
);
const LazyWorking = lazyOverlay(() =>
  import('./working-sheet.js').then((m) => m.WorkingSheet),
);
const TidyConfirmSheet = LazyConfirm.Component;
const WorkingSheet = LazyWorking.Component;

/** Fetches both sheets' code ahead of their first use (#834). */
export function preloadRunSheets(): void {
  LazyConfirm.preload();
  LazyWorking.preload();
}

export function RunSheets(): JSX.Element | null {
  const { me } = useSession();
  const {
    phase,
    run,
    lastFinished,
    message,
    now,
    sheetOpen,
    dismissSheet,
    tidyUp,
    sheetReopenKey,
    confirmOpen,
    confirmCount,
    confirmLoading,
    confirmBreakdown,
    confirmPiles,
    confirmScope,
    confirmTidyUp,
    dismissConfirm,
  } = useRun();

  const uploading = activeItems(useUploadItems()).length;

  // No run before the account has a folder (login, onboarding).
  if (me?.vault == null) return null;

  // The chip opens the sheet on a result the run store has already put away
  // (`idle`, its run kept): the sheet shows that last finished run.
  const finishedOpen = phase === 'idle' && sheetOpen && lastFinished !== null;
  const shownPhase = finishedOpen
    ? lastFinished.state === 'done'
      ? 'done'
      : 'failed'
    : phase;
  const shownRun = finishedOpen ? lastFinished : run;

  return (
    <>
      <PushPrompt />
      {confirmOpen && (
        <TidyConfirmSheet
          count={confirmCount}
          loading={confirmLoading}
          breakdown={confirmBreakdown}
          piles={confirmPiles}
          uploading={uploading}
          kind={confirmScope === 'instructions' ? 'request' : 'tidy'}
          onConfirm={confirmTidyUp}
          onDismiss={dismissConfirm}
        />
      )}
      {(phase !== 'idle' || sheetOpen) && (
        <WorkingSheet
          phase={shownPhase}
          run={shownRun}
          message={message}
          now={now}
          open={sheetOpen}
          onDismiss={dismissSheet}
          reopenKey={sheetReopenKey}
          onTryAgain={tidyUp}
        />
      )}
    </>
  );
}
