/**
 * What a question is about, and whether it is still open (TL-P4-14 stage 3, `c3-subject`): the one home of a
 * question's subject, its key and the open-questions rule, for the reader (`DriveVault.questions()`, the answer loop)
 * and the planner (`planScripted`, the runner's answers). One open question per subject, never per its words
 * (TL-P4-11); a subject that is gone (left the inbox, or a note in the Bin) closes its question.
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
const PAIR = 'q-pair-';
/** Between a pair's two file ids in its question id: a Drive id never holds it ([A-Za-z0-9_-]). */
const PAIR_SEP = '.';
/** An older question about keeping one note, in its words (the corpus' and the first runner's): read, never written. */
const KEEP_ONE = /\bkeep one note\b/i;

/**
 * What a question is about:
 * - `inbox`: a pile or a thing in it, by its id (a pileId or a fileId: `questions.json` does not say which, and a pile
 *   and the things in it are one subject), with the content hash (md5Checksum) of the thing when it was asked;
 * - `state`: a note's Current state the person edited, by the note's file id, with the mark of its lines as asked;
 * - `pair`: two notes that may be one, which a yes keeps as one (`keep-one-note-merge`, c3-pair-ask): by their file
 *   ids (`by: 'id'`, the ids in its question id, as a state question carries its note's); an older question that linked
 *   both notes in its words still reads, by those two names (`by: 'name'`), as a tolerant reader does
 *   (https://martinfowler.com/bliki/TolerantReader.html);
 * - `folder`: the folder as a whole (a disagreement, the summaries rule, the accepted app's ones).
 */
export type Subject =
  | { kind: 'inbox'; id: string; hash?: string }
  | { kind: 'state'; id: string; mark?: string }
  | { kind: 'pair'; by: 'id' | 'name'; notes: readonly [string, string] }
  | { kind: 'folder' };

/** A question as far as its subject goes: its id, and what the wire may carry about it. */
export type Asked = Pick<Question, 'id'> & Partial<Pick<Question, 'subject' | 'hash' | 'state' | 'text'>>;

/** The id of the question asked about a pile, or about one thing by its file id: one each. */
export const askId = (pileOrFileId: string): string => `${ASK}${pileOrFileId}`;

/** The question about a note's Current state the person edited, word for word: `name` is the note's display name. */
export const STATE_ASK = (name: string): string => `You changed the current state of ${name}. Should Bower write its update there?`;
/** The same question asked again because the person changed that section after it was asked (its reason, said first). */
export const STATE_ASK_AGAIN = (name: string): string => `You changed the current state of ${name} again. Should Bower still write its update there?`;
/** The id of the question about a note's Current state the person edited, by the note's file id. */
export const stateQuestionId = (noteFileId: string): string => `${STATE}${noteFileId}`;

/** The id of the question whether two notes are one, by their file ids: one question per pair, in either order. */
export function pairQuestionId(a: string, b: string): string {
  const [x, y] = [a, b].sort((p, q) => (p < q ? -1 : p > q ? 1 : 0));
  return `${PAIR}${x ?? ''}${PAIR_SEP}${y ?? ''}`;
}

/** The two notes a pair question's id names, or null when it names no two different notes. */
function pairOf(id: string): readonly [string, string] | null {
  if (!id.startsWith(PAIR)) return null;
  const parts = id.slice(PAIR.length).split(PAIR_SEP);
  const [a, b] = parts;
  return parts.length === 2 && a && b && a !== b ? [a, b] : null;
}

/** An older keep-one question's two notes, by the names it links (a [[link]]'s target, before any "|", "#" or "^"). */
function namedPairOf(text: string | undefined): readonly [string, string] | null {
  if (text === undefined || !KEEP_ONE.test(text)) return null;
  const names = [...new Set([...text.matchAll(/\[\[([^\]|#^]*)/g)].map((m) => (m[1] ?? '').trim().replace(/\.md$/i, '')).filter(Boolean))];
  const [a, b] = names;
  return names.length === 2 && a && b && a.toLowerCase() !== b.toLowerCase() ? [a, b] : null;
}

/** What a question is about. An older ask with no `subject` carries its pile's or thing's id in its own id. */
export function subjectOf(q: Asked): Subject {
  if (q.id.startsWith(STATE)) return { kind: 'state', id: q.id.slice(STATE.length), ...(q.state !== undefined ? { mark: q.state } : {}) };
  const pair = pairOf(q.id);
  if (pair) return { kind: 'pair', by: 'id', notes: pair };
  const id = q.subject ?? (q.id.startsWith(ASK) ? q.id.slice(ASK.length) : undefined);
  if (id !== undefined) return { kind: 'inbox', id, ...(q.hash !== undefined ? { hash: q.hash } : {}) };
  const named = namedPairOf(q.text);
  return named ? { kind: 'pair', by: 'name', notes: named } : { kind: 'folder' };
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
 * The folder's notes as a reader saw them in its listing (the Bin is left out): their file ids, and their names
 * without ".md", in lower case (an older pair question names its notes so).
 */
export interface NotesSeen {
  ids: ReadonlySet<string>;
  names: ReadonlySet<string>;
}

/**
 * The notes a question's subject names that are not there now (in the Bin, or gone): a Current state's note, or a
 * pair's (by id, or an older one's by name). None for a thing, a pile or the folder, or when the notes were not seen.
 */
export function notesGone(q: Asked, notes: NotesSeen | null): string[] {
  const s = subjectOf(q);
  if (notes === null) return [];
  if (s.kind === 'state') return notes.ids.has(s.id) ? [] : [s.id];
  if (s.kind !== 'pair') return [];
  return s.notes.filter((n) => (s.by === 'id' ? !notes.ids.has(n) : !notes.names.has(n.toLowerCase())));
}

/**
 * Whether a question's subject is gone, for every kind of subject (TL-P4-19 addendum 8): a thing or pile that left
 * the inbox (neither its id nor its content is there now), or a note it names that is not there now. Only a reader
 * that saw the whole inbox, or the folder's notes, can say so (`null`: it did not, and nothing has gone).
 */
export function subjectLeft(q: Asked, inbox: InboxSeen | null, notes: NotesSeen | null = null): boolean {
  const s = subjectOf(q);
  if (s.kind === 'inbox') return inbox !== null && !inbox.ids.has(s.id) && !(s.hash !== undefined && !!inbox.hashes?.has(s.hash));
  return notesGone(q, notes).length > 0;
}

/** The questions still open: not answered, and not about a subject that is gone. */
export function openQuestions<Q extends Asked>(all: readonly Q[], answered: ReadonlySet<string | undefined>, inbox: InboxSeen | null, notes: NotesSeen | null = null): Q[] {
  return all.filter((q) => !answered.has(q.id) && !subjectLeft(q, inbox, notes));
}

/** A question as a run's report row has it: what the person reads, never its subject, hash, mark or shown update. */
export type ReportQuestion = Pick<Question, 'id' | 'text' | 'yes' | 'no' | 'askedAt' | 'about'>;

/** Its fields in the order the question has them, so a report reads as before. */
export function reportRowOf(q: Question): ReportQuestion {
  const { subject: _subject, hash: _hash, state: _state, shown: _shown, ...row } = q;
  return row;
}
