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
import { WRITE_IT_STATES, editAtWrite, editElsewhere, writeIt } from './write-it';
import { FakeRunService } from './fake-run-service';
import { FakeWorker } from './fake-worker';

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
const REASK = (name: string): string => `The current state of ${name} changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?`;

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

  it('a yes writes only the update that was shown', async () => {
    // TL-P4-19 addendum 17: the run that acts on the yes has a different update for Money; the yes was to the one shown.
    await tidyUp(drive, root, 'all', { states: WRITE_IT_STATES });
    const money = (await vault().questions()).find((q) => q.about === MONEY);
    await answer(money?.id ?? '');
    const other = WRITE_IT_STATES.map((st) => ({ ...st, lines: ['Money is over budget this month.'] }));
    expect((await tidyUp(drive, root, 'instructions', { states: other })).phase).toBe('done');
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

  it('a clash while the run reads the note re-asks with the new sentence', async () => {
    await tidyUp(drive, root, 'all', { states: WRITE_IT_STATES });
    const money = (await vault().questions()).find((q) => q.about === MONEY);
    const id = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === MONEY)?.id;
    await answer(money?.id ?? '');
    // The note changes while the run reads it: its bytes differ from the read that checked them.
    const read = drive.readBytes.bind(drive);
    let once = true;
    drive.readBytes = async (fileId) => {
      const bytes = await read(fileId);
      if (fileId !== id || !once) return bytes;
      once = false;
      return new TextEncoder().encode(`${new TextDecoder().decode(bytes)}\nChanged meanwhile.\n`);
    };
    await tidyUp(drive, root, 'instructions', { states: WRITE_IT_STATES });
    expect((await vault().questions()).find((q) => q.about === MONEY)?.text).toBe(REASK('Money'));
  });

  it('a clash at write time leads to the re-ask with the new sentence and no extra press', async () => {
    // The note changes on another device right before Bower's write is sent (TL-P4-19 addendum 15): the write is
    // refused, the answer stays, and the pretend Worker starts the run that asks again, as the real Worker's alarm does.
    const atWrite = editAtWrite(drive, root);
    const hooks = { beforeDispatch: atWrite.beforeDispatch };
    const worker = new FakeWorker({ drive, runs: new FakeRunService({ drive, scale: 'instant', hooks }), scenario: 'write-it', rootId: root, states: WRITE_IT_STATES });
    const ended = async (not: ReadonlySet<string>): Promise<string | null> => {
      for (let i = 0; i < 400; i++) {
        const run = (await worker.status()).run;
        if (run && !not.has(run.id) && (run.phase === 'done' || run.phase === 'failed')) return run.id;
        await new Promise((r) => setTimeout(r, 1));
      }
      return null;
    };
    const first = (await worker.process('all', { requestId: 'press-1' })).run;
    expect(await ended(new Set())).toBe(first?.id);
    const seen = new Set([first?.id ?? '']);
    const money = (await vault().questions()).find((q) => q.about === MONEY);
    expect(money?.text).toBe('You changed the current state of Money. Should Bower write its update there?');
    await answer(money?.id ?? '');
    atWrite.arm(MONEY, 'for the monthly plan.', 'for the yearly plan.');
    const answered = (await worker.process('instructions', { requestId: 'answer-1', answer: true })).run;
    seen.add(answered?.id ?? '');
    // No other press: the next status after that run ends starts the run that asks again.
    const next = await ended(seen);
    expect(await note(MONEY)).toContain('for the yearly plan.');
    expect(next).not.toBeNull();
    expect(parseNote(MONEY, await note(MONEY)).currentState).not.toEqual(WRITE_IT_STATES[0]?.lines);
    expect((await vault().questions()).find((q) => q.about === MONEY)?.text).toBe(REASK('Money'));
  });
});
