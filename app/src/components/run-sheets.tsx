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
import { PushPrompt } from './push-prompt.js';
import { TidyConfirmSheet } from './tidy-confirm-sheet.js';
import { WorkingSheet } from './working-sheet.js';

export function RunSheets(): JSX.Element | null {
  const { me } = useSession();
  const {
    phase,
    run,
    message,
    sheetOpen,
    dismissSheet,
    sheetReopenKey,
    confirmOpen,
    confirmCount,
    confirmTidyUp,
    dismissConfirm,
  } = useRun();

  // No run before the account has a folder (login, onboarding).
  if (me?.vault == null) return null;

  return (
    <>
      <PushPrompt />
      {confirmOpen && (
        <TidyConfirmSheet
          count={confirmCount}
          onConfirm={confirmTidyUp}
          onDismiss={dismissConfirm}
        />
      )}
      <WorkingSheet
        phase={phase}
        run={run}
        message={message}
        open={sheetOpen}
        onDismiss={dismissSheet}
        reopenKey={sheetReopenKey}
      />
    </>
  );
}
