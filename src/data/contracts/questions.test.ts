/**
 * What a question is about (`contracts/questions.ts`): a pair of notes Bower asks to keep as one is a typed subject,
 * its two notes by their file ids (c3-pair-ask, TL-P4-16 addendum). An older question naming both notes as [[links]]
 * still reads as a pair, by those names (a tolerant reader); the accepted app's merge question names no note and stays
 * the folder's own.
 */
import { describe, expect, it, vi } from 'vitest';
import { answerQuestion, answerRun } from '../answer-loop';
import { STATE_ASK_AGAIN, answeredState, isAnsweredRow, openQuestions, subjectOf } from './questions';
import type { Question } from './types';

const PAIR: Question = { id: 'q-pair-note-a.note-b', text: 'Flat 3, 12 Larkspur Lane and Flat 3 (second) look like one flat. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', askedAt: 1 };
const OLD: Question = { id: 'q-merge-flat-3', text: '[[Flat 3 (second)]] looks like [[Flat 3, 12 Larkspur Lane]]. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', askedAt: 1 };
const ACCEPTED: Question = { id: 'q1', text: 'Flat 3, 12 Larkspur Lane and the new Wrenfield Road listing look like the same building. Keep one note for both?', yes: 'Yes, merge', no: 'No, keep both', about: 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md', askedAt: 1 };

it('B5a contracts: b5-proposal-exact-payload', () => {
  expect(subjectOf(PAIR)).toEqual({ kind: 'pair', by: 'id', notes: ['note-a', 'note-b'] });
  expect(answerRun(PAIR, true)).toEqual({ scope: 'instructions' });
  const payload = { kind: 'type-row', row: { id: 'lease', match: ['lease'], template: 'source',
    properties: { rent: { type: 'money' } }, table: ['rent'] } };
  // A question points to the immutable artifact, rather than a title, an inbox item or a rewritten payload.
  const question = { id: 'q-proposal-lease-1', text: 'Add a lease type?', yes: 'Add', no: 'Keep as is',
    askedAt: 1, proposal: { id: 'lease-1', payload } };
  expect(subjectOf(question)).toEqual({ kind: 'proposal', id: 'lease-1' });
  expect(answerRun(question, true)).toEqual({ scope: 'instructions' });
  expect(answerRun(question, false)).toBeNull();
  expect(openQuestions([question], new Set(), { ids: new Set() }, { ids: new Set(), names: new Set() })).toEqual([question]);
  expect(openQuestions([question], new Set([question.id]), { ids: new Set() })).toEqual([]);
  expect(question.proposal).toEqual({ id: 'lease-1', payload });
});

it('B5a contracts: old question fixtures retain folder inbox state and pair meanings', () => {
  expect(subjectOf(ACCEPTED)).toEqual({ kind: 'folder' });
  expect(subjectOf(OLD)).toEqual({ kind: 'pair', by: 'name', notes: ['Flat 3 (second)', 'Flat 3, 12 Larkspur Lane'] });
  expect(subjectOf({ id: 'q-ask-alex', hash: 'content-1' })).toEqual({ kind: 'inbox', id: 'alex', hash: 'content-1' });
  expect(subjectOf({ id: 'q-state-career', state: 'mark-1' })).toEqual({ kind: 'state', id: 'career', mark: 'mark-1' });
  expect(openQuestions([ACCEPTED, PAIR], new Set(), { ids: new Set() },
    { ids: new Set(['note-a', 'note-b']), names: new Set() })).toEqual([ACCEPTED, PAIR]);
});

it('B5a contracts: proposal answer records only its id and uses the existing continuation once', async () => {
  const start = vi.fn(async () => ({ id: 'run-alex', scope: 'instructions' as const, phase: 'queued' as const,
    requestedAt: 1, phaseAt: 1, seen: false }));
  const answer = vi.fn(async () => undefined);
  const state = { id: 'q-state-career', text: 'Write it?', yes: 'Write', no: 'Keep mine', askedAt: 1 };
  const question = { id: 'q-proposal-lease-1', text: 'Add a lease type?', yes: 'Add', no: 'Keep as is', askedAt: 1,
    proposal: { id: 'lease-1', payload: { kind: 'type-row', row: { id: 'lease', match: ['lease'],
      template: 'source', properties: { rent: { type: 'money' } }, table: ['rent'] } } } };
  let open = [state];
  const vault = { questions: async () => open, answer };
  expect((await answerQuestion(vault, { start }, state.id, true, { allowWeb: false }))?.outcome.kind).toBe('now');
  expect(start).toHaveBeenCalledTimes(1);
  start.mockClear(); answer.mockClear();
  open = [question];
  const result = await answerQuestion(vault, { start }, question.id, true, { allowWeb: false });
  expect(answer).toHaveBeenCalledExactlyOnceWith(question.id, true);
  expect(start).toHaveBeenCalledExactlyOnceWith('instructions', {
    allowWeb: false, requestId: expect.stringMatching(/^answer-[0-9a-f]{40}$/), answer: true,
  });
  expect(result?.outcome.kind).toBe('now');
  start.mockClear(); answer.mockClear();
  expect((await answerQuestion(vault, { start }, question.id, false, { allowWeb: false }))?.outcome).toEqual({ kind: 'next' });
  expect(answer).toHaveBeenCalledExactlyOnceWith(question.id, false);
  expect(start).not.toHaveBeenCalled();
  open = [];
  expect(await answerQuestion(vault, { start }, question.id, true, { allowWeb: false })).toBeNull();
  expect(answer).toHaveBeenCalledTimes(1);
});

describe('question subjects', () => {
  it('a pair question has a typed two-note subject', () => {
    // Its two notes by their file ids, never by words in its text; a yes starts a run of your changes and notes.
    expect(subjectOf(PAIR)).toEqual({ kind: 'pair', by: 'id', notes: ['note-a', 'note-b'] });
    expect(answerRun(PAIR, true)).toEqual({ scope: 'instructions' });
    expect(answerRun(PAIR, false)).toBeNull();
    // An older question in the text form still reads as a pair, by the two names it links, and settles the same way.
    expect(subjectOf(OLD)).toEqual({ kind: 'pair', by: 'name', notes: ['Flat 3 (second)', 'Flat 3, 12 Larkspur Lane'] });
    expect(answerRun(OLD, true)).toEqual({ scope: 'instructions' });
    // The accepted app's question names no note: the folder's own, answered at the next tidy-up.
    expect(subjectOf(ACCEPTED)).toEqual({ kind: 'folder' });
    expect(answerRun(ACCEPTED, true)).toBeNull();
    // Malformed pair ids are not pairs.
    expect(subjectOf({ ...PAIR, id: 'q-pair-note-a.note-a' }).kind).toBe('folder');
    expect(subjectOf({ ...PAIR, id: 'q-pair-note-a' }).kind).toBe('folder');
  });
});

describe('a Write it with no effect (TL-P4-19 addendum 12)', () => {
  it('asks again in one sentence that says why', () => {
    expect(STATE_ASK_AGAIN('Home')).toBe('The current state of Home changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?');
  });

  it('a refused write and nothing to write name the note, or say "the note", and show on it', () => {
    const at = 'Areas/Home/Home.md';
    expect(answeredState('q-state-f1', 'refused', at)).toEqual({ questionId: 'q-state-f1', kind: 'state', outcome: 'refused', why: 'Not written: Drive would not let Bower change Home. Your current state is as you left it.', note: at });
    expect(answeredState('q-state-f1', 'refused', null)).toEqual({ questionId: 'q-state-f1', kind: 'state', outcome: 'refused', why: 'Not written: Drive would not let Bower change the note. Your current state is as you left it.' });
    expect(answeredState('q-state-f1', 'nothing-to-write', at)).toEqual({ questionId: 'q-state-f1', kind: 'state', outcome: 'nothing-to-write', why: 'Nothing to write: Home already said what Bower would have written.', note: at });
    expect(answeredState('q-state-f1', 'nothing-to-write', null)).toEqual({ questionId: 'q-state-f1', kind: 'state', outcome: 'nothing-to-write', why: 'Nothing to write: the note already said it.' });
  });

  it('rows stored before still read, and the new rows read too', () => {
    const gone = { questionId: 'q-state-f1', kind: 'state', outcome: 'subject-gone', why: 'Not written: the note had moved or gone to the Bin.' };
    expect(isAnsweredRow(gone)).toBe(true);
    expect(isAnsweredRow(answeredState('q-state-f1', 'refused', 'Areas/Home/Home.md'))).toBe(true);
    expect(isAnsweredRow(answeredState('q-state-f1', 'nothing-to-write', null))).toBe(true);
    expect(isAnsweredRow({ ...gone, outcome: 'clash' })).toBe(false);
  });
});


it('b4a-forget-fact-question-action', async () => {
  const { isQuestionOption, publicQuestion, checkedAnswer } = await import('./questions');
  const { isRunnerFile } = await import('../vault/layout');
  const fileTo = { id: 'file-choice', label: 'Garden', action: { kind: 'file-to', folderId: 'folder-garden' } };
  expect(isQuestionOption(fileTo), 'file-to remains unchanged').toBe(true);
  const forget = { id: 'fact-choice', label: 'Remote roles', action: { kind: 'forget-fact', factId: 'fact-remote' } };
  expect.soft(isQuestionOption(forget), 'additive action binds a shown fact id').toBe(true);
  for (const action of [
    { kind: 'forget-fact', factId: '' }, { kind: 'forget-fact', factId: '../fact-remote' },
    { kind: 'forget-fact', factId: 'fact-remote', sourceId: 'source-1' },
    { kind: 'forget-fact', folderId: 'folder-garden' }, { kind: 'file-to', factId: 'fact-remote' },
    { kind: 'file-to', folderId: 'folder-garden', factId: 'fact-remote' },
  ]) expect(isQuestionOption({ ...forget, action }), JSON.stringify(action)).toBe(false);
  const q = { id: 'q-ask-p-words', subject: 'p-words', text: 'Which fact should Bower forget?',
    yes: 'Choose', no: 'Keep', askedAt: 1, options: [forget,
      { id: 'garden-choice', label: 'Garden', action: { kind: 'forget-fact', factId: 'fact-garden' } }] };
  expect.soft(isRunnerFile('.bower/questions.json', { v: 1, questions: [q] }), 'stored actions round-trip').toBe(true);
  const card = publicQuestion(q);
  expect(card.options).toEqual([{ id: 'fact-choice', label: 'Remote roles' }, { id: 'garden-choice', label: 'Garden' }]);
  expect(checkedAnswer(card, { option: 'fact-choice' })).toEqual({ option: 'fact-choice' });
  expect(() => checkedAnswer(card, { option: 'fact-unshown' })).toThrow();
  const old = { ...q, options: [fileTo, { ...fileTo, id: 'second', action: { kind: 'file-to', folderId: 'folder-2' } }] };
  expect(isRunnerFile('.bower/questions.json', { v: 1, questions: [old] })).toBe(true);
});
