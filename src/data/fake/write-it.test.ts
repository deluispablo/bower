/**
 * The write-it situation (TL-P4-19 addendum 13): the scripted provider updates two Current states the person changed
 * by hand, so a tidy-up asks "Write it" with the update shown, and a yes writes it, through the pretend Worker's runs.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { tidyUp } from '@/testing/tidy-up';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { parseNote } from '../vault/note-format';
import { seedFakeDrive } from './seed';
import { WRITE_IT_STATES, editElsewhere, writeIt } from './write-it';

const MONEY = 'Areas/Money/Money.md';
const CAR = 'Areas/Car/Car.md';
let drive: FakeDrive;
let root: string;
const vault = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
/** Your answer, kept in the folder's changes as the app keeps it. */
const answer = async (id: string): Promise<void> => {
  const v = vault();
  await v.answer(id, true);
  await v.settled();
};
const note = async (path: string): Promise<string> => drive.dump(root).get(path) ?? '';

beforeEach(async () => {
  localStorage.clear();
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'write-it', Date.now())) ?? '';
  await writeIt(drive, root);
});

describe('the write-it situation', () => {
  it('asks Write it about each note with the update shown, and a yes writes it', async () => {
    const asked = await tidyUp(drive, root, 'all', { states: WRITE_IT_STATES });
    expect(asked.phase).toBe('done');
    const questions = await vault().questions();
    const money = questions.find((q) => q.about === MONEY);
    expect(money?.text).toBe('You changed the current state of Money. Should Bower write its update there?');
    expect(money?.shown?.lines).toEqual(WRITE_IT_STATES[0]?.lines);
    expect(questions.find((q) => q.about === CAR)?.shown?.lines).toEqual(WRITE_IT_STATES[1]?.lines);
    await answer(money?.id ?? '');
    const wrote = await tidyUp(drive, root, 'instructions', { states: WRITE_IT_STATES });
    expect(wrote.phase).toBe('done');
    expect(parseNote(MONEY, await note(MONEY)).currentState).toEqual(WRITE_IT_STATES[0]?.lines);
  });

  it('a change elsewhere asks again, and the update typed by hand settles as an answered row', async () => {
    await tidyUp(drive, root, 'all', { states: WRITE_IT_STATES });
    const car = (await vault().questions()).find((q) => q.about === CAR);
    await editElsewhere(drive, root)(CAR, '- [ ] Check the tyres before winter', '- [x] Check the tyres before winter');
    await answer(car?.id ?? '');
    await tidyUp(drive, root, 'instructions', { states: WRITE_IT_STATES });
    const again = (await vault().questions()).find((q) => q.about === CAR);
    expect(again?.text).toBe('The current state of Car changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?');
    await editElsewhere(drive, root)(CAR, '- MOT due in January.', '- MOT booked for 14 January.');
    await answer(again?.id ?? '');
    const settled = await tidyUp(drive, root, 'instructions', { states: WRITE_IT_STATES });
    expect(settled.phase === 'done' && settled.report.answered).toEqual([{ questionId: again?.id, kind: 'state', outcome: 'nothing-to-write', why: 'Nothing to write: Car already said what Bower would have written.', note: CAR }]);
    expect((await vault().questions()).some((q) => q.about === CAR)).toBe(false);
  });
});
