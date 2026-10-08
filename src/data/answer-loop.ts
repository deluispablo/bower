/**
 * Answering one of Bower's questions (C05, TL-P4-08 addendum 8).
 */
import type { RunSource, VaultSource } from './sources';
import type { Question, RunState } from './types';

/** What an answer did: the question it answered, and the tidy-up it started, if any. */
export interface Answered {
  question: Question;
  run: Promise<RunState> | null;
}

/** Records the answer. Null when the question is no longer open. */
export async function answerQuestion(vault: Pick<VaultSource, 'questions' | 'answer'>, _runs: Pick<RunSource, 'start'>, id: string, yes: boolean, _opts: { allowWeb: boolean }): Promise<Answered | null> {
  const question = (await vault.questions()).find((q) => q.id === id);
  if (!question) return null;
  await vault.answer(id, yes);
  return { question, run: null };
}
