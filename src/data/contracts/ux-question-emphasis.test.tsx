/**
 * ux-safe-question-actions: `Question.noChange` is carried wherever a question is copied, older questions read unchanged,
 * and `noChangeAnswer` alone says which yes/no answer is filled (rulings R1, R2, R5). Made-up words only.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { Questions } from '@/features/home/Home';
import { loadingSources } from '@/testing/loading-sources';
import { only } from '../compat-p2-fixtures';
import { SYSTEM, isRunnerFile } from '../vault/layout';
import { isQuestionSnapshot, publicQuestion } from './questions';
import type { Question } from './types';

afterEach(cleanup);

const q: Question = { id: 'q-folder-check', text: 'Two notes say the same thing about the garden shed. Keep both?', yes: 'Keep both', no: 'Keep one', askedAt: 1 };

/** Each question through the one card, with only what `<Questions/>` reads. */
async function cards(qs: Question[]): Promise<HTMLElement[]> {
  const base = loadingSources();
  const methods: Record<string, unknown> = { questions: async () => qs, tree: async () => [] };
  const vault = new Proxy(base.vault, { get: (t, k) => typeof k === 'string' && k in methods ? methods[k] : Reflect.get(t, k) });
  await act(async () => {
    render(<MemoryRouter><DataProvider sources={{ ...base, vault }}><Questions /></DataProvider></MemoryRouter>);
  });
  const rows = [...screen.getByRole('region').querySelectorAll<HTMLElement>(':scope > ul > li')];
  // Cards stand in askedAt order, which each list below follows.
  expect(rows.map((r) => r.querySelector('p')?.textContent)).toEqual(qs.map((x) => x.text.replace(/\[\[([^\]]*)\]\]/g, '$1')));
  return rows;
}
const filled = (card: HTMLElement) => [...card.querySelectorAll('button.primary')].map((b) => b.textContent);

describe('ux-safe-question-actions: the noChange field', () => {
  it('AC3 carried', () => {
    expect(publicQuestion({ ...q, noChange: false })).toEqual({ ...q, noChange: false });
    expect(isQuestionSnapshot([{ ...q, noChange: true }])).toBe(true);
    expect(isQuestionSnapshot([{ ...q, noChange: 'yes' } as unknown as Question])).toBe(false);
    expect(isRunnerFile(SYSTEM.questions, { v: 1, questions: [{ ...q, noChange: true }] })).toBe(true);
    expect(isRunnerFile(SYSTEM.questions, { v: 1, questions: [{ ...q, noChange: 'yes' }] })).toBe(false);
    const lastRun = only('last-run').content as { run: { phase: string; report: Record<string, unknown> } };
    expect(lastRun.run.phase).toBe('done');
    const withRow = (row: unknown) => ({ ...lastRun, run: { ...lastRun.run, report: { ...lastRun.run.report, questions: [row] } } });
    expect(isRunnerFile(SYSTEM.lastRun, withRow({ ...q, noChange: true }))).toBe(true);
    expect(isRunnerFile(SYSTEM.lastRun, withRow({ ...q, noChange: 'yes' }))).toBe(false);
  });

  it('AC3 older_and_unknown_neutral', async () => {
    const stored = only('questions').content as { questions: Question[] };
    expect(isRunnerFile(SYSTEM.questions, stored)).toBe(true);
    const p2 = stored.questions.find((x) => x.id === 'q1');
    if (!p2) throw new Error('p2 q1 missing');
    const old = publicQuestion(p2);
    expect(Object.hasOwn(old, 'noChange')).toBe(false);
    const options = [{ id: 'home-folder', label: 'Areas / Home' }, { id: 'garden-folder', label: 'Projects / Garden' }];
    const after = old.askedAt;
    const qs: Question[] = [
      old,
      { id: 'q-ask-letter', subject: 'letter', text: 'Is this a letter from the council?', yes: 'File it', no: 'Leave it', askedAt: after + 1 },
      { ...q, askedAt: after + 2 },
      { id: 'q-ask-paper', subject: 'paper', text: 'Where should these papers go?', yes: 'File them', no: 'Leave them', askedAt: after + 3, options },
    ];
    const rows = await cards(qs);
    rows.forEach((row, i) => expect([qs[i]?.id, filled(row)]).toEqual([qs[i]?.id, []]));
  });

  it('AC3 subject_fill', async () => {
    const shown = { lines: ['The shed was painted.'], md5: '0'.repeat(32) };
    const qs: Question[] = [
      { id: 'q-state-shed', text: 'You changed the current state of Shed. Should Bower write its update there?', yes: 'Write it', no: 'Keep mine', shown, askedAt: 1 },
      { id: 'q-pair-a.b', text: 'Note A and Note B look like one note. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', askedAt: 2 },
      { id: 'q-merge-shed', text: '[[Shed (second)]] looks like [[Garden shed]]. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', askedAt: 3 },
      { id: 'q-request-r1', text: 'There are 3 active offers. Mark them reviewed?', yes: 'Start with these', no: 'Leave them', askedAt: 4,
        request: { id: 'r1', title: 'Review offers', set: { type: 'offer', folderId: 'folder-1', recursive: false },
          ops: [{ kind: 'property', key: 'review_state', mode: 'set', value: 'reviewed' }], members: ['file-1', 'file-2', 'file-3'], total: 3 } },
      { id: 'q-proposal-lease-1', text: 'Add a lease type?', yes: 'Add', no: 'Keep as is', askedAt: 5,
        proposal: { id: 'lease-1', payload: { kind: 'type-row', row: { id: 'lease', match: ['lease'], template: 'source', properties: { rent: { type: 'money' } }, table: ['rent'] } } } as Question['proposal'] },
      { id: 'q-pair-c.d', text: 'Note C and Note D look like one note. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', askedAt: 6, noChange: true },
      { ...q, id: 'q-folder-yes', text: 'Two receipts for the shed paint look like one payment. Keep both?', askedAt: 7, noChange: true },
      { ...q, id: 'q-folder-no', text: 'The shed and the garden notes look alike. Keep one?', yes: 'Merge', no: 'Keep apart', askedAt: 8, noChange: false },
    ];
    const rows = await cards(qs);
    const expected = [...qs.slice(0, 6).map((x) => x.no), 'Keep both', 'Keep apart'];
    rows.forEach((row, i) => expect([qs[i]?.id, filled(row)]).toEqual([qs[i]?.id, [expected[i]]]));
  });
});
