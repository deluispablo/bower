/**
 * Answering one of Bower's questions (C05, TL-P4-08 addendum 8; the owner chose (A): an answer applies at once).
 *
 * The answer is stored with its question once (`VaultSource.answer`: a journal line keyed by the question), and a yes
 * the run can act on starts a small tidy-up scoped to what it is about, at once:
 * - a thing or pile asked about (`q-ask-…`, its `subject`): a run that takes only that pile, and your changes;
 * - keeping one note (a question naming its two notes as [[links]]): a run of your changes only, no pile.
 * Every other answer starts none and waits for the next tidy-up: a no, or a choice that changes nothing, closes its
 * question; a yes to Bower keeping the summaries it did not write (`q-adopt-states`) records that as a rule. A yes to
 * writing over a Current state you edited (`q-state-…`) is not something Bower can do yet: it says so, starts nothing,
 * and the next tidy-up closes the question, your summary as you wrote it (P4-20 I2; the lead decides whether to build it).
 * While a run is going, an answer starts none: it waits for the next run, and says so (P4-20 I1).
 *
 * The run is asked for as a press of Tidy up is, with an Idempotency-Key made from the question (its id and when it
 * was asked), so answering twice, on one device or two, is one run
 * (https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/). The Worker admits it as any press:
 * the daily quota, one run at a time (a run going is answered, and the answer waits for the next run).
 */
import type { RunSource, VaultSource } from './sources';
import type { Question, RunState } from './types';

/** What an answer starts: a run scoped to a thing or pile in the inbox, or to your changes and notes. */
export type AnswerRun = { scope: 'all'; subject: string } | { scope: 'instructions' };

/** A question about keeping one note: the corpus' and the runner's wording (`runner/src/claude.ts`, `mergesOf`). */
const KEEP_ONE = /\bkeep one note\b/i;
/** The phases of a run still going (the Worker's `ACTIVE_PHASES`). */
const GOING: readonly RunState['phase'][] = ['queued', 'reading', 'writing', 'saving'];
/** A subject the Worker takes: a Drive file id or a pile id. */
const SUBJECT = /^[A-Za-z0-9_-]{1,128}$/;

/** The thing or pile a question is about: its subject, or the id in an older `q-ask-` question's id. */
export function subjectOf(q: Pick<Question, 'id' | 'subject'>): string | undefined {
  return q.subject ?? (q.id.startsWith('q-ask-') ? q.id.slice('q-ask-'.length) : undefined);
}

/** The run a yes starts at once, or null: a no, and a choice no run acts on, start none. */
export function answerRun(q: Question, yes: boolean): AnswerRun | null {
  if (!yes) return null;
  const subject = subjectOf(q);
  if (subject !== undefined) return SUBJECT.test(subject) ? { scope: 'all', subject } : null;
  const notes = new Set((q.text.match(/\[\[[^\]]+\]\]/g) ?? []).map((l) => l.toLowerCase()));
  return KEEP_ONE.test(q.text) && notes.size === 2 ? { scope: 'instructions' } : null;
}

/** The request id of the run an answer starts: the same for every answer to one asking of one question. */
export async function answerRequestId(q: Pick<Question, 'id' | 'askedAt'>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${q.id}\n${q.askedAt}`));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `answer-${hex.slice(0, 40)}`;
}

/**
 * What an answer did, once the run it asks for has answered: `now` a run of its own started; `waits` a run is going and
 * the answer waits for the next; `failed` the run could not start (the answer is kept for the next tidy-up); `next`
 * it starts no run and the next tidy-up closes it; `not-yet` Bower cannot do what was chosen yet (the question closes).
 */
export type AnswerOutcome =
  | { kind: 'now'; run: RunState }
  | { kind: 'waits' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'next' }
  | { kind: 'not-yet' };

export interface Answered {
  question: Question;
  outcome: AnswerOutcome;
}

/**
 * Records the answer, then asks for the run it starts, if any. Null when the question is no longer open (answered
 * already, here or elsewhere): nothing is recorded or started again.
 */
export async function answerQuestion(vault: Pick<VaultSource, 'questions' | 'answer'>, runs: Pick<RunSource, 'start' | 'current'>, id: string, yes: boolean, opts: { allowWeb: boolean }): Promise<Answered | null> {
  const question = (await vault.questions()).find((q) => q.id === id);
  if (!question) return null;
  await vault.answer(id, yes);
  if (yes && question.id.startsWith('q-state-')) return { question, outcome: { kind: 'not-yet' } };
  const plan = answerRun(question, yes);
  if (!plan) return { question, outcome: { kind: 'next' } };
  const requestId = await answerRequestId(question);
  try {
    // A run going keeps what it took: the answer waits for the next run, and is not told it is being done now.
    const current = await runs.current();
    if (current && GOING.includes(current.phase)) return { question, outcome: { kind: 'waits' } };
    const run = await runs.start(plan.scope, { allowWeb: opts.allowWeb, requestId, ...(plan.scope === 'all' ? { subject: plan.subject } : {}) });
    return { question, outcome: { kind: 'now', run } };
  } catch (error) {
    // The answer is kept; the person hears one sentence (`answerToast`), the details go to the console.
    console.error(error);
    return { question, outcome: { kind: 'failed', error } };
  }
}
