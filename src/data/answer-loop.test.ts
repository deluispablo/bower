import { describe, expect, it, vi } from 'vitest';
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

  it('a yes to Write it says honestly it is not done, and starts nothing', async () => {
    const { vault, runs, start } = sources([state], null);
    const done = await answerQuestion(vault, runs, state.id, true, { allowWeb: false });
    expect(vault.answer).toHaveBeenCalledWith(state.id, true);
    expect(start).not.toHaveBeenCalled();
    expect(done?.outcome).toEqual({ kind: 'not-yet' });
    expect(answerToast({ kind: 'not-yet' }, 'Write it')).toBe('You chose "Write it". Bower cannot write over your own summary yet, so it stays as you wrote it.');
  });
});
