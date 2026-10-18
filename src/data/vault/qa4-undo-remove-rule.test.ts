/**
 * qa4-undo-remove-rule (qa-4 Claude F2): Undo after "Remove rule" says "The rule is back.", so the same rule is back:
 * its words, its date and its place, in the list now and in Rules.md after the next tidy-up. A removal and its Undo
 * taken in the same tidy-up cancel each other (the pair from `pairsOf`); they are never a removal and a new rule.
 * Everything goes through the vault API on a pretend Drive, as `undo-compensate.test.ts` does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { tidyUp } from '@/testing/tidy-up';
import { DriveVault } from './drive-vault';

let drive: FakeDrive;
let root: string;

beforeEach(async () => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
});
afterEach(() => vi.restoreAllMocks());

const tab = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() }, () => true, async () => root, {} as FakeDrive);
const rulesText = (): string => drive.dump(root).get('Rules.md') ?? '';
const shown = (rules: Awaited<ReturnType<DriveVault['rules']>>) => rules.map((r) => ({ text: r.text, yourWords: r.yourWords, since: r.since, pending: !!r.pending }));

describe('qa4-undo-remove-rule: Undo puts the same rule back', () => {
  it('AC1 same-rule-listed: after Undo the list is as before, the rule worded, with its date and place', async () => {
    const v = tab();
    const before = await v.rules();
    const worded = before.filter((r) => !r.pending);
    // Positive control: the seed has worded rules, and the one taken out is not the first.
    expect(worded.length).toBeGreaterThan(1);
    const middle = worded[1];
    if (!middle) throw new Error('no second worded rule in the seed');
    const undo = await v.removeRule(middle.id);
    expect((await tab().rules()).some((r) => r.text === middle.text)).toBe(false);
    await undo();
    expect(shown(await tab().rules())).toEqual(shown(before));
  });

  it('AC2 same-rule-written: after Undo, the next tidy-up leaves Rules.md exactly as it was', async () => {
    const v = tab();
    const middle = (await v.rules()).filter((r) => !r.pending)[1];
    if (!middle) throw new Error('no second worded rule in the seed');
    const written = rulesText();
    // Positive control: the rule's line, its date and the words you wrote are in the note.
    expect(written).toContain(middle.text);
    const undo = await v.removeRule(middle.id);
    await undo();
    const run = await tidyUp(drive, root, 'instructions');
    if (run.phase !== 'done') throw new Error(run.failure);
    expect(rulesText()).toBe(written);
    expect(run.report.rulesWorded ?? 0).toBe(0);
    expect(run.report.yourChanges ?? 0).toBe(0);
  });

  it('AC3 pending-rule-keeps-date: a rule not worded yet, taken out and put back, keeps the date you added it', async () => {
    const v = tab();
    const words = 'anything from the dentist goes in health';
    const added = await v.addRule(words);
    // Let the clock move on, so a new line would carry another time.
    await new Promise((done) => setTimeout(done, 5));
    const undo = await v.removeRule(added.id);
    await undo();
    const back = (await tab().rules()).filter((r) => r.yourWords === words);
    expect(back.map((r) => ({ since: r.since, pending: !!r.pending }))).toEqual([{ since: added.since, pending: true }]);
    // R10: the Undo pairs with the removal it takes back, so the rule you added still shows as your change.
    expect((await tab().changes()).map((c) => c.id)).toContain(added.id);
    const run = await tidyUp(drive, root, 'instructions');
    if (run.phase !== 'done') throw new Error(run.failure);
    // The seed alone has nothing for a tidy-up to word (baseline 0), so this rule is the one worded.
    expect(run.report.rulesWorded ?? 0).toBe(1);
    // One rule line for it, worded once (its "You wrote" line under it is not a rule line).
    expect(rulesText().split('\n').filter((l) => l.startsWith('- ') && /dentist/i.test(l))).toHaveLength(1);
  });
});
