import { stateMark } from '../contracts/note-edit';
import type { FakeDrive } from '../drive/fake-drive';
import type { AuthoredState } from '../spine/scripted';
import type { DispatchAt } from './fake-run-service';

/**
 * The write-it situation (TL-P4-19 addenda 12 and 13): Money's and Car's Current states were changed by hand since
 * Bower last wrote them, and the scripted reply has an update for each, so a tidy-up asks "Write it" about both with the
 * update it shows. Only the scripted provider reads these updates (`fake-runner.ts`); the live path never does.
 * Made up, on Alex's folder.
 */
export const WRITE_IT_STATES: readonly (Omit<AuthoredState, 'cites'> & { cites: string })[] = [
  // Each cites the inbox thing its news is from, by its fixture key (`seedFixture`), resolved when the situation runs.
  { path: 'Areas/Money/Money.md', lines: ['October is on budget so far.', 'Receipts are filed by month, as your rule says.'], cites: 'r0' },
  { path: 'Areas/Car/Car.md', lines: ['Insurance runs until 30 June.', 'MOT booked for 14 January.'], cites: 's1-0' },
];

/** The updates with each fixture key resolved to the id the seed gave its thing (TL-P4-19 addendum 20): never by name. */
export function writeItStates(keys: ReadonlyMap<string, string>): AuthoredState[] {
  return WRITE_IT_STATES.map((st) => {
    const id = keys.get(st.cites);
    if (id === undefined) throw new Error('The write-it situation could not be set up.');
    return { ...st, cites: id };
  });
}

/** What Bower last wrote in each note's Current state (its mark): not the lines there now, which the person changed. */
const BOWER_WROTE: Readonly<Record<string, readonly string[]>> = {
  'Areas/Money/Money.md': ['September came in on budget.'],
  'Areas/Car/Car.md': ['Insurance runs until 30 June.'],
};

/** Marks each note's Current state as changed by hand since Bower wrote it. */
export async function writeIt(drive: FakeDrive, root: string): Promise<void> {
  const listed = await drive.listAll(root);
  for (const [path, lines] of Object.entries(BOWER_WROTE)) {
    const file = listed.find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error('The write-it situation could not be set up.');
    const text = await drive.readText(file.id);
    await drive.writeText(file.id, text.replace('by: bower\n', `by: bower\nbower_state: ${stateMark(lines)}\n`), file.modifiedTime);
  }
}

/**
 * The page's hook in this situation: the person changes a note on another device (`from` becomes `to` in its text),
 * between Bower showing its update and their answer.
 */
export function editElsewhere(drive: FakeDrive, root: string): (path: string, from: string, to: string) => Promise<void> {
  return async (path, from, to) => {
    const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === path);
    if (!file) throw new Error(`No note at ${path} to change.`);
    const text = await drive.readText(file.id);
    if (!text.includes(from)) throw new Error(`The note at ${path} does not say what is to change.`);
    await drive.writeText(file.id, text.replace(from, to), file.modifiedTime);
  };
}

/**
 * The page's hook for a clash at the write itself (TL-P4-19 addendum 15): `arm` has the person change a note on another
 * device right before Bower's next write to that note is sent, after the run planned it; `beforeDispatch` is the run
 * service's seam that does it, once.
 */
export function editAtWrite(drive: FakeDrive, root: string): { arm: (path: string, from: string, to: string) => void; beforeDispatch: (at: DispatchAt) => Promise<void> } {
  let armed: { path: string; from: string; to: string } | null = null;
  return {
    arm: (path, from, to) => {
      armed = { path, from, to };
    },
    beforeDispatch: async (at) => {
      if (!armed || at.effect.kind !== 'edit-text' || at.effect.path !== armed.path) return;
      const { path, from, to } = armed;
      armed = null;
      await editElsewhere(drive, root)(path, from, to);
    },
  };
}
