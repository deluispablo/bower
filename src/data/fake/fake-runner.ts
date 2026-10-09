/**
 * The runner, faked: what a tidy-up plans for the Bower folder on a FakeDrive,
 * with no AI. It plans one fixed contract B manifest from what it reads: the
 * ready piles in the inbox, their things filed where the demo would (the
 * fixture's plan, else a guess from the pile's words), the rules you typed,
 * your requests, answered questions and the journal. The run service
 * (`fake-run-service.ts`) applies it, recoverably. Nothing writes outside a
 * manifest any more (TL-P2-38): the legacy runner that did is gone, and its
 * records are only read (`fake-worker.ts`).
 *
 * The planning itself is the scripted provider's (`spine/scripted.ts`), which the GitHub Actions runner uses too:
 * here it reads the pretend Drive, and the Inbox's piles through `DriveVault`, as before.
 */
import type { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { fakeRead, type ScriptedRead } from '../spine/read';
import { planScripted, type AuthoredState, type PlanOptions, type RunPlan } from '../spine/scripted';
import { scriptedDecisions, type HubUpdate } from '../demo/script';

export { SET_ASIDE } from '../spine/plan';
export { NOTE_NOT_WRITTEN, OWN_FILES, REQUEST_DONE, WORDS_NOT_WRITTEN, type PlanOptions, type RunPlan } from '../spine/scripted';
export type { HubUpdate };

/** The scripted provider's reads over the pretend Drive: the plan's reads, and the piles as the Inbox reads them. */
export function fakeScripted(drive: FakeDrive): ScriptedRead {
  return {
    ...fakeRead(drive),
    piles: (rootId, context) => new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'runner' }).piles(context),
    provenance: 'fake-stored',
  };
}

/**
 * A fake run's options: the scripted reply's, with the hub notes it brings up to date (the demo's by default) and the
 * Current states it updates (none by default; the write-it situation's).
 */
export type FakePlanOptions = Omit<PlanOptions, 'decisions'> & { updates?: readonly HubUpdate[]; states?: readonly AuthoredState[] };

/** Plans a run on the B path over the pretend Drive: the scripted provider's planning (`planScripted`). */
export function planRun(drive: FakeDrive, rootId: string, opts: FakePlanOptions, editCap?: number, held?: ReadonlySet<string>): Promise<RunPlan> {
  const { updates, states, ...rest } = opts;
  return planScripted(fakeScripted(drive), rootId, { ...rest, decisions: scriptedDecisions(updates, states) }, editCap, held);
}
