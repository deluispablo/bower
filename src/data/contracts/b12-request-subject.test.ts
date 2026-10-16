/** B12d: a large request's question is one more subject of the one question contract (TL-P4-52 Q2, Q9). */
import { describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import { answerRun } from '../answer-loop';
import type { Question } from '../types';
import { isRunnerFile, SYSTEM } from '../vault/layout';
import { checkedAnswer, isQuestionSnapshot, subjectOf } from './questions';

const members = (n: number) => Array.from({ length: n }, (_, i) => `file-${i + 1}`);
const ask = (request: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ id: 'q-request-press-1',
  text: 'There are 201 active offers. Start with the 200 most recent?', yes: 'Start with these', no: 'Leave them', askedAt: 1,
  request: { id: 'press-1', title: 'Review offers', set: { type: 'offer', folderId: 'folder-1', recursive: false },
    ops: [{ kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' }], members: members(200), total: 201, ...request }, ...extra }) as unknown as Question;

describe('B12d the request subject', () => {
  it('AC22 b12-large-part-subject-contract: a request question is its own subject, read and written through the one contract', () => {
    expect(subjectOf(ask())).toEqual({ kind: 'request', id: 'press-1' });
    expect(isQuestionSnapshot([ask()])).toBe(true);
    for (const [why, bad] of [
      ['201 members', ask({ members: members(201) })],
      ['no member', ask({ members: [] })],
      ['a member twice', ask({ members: [...members(199), 'file-1'] })],
      ['a total below its members', ask({ total: 199 })],
      ['an id that does not name its request', ask({}, { id: 'q-request-press-2' })],
      ['a key outside the contract', ask({ extra: 1 })],
      ['an inbox subject beside it', ask({}, { subject: 'file-9' })],
      ['options beside it', ask({}, { options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] })],
      // The stored part's nested grammar, one contract (R42): the set and the ops a yes would apply.
      ['a set selector the grammar refuses', ask({ set: { type: 'offer', folderId: 'folder-1', recursive: false, where: { op: 'eval', property: 'status', value: 'active' } } })],
      ['a set with no folder', ask({ set: { type: 'offer', recursive: false } })],
      ['empty ops', ask({ ops: [] })],
      ['more than 8 ops', ask({ ops: Array.from({ length: 9 }, () => ({ kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' })) })],
      ['an op outside the grammar', ask({ ops: [{ kind: 'delete' }] })],
      ['a property op with no value', ask({ ops: [{ kind: 'property', key: 'review_state', mode: 'set' }] })],
      ['a tag that is not a tag', ask({ ops: [{ kind: 'tag', mode: 'add', value: 'Not A Tag!' }] })],
      ['a rename, which belongs to one note', ask({ ops: [{ kind: 'rename', name: 'Offer.md' }] })],
      ['a proposal subject beside it', ask({}, { proposal: { id: 'lease-1', payload: { kind: 'type-row', row: { id: 'lease', match: ['lease'], template: 'source', properties: { rent: { type: 'money' } }, table: ['rent'] } } } })],
    ] as const) {
      expect(isQuestionSnapshot([bad]), why).toBe(false);
      expect(isRunnerFile(SYSTEM.questions, { v: 1, questions: [bad] }), `the app's reader: ${why}`).toBe(false);
    }
    expect(isRunnerFile(SYSTEM.questions, { v: 1, questions: [ask()] })).toBe(true);
  });

  it('AC22 b12-large-part-answer-run: a yes starts a run for your changes; a no starts none; only yes or no is an answer', () => {
    expect(answerRun(ask(), true)).toEqual({ scope: 'instructions' });
    expect(answerRun(ask(), false)).toBeNull();
    expect(checkedAnswer(ask(), true)).toBe(true);
    expect(() => checkedAnswer(ask(), { text: 'Only the first ten.' })).toThrow();
  });

  it('AC22 b12-large-part-public-drive: the app\'s Drive reader lists a request question with its stored part; its yes starts the stored instructions', async () => {
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    try {
      localStorage.clear();
      const drive = new FakeDrive();
      const root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
      const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
      const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === SYSTEM.questions);
      if (!file) throw new Error('no questions.json');
      const stored = ask({ members: ['file-1', 'file-2'] });
      await drive.writeText(file.id, JSON.stringify({ v: 1, questions: [stored] }), (await drive.get(file.id)).modifiedTime);
      await vault.refresh();
      const [card] = await vault.questions();
      expect(card, 'listed whole, its stored part kept').toEqual(stored);
      if (!card) return;
      expect(subjectOf(card)).toEqual({ kind: 'request', id: 'press-1' });
      expect(answerRun(card, true), 'its yes starts the stored instructions').toEqual({ scope: 'instructions' });
    } finally { vi.useRealTimers(); }
  });
});
