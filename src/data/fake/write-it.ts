import { stateMark } from '../contracts/note-edit';
import type { FakeDrive } from '../drive/fake-drive';
import type { AuthoredState } from '../spine/scripted';

/**
 * The write-it situation (TL-P4-19 addenda 12 and 13): Money's and Car's Current states were changed by hand since
 * Bower last wrote them, and the scripted reply has an update for each, so a tidy-up asks "Write it" about both with the
 * update it shows. Only the scripted provider reads these updates (`fake-runner.ts`); the live path never does.
 * Made up, on Alex's folder.
 */
export const WRITE_IT_STATES: readonly AuthoredState[] = [
  { path: 'Areas/Money/Money.md', lines: ['October is on budget so far.', 'Receipts are filed by month, as your rule says.'], cites: null },
  { path: 'Areas/Car/Car.md', lines: ['Insurance runs until 30 June.', 'MOT booked for 14 January.'], cites: null },
];

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
