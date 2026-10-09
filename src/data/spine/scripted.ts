/**
 * The planner (TL-P3-22 addendum, TL-P4-14 stage 3), run over a read port (`ScriptedRead` in `read.ts`), so the fake
 * runner and the GitHub Actions runner plan the same way. It reads one reply's decisions (`Decisions`): the model's
 * (`modelDecisions`) or the scripted provider's (`demo/script.ts`, the only side that reads the demo fixture), and
 * the same folder, admitted set and decisions give the same plan, create keys included (`runKeys`).
 *
 * What a tidy-up plans for the Bower folder. It plans one fixed contract B manifest from what it reads: the
 * ready piles in the inbox, their things filed where the reply decided, the rules you typed,
 * your requests, answered questions and the journal. The run service
 * (`fake-run-service.ts`) or the runner applies it, recoverably, through the one engine (`engine.ts`). Given the admitted set
 * a run took (`taken`), it plans only those piles, those things and those journal lines.
 */
import type { DriveFile } from '../drive/drive-api';
import { ADOPT_STATES_ID, ADOPT_STATES_QUESTION, ADOPT_STATES_RULE, STATE_UPDATED, applyChanges, KEEP_CHANGED, keptLine, currentStateOf, renameOk, renamesFor, ruleAddOk, ruleRemoveOk, savedLinkKey, stateMark, stateMarkOf, stateNewsLine, timelineDate } from '../contracts/note-edit';
import { canonicalRecordJson } from '../contracts/record-json';
import { parseRunManifestV2, recordableId, recordableRecordId, type Capture as ManifestCapture, type CapturedMember, type CapturedPile, type Change, type EditEntry, type EffectV2, type Manifest, type ManifestRunReport, type ManifestV2, type Operation, type OperationV2, type Rename, type ReportContribution, type RuleAdd, type RuleRemove, type Target, type VerifiedContent } from '../contracts/run-manifest';
import { PILE_NOTE, safeInboxName } from '../piles';
import { recordablePile, sameText, type Digest } from '../pile-readiness';
import { displayName, freeName, join, kindOf, nameOf, parentOf, thingName } from '../tree';
import { BowerError, PARA_ROOTS, type Pile, type PileItem, type Question, type Request } from '../types';
import { isJournalRecord, type JournalRecord } from '../contracts/journal-record';
import { PROP, RUNNER_WRITES, SYSTEM, isRunnerFile, type HashesFile, type QuestionsFile, type RequestsFile } from '../vault/layout';
import { ruleLike } from '../rules';
import { savedLinkAddress } from '../search-text';
import { EMPTY_MD5, md5Hex } from '../contracts/hashes';
import { answeredGone, askId, binnedPairNote, openQuestions, pairQuestionId, reportRowOf, stateQuestionId, subjectKey, subjectLeft, subjectOf, type InboxSeen, type NotesSeen } from '../contracts/questions';
import { sha256 } from '../vault/hashes';
import { parseNote, serializeNote, timelineBullets, type ParsedNote } from '../vault/note-format';
import { parseTimelineLine } from '../contracts/timeline-line';
import { parseRules, serializeRules } from '../vault/rules-format';
import { VaultIndex } from '../vault/vault-index';
import { grounded, groundedKeys, seen } from './grounded';
import { canonical } from './records';
import { NOT_FILED } from './report';
import { SET_ASIDE, capturePiles, listedPiles, pileShape } from './plan';
import { duplicatesOf, wordsSaved, type Duplicate } from './duplicates';
import type { AdmissionManifest } from './admission';
import type { ScriptedRead } from './read';
import { stampOf } from './write-once';

export { SET_ASIDE, listedPiles };

/** A B run that failed, or a plan refused before admission: the honest-phase rule guarantees no effect applied. */
export const B_FAILURE = 'The tidy-up stopped before changing anything. Try again.';

/** A runner file's JSON, or null when it is not JSON. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    // A parser's message quotes the text: say only that it is not JSON.
    console.error('A runner file is not valid JSON');
    return null;
  }
}

/** A file's stored size and hash, as the read port gives them; null when they cannot be read. */
async function storedDigest(read: ScriptedRead, f: DriveFile): Promise<Digest | null> {
  try {
    return await read.digest(f);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * A run's plan, fixed before any effect: always the B path with its manifest (TL-P2-38). What it cannot take it holds,
 * and what Bower's own checks refuse is refused before admission; there is no other path.
 */
export type RunPlan = {
  path: 'b';
  manifest: Manifest | ManifestV2;
  /** Each of your changes the run takes, by record id, with the operations its archive waits for (`Need`). */
  needs: ReadonlyMap<string, readonly string[]>;
};

export interface PlanOptions {
  scope: 'all' | 'instructions';
  allowWeb: boolean;
  runId: string;
  requestId: string;
  requestedAt: number;
  /** Mints a create key (random by default; `runKeys` for a provider, so its plan is deterministic). */
  mintKey?: (kind: string) => string;
  /** The admitted set the run took: only its piles, their things and its journal lines are planned. */
  taken?: AdmissionManifest;
  /**
   * What the reply decided (the model's intent, or the scripted provider's): only places, names, words and questions.
   * Everything else, and every id, hash and digest, the plan makes as it always does. The planner reads only this.
   */
  decisions: Decisions;
}

/** A place in the folder (a path under a main folder) and a name, as a model proposes them. */
export interface Placement {
  to: string;
  name: string;
}

/** A note a model wrote for a thing it files (P4-3): beside the thing, its name, summary and body. */
export interface AuthoredNote {
  name: string;
  summary: string;
  body: string;
}

/** A Timeline line a model wrote for a note it was shown (P4-3), citing a thing this run files, or none. */
export interface AuthoredLine {
  path: string;
  text: string;
  cites: string | null;
}

/**
 * A note's Current state as a model would write it now (C05, TL-P4-08 addendum 1 point 1), for a note it was shown,
 * citing a thing this run files, or none. Bower rewrites only a Current state it still owns; one the person edited
 * gets these lines as a Timeline line and a question instead.
 */
export interface AuthoredState {
  path: string;
  lines: string[];
  cites: string | null;
}

/**
 * A model's intent, by what it was admitted to take: a thing by its file id, a pile of words by its pile id; and
 * (P4-3) a thing's own note and Timeline lines. The plan authors every note's front matter and Bower's sections, and
 * `applyChanges` alone adds a line, on Bower's notes only.
 */
export interface Filing {
  thing(fileId: string): Placement | null;
  words(pileId: string): Placement | null;
  note?(fileId: string): AuthoredNote | null;
  lines?: readonly AuthoredLine[];
  /** Current states to bring up to date (C05), at most one per note. */
  states?: readonly AuthoredState[];
  /** A new Area's path and the ongoing responsibility it is for; the report says it beside the made folder. */
  areas?: ReadonlyMap<string, string>;
  /** Piles it could not place without guessing, by pile id, each with its question: they stay in the inbox (TL-P4-08). */
  asks?: ReadonlyMap<string, Ask>;
  /**
   * Things it could not place without guessing, by file id, each with its question (TL-P4-08 addendum 4): each stays in
   * the inbox untouched, its pile's words with it, and the rest of its pile is filed.
   */
  thingAsks?: ReadonlyMap<string, Ask>;
  /** Notes the person said yes to keeping as one (C05, `keep-one-note-merge`), each with the answer that says so. */
  keep?: readonly KeepOne[];
  /** Two notes it was shown that may be one thing, each pair with its question: a yes keeps one (c3-pair-ask). */
  pairAsks?: readonly PairAsk[];
}

/**
 * Two notes kept as one (C05, TL-P4-08 addendum 7): the model names the note kept and the other, and the spine
 * checked the person's yes (`answer`, a journal record id). The other note's facts and Timeline lines go to the kept
 * note's Timeline (a person's words there untouched), links to it follow the kept note, and it goes to the Bin.
 */
export interface KeepOne {
  kept: string;
  other: string;
  answer: string;
}

/**
 * A question about a pile whose place is genuinely unclear (TL-P4-08 point 1, C11): the pile stays in the inbox
 * untouched, the question goes to the person, and the rest of the run goes on. A run never waits and never guesses.
 */
export interface Ask {
  text: string;
  yes: string;
  no: string;
}

/**
 * A question whether two notes are one thing (c3-pair-ask, TL-P4-16 addendum): the notes by their paths as the reply
 * named them; the plan asks it by their file ids (`pairQuestionId`), so the answer follows them wherever they go.
 */
export interface PairAsk extends Ask {
  notes: readonly [string, string];
}

/** What a thing is, as the plan captured it: all a decision about it may read. */
export interface ThingSeen {
  fileId: string;
  /** The name it was added under. */
  name: string;
  fileName: string;
  kind: PileItem['kind'];
  /** Its pile's words. */
  words: string;
  /** A saved link's text, when it is one and was read. */
  linkText: string | null;
}

/** How a reply answers one of your requests: from your notes, a comparison note, or a web lookup (C08-C10). */
export type RequestPlan =
  | { kind: 'answer'; uses: readonly string[]; answer: string }
  | { kind: 'compare'; uses: readonly string[]; note: { to: string; title: string; what: string }; answer: string }
  | { kind: 'lookup'; uses: readonly [string]; found: { text: string; url: string }; answer: string; offline: string };

/** A Timeline line a reply wants on a note, citing a thing by the name it was added under, with the name it cites. */
export interface HubLine {
  path: string;
  what: string;
  cites?: string;
  source?: string;
  /** Written only when the thing it cites is filed by this run. */
  onlyCited?: true;
}

/** What a stored note's property says, as a note you added might disagree with it (C07). */
export interface Disagreement {
  note: string;
  property: string;
  question(words: string, added: string, stored: { name: string; value: string | undefined }, at: number): Question | null;
}

/**
 * A reply's decisions, the one thing the planner reads of a provider (TL-P4-14 stage 3): the model's intent
 * (`modelDecisions`), or the scripted provider's, which also answers what no model reply does yet (the optional part).
 * A part a reply leaves out is not done: requests and answers it does not settle wait for a run that can act on them.
 */
export interface Decisions {
  thing(t: ThingSeen): Placement | null;
  words(pileId: string, words: string): Placement | null;
  pileAsk(pile: Pile): Ask | null;
  thingAsk(fileId: string): Ask | null;
  note(fileId: string): AuthoredNote | null;
  lines: readonly AuthoredLine[];
  states: readonly AuthoredState[];
  areas: ReadonlyMap<string, string>;
  keep: readonly KeepOne[];
  /** Questions about two notes that may be one thing; none when left out. */
  pairAsks?: readonly PairAsk[];
  /** Whether it acts on the answer to this question; without it, only answers the plan settles on its own are taken. */
  settles?(questionId: string): boolean;
  /** A thing joining a note, by the question whose yes asks for it. */
  merge?(item: PileItem, yes: (questionId: string) => boolean): { question: string; into: string; title: string; line: string } | null;
  /** The path of a note of its own a filed thing gets. */
  ownNote?(itemName: string): string | null;
  hubLines?: readonly HubLine[];
  /** A question asked once this pile is filed. */
  askAfter?(pile: Pile, at: number): Question | null;
  /** How it answers a request; without it, requests wait. */
  request?(text: string): RequestPlan | null;
  /** The Timeline line an answer adds to a stored note (C07). */
  said?: { about(questionId: string): boolean; line(q: Question, yes: boolean): { note: string; line: string } | null };
  disagreements?(words: string): readonly Disagreement[];
  /** A rule you typed, worded; without it, your own words, tidied. */
  wordRule?(words: string): string;
}

/** The model's intent as decisions: what it placed, wrote and asked, nothing more. */
export function modelDecisions(filing: Filing): Decisions {
  return {
    thing: (t) => filing.thing(t.fileId),
    words: (pileId) => filing.words(pileId),
    pileAsk: (pile) => filing.asks?.get(pile.id) ?? null,
    thingAsk: (fileId) => filing.thingAsks?.get(fileId) ?? null,
    note: (fileId) => filing.note?.(fileId) ?? null,
    lines: filing.lines ?? [],
    states: filing.states ?? [],
    areas: filing.areas ?? new Map(),
    keep: filing.keep ?? [],
    pairAsks: filing.pairAsks ?? [],
  };
}

/** A rule in your own words, tidied: a capital first letter and a full stop, nothing else changed. */
export function tidiedRule(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`;
}

const emptyReport = (): ManifestRunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });


/**
 * Plans a run on the B path: every effect it needs is a B effect (move, create-folder, a generated note's create-text
 * (TL-P2-17), Bin, write-runner-json, and B.2's edit-text). A pile it cannot take as it read it (a race while it
 * plans, a name or an id no record can carry, bytes it cannot check) is held with "Bower couldn't tidy this up yet.
 * Try again." and the rest of the run goes on (TL-P2-38); a plan the manifest guard or grounding refuses is refused
 * before admission and any effect. A runner file that cannot be read refuses the run before admission (TL-P2-17); a missing one is
 * made with create-text, and your rules are worded in Rules.md by one `rules-wording` edit, or a `create-text` when
 * it is missing. Decided from one capture before any effect, and never
 * changed during the run. The B plan fixes every operation and every report
 * row (TL-P2-06 §1, contract B guards 7 and 9) and reuses the readiness
 * capture: only ready piles are captured, and their folders go to the Bin
 * only with no child the run did not capture. A loose pile (one file in the
 * inbox) is captured with no folder: its file is moved and nothing is Binned. A pile held for readiness is
 * left out, untouched and unreported (TL-P2-21). A pile is captured with its
 * members and its one bound context note (by member key when declared,
 * otherwise the first pile note); any other child (a late thing, a pile
 * note not bound to it, a file a declared pile does not list) is uncaptured,
 * stays for the next run, and keeps the folder out of the Bin: the Bin is
 * rejected at the boundary and the pile retained (guard 7). Once every member
 * of a declared pile is accounted for (a consumed disposition, or arrived and
 * left), what is left in its folder is an ordinary observed pile with no keys
 * and no new disposition (TL-P2-29); when only some are, the members still in
 * its folder are its declared members for this run. Your changes from the journal
 * are captured too (record id, digest, files) and archived by B moves into
 * `.bower/changes/archive`, after the runner-JSON writes derived from them.
 * A hub note a full run brings up to date gets its Timeline line as one
 * `edit-text` (TL-P2-20), authored only by `applyChanges` and dated from
 * `requestedAt`: only on Bower's notes (ownership/2, or `by: bower`), never
 * when the line is already there, and with the in-place "new" move after it.
 * A saved link filed as a note gets a generated note (create-text, keyed by the link file's id) before the
 * link file moves beside it; a note with that key already there is reused and checked again at the move.
 * The manifest is v2 only when it holds an edit; otherwise it stays v1.
 * A "yes" to keeping one note merges the thing into it: the note's Timeline line (an edit carrying the
 * answer's record id), then the thing's move after it; the questions.json write that drops the question
 * waits for both, and the answer's archive for all three (TL-P2-20 I4, R3-4, R4-1). A person's note is
 * never merged into: the thing is filed as usual. A merge line refused at plan time files the thing on its
 * own, with a row saying so; the answer then settles with that filing (TL-P2-35). The note is followed
 * through the renames and moves since the last tidy-up.
 * At most `editCap` edits are planned, in code-point path order (TL-P2-29 (1)); when the manifest guard
 * refuses the plan as too big, it is planned again with one edit fewer. The rest wait for the next run;
 * a pile whose merge line waits is planned again as `held`, left whole for the next run with its answer.
 */
export async function planScripted(drive: ScriptedRead, rootId: string, opts: PlanOptions, editCap = EDITS_PER_RUN, held: ReadonlySet<string> = new Set()): Promise<RunPlan> {
  const captured = await capture(drive, rootId, opts);
  let attempt: Attempt = { editCap, held };
  // Planned again, never recursively, while a step holds more back: each try holds a pile or a keep more, or one edit
  // fewer, so it ends. What is held changes what comes before it (a copy whose thing waits, a keep that cannot go
  // whole, a merge line past the cap, a manifest too big), so the reply is applied again; the folder is not read again.
  for (;;) {
    const decided = await decide(drive, captured, opts, attempt);
    const ended = decided.kind === 'decided' ? await build(decided) : decided;
    if (ended.kind === 'plan') return ended.plan;
    attempt = ended.attempt;
  }
}

/** What a plan is tried with: at most `editCap` edits, and what waits whole (a pile by its id, a keep as `keep:<answer>`). */
type Attempt = { editCap: number; held: ReadonlySet<string> };
/** How a step ends: the plan, or a try again with more held back, since what it found changes what comes before it. */
type Ended = { kind: 'plan'; plan: RunPlan } | { kind: 'again'; attempt: Attempt };

/**
 * Capture (TL-P4-14 stage 3 contract 1): what the folder holds, read once for every try, whatever the reply decides:
 * the listing, your changes the run took, the inbox and its piles' readiness, things already saved, and Bower's own
 * files. It never reads the reply.
 */
export async function capture(drive: ScriptedRead, rootId: string, opts: PlanOptions) {
  const all = opts.scope === 'all';
  const listing = await drive.listAll(rootId);
  const ix = VaultIndex.build(rootId, listing);
  const read = await journalOf(drive, ix);
  const lines = opts.taken ? tookLines(read, opts.taken) : read;
  // An instructions run takes no pile: it reads only your changes.
  const inbox = all ? await drive.piles(rootId) : [];
  // Bower's own files (TL-P2-17): a failed read refuses before admission and any effect; a malformed one is
  // replaced when the run writes it, its old entries never claimed; a missing one is made again.
  const sys = ix.file(SYSTEM.dir);
  const requests = ix.file(SYSTEM.requests);
  const hashesFile = ix.file(SYSTEM.hashes);
  const requestsValue = requests ? parsed(await ownText(drive, requests)) : null;
  const requestsBroken = !!requests && !isRunnerFile(SYSTEM.requests, requestsValue);
  const requestsDone = isRunnerFile(SYSTEM.requests, requestsValue) ? requestsValue.done : [];
  const hashesText = hashesFile ? await ownText(drive, hashesFile) : null;
  const hashesBroken = hashesText !== null && !isRunnerFile(SYSTEM.hashes, parsed(hashesText));
  // An inbox emptied after the Worker looked at it: the Worker's own refusal, before any effect. A run the Worker
  // admitted is past refusing: what it took and finds gone waits, and it ends with nothing filed (TL-P3-25 point 2).
  if (all && !inbox.length && !opts.taken) throw new BowerError('conflict', NOTHING_WAITING);
  const piles = opts.taken ? tookPiles(inbox, opts.taken) : inbox;
  // The capture the Worker's admission shares (TL-P3-21), with the one pile note each pile records read and checked.
  const readiness = await capturePiles(drive, rootId, piles.map(pileShape), { notes: true });
  // Things already saved (`duplicates.ts`, TL-P4-10 addendum 2), by their content.
  const dups = duplicatesOf(listing, ix, piles.flatMap((p) => p.items.map((i) => i.id)));
  return { rootId, all, listing, ix, lines, inbox, sys, requests, hashesFile, requestsBroken, requestsDone, hashesText, hashesBroken, piles, readiness, dups };
}
type Captured = Awaited<ReturnType<typeof capture>>;

/**
 * Decide: the reply's decisions (`Decisions`, the model's or the scripted provider's, the one type the planner reads)
 * applied to the capture, with what they name read: the piles taken or asked about, where each thing goes, the note
 * edits, the generated notes, the questions. It ends decided, or with a try again that holds more back.
 */
export async function decide(drive: ScriptedRead, snapshot: Captured, opts: PlanOptions, attempt: Attempt = { editCap: EDITS_PER_RUN, held: new Set() }) {
  const { rootId, all, listing, ix, lines, inbox, sys, requests, hashesFile, requestsBroken, requestsDone, hashesText, hashesBroken, piles, readiness, dups } = snapshot;
  const { editCap, held } = attempt;
  const newKey = opts.mintKey ?? mintKey;
  /**
   * What the reply decided. A part it leaves out is not done (P4-2 review I1): your requests and answers then wait for
   * a run that can act on them, never archived unanswered.
   */
  const d = opts.decisions;
  // Notes kept as one: each by its yes, among the lines this run took; one held back (`keep:<answer>`) waits with it.
  // A run with no day to date its lines (outside years 0000-9999) keeps nothing: the answer waits, never archived unmerged.
  const keepDay = timelineDate(opts.requestedAt) !== null;
  if (!keepDay && d.keep.length) console.error('A run with no date cannot keep one note; the answer waits for the next tidy-up');
  // A keep whose notes are not there, or cannot be named in links, waits with its answer: decided here, from the listing.
  const keeps = (keepDay ? d.keep : []).filter((k) => !held.has(`keep:${k.answer}`) && lines.some((l) => l.rec.id === k.answer && l.rec.kind === 'answer' && l.rec.text === 'yes')).flatMap((k) => {
    const kept = ix.file(k.kept);
    const other = ix.file(k.other);
    const rename = { from: displayName(nameOf(k.other)), to: displayName(nameOf(k.kept)) };
    const noteOk = (path: string): boolean => path.endsWith('.md') && MAIN_FOLDERS.includes(path.split('/')[0] ?? '');
    if (kept && !kept.folder && other && !other.folder && noteOk(k.kept) && noteOk(k.other) && renameOk(rename)) return [{ k, kept, other, rename }];
    console.error('A note to keep as one is not there or cannot be named in links; its answer waits for the next tidy-up');
    return [];
  });
  const keepAnswers = new Set(keeps.map((x) => x.k.answer));
  // Answers a model's run settles (TL-P4-08 addendum 8): a no (it closes its question), a yes to keeping summaries up
  // to date (your rule line carries it), and an answer about a thing or pile this run took (the model is shown it) or
  // that left the inbox (its question closes). A second answer to one question goes with the first: one answer. Any
  // other waits for a run that can act on it.
  const tookSubjects = new Set((opts.taken?.piles ?? []).flatMap((p) => [p.pileId, ...(p.anchor ? [p.anchor.fileId] : []), ...p.items.map((i) => i.fileId)]));
  // The folder's notes as listed (the Bin left out): a question about a note that is not there now is gone, whatever its
  // kind (`subjectLeft`, TL-P4-19 addendum 8), so its answer settles and its question closes.
  const notesSeen: NotesSeen = ix.notesSeen();
  const settlesAlone = (l: JournalLine): boolean => {
    const q = l.rec.questionId ?? '';
    // A Current state you edited: a no closes its question; a yes too, once its run wrote the update (the answer goes
    // with that edit) or asked again about a section changed since (`state-yes-writes`). A pair by its notes' ids
    // whose note is gone settles: nothing can be kept as one.
    return keepAnswers.has(l.rec.id) || l.rec.text === 'no' || q === ADOPT_STATES_ID || subjectOf({ id: q }).kind === 'state' || subjectLeft({ id: q }, null, notesSeen);
  };
  const inboxIds = new Set(inbox.flatMap((p) => [p.id, ...p.items.map((i) => i.id)]));
  const seenFirst: InboxSeen | null = all ? { ids: inboxIds, hashes: new Set(listing.flatMap((f) => (inboxIds.has(f.id) && f.md5Checksum ? [f.md5Checksum] : []))) } : null;
  // An answer about a thing or pile goes by its question's subject, as Bower's list holds it, never by its id (P4-15b);
  // so does an older pair question, by the names in its words. The list is read for it only when a model's run has
  // such an answer waiting, or when an answer's subject may be gone (its row names what it was about).
  const bySubject = !d.settles ? lines.filter((l) => l.rec.kind === 'answer' && !settlesAlone(l)) : [];
  const maybeGone = lines.some((l) => l.rec.kind === 'answer' && l.rec.text !== 'no' && subjectLeft({ id: l.rec.questionId ?? '' }, seenFirst, notesSeen));
  const listedFile = bySubject.length || maybeGone ? ix.file(SYSTEM.questions) : undefined;
  const listedValue = listedFile && !listedFile.folder ? parsed(await ownText(drive, listedFile)) : null;
  const listed = isRunnerFile(SYSTEM.questions, listedValue) ? listedValue.questions : [];
  const settles = (l: JournalLine): boolean => {
    if (settlesAlone(l)) return true;
    const q = listed.find((x) => x.id === l.rec.questionId);
    const key = q && subjectKey(q);
    return q !== undefined && ((key !== undefined && tookSubjects.has(key)) || subjectLeft(q, seenFirst, notesSeen));
  };
  const settled = new Set(lines.filter((l) => l.rec.kind === 'answer' && settles(l)).map((l) => l.rec.questionId ?? ''));
  /**
   * An answer whose subject was gone before this run, of any kind (TL-P4-19 addendum 10): nothing is done, and its
   * answered row says so, on its line's archive; one per question, its last answer's. A no did nothing to begin with.
   * The pair note that stays is found by its file id, or an older question's by the name it links.
   */
  const notePath = (note: string): string | undefined => ix.pathOf(note) ?? [...ix.entries().keys()].find((p) => p.endsWith('.md') && displayName(nameOf(p)).toLowerCase() === note.toLowerCase());
  const lastAnswer = new Map<string, JournalLine>();
  for (const l of lines) {
    if (l.rec.kind !== 'answer' || keepAnswers.has(l.rec.id)) continue;
    const had = lastAnswer.get(l.rec.questionId ?? '');
    if (!had || had.rec.at <= l.rec.at) lastAnswer.set(l.rec.questionId ?? '', l);
  }
  const yesAnswers = [...lastAnswer.values()].filter((l) => l.rec.text !== 'no').map((l) => ({ l, q: listed.find((x) => x.id === l.rec.questionId) ?? { id: l.rec.questionId ?? '' } }));
  // A pair asked by ids whose other note is gone is named by the name its file keeps in the Bin: one read of that file,
  // only for a row made here (TL-P4-19 addendum 14). A file that cannot be read (a 404 or any refusal) leaves the row
  // its fallback words.
  const binnedNames = new Map<string, string>();
  for (const id of new Set(yesAnswers.flatMap(({ q }) => binnedPairNote(q, notesSeen) ?? []))) {
    try {
      binnedNames.set(id, displayName((await drive.binned(id)).name));
    } catch (e) {
      console.error('The other note of a pair could not be read; its answered row says "the other note"', e);
    }
  }
  const answeredRows = new Map(yesAnswers.flatMap(({ l, q }) => {
    const row = answeredGone(q, seenFirst, notesSeen, notePath, (id) => binnedNames.get(id));
    return row ? [[l.rec.id, row] as const] : [];
  }));
  let journal = lines.filter((l) => (l.rec.kind === 'request' ? !!d.request : l.rec.kind === 'answer' ? (d.settles?.(l.rec.questionId ?? '') ?? settled.has(l.rec.questionId ?? '')) : true));
  // Your rules (TL-P2-20 rules-wording): one change for every rule line, worded below in one edit of Rules.md, or
  // Rules.md made when it is missing; a line whose words cannot be worded stays pending.
  const ruleWords = ruleChangesOf(journal, d.wordRule ?? tidiedRule);
  // A "yes" to keeping one note joins the thing it is about to that note (MERGES), by the answer's line.
  const yes = new Map(journal.filter((l) => l.rec.kind === 'answer' && l.rec.text === 'yes').map((l) => [l.rec.questionId ?? '', l.rec.id]));
  // Its note is followed through the renames and moves since the last tidy-up, as the resolver follows a link.
  const follow = (path: string): string => {
    let now = path;
    for (const l of journal.filter((x) => (x.rec.kind === 'rename' || x.rec.kind === 'move') && x.rec.from && x.rec.path)) {
      const from = l.rec.from ?? '';
      if (now === from) now = l.rec.path ?? now;
      else if (now.startsWith(`${from}/`)) now = (l.rec.path ?? '') + now.slice(from.length);
    }
    return now;
  };
  const mergeOf = (item: PileItem): Merge | null => {
    const m = d.merge?.(item, (q) => yes.has(q));
    return m && yes.has(m.question) ? { into: follow(m.into), title: m.title, line: m.line, answer: yes.get(m.question) ?? '' } : null;
  };
  /**
   * What each of your changes needs (rule 7, R3-4, R4-1), in one map by record id: it waits whole for the next run
   * (`held`), or until every Timeline line it needs is written; once taken, its archive waits for the edits that
   * name it and the operations derived from it (`edits`, `derived`).
   */
  const needs = new Map<string, Need>();
  const need = (id: string): Need => {
    const had = needs.get(id);
    if (had) return had;
    const made: Need = { held: false, lines: [], edits: [], derived: [] };
    needs.set(id, made);
    return made;
  };
  const derive = (id: string, ...ops: string[]): void => void need(id).derived.push(...ops);
  /** Where a pile of words goes and its note's name, as the reply decided. */
  const wordsPlace = (pileId: string, words: string): Placement => d.words(pileId, words) ?? { to: '', name: '' };

  const verified = async (f: DriveFile, encoding: 'utf8' | 'blob'): Promise<VerifiedContent | null> => {
    const d = await storedDigest(drive, f);
    return d ? { encoding, size: d.size, sha256: d.sha256, provenance: drive.provenance, observedModifiedTime: f.modifiedTime } : null;
  };
  /** A runner file's stored content as planned on; one that cannot be read refuses the run before admission. */
  const ownVerified = async (f: DriveFile): Promise<VerifiedContent> => {
    const v = await verified(f, 'utf8');
    if (!v) throw new BowerError('unknown', OWN_FILES);
    return v;
  };

  /**
   * Things already saved: each is captured with its pile and goes to the Bin, never filed and never shown to a model.
   * A copy of another thing of this run waits on that one's move; when that one is not filed by this run (asked about,
   * or its pile not taken), the copy stays where it is too.
   */
  const pileOfThing = new Map(piles.flatMap((p) => p.items.map((i) => [i.id, p] as const)));
  const filedHere = (id: string): boolean => {
    const p = pileOfThing.get(id);
    if (!p || readiness.get(p.id)?.blocked !== null || held.has(p.id)) return false;
    if (d.pileAsk(p)) return false;
    return !d.thingAsk(id);
  };
  const staying = new Set([...dups].flatMap(([id, d]) => (d.of === 'run' && !filedHere(d.keptId) ? [id] : [])));
  const saved: Array<{ pile: Pile; file: DriveFile; dup: Duplicate }> = [];

  // The ready piles and their things, exactly as captured.
  const capturedPiles: CapturedPile[] = [];
  const members: CapturedMember[] = [];
  const things: Array<{ pile: Pile; folder: DriveFile; item: PileItem; file: DriveFile; content: VerifiedContent; words: string; merge: Merge | null }> = [];
  /** Captured piles the run asks a question about once they are filed (TL-P2-37 Q1 (a)). */
  const asking = new Map<string, Question>();
  /** Questions about piles that stay in the inbox untouched, since their place is unclear (TL-P4-08 point 1). */
  const askedPiles: Question[] = [];
  const fromWords: Array<{ pileId: string; folder: DriveFile; words: string; context: DriveFile | null }> = [];
  /**
   * Piles of words only whose news a Timeline line on a note carries instead of a note of their own (c3-pair-ask, the
   * value gate for words): each goes to the Bin only once every line citing it is written, and waits whole otherwise.
   */
  const citedWords = new Map<string, { folder: DriveFile; context: DriveFile | null; lines: WantedLine[]; notes: Set<string> }>();
  const citedByLine = (pileId: string): boolean => all && keepDay && d.lines.some((l) => l.cites === pileId);
  /** Piles with things asked about (TL-P4-08 addendum 4): the rest is filed, the folder and its words stay. */
  const partly = new Set<string>();
  for (const pile of piles) {
    const marks = { members: members.length, things: things.length, saved: saved.length };
    /**
     * A pile this plan cannot take as it read it is held (TL-P2-38): nothing of it is captured or written, and the
     * rest of the run goes on. A race clears on the next run; what the Inbox can see, it shows (`untidied`).
     */
    const hold = (why: string): void => {
      members.length = marks.members;
      things.length = marks.things;
      saved.length = marks.saved;
      console.error(new BowerError('unknown', SET_ASIDE.notTidied), `A pile waits for the next tidy-up: ${why}`);
    };
    const folder = pile.path ? ix.file(pile.path) : undefined;
    // Not in this listing (a loose thing not arrived, or one still on its way): nothing to capture (TL-P2-21).
    if (!folder) continue;
    // A loose pile (TL-P2-16 item 5) has no folder: its one file is its only child, and nothing goes to the Bin.
    const loose = !folder.folder;
    const cap = readiness.get(pile.id);
    if (!cap) {
      hold('it changed while the run read the inbox');
      continue;
    }
    // A pile that is not ready is held (TL-P2-21): not captured, no effect, no report row; its reason shows in the Inbox.
    if (cap.blocked !== null) continue;
    // A pile the reply asks about: asked, never captured (TL-P4-08 point 1).
    const ask = d.pileAsk(pile);
    // A pile whose merge line waits past the edit cap waits whole, with its answer (planned again without it).
    if (held.has(pile.id) && !ask) {
      for (const item of pile.items) {
        const m = mergeOf(item);
        if (m) need(m.answer).held = true;
      }
      continue;
    }
    // A pile id no run record can carry is held (TL-P2-38); the Inbox holds it already, this keeps it so.
    if (!recordableId(pile.id)) {
      hold('its id cannot be recorded');
      continue;
    }
    if (ask) {
      askedPiles.push({ id: askId(pile.id), text: ask.text, yes: ask.yes, no: ask.no, subject: pile.id, askedAt: opts.requestedAt });
      continue;
    }
    // Things the model asks about: each stays where it is, named by its question; the rest of the pile goes on.
    const thingAsk = (fileId: string): Ask | undefined => (loose ? undefined : d.thingAsk(fileId) ?? undefined);
    for (const item of pile.items) {
      const q = thingAsk(item.id);
      const hash = listing.find((f) => f.id === item.id)?.md5Checksum;
      if (q) askedPiles.push({ id: askId(item.id), text: q.text, yes: q.yes, no: q.no, about: join(pile.path ?? '', item.name), subject: item.id, ...(hash ? { hash } : {}), askedAt: opts.requestedAt });
    }
    // What stays where it is: what is asked about, and a copy of a thing this run does not file.
    const stays = (fileId: string): boolean => !!thingAsk(fileId) || staying.has(fileId);
    // A pile whose only things are already saved keeps its folder and its words where they are (review P4-17 I3): the
    // copies go to the Bin, and the next tidy-up reads the words on their own, as any pile of words.
    const onlySaved = !loose && !!pile.text.trim() && pile.items.some((i) => dups.has(i.id) && !staying.has(i.id))
      && pile.items.every((i) => i.name === PILE_NOTE || stays(i.id) || dups.has(i.id));
    const partial = pile.items.some((item) => stays(item.id)) || onlySaved;
    const children = loose ? [folder] : listing.filter((f) => f.parents[0] === folder.id);
    const notes = loose ? [] : children.filter((f) => !f.folder && f.name === PILE_NOTE);
    const declared = cap.declared;
    // The one context note bound to the pile (TL-P2-21): by its member key when declared, otherwise the first.
    // What is left of a declared pile takes its bound note when it is there, otherwise the first (TL-P2-29).
    // Any other child (a second pile note, a folder) is uncaptured: guard 7 then keeps the folder out of the Bin.
    const contextKey = declared?.contextKey ?? cap.leftover?.contextKey ?? null;
    const bound = contextKey === null ? undefined : children.find((f) => !f.folder && f.appProperties?.[PROP.item] === contextKey);
    // A declared pile whose context was removed (TL-P2-08 b) has none: any pile note in it is unbound.
    const note = declared ? bound : (bound ?? notes[0]);
    // A pile partly asked about keeps its note where it is, with what is asked about: it is read for its words only.
    const kept = partial ? undefined : note;
    // The bound note is read once, before anything of the pile is captured: one Drive cannot give back now holds
    // only this pile (TL-P2-08 (a)), never the run; a sign-out still stops it.
    let noteText = '';
    if (note) {
      try {
        noteText = await drive.readText(note.id);
      } catch (e) {
        if (!(e instanceof BowerError) || e.code === 'auth') throw e;
        console.error(e);
        continue;
      }
    }
    // Where its things go is guessed from the bound note's words only, never from an unbound note listed first.
    const words = !note ? '' : note.id === notes[0]?.id ? pile.text : parseNote(join(pile.path ?? '', PILE_NOTE), noteText).body.trim();
    const keys: Array<string | null> = [];
    const taken: string[] = [];
    let askedKeys = 0;
    let lost: string | null = null;
    for (const item of pile.items) {
      const file = children.find((f) => f.id === item.id);
      if (stays(item.id)) {
        const key = declared ? file?.appProperties?.[PROP.item] : undefined;
        if (key !== undefined && declared?.memberKeys.has(key)) askedKeys += 1;
        continue;
      }
      if (file && !file.folder && file.name === PILE_NOTE && file.id !== note?.id) continue;
      if (!file || file.folder) {
        lost = 'one of its things changed while the run read it';
        break;
      }
      const key = declared ? (file.appProperties?.[PROP.item] ?? null) : null;
      // A file in a declared pile that is not one of its members stays there for the next run.
      if (declared && (key === null || !declared.memberKeys.has(key))) continue;
      const content = await verified(file, 'blob');
      if (!content) {
        lost = 'the bytes of one of its things could not be checked';
        break;
      }
      keys.push(key);
      taken.push(file.id);
      members.push({ pileId: pile.id, memberKey: key, file: seen(file), content });
      const dup = dups.get(file.id);
      if (dup) saved.push({ pile, file, dup });
      else things.push({ pile, folder, item, file, content, words, merge: mergeOf(item) });
    }
    // Every thing of it asked about: nothing of it is taken, as for a pile asked about whole.
    if (partial && !taken.length && !lost) {
      members.length = marks.members;
      things.length = marks.things;
      saved.length = marks.saved;
      continue;
    }
    // A pile of words only, or of pile notes only (TL-P2-32), becomes a generated note from its context (TL-P2-17),
    // under a main folder; its other pile notes stay as uncaptured children. A pile with no words either has nothing
    // to write, so it is left as it is, untouched, like a held pile.
    const wordsOnly = !partial && (!pile.items.length || (!taken.length && !declared));
    const asLine = wordsOnly && citedByLine(pile.id);
    if (wordsOnly && (!words.trim() || (!asLine && !generatedPlace(wordsPlace(pile.id, words).to)))) continue;
    // Every member still in the folder is taken; those accounted for were filed already and are not captured again.
    if (!lost && ((!taken.length && !wordsOnly) || (declared && keys.length + askedKeys !== declared.memberKeys.size))) lost = 'one of its members is not among its things';
    // Its names must be ones a run record can carry, as the Inbox checks them (`recordablePile`).
    if (!lost && !recordablePile(pile.id, [folder.name, ...members.slice(marks.members).map((m) => m.file.name), ...(kept ? [kept.name] : [])])) lost = 'a name cannot be recorded';
    if (lost) {
      hold(lost);
      continue;
    }
    let context: CapturedPile['context'] = { kind: 'absent' };
    if (kept) {
      const text = noteText;
      const stored = await verified(kept, 'utf8');
      // The note is recorded as it was read: its text must be the very bytes stored (`sameText`, as in the Inbox).
      if (!stored || !(await sameText(text, stored))) {
        hold('its note is not the text the run read');
        continue;
      }
      // An observed pile invents no keys (guard 6): its context carries none.
      context = { kind: 'text', memberKey: declared ? contextKey : null, file: seen(kept), text, content: stored };
    }
    // Everything this pile puts in the plan must be text a record can carry; a pile whose words or names cannot
    // (half of a character) is held alone, untouched, and the rest of the run goes on (review b-dest-review-1).
    const written = { folder: folder.name, words, context: context.kind === 'text' ? context.text : null, names: members.slice(marks.members).map((m) => m.file.name), note: wordsOnly && !asLine ? wordsPlace(pile.id, words).name : null };
    if (!canonicalRecordJson(written).ok) {
      members.length = marks.members;
      things.length = marks.things;
      saved.length = marks.saved;
      console.error(new BowerError('unknown', NOT_WRITABLE), 'A pile has text no run record can carry; it waits for the next tidy-up');
      continue;
    }
    capturedPiles.push({
      pileId: pile.id,
      source: declared ? { kind: 'declared', ref: declared.ref } : { kind: 'observed' },
      anchor: loose ? null : seen(folder),
      memberKeys: keys,
      childFileIds: [...taken, ...(kept ? [kept.id] : [])].sort(),
      context,
    });
    if (partial) partly.add(pile.id);
    if (asLine) citedWords.set(pile.id, { folder, context: !declared && note ? note : null, lines: [], notes: new Set() });
    else if (wordsOnly) fromWords.push({ pileId: pile.id, folder, words, context: !declared && note ? note : null });
    // The question the reply asks about this pile, asked once it is filed.
    const after = d.askAfter?.(pile, opts.requestedAt);
    if (after) asking.set(pile.id, after);
  }

  // Two notes that may be one thing (c3-pair-ask): asked by their file ids, never by their names, so the answer follows
  // them; a pair whose note is not there now, or that this run keeps as one already, is not asked.
  for (const p of d.pairAsks ?? []) {
    const [a, b] = p.notes.map((path) => ix.file(path));
    if (!a || !b || a.folder || b.folder || a.id === b.id) continue;
    if (keeps.some((x) => [x.kept.id, x.other.id].includes(a.id) && [x.kept.id, x.other.id].includes(b.id))) continue;
    askedPiles.push({ id: pairQuestionId(a.id, b.id), text: p.text, yes: p.yes, no: p.no, about: p.notes[0], askedAt: opts.requestedAt });
  }

  // A copy waits on the move of the thing it copies: one whose pile was held after all waits whole with it.
  const filedIds = new Set(things.map((t) => t.file.id));
  const orphans = saved.filter((s) => s.dup.of === 'run' && !filedIds.has(s.dup.keptId));
  if (orphans.length) return tryAgain({ editCap, held: new Set([...held, ...orphans.map((s) => s.pile.id)]) });

  // An open question belongs to its subject, never to its words (TL-P4-11 addendum): a later ask about the same thing
  // (its fileId or pileId, or the same content uploaded again) adds nothing, and a thing that left the inbox closes it.
  // A thing already saved leaves it for the Bin now, and a pile of nothing else with it.
  const binning = new Set(saved.map((s) => s.file.id));
  const inInbox = new Set(inbox.flatMap((p) => {
    const left = p.items.filter((i) => !binning.has(i.id)).map((i) => i.id);
    return p.items.length && !left.length && !partly.has(p.id) ? [] : [p.id, ...left];
  }));
  const hashesIn = new Set(listing.flatMap((f) => (inInbox.has(f.id) && f.md5Checksum ? [f.md5Checksum] : [])));
  // Only a run that saw the whole inbox can say a thing is gone: an instructions run reads none (TL-P4-11 I2).
  const seenNow: InboxSeen | null = all ? { ids: inInbox, hashes: hashesIn } : null;
  const gone = (q: Question): boolean => subjectLeft(q, seenNow, notesSeen);
  /** A pile and a thing in it are one subject (a pile ask then a thing ask about its photo adds nothing). */
  const pileOf = new Map(inbox.flatMap((p) => p.items.map((i) => [i.id, p.id] as const)));
  const related = (x: string | undefined, y: string | undefined): boolean => x !== undefined && y !== undefined && (x === y || pileOf.get(x) === y || pileOf.get(y) === x);
  /** Equal content is the same subject only for the same thing uploaded again: not the empty file, and not while both are in the inbox. */
  const sameContent = (a: Question, b: Pick<Question, 'hash'>): boolean => !!a.hash && a.hash === b.hash && a.hash !== EMPTY_MD5 && !inInbox.has(subjectKey(a) ?? '');
  const sameThing = (a: Question, b: Question): boolean => a.id === b.id || related(subjectKey(a), subjectKey(b)) || sameContent(a, b) || sameContent(b, a);
  /** A list too small to hold a question (`{"v":1,"questions":[]}` is 24 bytes, one question over 100) is not read. */
  const mayHold = (f: DriveFile): boolean => f.size === undefined || f.size > 40;
  /** Whether a question of the list now open has lost its thing (read only when a run has nothing else to do). */
  const closable = async (): Promise<boolean> => {
    const f = ix.file(SYSTEM.questions);
    if (!f || !mayHold(f)) return false;
    const value = parsed(await ownText(drive, f));
    return isRunnerFile(SYSTEM.questions, value) && value.questions.some(gone);
  };
  // Only held piles and nothing else to read: nothing is admitted (TL-P2-21), the existing refusal. A run already
  // admitted (a pile changed between admission and the run) plans nothing instead: it ends done, with nothing filed,
  // its report saying nothing was ready yet, and every item it took waiting (TL-P3-25 point 2). It is no failure.
  // A thing that left the inbox closes its question, which is something to do.
  if (all && !capturedPiles.length && !journal.length && !askedPiles.length && !(await closable())) {
    if (opts.taken) return { kind: 'plan' as const, plan: await nothingReadyPlan(rootId, opts) };
    throw new BowerError('conflict', NOTHING_READY);
  }

  // Where each thing goes and under which name, against the folder as it will be.
  const planned = new Map(ix.entries());
  const places = new Map<string, DriveFile>();
  const missing: string[] = [];
  // A destination's nearest existing folder is a captured place; every folder missing below it is made by the run.
  const destination = (to: string): void => {
    let at = to;
    while (at && !ix.file(at)?.folder) at = parentOf(at);
    if (at) {
      const place = ix.file(at);
      if (place) places.set(place.id, place);
    }
    for (let p = to; p !== at; p = parentOf(p)) if (!missing.includes(p)) missing.push(p);
    for (let p = to; p !== at; p = parentOf(p)) planned.set(p, { path: p, type: 'folder', modified: 0, created: 0 });
  };
  const plannedFile = (path: string): void => {
    planned.set(path, { path, type: 'file', kind: kindOf(path), modified: 0, created: 0 });
  };
  const date = timelineDate(opts.requestedAt);
  // Note edits (TL-P2-20), one edit-text per note at most, planned on the bytes read now; applyChanges is the only
  // author. A hub note a full run brings up to date gets its Timeline line, and so does a note a thing is merged
  // into, only on Bower's notes and never twice (from any day). After a rename or a move, every note linking to a
  // former name gets its links rewritten.
  const wanted = new Map<string, Wanted>();
  const want = (f: DriveFile, path: string): Wanted => {
    const had = wanted.get(f.id);
    if (had) return had;
    const made: Wanted = { file: f, path, lines: [], renames: null, rules: null, state: null };
    wanted.set(f.id, made);
    return made;
  };
  // A hub line cites the thing this run files for it (C06): the note or file its plan makes of it, never a merge's.
  // The line waits for that thing's move, so it never cites what is not there.
  const citeOf = (u: HubLine): { source: string; fileId: string } | null => {
    const thing = u.cites === undefined ? undefined : things.find((t) => t.item.name === u.cites && !t.merge);
    return thing && u.source !== undefined ? { source: u.source, fileId: thing.file.id } : null;
  };
  for (const u of all && date ? (d.hubLines ?? []) : []) {
    const f = ix.file(u.path);
    if (!f || f.folder) continue;
    const cite = citeOf(u);
    if (u.onlyCited && !cite) continue;
    const made = want(f, u.path);
    made.lines.push({ entry: { date: date ?? '', text: u.what, source: cite?.source ?? null }, record: null, what: u.what, after: cite?.fileId ?? null });
  }
  // A model's Timeline lines (P4-3): each cites the note its thing gets, or the thing as filed, and waits for its move.
  // The cite is the name asked for until the filing below fixes the name each one gets; then it is that name.
  const modelLines: Array<{ line: WantedLine; cites: string }> = [];
  /** A captured thing as a decision about it reads it (its link text is read only where it is filed). */
  const seenOf = (t: (typeof things)[number], linkText: string | null = null): ThingSeen => ({ fileId: t.file.id, name: t.item.name, fileName: t.file.name, kind: t.item.kind, words: t.words, linkText });
  const pileIds = new Set(piles.map((p) => p.id));
  for (const l of all && date ? d.lines : []) {
    const f = ix.file(l.path);
    if (!f || f.folder) continue;
    const thing = l.cites === null ? undefined : things.find((t) => t.file.id === l.cites && !t.merge);
    // A line citing a pile of words only is written only with that pile taken, and the pile waits for it.
    const words = l.cites === null || thing ? undefined : citedWords.get(l.cites);
    if (l.cites !== null && !thing && !words && pileIds.has(l.cites)) continue;
    const asked = thing ? (d.note(thing.file.id)?.name ?? d.thing(seenOf(thing))?.name) : undefined;
    const line: WantedLine = { entry: { date: date ?? '', text: l.text, source: asked === undefined ? null : citeName(asked) }, record: null, what: l.text, after: asked === undefined ? null : (thing?.file.id ?? null) };
    want(f, l.path).lines.push(line);
    if (thing && asked !== undefined) modelLines.push({ line, cites: thing.file.id });
    if (words) {
      words.lines.push(line);
      words.notes.add(f.id);
    }
  }
  // "Write it" (`state-yes-writes`): your yes, among the changes this run took, to Bower writing its update over a
  // Current state you edited, by the note's file id: the grant for that one write, while the section still reads as
  // the question saw it (its `state` mark, an optimistic-concurrency precondition). The later answer counts. Each
  // granted note is read below even with no update for it, so a section changed since is asked about again.
  const grants = new Map<string, { answer: string; seen: string | null; question: Question }>();
  const stateAnswers = date && !d.settles ? lines.filter((l) => l.rec.kind === 'answer' && subjectOf({ id: l.rec.questionId ?? '' }).kind === 'state') : [];
  if (stateAnswers.length) {
    const file = ix.file(SYSTEM.questions);
    const value = file && !file.folder ? parsed(await ownText(drive, file)) : null;
    const asked = isRunnerFile(SYSTEM.questions, value) ? value.questions : [];
    const last = new Map<string, JournalLine>();
    for (const l of stateAnswers) {
      const id = l.rec.questionId ?? '';
      const had = last.get(id);
      if (!had || had.rec.at <= l.rec.at) last.set(id, l);
    }
    for (const [id, l] of last) {
      const q = asked.find((x) => x.id === id);
      // The note by its file id, never by name: wherever it is now.
      const about = subjectOf({ id });
      const path = about.kind === 'state' ? ix.pathOf(about.id) : undefined;
      const f = path === undefined ? undefined : ix.file(path);
      if (l.rec.text !== 'yes' || !q || !f || f.folder || path === undefined) continue;
      grants.set(f.id, { answer: l.rec.id, seen: q.state ?? null, question: q });
      want(f, path);
    }
  }
  // A model's Current states (C05): planned below on the bytes read, only where Bower still owns the section, or the
  // person's yes grants it. A run of your changes only (no pile) writes only a granted one.
  for (const st of date ? d.states : []) {
    const f = ix.file(st.path);
    if (!f || f.folder) continue;
    if (!all && !grants.has(f.id)) continue;
    const thing = st.cites === null ? undefined : things.find((t) => t.file.id === st.cites && !t.merge);
    const asked = thing ? (d.note(thing.file.id)?.name ?? d.thing(seenOf(thing))?.name) : undefined;
    want(f, st.path).state = { lines: st.lines, source: asked === undefined ? null : citeName(asked), thing: asked === undefined ? null : (thing?.file.id ?? null) };
  }
  /** Current states the person edited: what Bower would write goes on the Timeline as a line, and they are asked. */
  const personStates: Array<{ line: WantedLine; file: DriveFile; path: string; seen: string }> = [];
  /** Granted sections the person changed again since they were asked: nothing is written, and they are asked again. */
  const reasked: Question[] = [];
  /** Unmarked Current states Bower may not adopt: a line each, and one question for the whole folder (TL-P4-10). */
  const unmarkedStates: WantedLine[] = [];
  /** Whether a rule lets Bower keep up to date the Current states it did not write: Rules.md, read once, when needed. */
  let adoptRule: Promise<boolean> | null = null;
  const adopting = (): Promise<boolean> => (adoptRule ??= (async () => {
    const rulesNote = ix.file(RULES_PATH);
    if (!rulesNote || rulesNote.folder) return false;
    try {
      return ruleLike(parseRules(await ownText(drive, rulesNote)), ADOPT_STATES_RULE) !== undefined;
    } catch (e) {
      // An unreadable Rules.md grants nothing: the sections stay the person's, and the run goes on.
      console.error('Your rules could not be read for the summaries rule:', e);
      return false;
    }
  })());
  // A merge's line, by its answer (R3-4): only into a note in a main folder, never the inbox or Bower's own files.
  for (const thing of things) {
    const m = thing.merge;
    const f = m && date ? ix.file(m.into) : undefined;
    if (!m || !f || f.folder || !m.into.endsWith('.md') || m.into.startsWith('Inbox/') || m.into.startsWith(`${SYSTEM.dir}/`)) continue;
    want(f, m.into).lines.push({ entry: { date: date ?? '', text: m.line, source: null }, record: m.answer, what: m.line, after: null });
  }
  // A lookup request (C10, TL-P2-40 (2)): with the web allowed, its scripted result is a Timeline line on its note,
  // its address the line's source; the line names the request, so the request's archive waits for it (rule 7). With
  // the web off nothing is looked up or written, and its answer says so.
  const lookups = new Map<string, WantedLine>();
  for (const l of opts.allowWeb && date ? journal.filter((x) => x.rec.kind === 'request') : []) {
    const scripted = d.request?.(l.rec.text ?? l.rec.what);
    if (scripted?.kind !== 'lookup') continue;
    const [path] = scripted.uses;
    const f = ix.file(path);
    if (!f || f.folder) continue;
    const line: WantedLine = { entry: { date: date ?? '', text: scripted.found.text, source: scripted.found.url }, record: l.rec.id, what: scripted.found.text, after: null };
    want(f, path).lines.push(line);
    lookups.set(l.rec.id, line);
    need(l.rec.id).lines.push(line);
  }
  // A disagreement's answer (C07, TL-P2-40): what you said goes on the stored note's Timeline, naming the answer, and
  // its question goes once that line is there (R4-1). The note's Current state waits for P4. The question is read
  // from Bower's questions.json, as it was asked.
  const answerLines = new Map<string, { fileId: string; line: WantedLine }>();
  const disagreed = journal.filter((l) => l.rec.kind === 'answer' && !!d.said?.about(l.rec.questionId ?? ''));
  const openFile = disagreed.length && date ? ix.file(SYSTEM.questions) : undefined;
  const openValue = openFile && !openFile.folder ? parsed(await ownText(drive, openFile)) : null;
  const open = isRunnerFile(SYSTEM.questions, openValue) ? openValue.questions : [];
  for (const l of disagreed) {
    const q = open.find((x) => x.id === l.rec.questionId);
    const said = q ? (d.said?.line(q, l.rec.text === 'yes') ?? null) : null;
    const path = said ? follow(said.note) : '';
    const f = said ? ix.file(path) : undefined;
    if (!said || !f || f.folder || !path.endsWith('.md')) continue;
    const line: WantedLine = { entry: { date: date ?? '', text: said.line, source: null }, record: l.rec.id, what: said.line, after: null };
    want(f, path).lines.push(line);
    answerLines.set(l.rec.id, { fileId: f.id, line });
    need(l.rec.id).lines.push(line);
  }
  // The rename and move lines this run takes; their renames as the resolver follows them (chains, `taken`).
  const moved = journal.filter((l) => l.rec.kind === 'rename' || l.rec.kind === 'move');
  const taken = new Set([...ix.entries().keys()].filter((p) => p.endsWith('.md')).map((p) => displayName(nameOf(p)).toLowerCase()));
  const allRenames = renamesFor(moved.map((l) => ({ id: l.rec.id, at: l.rec.at, kind: l.rec.kind, what: l.rec.what, ...(l.rec.path ? { path: l.rec.path } : {}), ...(l.rec.from ? { from: l.rec.from } : {}) })), taken);
  const journalRenames = allRenames.filter(renameOk);
  // A rename no link can be written with keeps its lines where they are, as the resolver still follows them (rule 7).
  let holdRenames = journalRenames.length !== allRenames.length;
  if (holdRenames) console.error('A former name cannot be written into links; the rename lines stay for the next tidy-up');
  // Notes kept as one (C05): the other note's facts and Timeline lines on the kept note's Timeline, each line naming
  // the answer (so its archive waits for it), and every link to the other note rewritten to the kept one.
  const keeping: Array<{ k: KeepOne; kept: DriveFile; other: DriveFile; rename: Rename; lines: WantedLine[] }> = [];
  for (const { k, kept, other, rename } of date ? keeps : []) {
    const was = await drive.readText(kept.id);
    const lines = carriedLines(parseNote(k.other, await drive.readText(other.id)), parseNote(k.kept, was))
      .map((entry): WantedLine => ({ entry: { ...entry, date: date ?? '' }, record: k.answer, what: null, after: null }));
    want(kept, k.kept).lines.push(...lines);
    keeping.push({ k, kept, other, rename, lines });
    // The other note is recorded as the run saw it, so its Bin is checked against that (`stillAsSeen`) and undone from it.
    places.set(other.id, other);
  }
  const keepRenames = keeping.map((x) => x.rename);
  const renames = [...journalRenames, ...keepRenames.filter((r) => !journalRenames.some((j) => j.from.toLowerCase() === r.from.toLowerCase()))];
  const binned = new Set(keeping.map((x) => x.other.id));
  if (renames.length) {
    for (const [path, entry] of ix.entries()) {
      if (entry.type !== 'file' || !path.endsWith('.md') || path.startsWith('Inbox/') || path.startsWith(`${SYSTEM.dir}/`)) continue;
      const f = ix.file(path);
      if (f && !f.folder && !binned.has(f.id)) want(f, path).renames = renames;
    }
  }
  // Rules.md takes its rules-wording change in its one edit (TL-P2-20 rule 3), within the edit cap.
  const rulesFile = ix.file(RULES_PATH);
  if (ruleWords.change && rulesFile && !rulesFile.folder) want(rulesFile, RULES_PATH).rules = ruleWords.change;
  /** Where the rules ended up: worded in Rules.md's edit, already there (nothing to write), or left pending. */
  let rulesState: 'planned' | 'present' | 'left' = 'left';
  let rulesWorded: ReadonlySet<string> = new Set();
  /**
   * Each Timeline line wanted: written by this run, there already, refused as a person's note (I7), refused for any
   * other reason at plan time (too big, unknown format, not UTF-8, refused when authored), or deferred (past the
   * edit cap, or the note changed while it was read), so whatever derives from it waits for the next run.
   */
  const lineState = new Map<WantedLine, LineState>();
  /** A line wanted twice in one note (the same words): written once, and it goes as its twin goes. */
  const twins = new Map<WantedLine, WantedLine>();
  const candidates: Array<{ file: DriveFile; path: string; before: VerifiedContent; bytes: Uint8Array; rewrite: boolean; lines: WantedLine[]; rules: RulesWording | null; state: StateRewrite | null; stateAfter: string | null }> = [];
  const editing = [...wanted.values()].sort((a, b) => byCodePoint(a.path, b.path));
  /** Notes that changed while read, and the bytes of notes whose links could not be rewritten: a keep waits on either. */
  const raced = new Set<string>();
  const notRelinked = new Set<Uint8Array>();
  // What the next loops read, one after the other: the notes to edit, and the saved links being filed.
  drive.warm?.([...editing.map((w) => ({ id: w.file.id, as: 'bytes' as const })), ...things.filter((t) => t.item.kind === 'link').map((t) => ({ id: t.file.id, as: 'text' as const }))]);
  for (const w of editing) {
    const f = w.file;
    for (const l of w.lines) lineState.set(l, 'refused');
    const before = await verified(f, 'utf8');
    // Rules.md is Bower's own file: when the run words rules in it, a read that fails refuses the run (TL-P2-17).
    if (w.rules && !before) throw new BowerError('unknown', OWN_FILES);
    let bytes: Uint8Array | null;
    try {
      bytes = before ? await drive.readBytes(f.id) : null;
    } catch (e) {
      if (!w.rules) throw e;
      console.error(e);
      throw new BowerError('unknown', OWN_FILES);
    }
    if (!before || !bytes || before.size !== bytes.byteLength || before.sha256 !== (await sha256(new Blob([bytes.slice()])))) {
      console.error('A note changed while it was read; no edit is planned for it this time');
      raced.add(f.id);
      // A yes to writing over it is not used up on a note that changed under the read: it is asked again, as it was.
      const grant = grants.get(f.id);
      if (grant) reasked.push({ ...grant.question, askedAt: opts.requestedAt });
      if (w.renames) holdRenames = true;
      // A passing race, not a refusal: its lines wait for the next run, like those past the cap.
      for (const l of w.lines) lineState.set(l, 'deferred');
      continue;
    }
    let rewrite = false;
    // The bytes the later changes of this one edit apply to: after its link rewrite, which goes first (R3-7 m4).
    let rewritten = bytes;
    if (w.renames) {
      const result = applyChanges(bytes, [{ kind: 'link-rewrite', recordIds: [], renames: w.renames }]);
      rewrite = result.ok;
      if (result.ok) rewritten = result.bytes;
      // A note that links to a former name but cannot be rewritten keeps the rename lines (rule 7).
      if (!result.ok && result.reason !== 'unchanged') notRelinked.add(bytes);
      if (!result.ok && result.reason !== 'unchanged' && mentions(bytes, journalRenames)) {
        console.error(`A note's links could not be rewritten (${result.reason}); the rename lines stay for the next tidy-up`);
        holdRenames = true;
      }
    }
    // A Current state (C05): rewritten only while it is Bower's (as Bower last wrote it, by its mark); one the person
    // edited since is never rewritten: what Bower would write becomes a Timeline line, and the person is asked.
    // TL-P4-10: an unmarked one is the person's, unless a rule lets Bower adopt it (no write of Bower's ever does);
    // a Bower note with none gets one, with its mark.
    let state: StateRewrite | null = null;
    const grant = grants.get(f.id);
    const section = grant ? currentStateOf(bytes) : null;
    const mark = stateMarkOf(bytes);
    if (grant && section?.owner === 'person' && (grant.seen === null || grant.seen !== stateMark(section.lines))) {
      // Changed since the question (or asked before questions kept what they saw): the yes was not to these lines.
      reasked.push({ id: stateQuestionId(f.id), text: `You changed the current state of ${displayName(nameOf(w.path))} again. Should Bower still write its update there?`, yes: 'Write it', no: 'Keep mine', about: w.path, state: stateMark(section.lines), askedAt: opts.requestedAt });
    } else if (grant && section?.owner === 'person' && mark !== null && w.state && section.lines.join('\n') !== w.state.lines.join('\n')) {
      // The person's yes grants this one write over their lines, as read now; the answer goes with the edit.
      const change: StateRewrite = { kind: 'state-rewrite', recordIds: [grant.answer], previous: section.lines, lines: w.state.lines, granted: { answer: grant.answer, mark } };
      const result = applyChanges(bytes, [change]);
      if (result.ok) state = change;
      else console.error(`A note's Current state was refused (${result.reason}); none is planned for it`);
    } else if (w.state && !(grant && section?.owner === 'person')) {
      const now = currentStateOf(bytes);
      const adopt = now?.owner === 'unmarked' && (await adopting());
      if (now && (now.owner === 'bower' || now.owner === 'missing' || adopt)) {
        if (now.lines.join('\n') !== w.state.lines.join('\n')) {
          const change: StateRewrite = { kind: 'state-rewrite', recordIds: [], previous: now.lines, lines: w.state.lines, ...(adopt ? { adopted: true as const } : {}) };
          const result = applyChanges(bytes, [change]);
          if (result.ok) state = change;
          else console.error(`A note's Current state was refused (${result.reason}); none is planned for it`);
        }
      } else {
        // Never silently dropped: what Bower would write becomes one Timeline line (a person's note takes none).
        // Only what the section lacks; nothing new, no line.
        // Same news twice in one run: a line this run adds to the note citing the same thing already says it.
        const cited = w.state.thing === null ? undefined : w.lines.find((l) => l.after === w.state?.thing && l.entry.source !== null);
        // The person is still asked, once that line is there.
        if (cited && now?.owner === 'person') personStates.push({ line: cited, file: f, path: w.path, seen: stateMark(now.lines) });
        if (cited && now?.owner === 'unmarked') unmarkedStates.push(cited);
        const text = cited ? null : stateNewsLine(w.state.lines, now?.lines ?? [], stateMarkOf(bytes));
        if (text !== null) {
          const line: WantedLine = { entry: { date: date ?? '', text, source: w.state.source }, record: null, what: text, after: w.state.thing };
          w.lines.push(line);
          lineState.set(line, 'refused');
          if (now?.owner === 'person') personStates.push({ line, file: f, path: w.path, seen: stateMark(now.lines) });
          if (now?.owner === 'unmarked') unmarkedStates.push(line);
          if (w.state.thing !== null && w.state.source !== null) modelLines.push({ line, cites: w.state.thing });
        }
      }
    }
    // Each line on its own: one already there (from any day) is dropped; a person's note takes none.
    const lines: WantedLine[] = [];
    // A hub line with nothing to cite is there already when its words are, with or without a source (C06).
    const said = new Set(timelineBullets(new TextDecoder().decode(bytes)).flatMap((x) => {
      const m = parseTimelineLine(x);
      return m ? [m.text] : [];
    }));
    for (const l of w.lines) {
      if (l.record === null && l.entry.source === null && said.has(l.entry.text)) {
        lineState.set(l, 'present');
        continue;
      }
      const result = applyChanges(bytes, [{ kind: 'timeline-append', recordIds: [], entries: [l.entry] }]);
      const twin = lines.find((x) => x.entry.text === l.entry.text);
      if (result.ok && twin) twins.set(l, twin);
      else if (result.ok) lines.push(l);
      else if (!result.ok && result.reason === 'unchanged') lineState.set(l, 'present');
      else if (!result.ok && result.reason === 'not-bower') lineState.set(l, 'person');
      else if (!result.ok) console.error(`A note's Timeline line was refused (${result.reason}); none is planned for it`);
    }
    // The rules, as applyChanges words them in this edit, after its link rewrite: a rule the rewrite makes a repeat
    // of one there is not written (TL-P2-20 I10). Nothing to write when every one is there already, and a refusal
    // (not Bower's, damaged, too big) leaves them pending (rule 7).
    let rules: RulesWording | null = null;
    if (w.rules) {
      // A rule taken out is matched as it reads after this edit's link rewrite (TL-P2-38); still no match, it is gone.
      const change = rewrite && w.renames ? relinkedRemovals(w.rules, w.renames) : w.rules;
      const result = applyChanges(rewritten, [change]);
      const worded = result.ok ? wordedBy(new TextDecoder().decode(rewritten), change, result.text) : null;
      if (worded) {
        rules = change;
        rulesWorded = worded;
      } else if (!result.ok && result.reason === 'unchanged') rulesState = 'present';
      else console.error(`${RULES_PATH} was refused for wording (${result.ok ? 'count' : result.reason})`);
    }
    if (rewrite || lines.length || rules || state) candidates.push({ file: f, path: w.path, before, bytes, rewrite, lines, rules, state, stateAfter: state ? (w.state?.thing ?? null) : null });
  }
  // At most editCap edits, in path order; the rest wait for the next run, which plans them again. Their rename lines
  // stay unarchived meanwhile (TL-P2-29 (1)).
  if (candidates.slice(editCap).some((c) => c.rewrite)) holdRenames = true;
  for (const l of candidates.slice(editCap).flatMap((c) => c.lines)) lineState.set(l, 'deferred');
  // Each kept note's changes together, in the contract's order; the text never depends on the record ids.
  const appendOf = (lines: WantedLine[]): Change[] => (lines.length
    ? [{ kind: 'timeline-append', recordIds: [...new Set([...lines, ...[...twins].filter(([, t]) => lines.includes(t)).map(([l]) => l)].flatMap((l) => (l.record === null ? [] : [l.record])))], entries: lines.map((l) => l.entry) }]
    : []);
  /** The answers whose keep a note's link rewrite is for: the notes it links to the other note of each. */
  const keptFor = (bytes: Uint8Array): string[] => keeping.filter((x) => mentions(bytes, [x.rename])).map((x) => x.k.answer);
  const changesOf = (c: (typeof candidates)[number], recordIds: string[]): Change[] =>
    [...(c.state ? [c.state] : []), ...(c.rewrite ? [{ kind: 'link-rewrite' as const, recordIds: [...recordIds, ...keptFor(c.bytes)], renames }] : []), ...appendOf(c.lines), ...(c.rules ? [c.rules] : [])];
  const authored = candidates.slice(0, editCap).flatMap((c) => {
    const result = applyChanges(c.bytes, changesOf(c, []));
    if (result.ok) return [{ c, text: result.text }];
    console.error(`A note edit was refused (${result.reason}); none is planned for it`);
    if (c.rewrite) holdRenames = true;
    return [];
  });
  const renameIds = holdRenames ? [] : moved.map((l) => l.rec.id);
  const edits: Array<{ file: DriveFile; path: string; rows: Array<{ what: string; line?: number }>; before: VerifiedContent; bytes: Uint8Array; changes: Change[]; text: string; after: string[]; keeps: string[] }> = [];
  for (const { c, text } of authored) {
    for (const l of c.lines) lineState.set(l, 'planned');
    if (c.rules) rulesState = 'planned';
    // One report row per Timeline line it writes (report-misses-hub-line); a Current state alone says it was updated.
    // Each row names its line by its ordinal among the lines the edit appends, in order (TL-P4-19 addendum 4).
    const written = c.lines.flatMap((l, i) => (l.what === null ? [] : [{ what: l.what, line: i }]));
    const rows = written.length ? written : c.state ? [{ what: STATE_UPDATED }] : [];
    const after = [...new Set([...c.lines.flatMap((l) => (l.after === null ? [] : [l.after])), ...(c.stateAfter === null ? [] : [c.stateAfter])])];
    // An edit a keep needs (the kept note's lines, a link to the other note) keeps the note's text as read, for its undo.
    // So does a write the person's yes granted: its undo puts their section back byte for byte (`undoEdit`).
    const keeps = [...new Set([...keeping.filter((x) => x.kept.id === c.file.id).map((x) => x.k.answer), ...(c.rewrite ? keptFor(c.bytes) : []), ...(c.state?.granted ? [c.state.granted.answer] : [])])];
    edits.push({ file: c.file, path: ix.pathOf(c.file.id) ?? c.path, rows, before: c.before, bytes: c.bytes, changes: changesOf(c, renameIds), text, after, keeps });
    places.set(c.file.id, c.file);
  }
  for (const [l, twin] of twins) lineState.set(l, lineState.get(twin) ?? 'refused');
  // A Current state the person edited is asked about once its line is there (C11 asks flow), never rewritten.
  for (const p of personStates) {
    const kept = lineState.get(p.line);
    if (kept !== 'planned' && kept !== 'present') continue;
    askedPiles.push({ id: stateQuestionId(p.file.id), text: `You changed the current state of ${displayName(nameOf(p.path))}. Should Bower write its update there?`, yes: 'Write it', no: 'Keep mine', about: p.path, state: p.seen, askedAt: opts.requestedAt });
  }
  // Summaries Bower did not write: one question for the folder, however many there are (TL-P4-10 point 3); a yes
  // becomes ADOPT_STATES_RULE (C11), and Bower then adopts them.
  if (unmarkedStates.some((l) => lineState.get(l) === 'planned' || lineState.get(l) === 'present')) {
    askedPiles.push({ id: ADOPT_STATES_ID, text: ADOPT_STATES_QUESTION, yes: 'Keep them up to date', no: 'Leave them', askedAt: opts.requestedAt });
  }
  // A pile of words a line carries goes to the Bin only with every such line written (or there already); otherwise it
  // waits whole for the next run, its words untouched, and its lines are not written now either.
  // At least one of them written now, so the pile is filed as the note it went into; with every one there already, it
  // is saved already, as those notes (`duplicates.ts`), and goes to the Bin as a copy does.
  const savedWords = new Map([...citedWords].flatMap(([id, w]) => {
    const as = wordsSaved(w.lines.map((l) => lineState.get(l)), [...w.notes].flatMap((n) => listing.find((f) => f.id === n) ?? []));
    return as ? [[id, as] as const] : [];
  }));
  const wordsWaiting = [...citedWords].filter(([id, w]) => !savedWords.has(id) && (!w.lines.some((l) => lineState.get(l) === 'planned') || !w.lines.every((l) => ['planned', 'present'].includes(lineState.get(l) ?? '')))).map(([id]) => id);
  if (wordsWaiting.length) {
    console.error('A pile of words could not be added to its note now; it waits for the next tidy-up');
    return tryAgain({ editCap, held: new Set([...held, ...wordsWaiting]) });
  }
  // A keep goes whole or waits whole with its answer: every line it carries written (or there already), every note
  // linking the other note rewritten, and the other note edited by nothing else; otherwise it is planned again held.
  for (const x of keeping) {
    const planned = (l: WantedLine): boolean => ['planned', 'present'].includes(lineState.get(l) ?? '');
    const relinked = candidates.filter((c) => mentions(c.bytes, [x.rename])).every((c) => edits.some((e) => e.file.id === c.file.id && e.changes.some((ch) => ch.kind === 'link-rewrite')));
    const unlinked = raced.size > 0 || [...notRelinked].some((b) => mentions(b, [x.rename]));
    if (!x.lines.every(planned) || !relinked || unlinked || edits.some((e) => e.file.id === x.other.id)) {
      console.error('Two notes could not be kept as one now; the answer waits for the next tidy-up');
      return tryAgain({ editCap, held: new Set([...held, `keep:${x.k.answer}`]) });
    }
  }
  /** A merge's line, when its note is one a line can go to at all. */
  const lineOf = (m: Merge): WantedLine | undefined => wanted.get(ix.idOf(m.into) ?? '')?.lines.find((l) => l.record === m.answer && l.entry.text === m.line);
  const stateOf = (m: Merge | null): LineState | undefined => {
    const line = m ? lineOf(m) : undefined;
    return line ? lineState.get(line) : undefined;
  };
  // A merge whose line waits past the cap waits with its whole pile and its answer: planned again with that pile
  // held, so its question is never dropped (rule 7, R4-1). A refused line is not a wait (TL-P2-35): see below.
  const waitingPiles = things.filter((t) => stateOf(t.merge) === 'deferred').map((t) => t.pile.id);
  if (waitingPiles.length) return tryAgain({ editCap, held: new Set([...held, ...waitingPiles]) });
  /**
   * How each merge goes: after its line, beside a line already there, or not at all: when the note is a person's own
   * (I7), when there is no note to merge into, or when its line was refused at plan time (TL-P2-35), the thing is
   * filed as usual, and in the last case the report says it was filed on its own.
   */
  const mergeState = (thing: (typeof things)[number]): MergeState | null => {
    const m = thing.merge;
    const state = stateOf(m);
    return m && (state === 'planned' || state === 'present') ? { ...m, line: state } : null;
  };
  /** A thing whose merge fell back to ordinary filing: its answer, and the note's shown name when its line was refused. */
  const fallbackOf = (thing: (typeof things)[number]): Fallback | null => {
    const m = thing.merge;
    if (!m || mergeState(thing)) return null;
    return { answer: m.answer, into: m.into, alone: stateOf(m) === 'refused' ? displayName(nameOf(m.into)) : null };
  };
  // Lines held back stay where they are, uncaptured, for the next run (rule 7): renames, rule lines left pending, and
  // any change whose line (a lookup's result, what you said) is not written now, past the cap or refused.
  const rules = rulesPlanOf(ruleWords, rulesFile, rulesState, rulesWorded);
  for (const l of holdRenames ? moved : []) need(l.rec.id).held = true;
  for (const id of rules.left) need(id).held = true;
  const waits = new Set([...needs].filter(([, n]) => n.held || !n.lines.every((l) => ['planned', 'present'].includes(lineState.get(l) ?? ''))).map(([id]) => id));
  if (waits.size) journal = journal.filter((l) => !waits.has(l.rec.id));
  const unwritten = [...waits].filter((id) => !needs.get(id)?.held).length;
  if (unwritten) console.error(`${unwritten} of your changes wait for the next tidy-up: what they add could not be written now`);
  // An instructions run with no line it can take, once every held line is left out, has nothing to read: the
  // existing refusal, before admission.
  if (!all && !journal.length) throw new BowerError('conflict', NOTHING_TO_READ);
  const edited = new Set(edits.map((e) => e.file.id));
  const filing: Array<{ thing: (typeof things)[number]; to: string; name: string; note?: SavedNote; merge?: MergeState }> = [];
  for (const thing of things) {
    // A merge (TL-P2-20 I4): the thing joins the note's folder under the merge's title.
    const merge = mergeState(thing);
    if (merge) {
      const to = parentOf(merge.into);
      const folder = ix.file(to);
      if (folder?.folder) places.set(folder.id, folder);
      const name = freeName(planned, to, merge.title);
      planned.set(join(to, name), { path: join(to, name), type: 'file', kind: kindOf(name), modified: 0, created: 0 });
      filing.push({ thing, to, name, merge });
      continue;
    }
    // A saved link is named from its address unless the plan names it (as the legacy runner did).
    const linkText = thing.item.kind === 'link' ? await drive.readText(thing.file.id) : null;
    // Where it goes and its name, as the reply decided: a thing it did not place is no plan.
    const place = d.thing(seenOf(thing, linkText)) ?? refused('a thing the reply did not place');
    const title = place.name;
    if (linkText !== null && kindOf(title) === 'note') {
      // A saved link filed as a note (TL-P2-20 M5, R3-6): a generated note keyed by the link file's id, and the
      // link file itself moved beside it, never rewritten. A note with that key already there is reused (R4-2).
      const key = await savedLinkKey(thing.file.id);
      const kept = listing.find((f) => !f.folder && f.appProperties?.[PROP.item] === key);
      const keptPath = kept ? ix.pathOf(kept.id) : undefined;
      const keptIn = keptPath === undefined ? undefined : ix.file(parentOf(keptPath));
      if (kept && keptPath !== undefined && keptIn?.folder && !keptPath.startsWith('Inbox/') && !keptPath.startsWith(`${SYSTEM.dir}/`)) {
        const to = parentOf(keptPath);
        places.set(kept.id, kept);
        places.set(keptIn.id, keptIn);
        const name = freeName(planned, to, thing.file.name);
        plannedFile(join(to, name));
        filing.push({ thing, to, name, note: { name: kept.name, key, text: null, what: null } });
        continue;
      }
      const address = savedLinkAddress(linkText) ?? thing.item.name;
      const text = serializeNote({ summary: `Saved from ${address}.`, properties: [{ key: 'source', label: 'Source', value: address }], tags: [], currentState: [], body: `Saved from ${address}.`, timeline: [{ date: date ?? '', text: 'Saved by you, filed by Bower.', source: address }], byBower: true });
      const to = place.to;
      destination(to);
      const noteName = freeName(planned, to, title);
      plannedFile(join(to, noteName));
      const name = freeName(planned, to, thing.file.name);
      plannedFile(join(to, name));
      filing.push({ thing, to, name, note: { name: noteName, key, text, what: `Saved from ${address}.` } });
      continue;
    }
    const to = place.to;
    destination(to);
    const name = freeName(planned, to, title);
    plannedFile(join(to, name));
    filing.push({ thing, to, name });
  }
  // Generated notes (TL-P2-17): under a main folder, named from the authored title with the naming rules of the
  // Inbox, `.md`, unique against the folder as it will be. A filed thing's own note is written only where none is
  // yet, as the legacy runner did; it follows its thing's move. The words of a pile become its note.
  const noteDate = timelineDate(opts.requestedAt) ?? 'Today';
  const generated: Array<{ to: string; name: string; text: string; what: string; after: string | null; pileId: string | null; aside: string; context: DriveFile | null }> = [];
  for (const { thing, name } of filing) {
    const own = d.ownNote?.(thing.item.name) ?? undefined;
    if (!own || !generatedPlace(parentOf(own))) continue;
    if (freeName(planned, parentOf(own), nameOf(own)) !== nameOf(own)) continue;
    destination(parentOf(own));
    plannedFile(own);
    const what = `A note for ${displayName(name)}.`;
    const text = serializeNote({ summary: what, properties: [], tags: [], currentState: [], body: '', timeline: [{ date: noteDate, text: 'Filed by Bower.', source: name }], byBower: true });
    generated.push({ to: parentOf(own), name: nameOf(own), text, what, after: thing.file.id, pileId: null, aside: thing.file.name, context: null });
  }
  /** The name each filed thing is cited by, as the run makes it: its note's, else its own. */
  const madeAs = new Map(filing.map(({ thing, name, note }) => [thing.file.id, note?.name ?? name]));
  // A note a model wrote for a thing (P4-3): beside it, its words as the body, Bower's summary and Timeline around them.
  for (const { thing, to, name, note, merge } of filing) {
    const authored = note || merge ? null : d.note(thing.file.id);
    if (!authored) continue;
    const noteName = freeName(planned, to, authored.name);
    madeAs.set(thing.file.id, noteName);
    plannedFile(join(to, noteName));
    const text = serializeNote({ summary: authored.summary, properties: [], tags: [], currentState: [], body: authored.body, timeline: [{ date: noteDate, text: 'Filed by Bower.', source: name }], byBower: true });
    generated.push({ to, name: noteName, text, what: authored.summary, after: thing.file.id, pileId: null, aside: thing.file.name, context: null });
  }
  for (const { pileId, folder, words, context } of fromWords) {
    const { to, name: title } = wordsPlace(pileId, words);
    destination(to);
    const name = freeName(planned, to, title);
    plannedFile(join(to, name));
    const what = 'Written from a note you added.';
    const text = serializeNote({ summary: words, properties: [{ key: 'kind', label: 'Kind', value: 'Note' }], tags: [], currentState: [], body: words, timeline: [{ date: noteDate, text: what }], byBower: true });
    generated.push({ to, name, text, what, after: null, pileId, aside: folder.name, context });
  }
  // Words you added that disagree with a stored note (C07): the question linking both, asked once the note written
  // from those words is there. The stored note is read now; one that cannot be read asks nothing.
  const disagreeing: Array<{ pileId: string; question: Question }> = [];
  for (const note of generated) {
    const words = note.pileId === null ? '' : (fromWords.find((w) => w.pileId === note.pileId)?.words ?? '');
    for (const rule of note.pileId === null ? [] : (d.disagreements?.(words) ?? [])) {
      const f = ix.file(rule.note);
      if (!f || f.folder) continue;
      let stored: ParsedNote;
      try {
        stored = parseNote(rule.note, await drive.readText(f.id));
      } catch (e) {
        if (e instanceof BowerError && e.code === 'auth') throw e;
        console.error(e);
        continue;
      }
      const value = stored.properties.find((p) => p.key === rule.property)?.value;
      const question = rule.question(words, displayName(note.name), { name: displayName(nameOf(rule.note)), value }, opts.requestedAt);
      if (question && note.pileId !== null) disagreeing.push({ pileId: note.pileId, question });
    }
  }
  // A comparison request (C08, TL-P2-40 (1)): a generated note under a main folder (TL-P2-17) with a GFM table of
  // the notes it compares, read now, and the list of those sources. Only when every one is there and can be read.
  const compared = new Map<string, { to: string; name: string; text: string; what: string }>();
  for (const l of journal.filter((x) => x.rec.kind === 'request')) {
    const scripted = d.request?.(l.rec.text ?? l.rec.what);
    if (scripted?.kind !== 'compare' || !generatedPlace(scripted.note.to)) continue;
    const read: ParsedNote[] = [];
    for (const path of scripted.uses) {
      const f = ix.file(path);
      if (!f || f.folder) break;
      try {
        read.push(parseNote(path, await drive.readText(f.id)));
      } catch (e) {
        // A note that cannot be read now leaves the request with its plain line; a sign-out stops the run.
        if (e instanceof BowerError && e.code === 'auth') throw e;
        console.error(e);
        break;
      }
    }
    if (read.length !== scripted.uses.length) continue;
    const { to, title, what } = scripted.note;
    destination(to);
    const name = freeName(planned, to, generatedName(title));
    plannedFile(join(to, name));
    compared.set(l.rec.id, { to, name, text: comparisonNote(read, what, noteDate), what });
  }
  // Answers drop their questions from questions.json; an answer held back keeps its own. The question the run asks
  // goes into that same write (TL-P2-37 Q1 (a)), asked at `requestedAt`, unless it is open already or answered now.
  const answered = new Set(journal.filter((l) => l.rec.kind === 'answer').map((l) => l.rec.questionId ?? ''));
  // A question asked again (a granted section changed since) replaces the one its answer drops, under the same id.
  const again = new Set(reasked.map((q) => q.id));
  const toAsk = [...asking.values(), ...disagreeing.map((d) => d.question), ...reasked, ...askedPiles]
    .filter((q, i, all) => (again.has(q.id) || !answered.has(q.id)) && all.findIndex((x) => x.id === q.id) === i);
  const questionsFile = ix.file(SYSTEM.questions);
  let questionsText: string | null = null;
  let fresh: Question[] = [];
  /** The questions this write closes because their thing or pile left the inbox. */
  const closing: Question[] = [];
  if ((answered.size || toAsk.length || (all && inbox.length && questionsFile && mayHold(questionsFile))) && questionsFile) {
    const value = parsed(await ownText(drive, questionsFile));
    const readable = isRunnerFile(SYSTEM.questions, value);
    // An unreadable list is Bower's own file: replaced with a fresh one (TL-P2-17); the report never claims its old entries.
    if (!readable) console.error(new BowerError('unknown', QUESTIONS_REPLACED), `${SYSTEM.questions} is not a valid questions file`);
    const all = readable ? value.questions : [];
    fresh = toAsk.filter((q) => again.has(q.id) || !all.some((x) => sameThing(x, q)));
    // The same content uploaded again keeps its one question, now about the new file (so the reader still shows it).
    const retarget = (x: Question): Question => {
      const again = toAsk.find((q) => q.subject !== undefined && related(subjectKey(x), q.subject) === false && sameContent(x, q));
      return again ? { ...x, subject: again.subject, ...(again.about !== undefined ? { about: again.about } : {}) } : x;
    };
    const open = openQuestions(all, answered, seenNow, notesSeen);
    // A question closed because its thing goes to the Bin now (a saved copy) closes only once that Bin is done (P4-17).
    closing.push(...all.filter((q) => !answered.has(q.id) && !open.includes(q)));
    const left = [...open.map(retarget), ...fresh];
    if (!readable || left.length !== all.length || fresh.length || left.some((q, i) => q.subject !== all[i]?.subject)) questionsText = questionsJson(left);
  } else if (toAsk.length && sys?.folder) {
    // A missing list is made again in `.bower` with the question (TL-P2-33 §2a).
    fresh = toAsk;
    questionsText = questionsJson(fresh);
  } else if (toAsk.length) {
    // No `.bower` yet: the run's own records make it; there is no list to ask in, so the question is not asked.
    console.error(new BowerError('unknown', NOT_ASKED), `${SYSTEM.dir} is missing; the question is not asked`);
  }
  // A run that only asks, about piles asked about already, has nothing new to do: nothing was ready yet.
  // A Timeline line the model added on a note is something to do, so a run with one is not "nothing ready".
  if (all && !capturedPiles.length && !journal.length && questionsText === null && ![...wanted.values()].some((w) => w.lines.length || w.state)) {
    if (opts.taken) return { kind: 'plan' as const, plan: await nothingReadyPlan(rootId, opts) };
    throw new BowerError('conflict', NOTHING_READY);
  }
  // Your changes go to the archive the legacy runner used, made in `.bower/changes` only when a line needs it
  // (TL-P2-33 §1). With no `.bower/changes` there is no line: the journal is empty and no folder is made. A line
  // is always in a changes folder (`journalFiles`), so its own folder is the place when the path names another.
  const named = ix.file(SYSTEM.changes);
  const changesFolder = named?.folder ? named : listing.find((f) => f.folder && f.id === journal[0]?.files[0]?.parents[0]);
  const archiveFolder = changesFolder && listing.find((f) => f.folder && f.name === nameOf(SYSTEM.archive) && f.parents.length === 1 && f.parents[0] === changesFolder.id);
  if (journal.length) {
    const place = archiveFolder ?? changesFolder;
    if (!place) throw new BowerError('unknown', OWN_FILES);
    places.set(place.id, place);
  }
  // A runner file made again goes into `.bower`, a captured place.
  if ((!requests || !hashesFile || (!questionsFile && questionsText !== null)) && sys?.folder) places.set(sys.id, sys);
  // The file a thing already saved copies is recorded as the run saw it, so its report row names a captured file.
  for (const s of saved) if (s.dup.of === 'filed') places.set(s.dup.file.id, s.dup.file);
  const capturedPlaces = [...places.values()].map((f) => ({ file: seen(f), path: ix.pathOf(f.id) ?? '' })).sort((a, b) => a.path.localeCompare(b.path));
  const captured = journal.map((l) => ({ recordId: l.rec.id, sha256: l.sha256, fileIds: l.files.map((f) => f.id) }));
  const captureValue: ManifestCapture = { piles: capturedPiles, members, journal: captured, places: capturedPlaces };
  const scope = { rootId };
  const captureId = (await canonical({ scope, runScope: opts.scope, capture: captureValue })).hash;
  /**
   * What a request's done line says (C09, TL-P2-40): a scripted answer names what was found, with links to the notes
   * it used, when every one is there; the plain line only when nothing specific can be named.
   */
  const answerOf = (l: JournalLine): string => {
    const scripted = d.request?.(l.rec.text ?? l.rec.what);
    const there = (path: string): boolean => !!ix.file(path) && !ix.file(path)?.folder;
    // A lookup with the web off looks nothing up, and says so (C10); with it on, it names the note its result went to.
    if (scripted?.kind === 'lookup') return !opts.allowWeb ? scripted.offline : lookups.has(l.rec.id) ? scripted.answer : REQUEST_DONE;
    // A comparison names the note it wrote (C08).
    const note = compared.get(l.rec.id);
    if (scripted?.kind === 'compare') return note ? scripted.answer.replace('{note}', displayName(note.name)) : REQUEST_DONE;
    return scripted && scripted.uses.every(there) ? scripted.answer : REQUEST_DONE;
  };
  const answers = new Map(journal.filter((l) => l.rec.kind === 'request').map((l) => [l.rec.id, answerOf(l)]));
  // Bower's own files the run writes, as read now, so the writes pass what they read.
  const requestsRead = requests && answers.size ? { file: requests, content: await ownVerified(requests) } : null;
  const questionsRead = questionsText !== null && questionsFile ? { file: questionsFile, content: await ownVerified(questionsFile) } : null;
  // `.bower/hashes.json` on a full run: every file's content by its path once the run is done.
  let hashesNew: { text: string; before: VerifiedContent | null } | null = null;
  if (all) {
    const hashes: Record<string, string> = {};
    const digests = new Map(things.map(({ file, content }) => [file.id, content.sha256]));
    const finalPaths = new Map(filing.map(({ thing, to, name }) => [join(to, name), thing.file.id]));
    for (const [path, entry] of [...planned].sort(([a], [b]) => a.localeCompare(b))) {
      if (entry.type !== 'file' || entry.kind === 'note' || path.startsWith('Inbox/')) continue;
      const id = finalPaths.get(path) ?? ix.idOf(path);
      const f = id ? listing.find((x) => x.id === id) : undefined;
      const hash = (id && digests.get(id)) ?? (f ? (await storedDigest(drive, f))?.sha256 : undefined);
      // A derived list: a file whose bytes cannot be checked now is left out of it, and the next full run adds it.
      if (!hash) {
        console.error(`A file's content could not be checked; ${SYSTEM.hashes} leaves it out this time`);
        continue;
      }
      hashes[hash] = path;
    }
    const text = `${JSON.stringify({ v: 1, hashes } satisfies HashesFile, null, 2)}\n`;
    hashesNew = { text, before: hashesFile && text !== hashesText ? await ownVerified(hashesFile) : null };
  }
  return {
    kind: 'decided' as const, run: { runId: opts.runId, requestId: opts.requestId, scope: opts.scope, allowWeb: opts.allowWeb, requestedAt: opts.requestedAt },
    rootId, all, listing, ix, newKey, held, scope, captureId, captureValue, journal, edited, missing, areas: d.areas, filing, fallbackOf, derive, need,
    generated, modelLines, madeAs, edits, lineState, answerLines, keeping, saved, capturedPiles, partly, answers, compared, requestsRead,
    requestsBroken, requestsDone, sys, questionsText, questionsRead, fresh, asking, disagreeing, closing, related, sameContent, rules, ruleWords,
    rulesState, rulesFile, archiveFolder, changesFolder, hashesFile, hashesBroken, hashesNew, citedWords, savedWords, answeredRows,
  };
}
type Decided = Extract<Awaited<ReturnType<typeof decide>>, { kind: 'decided' }>;

/**
 * Build: the fixed operations and the report rows, each row from the operation it reports, from what was decided.
 * It reads neither Drive nor the reply; the manifest guard and grounding check what it built.
 */
export async function build(decided: Decided): Promise<Ended> {
  const { run: opts, rootId, listing, ix, newKey, held, scope, captureId, captureValue, journal, edited, missing, areas, filing, fallbackOf, derive, need,
    generated, modelLines, madeAs, edits, lineState, answerLines, keeping, saved, capturedPiles, partly, answers, compared, requestsRead,
    requestsBroken, requestsDone, sys, questionsText, questionsRead, fresh, asking, disagreeing, closing, related, sameContent, rules, ruleWords,
    rulesState, rulesFile, archiveFolder, changesFolder, hashesFile, hashesBroken, hashesNew, citedWords, savedWords, answeredRows } = decided;

  // The fixed operations, in order: clear last run's marks, make folders, file, the note edits, the merges, Bin the piles,
  // your changes, the hashes.
  const operations: OperationV2[] = [];
  const add = async (effect: EffectV2, dependsOn: string[] = []): Promise<string> => {
    const ordinal = operations.length;
    const operationId = (await canonical({ runId: opts.runId, captureId, ordinal, effect })).hash;
    operations.push({ operationId, ordinal, dependsOn, effect });
    return operationId;
  };
  // An edited note keeps its mark: it is marked new again after its edit (rule 3), never cleared in the same run.
  for (const f of listing.filter((x) => !x.folder && x.appProperties?.[PROP.isNew] === '1' && x.parents.length === 1 && !edited.has(x.id)).sort((a, b) => a.id.localeCompare(b.id))) {
    await add({ kind: 'move', before: seen(f), parent: { fileId: f.parents[0] ?? '' }, name: f.name, properties: { bowerNew: null } });
  }
  const made = new Map<string, string>();
  const targetOf = (path: string): Target => {
    const op = made.get(path);
    if (op) return { createdBy: op };
    return { fileId: ix.idOf(path) ?? '' };
  };
  for (const path of [...missing].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
    made.set(path, await add({ kind: 'create-folder', parent: targetOf(parentOf(path)), name: nameOf(path), createKey: newKey('folder') }));
  }
  const chainOf = (path: string): string[] => (made.has(path) ? [made.get(path) ?? '', ...chainOf(parentOf(path))] : []);
  const reportPlan: ReportContribution[] = [];
  // A new Area the model gave a responsibility for: the first thing filed there says why it was made (TL-P4-07 addendum 3).
  const said = new Set<string>();
  const areaOf = (to: string): { area: string } | Record<string, never> => {
    for (const [path, why] of areas) {
      if ((to === path || to.startsWith(`${path}/`)) && made.has(path) && !said.has(path)) {
        said.add(path);
        return { area: `New area ${nameOf(path)}, for ${why}` };
      }
    }
    return {};
  };
  const movesOf = new Map<string, string[]>();
  const moveOf = new Map<string, string>();
  const empty = emptyReport;
  /** Each edit by its note; by the records it comes from, in `needs` (their archives wait for it, rule 7, R3-4). */
  const editOf = new Map<string, string>();
  const fileOne = async ({ thing, to, name, note, merge }: (typeof filing)[number]): Promise<void> => {
    const isNote = kindOf(name) === 'note';
    // A saved link's note first (R3-6): written once by its key, then the link file moves beside it.
    const created = note && note.text !== null
      ? await add({ kind: 'create-text', parent: targetOf(to), name: note.name, createKey: note.key, text: note.text, content: await utf8(note.text), purpose: 'generated' })
      : null;
    const move = await add({
      kind: 'move',
      before: seen(thing.file),
      parent: targetOf(to),
      name,
      properties: { bowerNew: '1', ...(isNote ? { by: 'bower' as const } : {}), asAdded: null, origin: null, kind: null, pile: null },
    }, created ? [created] : merge?.line === 'planned' ? [editOf.get(ix.idOf(merge.into) ?? '') ?? ''] : []);
    movesOf.set(thing.pile.id, [...(movesOf.get(thing.pile.id) ?? []), move]);
    moveOf.set(thing.file.id, move);
    const fallback = fallbackOf(thing);
    if (fallback) {
      // R4-1: what derives from the answer is now this ordinary filing; TL-P2-35: and the report says why, once it applied.
      derive(fallback.answer, ...(created ? [created] : []), move);
      if (fallback.alone !== null) {
        reportPlan.push({ requires: [move], when: 'applied', value: { ...empty(), setAside: [{ name: thing.file.name, why: `Bower couldn't add it to ${fallback.alone}, so it was filed on its own.` }] } });
      }
    }
    if (merge) {
      // The line first, then the move after it; filed with the note only when both applied (I4, R3-5).
      const line = merge.line === 'planned' ? editOf.get(ix.idOf(merge.into) ?? '') ?? null : null;
      derive(merge.answer, ...(line ? [line] : []), move);
      const row = line
        ? { name: thing.file.name, title: displayName(nameOf(merge.into)), kind: thing.item.kind, to, note: merge.into }
        : { name: thing.file.name, title: thingName(name), kind: thing.item.kind, to };
      reportPlan.push({ requires: [...(line ? [line] : []), move, ...chainOf(to)], when: 'applied', value: { ...empty(), filed: [{ ...row, ...areaOf(to) }] } });
      reportPlan.push({ requires: [move], when: 'rejected', value: { ...empty(), setAside: [{ name: thing.file.name, why: NOT_FILED }] } });
      return;
    }
    if (note) {
      // R3-5: filed only with every operation for it; a rejected move (or its note's) leaves it to the next run.
      // The note it wrote is listed with the notes the run made; one reused is not (R4-2).
      const made = created && note.what !== null ? [{ path: join(to, note.name), what: note.what }] : [];
      reportPlan.push({ requires: [...(created ? [created] : []), move, ...chainOf(to)], when: 'applied', value: { ...empty(), filed: [{ name: thing.file.name, title: thingName(note.name), kind: thing.item.kind, to, note: join(to, note.name), ...areaOf(to) }], created: made } });
      reportPlan.push({ requires: [move], when: 'rejected', value: { ...empty(), setAside: [{ name: thing.file.name, why: NOT_FILED }] } });
      return;
    }
    reportPlan.push({ requires: [move, ...chainOf(to)], when: 'applied', value: { ...empty(), filed: [{ name: thing.file.name, title: thingName(name), kind: thing.item.kind, to, ...areaOf(to) }] } });
    reportPlan.push({ requires: [move], when: 'rejected', value: { ...empty(), setAside: [{ name: thing.file.name, why: NOT_FILED }] } });
  };
  for (const f of filing.filter((x) => !x.merge)) await fileOne(f);
  // Each generated note, keyed by its own createKey; a pile of words goes to the Bin only after its note is written.
  const notesOf = new Map<string, string>();
  for (const note of generated) {
    const after = note.after === null ? undefined : moveOf.get(note.after);
    const op = await add({ kind: 'create-text', parent: targetOf(note.to), name: note.name, createKey: newKey('note'), text: note.text, content: await utf8(note.text), purpose: 'generated' }, after ? [after] : []);
    const path = join(note.to, note.name);
    const filed = note.pileId === null ? [] : [{ name: 'Your note', title: thingName(note.name), kind: 'note' as const, to: note.to, note: path }];
    if (note.pileId !== null) notesOf.set(note.pileId, op);
    // An observed pile's context note goes to the Bin once its words are written, so a folder kept by another
    // child (a second pile note, a late thing) never has the same words written again on the next run.
    if (note.context) await add({ kind: 'bin', before: seen(note.context), capturedChildIds: [] }, [op]);
    reportPlan.push({ requires: [op, ...chainOf(note.to)], when: 'applied', value: { ...empty(), filed, created: [{ path, what: note.what }] } });
    reportPlan.push({ requires: [op], when: 'rejected', value: { ...empty(), setAside: [{ name: note.aside, why: note.pileId === null ? NOTE_NOT_WRITTEN : WORDS_NOT_WRITTEN }] } });
  }
  // A model's line cites the name its thing or note was given (a free name when the one asked for was taken): its
  // note's text is authored again with it, by `applyChanges` as before; one that cannot be cites nothing.
  const recited = new Set<WantedLine>();
  for (const { line, cites } of modelLines) {
    const made = madeAs.get(cites);
    if (made === undefined || citeName(made) === line.entry.source) continue;
    line.entry.source = citeName(made);
    recited.add(line);
  }
  for (const edit of recited.size ? edits : []) {
    const mine = [...recited].filter((l) => edit.changes.some((c) => c.kind === 'timeline-append' && c.entries.includes(l.entry)));
    if (!mine.length) continue;
    let result = applyChanges(edit.bytes, edit.changes);
    if (!result.ok) {
      console.error(`A note's Timeline line could not cite the name its thing was given (${result.reason}); it cites nothing`);
      for (const l of mine) l.entry.source = null;
      result = applyChanges(edit.bytes, edit.changes);
    }
    if (!result.ok) throw new BowerError('unknown', B_FAILURE);
    edit.text = result.text;
  }
  // After the filing moves, each note edit (TL-P2-20), then the merges whose moves depend on their line. A Timeline
  // line's note is marked new in place after its edit, and gets its updated row once it applied.
  for (const edit of edits) {
    // A line citing a thing filed by this run waits for that thing's move (C06).
    const cited = edit.after.flatMap((id) => moveOf.get(id) ?? []);
    const beforeText = edit.keeps.length ? { beforeText: new TextDecoder().decode(edit.bytes) } : {};
    const op = await add({ kind: 'edit-text', before: seen(edit.file), path: edit.path, beforeContent: edit.before, changes: edit.changes, text: edit.text, content: await utf8(edit.text), ...beforeText }, cited);
    editOf.set(edit.file.id, op);
    for (const answer of edit.keeps) derive(answer, op);
    for (const id of edit.changes.flatMap((c) => (c.kind === 'rules-wording' ? [...c.add, ...c.remove].map((r) => r.recordId) : c.recordIds))) need(id).edits.push(op);
    // Only a Timeline line marks a note new (m3); a link fix never does.
    const appended = edit.changes.reduce((n, c) => n + (c.kind === 'timeline-append' ? c.entries.length : 0), 0);
    // A line's row says how the note is as the run leaves it: the edit's bytes, and the stamp of its last write there,
    // the New mark's (`write-once`), so the screen marks the line only while the note is still so (addendum 5).
    const left = appended ? { lines: appended, md5: md5Hex(new TextEncoder().encode(edit.text)), stamp: stampOf(opts.runId, await add({ kind: 'move', before: seen(edit.file), parent: { fileId: edit.file.parents[0] ?? '' }, name: edit.file.name, properties: { bowerNew: '1' } }, [op])) } : null;
    for (const row of edit.rows) reportPlan.push({ requires: [op], when: 'applied', value: { ...empty(), updated: [{ path: edit.path, what: row.what, op, ...(row.line === undefined || left === null ? {} : { line: row.line, ...left }) }] } });
  }
  // What a disagreement's answer derives (R4-1): its Timeline line, which the question's removal waits for.
  for (const [id, a] of answerLines) {
    const op = lineState.get(a.line) === 'planned' ? editOf.get(a.fileId) : undefined;
    if (op) derive(id, op);
  }
  for (const f of filing.filter((x) => x.merge)) await fileOne(f);
  // The other note of each keep goes to the Bin (never deleted), once the kept note and every link to it are written;
  // the report says so in one line on the kept note, and the answer's question goes once it is done (R4-1).
  for (const x of keeping) {
    const written = [...need(x.k.answer).derived];
    const op = await add({ kind: 'bin', before: seen(x.other), capturedChildIds: [] }, written);
    derive(x.k.answer, op);
    // Grounded by the kept note's edit first, then the link rewrites, then the Bin (`grounded`); with nothing new to
    // write on the kept note there is no edit to ground it, and the Bin says it alone.
    const keptEdit = editOf.get(x.kept.id);
    // The other note changed after it was read (the Bin checks its modifiedTime): it stays, and so does the question.
    reportPlan.push({ requires: [op], when: 'rejected', value: { ...empty(), setAside: [{ name: displayName(nameOf(x.k.other)), why: KEEP_CHANGED }] } });
    if (keptEdit) reportPlan.push({ requires: [keptEdit, ...written.filter((w) => w !== keptEdit), op], when: 'applied', value: { ...empty(), updated: [{ path: ix.pathOf(x.kept.id) ?? x.k.kept, what: keptLine(displayName(nameOf(x.k.other))), op: keptEdit }] } });
  }
  // Things already saved go to the Bin (never deleted), a copy of this run's thing after that one's move; each is
  // reported as already saved under the name of the file it copies, and gets no note and no line.
  const savedBins: Array<{ s: (typeof saved)[number]; op: string }> = [];
  for (const s of saved) {
    const kept = s.dup.of === 'run' ? s.dup.keptId : null;
    const after = kept === null ? undefined : moveOf.get(kept);
    const as = s.dup.of === 'filed' ? s.dup.file.name : filing.find((f) => f.thing.file.id === kept)?.name;
    if (as === undefined || (kept !== null && after === undefined)) return refused('a copy of a thing the run does not file');
    const op = await add({ kind: 'bin', before: seen(s.file), capturedChildIds: [] }, after ? [after] : []);
    movesOf.set(s.pile.id, [...(movesOf.get(s.pile.id) ?? []), op]);
    savedBins.push({ s, op });
    reportPlan.push({ requires: [op], when: 'applied', value: { ...empty(), alreadySaved: [{ name: s.file.name, as }] } });
    reportPlan.push({ requires: [op], when: 'rejected', value: { ...empty(), setAside: [{ name: s.file.name, why: SAVED_STAYS }] } });
  }
  // A pile of words whose news went onto notes as Timeline lines: its context note and folder go to the Bin once those
  // notes' edits are written; an edit refused leaves the pile in the inbox, whole, for the next tidy-up (as any line
  // refused while it is written, it has no row of its own).
  const wordsLines = new Map<string, string[]>();
  /** The Bin a pile of words already saved is reported by: its pile note's, or (none bound) its folder's. */
  const savedWordsBin = new Map<string, string>();
  for (const [pileId, w] of citedWords) {
    const lines = [...w.notes].flatMap((id) => editOf.get(id) ?? []);
    wordsLines.set(pileId, lines);
    const context = w.context ? await add({ kind: 'bin', before: seen(w.context), capturedChildIds: [] }, lines) : null;
    if (context !== null && savedWords.has(pileId)) {
      savedWordsBin.set(pileId, context);
      wordsLines.set(pileId, [context]);
    }
    // Filed as the note its news went into (the first, when it went into more than one), once every such edit applied.
    const into = edits.find((e) => editOf.get(e.file.id) === lines[0]);
    if (into) reportPlan.push({ requires: lines, when: 'applied', value: { ...empty(), filed: [{ name: 'Your note', title: displayName(nameOf(into.path)), kind: 'note', to: parentOf(into.path), note: into.path }] } });
  }
  for (const pile of capturedPiles) {
    const note = notesOf.get(pile.pileId);
    // A pile partly asked about keeps its folder, with what is asked about and its words.
    if (!pile.anchor || partly.has(pile.pileId)) continue;
    const op = await add({ kind: 'bin', before: pile.anchor, capturedChildIds: pile.childFileIds }, [...(movesOf.get(pile.pileId) ?? []), ...(note ? [note] : []), ...(wordsLines.get(pile.pileId) ?? [])]);
    if (savedWords.has(pile.pileId) && !savedWordsBin.has(pile.pileId)) savedWordsBin.set(pile.pileId, op);
  }
  // A pile of words already saved (`duplicates.ts`): reported as a copy is, by its folder's name and the note it is
  // saved as; its Bin refused, it stays in the inbox, and says so.
  for (const [pileId, op] of savedWordsBin) {
    const w = citedWords.get(pileId);
    const as = savedWords.get(pileId);
    if (!w || !as) continue;
    reportPlan.push({ requires: [op], when: 'applied', value: { ...empty(), alreadySaved: [{ name: w.folder.name, ...as }] } });
    reportPlan.push({ requires: [op], when: 'rejected', value: { ...empty(), setAside: [{ name: w.folder.name, why: SAVED_STAYS }] } });
  }
  // Your changes: requests completed in requests.json, answered questions dropped, then each line archived.
  // A line's archive move depends on every write derived from it, so a rejected write keeps it unarchived.
  const asked = journal.filter((l) => l.rec.kind === 'request');
  let requestsOp: string | null = null;
  if (asked.length) {
    const done: Request[] = [...asked].reverse().map((l) => ({ id: l.rec.id, text: l.rec.text ?? l.rec.what, at: l.rec.at, done: answers.get(l.rec.id) ?? REQUEST_DONE }));
    // A comparison's note, before the answer that links it; claimed by its one created row (C08).
    const notes: string[] = [];
    for (const l of asked) {
      const note = compared.get(l.rec.id);
      if (!note) continue;
      const op = await add({ kind: 'create-text', parent: targetOf(note.to), name: note.name, createKey: newKey('note'), text: note.text, content: await utf8(note.text), purpose: 'generated' });
      reportPlan.push({ requires: [op, ...chainOf(note.to)], when: 'applied', value: { ...empty(), created: [{ path: join(note.to, note.name), what: note.what }] } });
      notes.push(op);
    }
    // An answer that names what a request did is written once that is done (a lookup's Timeline line, a note).
    const answered = [...new Set([...asked.flatMap((l) => need(l.rec.id).edits), ...notes])];
    // A request done before (its line not archived then) keeps one row: the new one.
    const again = new Set(done.map((r) => r.id));
    const text = `${JSON.stringify({ v: 1, done: [...done, ...requestsDone.filter((r) => !again.has(r.id))].slice(0, 20) } satisfies RequestsFile, null, 2)}\n`;
    if (requestsRead) {
      if (requestsBroken) console.error(new BowerError('unknown', REQUESTS_REPLACED), `${SYSTEM.requests} is not a valid requests file`);
      requestsOp = await add({ kind: 'write-runner-json', before: seen(requestsRead.file), beforeContent: requestsRead.content, path: SYSTEM.requests, text, content: await utf8(text) }, answered);
    } else {
      // Your changes live in `.bower`, so it is there; made again without it would leave the requests undone.
      if (!sys?.folder) throw new BowerError('unknown', OWN_FILES);
      requestsOp = await add({ kind: 'create-text', parent: { fileId: sys.id }, name: nameOf(SYSTEM.requests), createKey: newKey('runner'), text, content: await utf8(text), purpose: 'runner-json' }, answered);
    }
  }
  let questionsOp: string | null = null;
  if (questionsText !== null) {
    // It waits for every operation derived from the answers it drops (R4-1), so a question stays until its work is done,
    // and for the moves of the piles its new question is about, so it is asked once they are filed.
    const derived = [
      ...journal.flatMap((l) => (l.rec.kind === 'answer' ? need(l.rec.id).derived : [])),
      ...(fresh.length ? [...asking.keys()].flatMap((id) => movesOf.get(id) ?? []) : []),
      // A disagreement is asked once the note it links is written (C07).
      ...disagreeing.filter((d) => fresh.some((q) => q.id === d.question.id)).flatMap((d) => notesOf.get(d.pileId) ?? []),
      // A question about a saved copy (by its id, its pile's or its content) closes once its Bin is done: a refused Bin
      // leaves the thing in the inbox, and its question open (P4-17).
      ...savedBins.filter(({ s }) => closing.some((q) => related(subjectKey(q), s.file.id) || sameContent(q, { hash: s.file.md5Checksum }))).map(({ op }) => op),
    ];
    if (questionsRead) {
      questionsOp = await add({ kind: 'write-runner-json', before: seen(questionsRead.file), beforeContent: questionsRead.content, path: SYSTEM.questions, text: questionsText, content: await utf8(questionsText) }, derived);
    } else if (sys?.folder) {
      questionsOp = await add({ kind: 'create-text', parent: { fileId: sys.id }, name: nameOf(SYSTEM.questions), createKey: newKey('runner'), text: questionsText, content: await utf8(questionsText), purpose: 'runner-json' }, derived);
    }
    // The question's row is grounded by that one write, with the same fields (contract B).
    if (questionsOp && fresh.length) reportPlan.push({ requires: [questionsOp], when: 'applied', value: { ...empty(), questions: fresh.map(reportRowOf) } });
  }
  // Rules.md made from the template's empty one when it is missing (R3-4); every rule line it words waits for it.
  // When it is there, its rules are worded by its one note edit above, which their archives wait for (rule 7).
  const rulesMade = rules.made !== null
    ? await add({ kind: 'create-text', parent: { fileId: rootId }, name: RULES_PATH, createKey: newKey('rules'), text: rules.made, content: await utf8(rules.made), purpose: 'generated' })
    : null;
  // Every rule line Rules.md is made to word waits for it, in the one map (`needs`).
  if (rulesMade) for (const r of ruleWords.change?.add ?? []) derive(r.recordId, rulesMade);
  const rulesOp = rulesMade ?? (rulesState === 'planned' && rulesFile ? editOf.get(rulesFile.id) ?? null : null);
  const archiveChain: string[] = [];
  let archiveTo: Target | null = archiveFolder ? { fileId: archiveFolder.id } : null;
  if (journal.length && !archiveTo && changesFolder) {
    const made = await add({ kind: 'create-folder', parent: { fileId: changesFolder.id }, name: nameOf(SYSTEM.archive), createKey: newKey('folder') });
    archiveChain.push(made);
    archiveTo = { createdBy: made };
  }
  /** What each record's archive waits for: the plan's `needs`. */
  const archives = new Map<string, readonly string[]>();
  for (const line of journal) {
    // Unreachable: a captured line has its changes folder, so its archive is there or planned above.
    if (!archiveTo) throw new BowerError('unknown', OWN_FILES);
    const write = line.rec.kind === 'request' ? requestsOp : line.rec.kind === 'answer' ? questionsOp : null;
    const n = need(line.rec.id);
    const derived = [...new Set([...(write ? [write] : []), ...n.edits, ...n.derived])];
    archives.set(line.rec.id, derived);
    const moves: string[] = [];
    for (const f of line.files) moves.push(await add({ kind: 'move', before: seen(f), parent: archiveTo, name: f.name, properties: {} }, derived));
    if (rulesOp && rules.worded.has(line.rec.id)) {
      // A rule this run words: counted once it and its line's archive applied.
      reportPlan.push({ requires: [rulesOp, ...moves, ...archiveChain], when: 'applied', value: { ...empty(), rulesWorded: 1 } });
    } else if (line.rec.kind === 'request' && requestsOp) {
      reportPlan.push({ requires: [requestsOp, ...moves, ...archiveChain], when: 'applied', value: { ...empty(), requests: [line.rec.text ?? line.rec.what] } });
    } else {
      // A rule taken out or already there is a rule record, not one of your other changes (TL-P2-23, TL-P2-33 §3).
      // An answer whose subject was gone says so in its answered row, never as a thing set aside.
      const gone = answeredRows.get(line.rec.id);
      reportPlan.push({ requires: [...moves, ...archiveChain], when: 'applied', value: { ...empty(), yourChanges: line.rec.kind === 'rule' ? 0 : 1, ...(gone ? { answered: [gone] } : {}) } });
    }
  }

  // `.bower/hashes.json` only on a full run, as the legacy runner wrote it.
  if (hashesNew) {
    const { text } = hashesNew;
    const after = [...movesOf.values()].flat();
    if (hashesFile && hashesNew.before) {
      if (hashesBroken) console.error(new BowerError('unknown', HASHES_REPLACED), `${SYSTEM.hashes} is not a valid hashes file`);
      await add({ kind: 'write-runner-json', before: seen(hashesFile), beforeContent: hashesNew.before, path: SYSTEM.hashes, text, content: await utf8(text) }, after);
    } else if (!hashesFile && sys?.folder) {
      await add({ kind: 'create-text', parent: { fileId: sys.id }, name: nameOf(SYSTEM.hashes), createKey: newKey('runner'), text, content: await utf8(text), purpose: 'runner-json' }, after);
    } else if (!hashesFile) {
      // No `.bower` yet: the run's own records make it, and the next full run writes the list there.
      console.error(`${SYSTEM.dir} is missing; ${SYSTEM.hashes} is written by the next full run`);
    }
  }

  const head = {
    kind: 'run-manifest' as const, scope, runId: opts.runId, requestId: opts.requestId, runScope: opts.scope,
    allowWeb: opts.allowWeb, requestedAt: opts.requestedAt, captureId, capture: captureValue, reportPlan,
  };
  // v1 whenever the plan has no edit (TL-P2-20 Format): its identities and bytes are exactly as before.
  const v1: Operation[] = operations.flatMap((o) => (o.effect.kind === 'edit-text' ? [] : [{ ...o, effect: o.effect }]));
  const manifest: Manifest | ManifestV2 = v1.length === operations.length ? { v: 1, ...head, operations: v1 } : { v: 2, ...head, operations };
  const checked = await parseRunManifestV2((await canonical(manifest)).bytes, rootId, RUNNER_WRITES);
  if (!checked.ok) {
    // Past the guard's own size limit: the last edit in path order waits for the next run, and the run is planned again.
    if (checked.reason === 'edit' && checked.rule === 'size' && edits.length) return tryAgain({ editCap: edits.length - 1, held });
    return refused(`the manifest guard refused the plan (${checked.reason}${checked.reason === 'edit' ? `: ${checked.rule}` : ''})`);
  }
  if (!grounded(manifest) || !(await groundedKeys(manifest))) return refused('the plan has report rows its effects do not ground');
  return { kind: 'plan', plan: { path: 'b', manifest, needs: archives } };
}

/** A step's end that plans again with more held back (`Attempt`). */
const tryAgain = (attempt: Attempt): Ended => ({ kind: 'again', attempt });

/**
 * The plan of an admitted full run that finds every pile it took held, and none of your changes: nothing captured,
 * no operation, no report row. Its report says nothing was ready yet (`materialize`).
 */
async function nothingReadyPlan(rootId: string, opts: PlanOptions): Promise<RunPlan> {
  const scope = { rootId };
  const capture: ManifestCapture = { piles: [], members: [], journal: [], places: [] };
  const captureId = (await canonical({ scope, runScope: opts.scope, capture })).hash;
  const manifest: Manifest = {
    v: 1, kind: 'run-manifest', scope, runId: opts.runId, requestId: opts.requestId, runScope: opts.scope,
    allowWeb: opts.allowWeb, requestedAt: opts.requestedAt, captureId, capture, reportPlan: [], operations: [],
  };
  const checked = await parseRunManifestV2((await canonical(manifest)).bytes, rootId, RUNNER_WRITES);
  if (!checked.ok) return refused(`the manifest guard refused the plan (${checked.reason})`);
  return { path: 'b', manifest, needs: new Map() };
}

/**
 * A plan Bower's own checks refuse fails closed (TL-P2-37 Q2, TL-P2-38): refused before admission and any effect,
 * with no other path to run on, the way a failed check denies (OWASP, Fail securely).
 */
function refused(why: string): never {
  const e = new BowerError('unknown', B_FAILURE);
  console.error(e, `A tidy-up was refused before admission: ${why}`);
  throw e;
}

/** A journal line as a B run captures it: the record, every file it was written to, and their one digest. */
type JournalLine = { rec: JournalRecord; files: DriveFile[]; sha256: string };

/**
 * Your changes since the last tidy-up, each once by its id with all its
 * files, when every one can take the B path: a request (completed in
 * requests.json), an answer (dropped from questions.json), a rule (worded
 * in Rules.md), a change that needs nothing but archiving, or a rename or a
 * move (archived after the link rewrites it needs). Your changes are never replaced or discarded (TL-P2-23): a line
 * that cannot be read, a line whose copies differ and a line in more than
 * one place stay where they are, uncaptured, with one BowerError for all of
 * them; the run goes on with the rest. At most the 20 oldest requests are
 * taken; the others wait for the next run. A Drive read failure refuses the
 * plan before admission.
 */
async function journalOf(drive: ScriptedRead, ix: VaultIndex): Promise<JournalLine[]> {
  const copies = new Map<string, Array<{ rec: JournalRecord; file: DriveFile; sha256: string }>>();
  let left = 0;
  for (const f of ix.journalFiles()) {
    if (f.folder || !f.name.endsWith('.json')) continue;
    let rec: unknown;
    const text = await ownText(drive, f);
    try {
      rec = JSON.parse(text);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(`Journal file ${f.id} is not valid JSON`);
      left++;
      continue;
    }
    let digest: Digest | null;
    try {
      digest = await drive.digest(f);
    } catch (e) {
      // A Drive read that fails refuses the run before admission (TL-P2-17, TL-P2-33 §1).
      console.error(e);
      throw new BowerError('unknown', OWN_FILES);
    }
    // A line whose id no run record can carry (a control character, past 1024 bytes, half a character) stays.
    if (!isJournalRecord(rec) || !recordableRecordId(rec.id) || !digest) {
      left++;
      continue;
    }
    copies.set(rec.id, [...(copies.get(rec.id) ?? []), { rec, file: f, sha256: digest.sha256 }]);
  }
  const lines: JournalLine[] = [];
  for (const [, all] of copies) {
    const [first] = all;
    if (!first || all.some((c) => c.sha256 !== first.sha256 || c.file.parents.length !== 1)) {
      left += all.length;
      continue;
    }
    lines.push({ rec: first.rec, files: all.map((c) => c.file), sha256: first.sha256 });
  }
  lines.sort((a, b) => a.rec.at - b.rec.at || a.rec.id.localeCompare(b.rec.id));
  if (left) console.error(new BowerError('unknown', JOURNAL_LEFT), `${left} journal files left uncaptured`);
  const requests = lines.filter((l) => l.rec.kind === 'request').slice(0, REQUESTS_PER_RUN);
  return lines.filter((l) => l.rec.kind !== 'request' || requests.includes(l));
}

type RulesWording = Extract<Change, { kind: 'rules-wording' }>;

/**
 * Your rule lines as one `rules-wording` change (TL-P2-20, TL-P2-26), removals and adds alike; a line whose words
 * cannot be worded is `left` pending, uncaptured, with one BowerError.
 */
function ruleChangesOf(lines: readonly JournalLine[], wordRule: (words: string) => string): { change: RulesWording | null; left: ReadonlySet<string> } {
  const left = new Set<string>();
  const add: RuleAdd[] = [];
  const remove: RuleRemove[] = [];
  for (const { rec } of lines) {
    if (rec.kind !== 'rule') continue;
    if (rec.removes) {
      const out: RuleRemove = { recordId: rec.id, text: rec.removes };
      if (ruleRemoveOk(out)) remove.push(out);
      else left.add(rec.id);
      continue;
    }
    const words = rec.text ?? rec.what;
    const worded: RuleAdd = { recordId: rec.id, text: wordRule(words), yourWords: words, since: rec.at };
    if (ruleAddOk(worded)) add.push(worded);
    else left.add(rec.id);
  }
  if (left.size) console.error(`${left.size} rule lines cannot be worded`);
  return { change: add.length || remove.length ? { kind: 'rules-wording', add, remove } : null, left };
}

/**
 * A rules change whose removals read as the rules will after a link rewrite with these renames: each removal's text
 * goes through that very rewrite (`applyChanges`, the one author), as the rule line it names in Rules.md does.
 */
function relinkedRemovals(change: RulesWording, renames: Rename[]): RulesWording {
  const relinked = (text: string): string => {
    const result = applyChanges(new TextEncoder().encode(`- ${text}`), [{ kind: 'link-rewrite', recordIds: [], renames }]);
    return result.ok ? result.text.slice(2) : text;
  };
  return { ...change, remove: change.remove.map((r) => ({ ...r, text: relinked(r.text) })) };
}

/**
 * The rule lines an applied change words, as `applyChanges` decides them: removals first, then each add unless it
 * repeats a rule (an add that repeats one is satisfied and not counted). Null when the text after it would not hold
 * exactly those rules (R3-4: what is counted is what the written text holds).
 */
function wordedBy(before: string, change: RulesWording, after: string): ReadonlySet<string> | null {
  const removed = new Set(change.remove.map((r) => r.text));
  const known = parseRules(before).filter((r) => !removed.has(r.text));
  const kept = known.length;
  const worded = new Set<string>();
  for (const a of [...change.add].sort((x, y) => x.since - y.since)) {
    if (ruleLike(known, a.text) || (a.yourWords.trim() && ruleLike(known, a.yourWords))) continue;
    known.push({ id: '', text: a.text, yourWords: a.yourWords, since: a.since });
    worded.add(a.recordId);
  }
  return parseRules(after).length === kept + worded.size ? worded : null;
}

/**
 * How a run words your rules. `worded` are the lines whose rule is written (each archive waits for that write, in
 * `needs`), `left` the lines that stay pending, uncaptured: a line whose words cannot be worded, or every rule
 * line when Rules.md is not Bower's, is damaged, too big, changed while read or past the edit cap (rule 7). `made`
 * is Rules.md's text when it is missing: authored by `applyChanges` on the template's empty one (R3-4).
 */
type RulesPlan = { worded: ReadonlySet<string>; left: ReadonlySet<string>; made: string | null };

function rulesPlanOf(
  words: { change: RulesWording | null; left: ReadonlySet<string> }, file: DriveFile | undefined,
  state: 'planned' | 'present' | 'left', worded: ReadonlySet<string>,
): RulesPlan {
  const plan = rulesPlanBy(words, file, state, worded);
  // One BowerError for every rule line left pending, whatever kept it (rule 7).
  if (plan.left.size) console.error(new BowerError('unknown', RULES_LEFT), `${plan.left.size} rule lines wait for the next tidy-up`);
  return plan;
}

function rulesPlanBy(
  words: { change: RulesWording | null; left: ReadonlySet<string> }, file: DriveFile | undefined,
  state: 'planned' | 'present' | 'left', worded: ReadonlySet<string>,
): RulesPlan {
  const { change, left } = words;
  const ids = change ? [...change.add, ...change.remove].map((r) => r.recordId) : [];
  const none: RulesPlan = { worded: new Set(), left, made: null };
  if (!change) return none;
  if (file?.folder) {
    console.error(`${RULES_PATH} is a folder`);
    return { ...none, left: new Set([...left, ...ids]) };
  }
  if (file) {
    if (state === 'planned') return { worded, left, made: null };
    // Every rule there already and none to take out: nothing to write, and each line is satisfied as it is.
    if (state === 'present') return none;
    return { ...none, left: new Set([...left, ...ids]) };
  }
  // A missing Rules.md has no rule to take out; it is made only to word new ones.
  if (!change.add.length) return none;
  const empty = serializeRules([]);
  const adds: RulesWording = { ...change, remove: [] };
  const result = applyChanges(new TextEncoder().encode(empty), [adds]);
  const made = result.ok ? wordedBy(empty, adds, result.text) : null;
  if (!result.ok || !made) {
    console.error(`${RULES_PATH} could not be made (${result.ok ? 'count' : result.reason})`);
    return { ...none, left: new Set([...left, ...change.add.map((r) => r.recordId)]) };
  }
  return { worded: made, left, made: result.text };
}

const RULES_PATH = 'Rules.md';
const RULES_LEFT = 'Bower could not word some of your rules; they wait for the next tidy-up.';

/** Requests a run takes at most, the oldest first: requests.json keeps the last 20 done. */
const REQUESTS_PER_RUN = 20;
/**
 * Note edits a run plans at most, in path order (TL-P2-29 (1)); fewer when the manifest would pass the guard's
 * 8 MiB. Nothing is written for the rest; they stay as they are and the next run plans them.
 */
const EDITS_PER_RUN = 8;
/** The fake Worker's refusal of a full run with nothing in the inbox (409). */
const NOTHING_WAITING = 'Nothing is waiting in the inbox.';
/** The fake Worker's refusal of an instructions run with nothing new (409). */
const NOTHING_TO_READ = 'There is nothing new for Bower to read.';
/** The same refusal of a full run when every waiting pile is held for readiness (409 `nothing`, TL-P2-21). */
const NOTHING_READY = 'Nothing in the inbox is ready yet.';
const JOURNAL_LEFT = 'Bower could not read some of your changes; they stay for the next tidy-up.';
const QUESTIONS_REPLACED = 'Bower replaced its list of questions, which it could not read.';
const NOT_ASKED = 'Bower could not ask its question this time.';

/** questions.json's text, as the runner writes it. */
function questionsJson(questions: Question[]): string {
  return `${JSON.stringify({ v: 1, questions } satisfies QuestionsFile, null, 2)}\n`;
}
const REQUESTS_REPLACED = 'Bower replaced its list of done requests, which it could not read.';
const HASHES_REPLACED = 'Bower replaced its list of your files, which it could not read.';
/** A run refused before admission because one of Bower's own files could not be read (TL-P2-17). */
export const OWN_FILES = "Bower couldn't read its own files. Try again.";

/** A runner file's text; a Drive read that fails refuses the run before admission and any effect (TL-P2-17). */
async function ownText(drive: ScriptedRead, f: DriveFile): Promise<string> {
  try {
    return await drive.readText(f.id);
  } catch (e) {
    console.error(e);
    throw new BowerError('unknown', OWN_FILES);
  }
}

/** A text's content as contract B describes it: its exact UTF-8 size and SHA-256. */
async function utf8(text: string): Promise<{ encoding: 'utf8'; size: number; sha256: string }> {
  const raw = new TextEncoder().encode(text);
  return { encoding: 'utf8', size: raw.byteLength, sha256: await sha256(new Blob([raw])) };
}

/** The line a request done by a tidy-up carries in requests.json. */
export const REQUEST_DONE = 'Done. See what changed in your folders.';

/** Logged when a pile holds text no run record can carry: it waits in the inbox. */
const NOT_WRITABLE = 'Bower could not write down one of your piles; it stays in your inbox.';

/** Why a filed thing has no note of its own (TL-P2-34): its note was not written; nothing writes it later. */
/** Why a thing already saved stays (review P4-17): it or its copy changed before its Bin, so the next run looks again. */
export const SAVED_STAYS = 'It stays in your inbox: it changed, or its saved copy did, before Bower got to it.';
export const NOTE_NOT_WRITTEN = "Bower couldn't write its note.";
/** Why a pile of words stays in the inbox (its generated note was not written). */
export const WORDS_NOT_WRITTEN = 'Bower could not write a note from it, so it stays in your inbox.';

/** Where a generated note may go (TL-P2-17): under a main folder; never Inbox, `.bower/` or the root. */
const MAIN_FOLDERS: readonly string[] = PARA_ROOTS.filter((root) => root !== 'Inbox');
function generatedPlace(to: string): boolean {
  return MAIN_FOLDERS.includes(to.split('/')[0] ?? '');
}

/**
 * A comparison's note (C08): a GFM table (https://github.github.com/gfm/#tables-extension-), one row per note with
 * its rent, commute and status as that note says them, then the list of those notes as its sources. A cell never
 * holds a pipe, which would end it.
 */
function comparisonNote(notes: readonly ParsedNote[], what: string, date: string): string {
  const cell = (value: string | undefined): string => (value ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const prop = (n: ParsedNote, key: string): string | undefined => n.properties.find((p) => p.key === key)?.value;
  const rows = notes.map((n) => `| [[${n.title}]] | ${cell(prop(n, 'rent'))} | ${cell(prop(n, 'commute'))} | ${cell(n.status)} |`);
  const body = ['| Flat | Rent | Commute | Status |', '| --- | --- | --- | --- |', ...rows, '', '## Sources', '', ...notes.map((n) => `- [[${n.title}]]`)].join('\n');
  return serializeNote({ summary: what, properties: [{ key: 'kind', label: 'Kind', value: 'Comparison' }], tags: [], currentState: [], body, timeline: [{ date, text: 'Written for a request you made.' }], byBower: true });
}

/** A generated note's name from its authored title, by the Inbox's naming rules, as `.md`. */
export function generatedName(title: string): string {
  // Control characters (a line break in the words) never reach a name: the manifest refuses them (C0 and DEL).
  const plain = [...title].map((char) => (char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f ? ' ' : char)).join('');
  // Cut by whole characters (grapheme clusters), never inside one: half an emoji is no text a record can carry.
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(plain.replace(/[:*?"<>|]+/g, ' ').replace(/\s+/g, ' '))];
  const safe = graphemes.slice(0, 48).map((g) => g.segment).join('').trim();
  return `${safeInboxName({ name: safe, kind: 'note' })}.md`;
}


/**
 * A Timeline line a run wants: its entry, the journal record it comes from (a merge's answer), its note's updated row
 * wording, and the captured file whose move it waits for (the thing it cites).
 */
type WantedLine = { entry: EditEntry; record: string | null; what: string | null; after: string | null };
/** What one of your changes needs: to wait whole, the Timeline lines it adds, the edits naming it and what derives from it. */
type Need = { held: boolean; lines: WantedLine[]; edits: string[]; derived: string[] };
/** What a run wants to change in one note, before applyChanges decides what it may. */
type Wanted = { file: DriveFile; path: string; lines: WantedLine[]; renames: Rename[] | null; rules: RulesWording | null; state: WantedState | null };
/** A Current state a model wrote for a note (C05): its lines, the name it cites and the thing whose move it waits for. */
type WantedState = { lines: string[]; source: string | null; thing: string | null };
type StateRewrite = Extract<Change, { kind: 'state-rewrite' }>;
/** The id of the folder's one question about summaries Bower did not write (TL-P4-10 point 3). */
export { ADOPT_STATES_ID };
/** A thing joining a note you said yes to keeping (MERGES), with the answer that says so. */
type Merge = { into: string; title: string; line: string; answer: string };
/** Where a wanted Timeline line ended up at plan time. */
type LineState = 'planned' | 'present' | 'person' | 'refused' | 'deferred';
/** A merge filed as usual instead: the answer it settles, and the shown name of the note it could not join, if refused. */
type Fallback = { answer: string; into: string; alone: string | null };
/** A merge as planned: after its Timeline line, or beside a line already there from an earlier run. */
type MergeState = Omit<Merge, 'line'> & { line: 'planned' | 'present' };

/** The name a Timeline line cites a filed thing or note by. */
const citeName = (name: string): string => name.replace(/\.md$/i, '');
/** Paths in code-point order, the same everywhere (TL-P2-29). */
const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Whether a note may link to a former name, read leniently (any encoding, any format): a note that does but cannot
 * be rewritten keeps the rename lines unarchived. It may say yes for a link the resolver would not follow; never no
 * for one it would.
 */
function mentions(bytes: Uint8Array, renames: readonly Rename[]): boolean {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).toLowerCase();
  return renames.some((r) => {
    for (let at = text.indexOf('[['); at >= 0; at = text.indexOf('[[', at + 2)) {
      if (text.slice(at + 2).trimStart().startsWith(r.from.toLowerCase())) return true;
    }
    return false;
  });
}

/** A saved link's note: its name, its stable key, its text and its created row's wording when the run writes it (null when one is reused). */
type SavedNote = { name: string; key: string; text: string | null; what: string | null };

/** A create key, minted once and kept in the manifest; never derived from a name or a time alone. */
function mintKey(kind: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${kind}-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Only the piles the run took, each with only the things it took (TL-P3-21): what changed since waits whole. */
function tookPiles(inbox: readonly Pile[], taken: AdmissionManifest): Pile[] {
  const took = new Map(taken.piles.map((p) => [p.pileId, new Set(p.items.map((i) => i.fileId))]));
  return inbox.flatMap((pile) => {
    const ids = took.get(pile.id);
    return ids ? [{ ...pile, items: pile.items.filter((i) => ids.has(i.id)) }] : [];
  });
}

/** Only the journal lines the run took: a line with any file it did not take waits for the next run. */
function tookLines(lines: readonly JournalLine[], taken: AdmissionManifest): JournalLine[] {
  const took = new Set(taken.journal.map((j) => j.fileId));
  return lines.filter((l) => l.files.every((f) => took.has(f.id)));
}

/**
 * A run's create keys: minted from its run id, which is random per run, and the order they are asked for; so the
 * same run plans the same keys again, and no two runs share one (never derived from a name or a time alone).
 */
/** A note's text made one Timeline field: links as their shown words, no Timeline separator, one line. */
const asLineText = (text: string): string => text
  .replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => (alias ?? target).trim())
  .replace(/\s+·\s+/g, ', ').split('').map((c) => (c < ' ' || c === '\u007f' ? ' ' : c)).join('').replace(/^#+\s*|^[-*+]\s+/, '').trim();

/**
 * What the other note of a keep brings to the kept one (C05): its properties the kept note lacks or says otherwise
 * ("Rent: ..."), its Current state and its own words, line by line, and its Timeline lines, each saying the day it
 * happened ("From 2026-10-02: ...") with its source. A line the kept note already says is not repeated. Dated by the
 * caller (the run's day, as every line a run writes).
 */
function carriedLines(other: ParsedNote, kept: ParsedNote): EditEntry[] {
  // Whole lines only, compared as they would be written: a line the kept note says as part of a longer one is carried.
  const same = (text: string): string => asLineText(text).replace(/\s+/g, ' ').toLowerCase();
  const said = new Set([
    ...kept.properties.map((p) => `${p.label}: ${p.value}`),
    ...kept.currentState, ...kept.body.split('\n'), ...kept.timeline.map((t) => t.text),
  ].map(same).filter(Boolean));
  const out: EditEntry[] = [];
  const add = (text: string, source: string | null): void => {
    const line = asLineText(text);
    const src = source !== null && /^[^\]|#^\r\n]+$/.test(source) ? source : null;
    if (line && !said.has(same(line)) && !out.some((e) => same(e.text) === same(line))) out.push({ date: '', text: line, source: src });
  };
  for (const p of other.properties) add(`${p.label}: ${p.value}`, null);
  for (const line of other.currentState) add(line, null);
  for (const line of other.body.split('\n')) add(line, null);
  for (const t of other.timeline) add(`From ${t.date}: ${t.text}`, t.source ?? null);
  return out;
}

export async function runKeys(runId: string): Promise<(kind: string) => string> {
  const base = (await sha256(new Blob([new TextEncoder().encode(`bower-create-key\n${runId}`)]))).slice(0, 20);
  let n = 0;
  return (kind) => `${kind}-${base}${(++n).toString(16).padStart(4, '0')}`;
}

/** Who a scripted run is: its folder, its id, and whether it may look things up on the web. */
export interface ScriptedRun {
  rootId: string;
  runId: string;
  allowWeb: boolean;
}
