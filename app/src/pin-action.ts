/**
 * Runs a pin or unpin call from `useVault()` (`pinNote`/`unpinNote`/
 * `pinFolder`/`unpinFolder`, #215) the same way from every entry point
 * (spec §14, issue #216): the note menu, a drawer row's held sheet, a tree
 * row's hover pin and its right-click menu, the Folder screen's chip, and
 * Home's Edit-mode unpin buttons. Shows the shared toast (`pin-toast.ts`)
 * on success, or one sentence on failure — errors are never swallowed
 * (`CLAUDE.md`).
 */

import { showPinToast } from './pin-toast.js';

/** Resolves to whether it succeeded, so a caller with its own follow-up
 * (Home's tile, briefly showing the bird's `done` pose) knows to run it. */
export async function runPinAction(
  action: () => Promise<void>,
  successMessage: 'Pinned to Home' | 'Unpinned',
): Promise<boolean> {
  try {
    await action();
    showPinToast(successMessage);
    return true;
  } catch (err) {
    console.error(err);
    showPinToast('Could not update the pin. Try again.');
    return false;
  }
}
