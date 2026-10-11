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
import type { Pile, Question } from './types';
import type { JournalRecord } from './journal-record';
import { BowerError } from './types';
import { EMPTY_MD5 } from './hashes';
import { keepAlreadyBinned } from './note-edit';
import { displayName, nameOf, thingName } from './tree';

/** The id prefixes Bower's questions carry, spelled here alone. */

/** Additive journal values; legacy text yes/no remains readable. */
export type QuestionAnswer = boolean | { option: string } | { text: string };
export interface QuestionOption { id: string; label: string; action: { kind: 'file-to'; folderId: string } }
export interface QuestionRound {
  subject: string; hash?: string; pileId: string; words: string; count: number; exhausted?: true;
  /** Words alone are a member of their own, never the things added later. Absent on legacy pile histories. */
  wordsOnly?: true;
  /** The settled asking's wording, retained only until an unavailable-folder answer is asked again. */
  reask?: Question;
}

export function isQuestionAnswer(value: unknown): value is QuestionAnswer {
  if (typeof value === 'boolean') return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 1) return false;
  if (typeof v.option === 'string') return /^[A-Za-z0-9_-]{1,128}$/.test(v.option);
  return typeof v.text === 'string' && v.text.trim() === v.text && v.text.length > 0 && v.text.length <= 1000
    && ![...v.text].some((char) => { const code = char.charCodeAt(0);
      return (code <= 0x1f && code !== 0x0a && code !== 0x0d) || (code >= 0x7f && code <= 0x9f); });
}

/** Validate at the shared answer boundary, before any journal line or run. */
export function checkedAnswer(q: Question, value: QuestionAnswer): QuestionAnswer {
  const answer = value && typeof value === 'object' && 'text' in value && typeof value.text === 'string'
    ? { ...value, text: value.text.trim() } : value;
  if (!isQuestionAnswer(answer) || (typeof answer !== 'boolean' && (subjectOf(q).kind !== 'inbox'
    || ('option' in answer && !q.options?.some((o) => o.id === answer.option)))))
    throw new BowerError('conflict', 'Choose an answer or write your words.');
  return answer;
}

export function journalAnswer(r: Pick<JournalRecord, 'answer' | 'text'>): QuestionAnswer | undefined {
  return r.answer ?? (r.text === 'yes' ? true : r.text === 'no' ? false : undefined);
}
export const askingKey = (q: Pick<Question, 'id' | 'askedAt'>): string => `${q.id}\n${q.askedAt}`;
export const answersAsking = (r: Pick<JournalRecord, 'questionId' | 'askedAt'>, q: Pick<Question, 'id' | 'askedAt'>): boolean =>
  r.questionId === q.id && (r.askedAt === undefined || r.askedAt === q.askedAt);
export function answeredAskings(lines: readonly JournalRecord[]): Set<string> {
  return new Set(lines.filter((r) => r.kind === 'answer' && journalAnswer(r) !== undefined)
    .map((r) => r.askedAt === undefined ? r.questionId ?? '' : askingKey({ id: r.questionId ?? '', askedAt: r.askedAt })));
}
export function isQuestionOption(value: unknown): value is QuestionOption {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  const a = o.action as Record<string, unknown> | undefined;
  return Object.keys(o).every((k) => ['id', 'label', 'action'].includes(k)) && typeof o.id === 'string'
    && /^[A-Za-z0-9_-]{1,128}$/.test(o.id) && typeof o.label === 'string' && o.label.trim().length > 0 && o.label.length <= 40
    && !!a && Object.keys(a).length === 2 && a.kind === 'file-to' && typeof a.folderId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(a.folderId);
}
/** A pile and its member are related; two different members remain different subjects. */
export function relatedSubjects(x: string | undefined, y: string | undefined, piles: readonly Pile[]): boolean {
  return x !== undefined && y !== undefined && (x === y || piles.some((p) =>
    (p.id === x && p.items.some((i) => i.id === y)) || (p.id === y && p.items.some((i) => i.id === x))));
}

/** Equal nonempty content identifies a reupload only after the original thing has left. */
export function sameSubjectContent(a: Asked, b: Pick<Question, 'hash'>, inbox: InboxSeen): boolean {
  return !!a.hash && a.hash !== EMPTY_MD5 && a.hash === b.hash && !inbox.ids.has(subjectKey(a) ?? '');
}

/** Locate today's subject by id first, then by a gone thing's nonempty content hash. */
export function subjectPile(q: Asked, piles: readonly Pile[], hashes: ReadonlyMap<string, string> = new Map()): Pile | undefined {
  const s = subjectOf(q);
  if (s.kind !== 'inbox') return undefined;
  return piles.find((p) => relatedSubjects(s.id, p.id, [p]))
    ?? (s.hash && s.hash !== EMPTY_MD5 ? piles.find((p) => p.items.some((i) => hashes.get(i.id) === s.hash)) : undefined);
}

/** Today's members covered by an asking; words alone use the pile identity. No frozen membership. */
export function subjectMembers(q: Asked, piles: readonly Pile[], contextName: string, hashes: ReadonlyMap<string, string> = new Map()): string[] {
  const pile = subjectPile(q, piles, hashes);
  if (!pile) return [];
  const subject = subjectKey(q);
  const members = pile.items.filter((i) => i.name !== contextName).map((i) => i.id);
  if (subject === pile.id) return members.length ? members : [pile.id];
  if (subject !== undefined && members.includes(subject)) return [subject];
  return members.filter((id) => q.hash !== undefined && q.hash !== EMPTY_MD5 && hashes.get(id) === q.hash);
}

/** Member history including legacy pile askings and reuploads; a pile's count is its members' maximum. */
export function roundFor(rounds: readonly QuestionRound[], q: Asked, piles: readonly Pile[], hashes: ReadonlyMap<string, string> = new Map()): QuestionRound | undefined {
  const pile = subjectPile(q, piles, hashes);
  if (!pile) return undefined;
  const inbox = { ids: new Set(piles.flatMap((p) => [p.id, ...p.items.map((i) => i.id)])) };
  return rounds.filter((r) => r.words === pile.text && (!r.wordsOnly || r.subject === subjectKey(q)) && (relatedSubjects(r.subject, subjectKey(q), piles)
    || sameSubjectContent({ id: askId(r.subject), subject: r.subject, hash: r.hash }, q, inbox)
    || sameSubjectContent(q, r, inbox))).reduce<QuestionRound | undefined>((max, r) =>
      !max || r.count > max.count || (r.count === max.count && r.exhausted) ? r : max, undefined);
}
export function pileQuestion(pile: Pile, open: readonly Question[], rounds: readonly QuestionRound[], hashes: ReadonlyMap<string, string> = new Map()): Pile['question'] {
  const belongs = (q: Asked): boolean => subjectPile(q, [pile], hashes) !== undefined;
  if (open.some(belongs)) return 'waiting';
  if (rounds.some((r) => r.reask && r.words === pile.text && belongs({ id: askId(r.subject), subject: r.subject, hash: r.hash }))) return 'waiting';
  return rounds.some((r) => r.exhausted && r.words === pile.text && belongs({ id: askId(r.subject), subject: r.subject, ...(r.hash ? { hash: r.hash } : {}) })) ? 'exhausted' : undefined;
}

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
export type Asked = Pick<Question, 'id'> & Partial<Pick<Question, 'subject' | 'hash' | 'state' | 'text' | 'askedAt'>>;

/** The id of the question asked about a pile, or about one thing by its file id: one each. */
export const askId = (pileOrFileId: string): string => `${ASK}${pileOrFileId}`;

/** The question about a note's Current state the person edited, word for word: `name` is the note's display name. */
export const STATE_ASK = (name: string): string => `You changed the current state of ${name}. Should Bower write its update there?`;
/**
 * The one re-ask of that question (TL-P4-19 addendum 12, the designer's words): the note changed after Bower showed its
 * update (the section, or anything else in the note: its stamp and checksum say so), so nothing was written.
 */
export const STATE_ASK_AGAIN = (name: string): string => `The current state of ${name} changed after Bower showed you its update, so nothing was written. Should Bower write its update there now?`;
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
  return all.filter((q) => !answered.has(q.id) && !(q.askedAt !== undefined && answered.has(askingKey({ id: q.id, askedAt: q.askedAt }))) && !subjectLeft(q, inbox, notes));
}

/**
 * What became of an answer that settled with no effect (TL-P4-19 addenda 10 and 12), the report's `answered` rows. Not
 * a thing set aside, and never counted as one. `subject-gone`: what the question was about had gone (left the inbox,
 * or a note in the Bin) before Bower's run, so nothing was done; `refused`: a "Write it" whose write was refused for
 * good; `nothing-to-write`: a "Write it" whose note already said what Bower would have written. A stored row is read
 * by `isAnsweredRow`, so rows written before these outcomes still read (strict on write, lenient on read).
 */
export const ANSWERED_OUTCOMES = ['subject-gone', 'refused', 'nothing-to-write'] as const;
export type AnsweredOutcome = (typeof ANSWERED_OUTCOMES)[number];
/** Which kind of question a row answers: a pair of notes, a thing or pile in the inbox, a note's Current state. */
export const ANSWERED_KINDS = ['pair', 'ask', 'state'] as const;
export type AnsweredKind = (typeof ANSWERED_KINDS)[number];
/**
 * One answered row: the question it answered, by id; its kind; what came of it; the sentence the person reads; and,
 * for a pair, the path of the note that stays, and for a "Write it" with no effect, its note: the row shows there too.
 */
export type AnsweredRow = { questionId: string; kind: AnsweredKind; outcome: AnsweredOutcome; why: string; note?: string };

/** A yes about a thing or pile whose thing had gone, by the thing's name when the question says it. */
export const ASK_GONE = 'Not done: what the question was about had moved or gone to the Bin.';
export const askGone = (thing: string | null): string => (thing === null ? ASK_GONE : `Not done: ${thing} had moved or gone to the Bin before Bower got to it.`);
/** A "Write it" whose note had gone, by the note's name when the question says it. */
export const STATE_GONE = 'Not written: the note had moved or gone to the Bin.';
export const stateGone = (note: string | null): string => (note === null ? STATE_GONE : `Not written: ${note} had moved or gone to the Bin before Bower got to it.`);
/** A "Write it" refused for good (not a clash, which asks again), by the note's name when it is known. */
export const stateRefused = (note: string | null): string => `Not written: Drive would not let Bower change ${note ?? 'the note'}. Your current state is as you left it.`;
/** What a "Write it" whose write was refused at the run's end says it does next: its answer stays (TL-P4-19 addendum 21). */
export const STATE_RETRY = 'Bower will try again in the next tidy-up.';
/**
 * The row of a "Write it" whose write Drive refused while the run worked, and not as a clash (which asks again): the
 * answer stays in your changes and the next tidy-up tries once more (TL-P4-19 addendum 21). The failure sentence by
 * its kind: Drive would not let Bower (`barred`), or Drive could not be reached (any other refusal).
 */
export function stateNotWritten(note: string | null, barred: boolean): string {
  const name = note ?? 'the note';
  const failed = barred ? `Not written: Drive would not let Bower change ${name}.` : `Not written: Bower couldn't reach Drive to change ${name}.`;
  return `${failed} ${STATE_RETRY}`;
}
/** A "Write it" with nothing to write: the note already said it. */
export const STATE_NOTHING = 'Nothing to write: the note already said it.';
export const stateNothing = (note: string | null): string => (note === null ? STATE_NOTHING : `Nothing to write: ${note} already said what Bower would have written.`);

/**
 * The answered row of a "Write it" that settled with no effect in the run that tried it (TL-P4-19 addendum 12): its
 * write refused for good, or nothing to write. `notePath` is the note's path now: the row names it and shows on it, as
 * a pair's row shows on the note that stays; with none, the row says "the note" and shows under the result only.
 */
export function answeredState(questionId: string, outcome: Exclude<AnsweredOutcome, 'subject-gone'>, notePath: string | null): AnsweredRow {
  const name = notePath === null ? null : displayName(nameOf(notePath));
  const why = outcome === 'refused' ? stateRefused(name) : stateNothing(name);
  return { questionId, kind: 'state', outcome, why, ...(notePath === null ? {} : { note: notePath }) };
}

/**
 * The answered row of an answer whose subject is gone, or null when its subject is there (or has no kind of its own):
 * the one writer of the row, for every kind (TL-P4-19 addenda 8 and 10). Names are display names: a thing's or a
 * note's from the path the question was asked about, never a file name or extension; a pair's other note by the
 * name an older question links it by, or a pair asked by ids by the name its file keeps in the Bin (`binnedName`, by
 * file id, from `binnedPairNote`; TL-P4-19 addendum 14). `at` gives the path now of the pair note that stays (a file
 * id, or an older question's name).
 */
export function answeredGone(q: Asked & Partial<Pick<Question, 'about'>>, inbox: InboxSeen | null, notes: NotesSeen | null, at: (note: string) => string | undefined, binnedName: (id: string) => string | undefined = () => undefined): AnsweredRow | null {
  if (!subjectLeft(q, inbox, notes)) return null;
  const s = subjectOf(q);
  const about = q.about === undefined ? null : nameOf(q.about);
  const row = { questionId: q.id, outcome: 'subject-gone' as const };
  if (s.kind === 'inbox') return { ...row, kind: 'ask', why: askGone(about === null ? null : thingName(about)) };
  if (s.kind === 'state') return { ...row, kind: 'state', why: stateGone(about === null ? null : displayName(about)) };
  if (s.kind !== 'pair') return null;
  const gone = notesGone(q, notes);
  const stays = gone.length === 1 ? s.notes.find((n) => !gone.includes(n)) : undefined;
  const note = stays === undefined ? undefined : at(stays);
  const one = gone.length === 1 ? gone[0] : undefined;
  const other = one === undefined ? undefined : s.by === 'name' ? one : binnedName(one);
  return { ...row, kind: 'pair', why: keepAlreadyBinned(other ?? null), ...(note !== undefined ? { note } : {}) };
}

/**
 * The file id of a pair's one note gone from the listing, for a pair asked by ids: the one file its answered row reads
 * for a name (TL-P4-19 addendum 14). Null for any other question, or when no note or both notes are gone.
 */
export function binnedPairNote(q: Asked, notes: NotesSeen | null): string | null {
  const s = subjectOf(q);
  if (s.kind !== 'pair' || s.by !== 'id') return null;
  const gone = notesGone(q, notes);
  return gone.length === 1 ? (gone[0] ?? null) : null;
}

/** An answered row as the wire holds it, the one validator of it (manifest, checkpoint and the run's view). */
export function isAnsweredRow(row: unknown): row is AnsweredRow {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return false;
  const r = row as Record<string, unknown>;
  const text = (v: unknown): boolean => typeof v === 'string' && v.length > 0;
  return Object.keys(r).every((k) => ['questionId', 'kind', 'outcome', 'why', 'note'].includes(k))
    && text(r.questionId) && ANSWERED_KINDS.some((k) => k === r.kind) && ANSWERED_OUTCOMES.some((o) => o === r.outcome)
    && text(r.why) && (r.note === undefined || text(r.note));
}

/** A question as a run's report row has it: what the person reads, never its subject, hash, mark or shown update. */
export type ReportQuestion = Pick<Question, 'id' | 'text' | 'yes' | 'no' | 'askedAt' | 'about'>;

/** Its fields in the order the question has them, so a report reads as before. */
export function reportRowOf(q: Question): ReportQuestion {
  const { id, text, yes, no, askedAt, about } = q;
  return { id, text, yes, no, askedAt, ...(about === undefined ? {} : { about }) };
}
