import { describe, expect, it, vi } from 'vitest';
import type { QuestionAnswer } from './contracts/questions';
import { answerQuestion } from './answer-loop';
import { answerToast } from '@/features/home/answer-words';
import type { RunSource, StartedRun, VaultSource } from './sources';
import type { Question, RunState } from './types';

const ask: Question = { id: 'q-ask-file-1', text: 'Is the kitchen photo from the viewing?', yes: 'Yes', no: 'No', subject: 'file-1', askedAt: 1 };
const state: Question = { id: 'q-state-note-1', text: 'You changed the current state of Flat 3. Should Bower write its update there?', yes: 'Write it', no: 'Keep mine', about: 'Projects/Flat hunt/Flat 3.md', askedAt: 2 };
const going: RunState = { id: 'run-going', scope: 'all', phase: 'reading', requestedAt: 1, phaseAt: 1, seen: false };

function sources(questions: Question[], current: RunState | null, started: StartedRun = { ...going, id: 'run-new', phase: 'queued' }) {
  const vault: Pick<VaultSource, 'questions' | 'answer'> = { questions: async () => questions, answer: vi.fn(async () => undefined) };
  const start = vi.fn(async (): Promise<StartedRun> => started);
  const runs: Pick<RunSource, 'start' | 'current'> = { start, current: async () => current };
  return { vault, runs, start };
}

describe('answering a question (TL-P4-08 addendum 8)', () => {
  it('an answer during a run says Bower will do it when the tidy-up ends', async () => {
    // The Worker keeps the answer for the end of the run going, and says so (TL-P4-13 addendum): no run of its own now.
    const { vault, runs, start } = sources([ask], going, { ...going, waits: true });
    const done = await answerQuestion(vault, runs, ask.id, true, { allowWeb: false });
    expect(vault.answer).toHaveBeenCalledWith(ask.id, true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('all', { allowWeb: false, requestId: expect.stringMatching(/^answer-[0-9a-f]{40}$/), subject: 'file-1', answer: true });
    expect(done?.outcome).toEqual({ kind: 'waits' });
    expect(answerToast({ kind: 'waits' }, 'Yes')).toBe('You chose "Yes". Bower will do this as soon as the current tidy-up ends.');
  });

  it('a yes with no run going starts its own and says so', async () => {
    const { vault, runs, start } = sources([ask], { ...going, phase: 'done' });
    const done = await answerQuestion(vault, runs, ask.id, true, { allowWeb: false });
    expect(start).toHaveBeenCalledTimes(1);
    expect(done?.outcome.kind).toBe('now');
    expect(answerToast({ kind: 'now', run: going }, 'Yes')).toBe('You chose "Yes". Bower is doing it now.');
  });

  it('a yes to Write it starts a run of your changes and says so; Keep mine starts none', async () => {
    const { vault, runs, start } = sources([state], null);
    const done = await answerQuestion(vault, runs, state.id, true, { allowWeb: false });
    expect(vault.answer).toHaveBeenCalledWith(state.id, true);
    // Scoped to your changes and notes (no pile): the run writes Bower's update into that note.
    expect(start).toHaveBeenCalledWith('instructions', { allowWeb: false, requestId: expect.stringMatching(/^answer-[0-9a-f]{40}$/), answer: true });
    expect(done?.outcome.kind).toBe('now');
    expect(answerToast({ kind: 'now', run: going }, 'Write it')).toBe('You chose "Write it". Bower is doing it now.');
    const no = sources([state], null);
    expect((await answerQuestion(no.vault, no.runs, state.id, false, { allowWeb: false }))?.outcome).toEqual({ kind: 'next' });
    expect(no.start).not.toHaveBeenCalled();
  });
});


describe('b5-proposal-yes-no-ignore-replay', () => {
  const proposal: Question = { id: 'q-proposal-lease', text: 'Remember leases as a type?', yes: 'Yes', no: 'No', askedAt: 3,
    proposal: { id: 'lease', payload: { kind: 'type-row', row: { id: 'lease', match: ['lease'], template: 'source',
      properties: { rent: { type: 'money' } }, table: ['rent'] } } } };
  it('control: exact boolean yes starts one instructions continuation and no starts none', async () => {
    for (const yes of [true, false]) {
      let open = true;
      const { vault, runs, start } = sources([proposal], null);
      vault.questions = async () => open ? [structuredClone(proposal)] : [];
      vault.answer = vi.fn(async () => { open = false; });
      await answerQuestion(vault, runs, proposal.id, yes, { allowWeb: false });
      expect(vault.answer).toHaveBeenCalledExactlyOnceWith(proposal.id, yes);
      expect(start).toHaveBeenCalledTimes(yes ? 1 : 0);
      if (yes) expect(start).toHaveBeenCalledWith('instructions', {
        allowWeb: false, answer: true, requestId: expect.stringMatching(/^answer-[0-9a-f]{40}$/),
      });
      expect(await answerQuestion(vault, runs, proposal.id, yes, { allowWeb: false })).toBeNull();
      expect(start).toHaveBeenCalledTimes(yes ? 1 : 0);
    }
  });
  it.each(['yes', { option: 'accept' }, { text: 'Yes' }])('rejects nonboolean answer %j before recording or starting', async (answer) => {
    const { vault, runs, start } = sources([proposal], null);
    await expect(answerQuestion(vault, runs, proposal.id, answer as QuestionAnswer, { allowWeb: false })).rejects.toThrow();
    expect(vault.answer).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  });
});
