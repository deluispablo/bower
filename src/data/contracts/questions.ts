/**
 * What a question is about, and whether it is still open (TL-P4-14 stage 3, `c3-subject`): the one home of a
 * question's subject, its key and the open-questions rule, for the reader (`DriveVault.questions()`, the answer loop)
 * and the planner (`planScripted`, the runner's answers). One open question per subject, never per its words
 * (TL-P4-11); a subject that left the inbox closes its question.
 *
 * The subject is a discriminated union (TypeScript handbook, "Discriminated unions",
 * https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions): its `kind` says which fields
 * it has, and every reader narrows on it. It is derived from the question as `.bower/questions.json` holds it, so the
 * wire stays as the accepted app wrote it (P2's `q1` with no subject still reads, as the folder's own question).
 */
import type { Question } from './types';

/** The id prefixes Bower's questions carry, spelled here alone. */
const ASK = 'q-ask-';
const STATE = 'q-state-';

/**
 * What a question is about:
 * - `inbox`: a pile or a thing in it, by its id (a pileId or a fileId: `questions.json` does not say which, and a pile
 *   and the things in it are one subject), with the content hash (md5Checksum) of the thing when it was asked;
 * - `state`: a note's Current state the person edited, by the note's file id, with the mark of its lines as asked;
 * - `folder`: the folder as a whole (keeping one note, a disagreement, the summaries rule, the accepted app's ones).
 */
export type Subject =
  | { kind: 'inbox'; id: string; hash?: string }
  | { kind: 'state'; id: string; mark?: string }
  | { kind: 'folder' };

/** A question as far as its subject goes: its id, and what the wire may carry about it. */
export type Asked = Pick<Question, 'id'> & Partial<Pick<Question, 'subject' | 'hash' | 'state'>>;

/** The id of the question asked about a pile, or about one thing by its file id: one each. */
export const askId = (pileOrFileId: string): string => `${ASK}${pileOrFileId}`;

/** The id of the question about a note's Current state the person edited, by the note's file id. */
export const stateQuestionId = (noteFileId: string): string => `${STATE}${noteFileId}`;

/** What a question is about. An older ask with no `subject` carries its pile's or thing's id in its own id. */
export function subjectOf(q: Asked): Subject {
  if (q.id.startsWith(STATE)) return { kind: 'state', id: q.id.slice(STATE.length), ...(q.state !== undefined ? { mark: q.state } : {}) };
  const id = q.subject ?? (q.id.startsWith(ASK) ? q.id.slice(ASK.length) : undefined);
  return id === undefined ? { kind: 'folder' } : { kind: 'inbox', id, ...(q.hash !== undefined ? { hash: q.hash } : {}) };
}

/** The key one open question per subject goes by: the pile's or thing's id in the inbox; none for any other subject. */
export function subjectKey(q: Asked): string | undefined {
  const s = subjectOf(q);
  return s.kind === 'inbox' ? s.id : undefined;
}

/** The inbox as a reader saw it: the ids of its piles and things, and the content hashes of its things when known. */
export interface InboxSeen {
  ids: ReadonlySet<string>;
  hashes?: ReadonlySet<string>;
}

/**
 * Whether a question's thing or pile left the inbox: neither its id nor its content is there now. Only a reader that
 * saw the whole inbox can say so (`null`: it did not, and nothing has left).
 */
export function subjectLeft(q: Asked, inbox: InboxSeen | null): boolean {
  const s = subjectOf(q);
  return inbox !== null && s.kind === 'inbox' && !inbox.ids.has(s.id) && !(s.hash !== undefined && !!inbox.hashes?.has(s.hash));
}

/** The questions still open: not answered, and not about a thing or pile that left the inbox. */
export function openQuestions<Q extends Asked>(all: readonly Q[], answered: ReadonlySet<string | undefined>, inbox: InboxSeen | null): Q[] {
  return all.filter((q) => !answered.has(q.id) && !subjectLeft(q, inbox));
}

/** A question as a run's report row has it: what the person reads, never its subject, hash or mark. */
export type ReportQuestion = Pick<Question, 'id' | 'text' | 'yes' | 'no' | 'askedAt' | 'about'>;

/** Its fields in the order the question has them, so a report reads as before. */
export function reportRowOf(q: Question): ReportQuestion {
  const { subject: _subject, hash: _hash, state: _state, ...row } = q;
  return row;
}
