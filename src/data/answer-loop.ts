/**
 * Answering one of Bower's questions (C05, TL-P4-08 addendum 8; the owner chose (A): an answer applies at once).
 *
 * The answer is stored with its question once (`VaultSource.answer`: a journal line keyed by the question), and a yes
 * the run can act on starts a small tidy-up scoped to what it is about, at once:
 * - a thing or pile asked about (its subject, `contracts/questions.ts`): a run that takes only that pile, and your changes;
 * - keeping one note (a question about a pair of notes, `c3-pair-ask`): a run of your changes only, no pile;
 * - writing Bower's update over a Current state you edited ("Write it", by the note's file id): a run of your
 *   changes only, in which the model computes the update and the yes grants that one write, while the section still
 *   reads as asked about (`state-yes-writes`); "Keep mine" starts none and closes the question.
 * - a type proposal: a run of your changes only; boolean yes grants its frozen payload, text supplies person words.
 * - a large request (B12d, `q-request-`): a yes starts a run of your changes only, which applies its frozen first part with
 *   no model; a no starts none and settles the request at the next tidy-up.
 * Every other answer starts none and waits for the next tidy-up: a no, or a choice that changes nothing, closes its
 * question; a yes to Bower keeping the summaries it did not write (`q-adopt-states`) records that as a rule.
 * While a run is going, an answer starts none now: the Worker keeps it, and when that run ends its person object starts
 * the answer's run with no press (TL-P4-13 addendum); the answer says so. With the day's tidy-ups used up it is refused,
 * and the answer says it is saved for the next tidy-up, and why.
 *
 * The run is asked for as a press of Tidy up is, with an Idempotency-Key made from the question (its id and when it
 * was asked), so answering twice, on one device or two, is one run
 * (https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/). The Worker admits it as any press:
 * the daily quota, one run at a time (a run going is answered with `waits`, and the answer's run starts at its end).
 */
import { sha256Hex } from './contracts/hashes';
import { checkedAnswer, type QuestionAnswer, subjectOf } from './contracts/questions';
import type { RunSource, VaultSource } from './sources';
import type { Question, RunState } from './types';

/** What an answer starts: a run scoped to a thing or pile in the inbox, or to your changes and notes. */
export type AnswerRun = { scope: 'all'; subject: string } | { scope: 'instructions' };

/** A subject the Worker takes: a Drive file id or a pile id. */
const SUBJECT = /^[A-Za-z0-9_-]{1,128}$/;

/** The run an answer starts at once: proposal text continues without granting consent; a no starts none. */
export function answerRun(q: Question, yes: QuestionAnswer): AnswerRun | null {
  if (!yes) return null;
  const about = subjectOf(q);
  if (about.kind === 'proposal') return yes === true || typeof yes === 'object' && 'text' in yes ? { scope: 'instructions' } : null;
  if (about.kind === 'state' || about.kind === 'pair') return { scope: 'instructions' };
  if (about.kind === 'request') return yes === true ? { scope: 'instructions' } : null;
  if (about.kind === 'inbox') return SUBJECT.test(about.id) ? { scope: 'all', subject: about.id } : null;
  return null;
}

/** The request id of the run an answer starts: the same for every answer to one asking of one question. */
export async function answerRequestId(q: Pick<Question, 'id' | 'askedAt'>): Promise<string> {
  const hex = await sha256Hex(`${q.id}\n${q.askedAt}`);
  return `answer-${hex.slice(0, 40)}`;
}

/**
 * What an answer did, once the run it asks for has answered: `now` a run of its own started; `waits` a run is going and
 * the answer's run starts when it ends; `failed` the run could not start (the answer is kept for the next tidy-up); `next`
 * it starts no run and the next tidy-up closes it.
 */
export type AnswerOutcome =
  | { kind: 'now'; run: RunState }
  | { kind: 'waits' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'next' };

export interface Answered {
  question: Question;
  outcome: AnswerOutcome;
}

/**
 * Records the answer, then asks for the run it starts, if any. Null when the question is no longer open (answered
 * already, here or elsewhere): nothing is recorded or started again.
 */
export async function answerQuestion(vault: Pick<VaultSource, 'questions' | 'answer'>, runs: Pick<RunSource, 'start'>, id: string, yes: QuestionAnswer, opts: { allowWeb: boolean }): Promise<Answered | null> {
  const question = (await vault.questions()).find((q) => q.id === id);
  if (!question) return null;
  yes = checkedAnswer(question, yes);
  await vault.answer(id, yes);
  const plan = answerRun(question, yes);
  if (!plan) return { question, outcome: { kind: 'next' } };
  const requestId = await answerRequestId(question);
  try {
    // The Worker decides, in one step: a run of its own now, or, while a run is going, at that run's end (`waits`).
    const run = await runs.start(plan.scope, { allowWeb: opts.allowWeb, requestId, ...(plan.scope === 'all' ? { subject: plan.subject } : {}), answer: true });
    if (run.waits) return { question, outcome: { kind: 'waits' } };
    return { question, outcome: { kind: 'now', run } };
  } catch (error) {
    // The answer is kept; the person hears one sentence (`answerToast`), the details go to the console.
    console.error(error);
    return { question, outcome: { kind: 'failed', error } };
  }
}
