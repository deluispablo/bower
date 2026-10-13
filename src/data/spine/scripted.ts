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
import { createOwnershipContext, type OwnershipContext } from '../contracts/ownership-format';
import { UNCONFIRMED_WRITE_MESSAGE, type DriveFile } from '../drive/drive-api';
import { ADOPT_STATES_ID, ADOPT_STATES_QUESTION, ADOPT_STATES_RULE, STATE_UPDATED, applyChanges, profileTextOk, ruleSequence, KEEP_CHANGED, keptLine, currentStateOf, renameOk, renamesFor, ruleAddOk, ruleRemoveOk, savedLinkKey, stateMark, stateMarkOf, stateNewsLine, timelineDate, personalTimelineRefusal } from '../contracts/note-edit';
import { canonicalRecordJson } from '../contracts/record-json';
import { parseRunManifestV2, recordableId, recordableRecordId, type Capture as ManifestCapture, type CapturedMember, type CapturedPile, type Change, type EditEntry, type EffectV2, type Manifest, type ManifestRunReport, type ManifestV2, type Operation, type OperationV2, type Rename, type ReportContribution, type RuleAdd, type RuleRemove, type Target, type VerifiedContent, type TimelineConsent, type AppendCompletion, type LeftAsWritten, type SatisfiedAppend } from '../contracts/run-manifest';
import { PILE_NOTE, safeInboxName } from '../piles';
import { recordablePile, sameText, type Digest } from '../pile-readiness';
import { checkCreationName, displayName, freeName, join, kindOf, nameOf, parentOf, thingName } from '../tree';
import { BowerError, PARA_ROOTS, type Pile, type PileItem, type Question, type Request, type StateShown, type Proposal } from '../types';
import { isJournalRecord, pairsOf, type JournalRecord } from '../contracts/journal-record';
import { PROP, RUNNER_WRITES, SYSTEM, isRunnerFile, type HashesFile, type QuestionsFile, type RequestsFile } from '../vault/layout';
import { ruleLike } from '../rules';
import { savedLinkAddress } from '../search-text';
import { md5Hex } from '../contracts/hashes';
import { proposalOk, isQuestionOption, answeredAskings, answersAsking, journalAnswer, roundFor, relatedSubjects, sameSubjectContent, subjectMembers, subjectPile, type QuestionRound, ASK_GONE, STATE_ASK, STATE_ASK_AGAIN, answeredGone, answeredState, askId, stateNotWritten, binnedPairNote, openQuestions, pairQuestionId, reportRowOf, stateQuestionId, subjectKey, subjectLeft, subjectOf, type InboxSeen, type NotesSeen } from '../contracts/questions';
import { sha256 } from '../vault/hashes';
import { indexedFront, parseNote, serializeNote, timelineBullets, type ParsedNote } from '../vault/note-format';
import { linkTarget, renderLink } from '../contracts/links';
import { parseTimelineLine, timelineLine } from '../contracts/timeline-line';
import { managedRules, serializeRules } from '../vault/rules-format';
import { VaultIndex } from '../vault/vault-index';
import { grounded, groundedKeys, seen } from './grounded';
import { RunRecords, RUNS_NAME, canonical, isManifestName } from './records';
import { NOT_FILED } from './report';
import { SET_ASIDE, capturePiles, listedPiles, pileShape } from './plan';
import { duplicatesOf, wordsSaved, type Duplicate } from './duplicates';
import type { AdmissionManifest } from './admission';
import type { ScriptedRead } from './read';
import { STAMP, stampOf } from './write-once';
import { NOTE_TEMPLATES, type NoteTemplate } from '../contracts/note-templates';
import { typeRowOk, readTypeTable, propertyValuesOk, insertTypeRow, requestTableColumn, rewriteTypeTable } from '../contracts/note-format';

import { aboutContext, hasVerbatimQuote, normalizedText, observationOf, parseObservations } from '../contracts/observations';

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
  context?: OwnershipContext;
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

/** A note a request names, by its title (TL-P4-32 finding 5): `titleKey` is the normalized title it matched. */
type NamedNote = { file: DriveFile; path: string; titleKey: string };

/** Whole title references, longest overlapping match first; only admitted request words enter here. */
export function namedNotes(listing: readonly DriveFile[], ix: VaultIndex, words: string): NamedNote[] {
  const normalize = (s: string): string => s.normalize('NFC').toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/^(?:the|my)\s+/u, '');
  const request = words.normalize('NFC').toLowerCase();
  const word = (s: string | undefined): boolean => !!s && /[\p{L}\p{N}_]/u.test(s);
  const matches = listing.flatMap((file) => {
    const path = file.folder ? undefined : ix.pathOf(file.id);
    if (!path || !path.endsWith('.md') || !MAIN_FOLDERS.includes(path.split('/')[0] ?? '')) return [];
    const title = normalize(displayName(file.name));
    if (!title) return [];
    const found: Array<NamedNote & { start: number; end: number }> = [];
    for (let at = request.indexOf(title); at >= 0; at = request.indexOf(title, at + 1)) {
      if (!word([...request.slice(0, at)].at(-1)) && !word([...request.slice(at + title.length)][0])) found.push({ file, path, titleKey: title, start: at, end: at + title.length });
    }
    return found;
  }).sort((a, b) => (b.end - b.start) - (a.end - a.start) || byCodePoint(a.path, b.path));
  const kept: typeof matches = [];
  for (const m of matches) if (!kept.some((k) => m.start < k.end && m.end > k.start && (m.start !== k.start || m.end !== k.end))) kept.push(m);
  return [...new Map(kept.map((m) => [m.file.id, { file: m.file, path: m.path, titleKey: m.titleKey }])).values()];
}

/** At most this many notes in one request (TL-P4-32 finding 5). */
const NAMED_MAX = 3;
/**
 * The notes a request names and whether it is refused whole (TL-P4-32 findings 4 and 5): more than three named, or a
 * name more than one note has. The planner's context and the plan both read this one verdict.
 */
export function requestTargets(listing: readonly DriveFile[], ix: VaultIndex, words: string): { notes: NamedNote[]; refused: 'overflow' | 'ambiguous' | null } {
  const notes = namedNotes(listing, ix, words);
  const keys = notes.map((n) => n.titleKey);
  return { notes, refused: notes.length > NAMED_MAX ? 'overflow' : new Set(keys).size < keys.length ? 'ambiguous' : null };
}

/** The run result's "Left as you wrote them" whys (the designer's rows 5 to 8). */
const LEFT_AS_WRITTEN = {
  overflow: "Bower didn't update any note: this request names more than three. Ask for three at most at a time.",
  ambiguous: (folder: string): string => `In ${folder}. Bower didn't update it: more than one note has this name. Ask again with its folder.`,
  'no-timeline': "Bower didn't add the line: this note has no Timeline.",
  'unreadable-timeline': "Bower didn't add the line: it can't read this note's Timeline.",
} as const;
/**
 * The why of a request older than the oldest run Bower still keeps, with no binding or completion there (TL-P4-32
 * addendum 5 (3); the designer's row, owner OK 2026-10-10): it fails closed, with no line, and is archived.
 */
export const TOO_OLD_WHY = "Bower didn't add the line: this request is too old for Bower to know if it already did. Ask again if you still want it.";
/** A named target with no line in this run (TL-P4-32 addendum 6; the designer's owner-signed row). */
export const NOTHING_FOUND_WHY = "Bower didn't add the line: it found nothing about this note in what you added.";
/** Row 1's line, under "Brought up to date". */
const LINE_ADDED = 'One line added to its Timeline, as you asked.';

/** What earlier runs did with requests' bound lines, read only through their own verified records. */
type AppendHistory = { completed: AppendCompletion[]; lines: Array<{ consent: TimelineConsent; entry: EditEntry; applied: boolean; path: string }> };

/** Bower's run records as this listing has them, each run read through `RunRecords.found`. */
const recordsOf = (read: ScriptedRead, rootId: string, listing: readonly DriveFile[]): RunRecords => new RunRecords({
  listAll: async () => [...listing], readBytes: (id) => read.readBytes(id),
  get: async (id) => {
    const file = listing.find((f) => f.id === id);
    if (!file) throw new BowerError('not-found', 'Bower could not read what it did.');
    return file;
  } }, rootId);

/**
 * A verified checkpoint outcome is the durable completion (or pending retry) of its manifest's request binding: each run
 * is read through `RunRecords.found`, whose walk checks the first checkpoint against its originating manifest. Only the
 * run's own bindings count; nothing is carried from one manifest to the next (TL-P4-32 addendum 2 (4)).
 */
export async function personalAppendHistory(read: ScriptedRead, rootId: string, listing: readonly DriveFile[], ix: VaultIndex, requests: readonly { rec: JournalRecord; files: readonly DriveFile[] }[] = []): Promise<AppendHistory> {
  const records = recordsOf(read, rootId, listing);
  const runs = new Map<string, Set<string>>();
  for (const request of requests) if (request.rec.kind === 'request') for (const file of request.files) {
    const runId = ix.waitingRun(file.id);
    if (runId) runs.set(runId, new Set([...(runs.get(runId) ?? []), request.rec.id]));
  }
  const lines: AppendHistory['lines'] = [];
  const completed = new Map<string, AppendCompletion>();
  for (const [runId, requestIds] of runs) {
    if (!listing.some((f) => f.folder && f.name === runId && parentOf(ix.pathOf(f.id) ?? '') === RUNS_PATH)) continue;
    const found = await records.found(runId);
    if (found.kind !== 'run') throw new BowerError('unknown', 'Bower could not read what it did.');
    const head = found.chain.at(-1);
    const outcomes = head?.outcomes ?? [];
    for (const r of head?.completedAppends ?? []) if (requestIds.has(r.requestId)) completed.set(JSON.stringify([r.requestId, r.targetFileId]), r);
    for (const op of found.manifest.operations) {
      if (op.effect.kind !== 'edit-text') continue;
      const outcome = outcomes.find((o) => o.operationId === op.operationId);
      for (const c of op.effect.changes) {
        if (c.kind !== 'timeline-append' || !c.consent || !c.entries[0] || !requestIds.has(c.consent.requestId)) continue;
        const filed = found.manifest.operations.find((o) => o.effect.kind === 'move' && o.effect.before.fileId === c.consent?.sourceFileId);
        const sourceLanded = filed ? outcomes.some((o) => o.operationId === filed.operationId && o.state === 'applied')
          : found.manifest.capture.places.some((p) => p.file.fileId === c.consent?.sourceFileId);
        // The engine records this unknown rejection only after read-back says not-landed. Keep its binding
        // when the published pointer selects this run; changed/gone or unreadable effects are not retried.
        const retryable = outcome?.state === 'rejected' && (outcome.failure.code === 'conflict'
          || (outcome.failure.code === 'unknown' && outcome.failure.message === UNCONFIRMED_WRITE_MESSAGE));
        if (outcome?.state === 'applied' || (sourceLanded && retryable))
          lines.push({ consent: c.consent, entry: c.entries[0], applied: outcome.state === 'applied', path: op.effect.path });
      }
    }
  }
  return { completed: [...completed.values()], lines };
}

/** Runs Bower keeps (the runner's retention, `KEEP_FINISHED` in `runner/src/spine/retention.ts`): older ones go to the Bin. */
const RETAINED_RUNS = 20;

/** The retention horizon comes only from the kept run folders' listing, never from record content. */
function retainedSince(listing: readonly DriveFile[], ix: VaultIndex): number | null {
  const runs = listing.filter((f) => f.folder && !f.trashed && parentOf(ix.pathOf(f.id) ?? '') === RUNS_PATH);
  if (runs.length < RETAINED_RUNS) return null;
  const ages = runs.map((f) => Date.parse(f.createdTime));
  if (ages.some((at) => !Number.isFinite(at))) throw new BowerError('unknown', 'Bower could not read what it did.');
  return Math.min(...ages);
}

/** A request's bound line already in its note as read: satisfied, or appended once its source's final name differs. */
type PresentLine = { line: WantedLine; consent: TimelineConsent; file: DriveFile; path: string; bytes: Uint8Array; before: VerifiedContent };
/** A row of "Left as you wrote them", with the sources it waits for (null: every thing the run files). */
type LeftRow = LeftAsWritten & { requestId: string; sources: string[] | null };

/**
 * The one home of what a person's request causes (TL-P4-32 addendum 2 (1)): from the admitted request and the notes it
 * names, never from a model's lines, it decides which request settles now, the binding of each note to it, whether it
 * is refused whole, its "Left as you wrote them" rows, what its archive waits for, and its completion.
 * - One request per note per run (2): the oldest unfinished request naming a note settles; a younger one naming it stays
 *   in the inbox untouched.
 * - A waiting request's identity is its record id in its own RunRecords, never its filename or a title match. One older than every kept run with neither fails closed: its row, no line, and its archive.
 * - A refused request (more than three named, a name two notes share) is refused whole, by source (3): no note named
 *   is touched, and no edit in the run cites a source it files, Bower's own hubs included. A request is not tied to one
 *   pile, so every thing the run files is its source.
 * - Every named note binds at first admission, whether the model offers a line or not (addendum 6). A bound note takes
 *   one line: the model's, citing a thing filed now, or a waiting retry's, cited by its source's id as named now (6).
 *   A person's note with no Timeline, or one `timeline-line.ts` cannot read, gets its row instead; no line gets the
 *   nothing-found row. Only a clashed append carries its bound ids to another run.
 * - A line already there is satisfied only under its source's final name (6); otherwise it is appended.
 * A request settles only when every note it binds has its line written or there, or a row; otherwise it waits whole.
 */
function settleRequest(requests: readonly JournalLine[], listing: readonly DriveFile[], ix: VaultIndex, history: AppendHistory, since: number | null) {
  const done = (requestId: string, targetFileId: string): boolean => history.completed.some((h) => h.requestId === requestId && h.targetFileId === targetFileId);
  const bound = new Map<string, { requestId: string; path: string; file: DriveFile }>();
  const owned = new Set<string>();
  const admitted = new Set<string>();
  const blocked = new Set<string>();
  const rows: LeftRow[] = [];
  const sources = new Map<string, Set<string> | null>();
  // A line refused at the fence waits with its binding, still the person's consent; the next run appends it (6).
  const retries = new Map<string, { consent: TimelineConsent; entry: EditEntry }>();
  let refusesSources = false;
  for (const l of requests) {
    const id = l.rec.id;
    // A binding or a completion in the kept records fixes the request's notes by id (TL-P4-32 addendum 5 (2)).
    const recorded = history.completed.some((h) => h.requestId === id) || history.lines.some((h) => h.consent.requestId === id);
    if (recorded) {
      owned.add(id);
      // A request waiting on such a line keeps the notes and the source it was bound to, by id, never its words' titles
      // again (TL-P4-32 addendum 3 (2)): a renamed note still gets its line; one gone or in the Bin gets the "Not done"
      // why. One with every recorded line completed settles as a no-op, whatever its words name now.
      const waiting = new Map(history.lines.filter((h) => !h.applied && h.consent.requestId === id && !done(id, h.consent.targetFileId))
        .map((h) => [h.consent.targetFileId, h]));
      if ([...waiting.keys()].some((target) => bound.has(target))) continue;
      admitted.add(id);
      for (const [target, h] of waiting) {
        const file = listing.find((f) => f.id === target && !f.folder && !f.trashed);
        const path = file && ix.pathOf(file.id);
        if (file && path) {
          bound.set(target, { requestId: id, path, file });
          retries.set(target, { consent: h.consent, entry: h.entry });
        } else rows.push({ requestId: id, sources: [], name: h.path, why: ASK_GONE });
      }
      continue;
    }
    if (l.waitingRun) {
      owned.add(id);
      admitted.add(id);
      rows.push({ requestId: id, sources: [], name: 'Request', why: TOO_OLD_WHY });
      continue;
    }
    const { notes, refused } = requestTargets(listing, ix, l.rec.text ?? l.rec.what);
    if (!notes.length) continue;
    owned.add(id);
    // Older than every kept run, with nothing of it there: it may have been bound in a run let go, so it fails closed
    // with no line, its row and its archive (TL-P4-32 addendum 5 (3)).
    if (since !== null && l.rec.at < since) {
      admitted.add(id);
      if (refused === 'overflow') rows.push({ requestId: id, sources: [], name: 'Request', why: TOO_OLD_WHY });
      else for (const n of notes) rows.push({ requestId: id, sources: [], name: n.path, fileId: n.file.id, why: TOO_OLD_WHY });
      continue;
    }
    // An older request settles this note first: this one waits untouched (2).
    if (notes.some((n) => bound.has(n.file.id))) continue;
    admitted.add(id);
    for (const n of notes) bound.set(n.file.id, { requestId: id, path: n.path, file: n.file });
    if (!refused) continue;
    refusesSources = true;
    sources.set(id, null);
    for (const n of notes) blocked.add(n.file.id);
    if (refused === 'overflow') rows.push({ requestId: id, sources: null, name: 'Request', why: LEFT_AS_WRITTEN.overflow });
    else for (const n of notes.filter((m) => notes.filter((x) => x.titleKey === m.titleKey).length > 1)) {
      rows.push({ requestId: id, sources: null, name: n.path, fileId: n.file.id, why: LEFT_AS_WRITTEN.ambiguous(parentOf(n.path).split('/').join(' / ')) });
    }
  }
  const consents: TimelineConsent[] = [];
  const given = new Set<string>();
  const rowed = new Set<string>();
  const present: PresentLine[] = [];
  const give = (c: TimelineConsent): TimelineConsent => {
    consents.push(c);
    given.add(c.targetFileId);
    const had = sources.get(c.requestId);
    if (had !== null) sources.set(c.requestId, new Set([...(had ?? []), c.sourceFileId]));
    return c;
  };
  return {
    /** Requests that settle in this run; any other C05 request waits. */
    admitted: admitted as ReadonlySet<string>,
    /** The requests this settlement decides (C05: they name a note, or wait on a line); a generic handler takes no other. */
    owned: owned as ReadonlySet<string>,
    /** Notes a refused request names: nothing is written there this run. */
    blocked: blocked as ReadonlySet<string>,
    /** A refused request in the run refuses every source it files (3). */
    refusesSources,
    /** The notes bound to a request, to be read for their Timeline. */
    bound: bound as ReadonlyMap<string, { requestId: string; path: string; file: DriveFile }>,
    /** Every binding this run gives, for the author's independent comparison. */
    consents,
    /** The binding for a model's line on a note, citing a thing this run files: one line per note, never a retry's. */
    consent(targetFileId: string, sourceFileId: string | null, filedNow: boolean): TimelineConsent | undefined {
      const b = bound.get(targetFileId);
      if (!b || !sourceFileId || !filedNow || blocked.has(targetFileId) || retries.has(targetFileId) || given.has(targetFileId)) return undefined;
      return give({ requestId: b.requestId, targetFileId, sourceFileId });
    },
    /** The waiting retries, their line cited by the source's id as it is named now (`nameOf` of the listing). */
    retries(nameOfSource: (fileId: string) => string | null): Array<{ consent: TimelineConsent; entry: EditEntry; file: DriveFile; path: string }> {
      return [...retries.values()].flatMap((r) => {
        const b = bound.get(r.consent.targetFileId);
        const source = nameOfSource(r.consent.sourceFileId);
        if (!b || source === null || blocked.has(r.consent.targetFileId)) return [];
        return [{ consent: give(r.consent), entry: { ...r.entry, source }, file: b.file, path: b.path }];
      });
    },
    /** A bound person's note that takes no line (rows 5 and 8): its row, waiting for the line's source or every one. */
    refuse(targetFileId: string, why: 'no-timeline' | 'unreadable-timeline', source: string | null): void {
      const b = bound.get(targetFileId);
      if (!b || rowed.has(targetFileId)) return;
      rowed.add(targetFileId);
      if (source === null) sources.set(b.requestId, null);
      rows.push({ requestId: b.requestId, sources: source === null ? null : [source], name: b.path, fileId: targetFileId, why: LEFT_AS_WRITTEN[why] });
    },
    /** A bound line already there as read: decided once its source's name is final (`named`). */
    present(p: PresentLine): void { present.push(p); },
    /**
     * After filing names every thing (6): a line still there under its source's final name is satisfied, its request's
     * archive the completion; one whose source got another name is appended under it.
     */
    named(finalName: (sourceFileId: string) => string | null): { satisfied: PresentLine[]; append: PresentLine[] } {
      const satisfied: PresentLine[] = [];
      const append: PresentLine[] = [];
      for (const p of present) {
        const name = finalName(p.consent.sourceFileId);
        if (name === null || name === p.line.entry.source) satisfied.push(p);
        else {
          p.line.entry.source = name;
          append.push(p);
        }
      }
      return { satisfied, append };
    },
    /** Settle targets with no offered line; requests with an unwritten bound line still wait for it. */
    unsettled(lineDone: (requestId: string, targetFileId: string) => boolean): string[] {
      for (const [target, b] of bound) if (!blocked.has(target) && !rowed.has(target) && !given.has(target) && !retries.has(target)) {
        rowed.add(target);
        sources.set(b.requestId, null);
        rows.push({ requestId: b.requestId, sources: null, name: b.path, fileId: target, why: NOTHING_FOUND_WHY });
      }
      return [...admitted].filter((id) => [...bound].some(([target, b]) => b.requestId === id && !blocked.has(target)
        && !rowed.has(target) && !lineDone(id, target)));
    },
    /** The rows of a request that settles. */
    rowsOf(requestId: string): LeftRow[] { return rows.filter((r) => r.requestId === requestId); },
    /** The sources a settling request's archive waits for: its lines' sources, or every thing the run files. */
    sourcesOf(requestId: string, runSources: readonly string[]): string[] {
      const own = sources.get(requestId);
      return own === null ? [...runSources] : [...(own ?? [])];
    },
  };
}

/** Whether a proposed Current state changes exactly one bullet of the one read (the only change asked on a person's note). */
const oneBulletOf = (read: readonly string[] | undefined, proposed: readonly string[]): boolean => !!read && read.length === proposed.length
  && read.filter((line, i) => line.trim() !== proposed[i]?.trim()).length === 1;

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
  template?: NoteTemplate;
  typeRow?: string;
  properties?: Record<string, unknown>;
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
  observations?: readonly unknown[];
  forget?: readonly { factId: string; quote?: string }[];
  shownFactIds?: readonly string[];
  profiles?: ReadonlyMap<string, readonly string[]>;
  kinds?: ReadonlyMap<string, string>;
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
  /** A question asked once this pile is filed. */
  askAfter?(pile: Pile, at: number): Question | null;
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
  options?: Array<{ folderId: string; label: string }>;
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
export interface Decisions extends Pick<Filing, 'observations' | 'forget' | 'shownFactIds' | 'profiles' | 'kinds'> {
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
    observations: filing.observations, forget: filing.forget, shownFactIds: filing.shownFactIds, profiles: filing.profiles, kinds: filing.kinds,
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
    askAfter: filing.askAfter,
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
  const context = opts.context ?? createOwnershipContext();
  const listing = await drive.listAll(rootId);
  const ix = VaultIndex.build(rootId, listing);
  const read = await journalOf(drive, ix);
  const lines = opts.taken ? tookLines(read, opts.taken) : read;
  // An instructions run takes no pile: it reads only your changes.
  const inbox = all ? await drive.piles(rootId, context) : [];
  // Bower's own files (TL-P2-17): a failed read refuses before admission and any effect; a malformed one is
  // replaced when the run writes it, its old entries never claimed; a missing one is made again.
  const sys = ix.file(SYSTEM.dir);
  const requests = ix.file(SYSTEM.requests);
  const hashesFile = ix.file(SYSTEM.hashes);
  const requestsValue = requests ? parsed(await ownText(drive, requests)) : null;
  const requestsBroken = !!requests && !isRunnerFile(SYSTEM.requests, requestsValue);
  const requestsDone = isRunnerFile(SYSTEM.requests, requestsValue) ? requestsValue.done : [];
  const typeFile = ix.file(SYSTEM.typeTable);
  const typeText = typeFile ? await ownText(drive, typeFile) : null;
  const types = readTypeTable(typeText);
  const proposals = new Map<string, Proposal>();
  const proposalIds = new Set<string>();
  for (const file of listing) {
    const path = ix.pathOf(file.id);
    if (!path || file.folder || parentOf(path) !== SYSTEM.proposals || !path.endsWith('.json')) continue;
    const id = nameOf(path).replace(/\.json$/, '');
    if (proposalIds.has(id)) {
      proposals.delete(id);
      console.error(new BowerError('conflict', 'Bower could not read that suggestion.'));
      continue;
    }
    proposalIds.add(id);
    const value = parsed(await ownText(drive, file));
    if (value && typeof value === 'object' && 'v' in value && value.v === 1 && 'id' in value && 'payload' in value
      && Object.keys(value).every((key) => ['v', 'id', 'payload'].includes(key))
      && proposalOk({ id: value.id, payload: value.payload }) && value.id === id) {
      proposals.set(id, { id, payload: value.payload as Proposal['payload'] });
    } else console.error(new BowerError('conflict', 'Bower could not read that suggestion.'));
  }
  const hashesText = hashesFile ? await ownText(drive, hashesFile) : null;
  const hashesBroken = hashesText !== null && !isRunnerFile(SYSTEM.hashes, parsed(hashesText));
  // An inbox emptied after the Worker looked at it: the Worker's own refusal, before any effect. A run the Worker
  // admitted is past refusing: what it took and finds gone waits, and it ends with nothing filed (TL-P3-25 point 2).
  if (all && !inbox.length && !opts.taken) throw new BowerError('conflict', NOTHING_WAITING);
  const questionsFile = ix.file(SYSTEM.questions);
  const questionValue = questionsFile && (questionsFile.size === undefined || questionsFile.size > 40 || lines.some((l) => l.rec.kind === 'answer'))
    ? parsed(await ownText(drive, questionsFile)) : null;
  const questionState: QuestionsFile = isRunnerFile(SYSTEM.questions, questionValue) ? questionValue : { v: 1, questions: [] };
  const memoryFile = ix.file('.bower/observations.jsonl');
  const memoryText = memoryFile ? await ownText(drive, memoryFile) : '';
  const memoryLedger = parseObservations(new TextEncoder().encode(memoryText));
  const piles = opts.taken ? tookPiles(inbox, opts.taken) : inbox;
  // The capture the Worker's admission shares (TL-P3-21), with the one pile note each pile records read and checked.
  const readiness = await capturePiles(drive, rootId, piles.map(pileShape), { notes: true, context });
  // Things already saved (`duplicates.ts`, TL-P4-10 addendum 2), by their content.
  const dups = duplicatesOf(listing, ix, piles.flatMap((p) => p.items.map((i) => i.id)));
  const appends = await personalAppendHistory(drive, rootId, listing, ix, lines);
  // How far the kept records reach is read only for a request with nothing of it there (TL-P4-32 addendum 5 (3)).
  const unrecorded = lines.some((l) => l.rec.kind === 'request' && !appends.completed.some((h) => h.requestId === l.rec.id)
    && !appends.lines.some((h) => h.consent.requestId === l.rec.id));
  const since = unrecorded ? retainedSince(listing, ix) : null;
  return { context, rootId, all, listing, ix, lines, inbox, sys, requests, hashesFile, requestsBroken, requestsDone, hashesText, hashesBroken, piles, readiness, dups, appends, since, questionState, types, typeFile, typeText, proposals, proposalIds, memoryFile, memoryText, memoryLedger };
}
type Captured = Awaited<ReturnType<typeof capture>>;

/**
 * Decide: the reply's decisions (`Decisions`, the model's or the scripted provider's, the one type the planner reads)
 * applied to the capture, with what they name read: the piles taken or asked about, where each thing goes, the note
 * edits, the generated notes, the questions. It ends decided, or with a try again that holds more back.
 */
export async function decide(drive: ScriptedRead, snapshot: Captured, opts: PlanOptions, attempt: Attempt = { editCap: EDITS_PER_RUN, held: new Set() }) {
  const { context, rootId, all, listing, ix, lines, inbox, sys, requests, hashesFile, requestsBroken, requestsDone, hashesText, hashesBroken, piles, readiness, dups, appends, since, questionState, types, typeFile, typeText, proposals, proposalIds, memoryFile, memoryText, memoryLedger } = snapshot;
  const { editCap, held } = attempt;
  const newKey = opts.mintKey ?? mintKey;

  /**
   * What the reply decided. A part it leaves out is not done (P4-2 review I1): your requests and answers then wait for
   * a run that can act on them, never archived unanswered.
   */
  const inboxHashes = new Map(listing.flatMap((f) => f.md5Checksum ? [[f.id, f.md5Checksum] as const] : []));
  const rounds: QuestionRound[] = (questionState.rounds ?? []).flatMap((r) => {
    if (!all) return [{ ...r }];
    const q = { id: askId(r.subject), subject: r.subject, ...(r.hash ? { hash: r.hash } : {}) };
    if (!roundFor([r], q, inbox, inboxHashes)) return [];
    if (r.wordsOnly) return [{ ...r }];
    return subjectMembers(q, inbox, PILE_NOTE, inboxHashes).map((subject) => ({ ...r, subject,
      ...(inboxHashes.has(subject) ? { hash: inboxHashes.get(subject) } : {}) }));
  }).filter((r, _, records) => !all || roundFor(records.filter((s) => s.subject === r.subject && s.wordsOnly === r.wordsOnly),
    { id: askId(r.subject), subject: r.subject, hash: r.hash }, inbox, inboxHashes) === r);
  // Presence is consent for this stored action only; null means its destination is unavailable, never a fallback.
  const memoryWords = new Set<string>();
  for (const candidate of opts.decisions.observations ?? []) {
    if (candidate && typeof candidate === 'object' && 'source' in candidate && candidate.source
      && typeof candidate.source === 'object' && 'pileId' in candidate.source && typeof candidate.source.pileId === 'string')
      memoryWords.add(candidate.source.pileId);
  }
  const forgetChoices = new Map<string, { factId: string; recordId: string }>();
  for (const q of questionState.questions) {
    const answers = lines.filter((l) => answersAsking(l.rec, q)).sort((a, b) => b.rec.at - a.rec.at);
    const l = answers[0]; const answer = l && journalAnswer(l.rec);
    const option = typeof answer === 'object' && 'option' in answer ? q.options?.find((o) => o.id === answer.option) : undefined;
    const action = isQuestionOption(option) ? option.action : undefined;
    if (action?.kind === 'forget-fact' && q.subject && (memoryLedger.live.some((f) => f.factId === action.factId)
      || memoryLedger.tombstones.some((t) => t.reason === 'forget' && t.factId === action.factId))) {
      forgetChoices.set(q.subject, { factId: action.factId, recordId: l?.rec.id ?? '' });
      memoryWords.add(q.subject);
    }
  }
  const forgetWords = piles.filter((p) => /\bforget\b/i.test(p.text));
  const boundedLearned = aboutContext({ personal: '', learned: memoryLedger.live.map((f) =>
    timelineLine({ date: f.date, text: f.text, source: f.origin.kind === 'document' ? 'Source' : 'Your words' })).join('\n'), factIds: [] }).learned.text;
  const shownText = new Set(boundedLearned.split(/\r?\n/).flatMap((line) => parseTimelineLine(line)?.text ?? []));
  const shownIds = new Set(memoryLedger.live.filter((f) => shownText.has(f.text)
    && (!opts.decisions.shownFactIds || opts.decisions.shownFactIds.includes(f.factId))).map((f) => f.factId));
  const forgetFacts = [...memoryLedger.live, ...memoryLedger.events.flatMap((f) => f.kind === 'observation'
    && memoryLedger.tombstones.some((t) => t.factId === f.factId) ? [f] : [])];
  const boundForget = new Map<string, string[]>();
  for (const { factId, quote } of opts.decisions.forget ?? []) {
    const matching = forgetWords.filter((p) => hasVerbatimQuote(p.text, quote));
    if (matching.length !== 1) continue;
    const facts = forgetFacts.filter((f) => normalizedText(f.text).includes(normalizedText(quote ?? '')));
    if (facts.length !== 1 || facts[0]?.factId !== factId
      || memoryLedger.live.some((f) => f.factId === factId) && !shownIds.has(factId)) continue;
    const pile = matching[0];
    if (pile) { boundForget.set(pile.id, [...(boundForget.get(pile.id) ?? []), factId]); memoryWords.add(pile.id); }
  }
  const chosen = new Map<string, { place: Placement | null; record: string }>();
  const hasChoice = (id: string): boolean => !!chosen.get(id)?.place;
  const latest = new Map<string, JournalLine>();
  for (const l of lines) {
    const q = questionState.questions.find((q) => answersAsking(l.rec, q));
    if (l.rec.kind !== 'answer' || !q) continue;
    const had = latest.get(q.id);
    if (!had || had.rec.at <= l.rec.at) latest.set(q.id, l);
  }
  for (const q of questionState.questions) {
    const l = latest.get(q.id);
    const answer = l && journalAnswer(l.rec);
    if (!l || typeof answer !== 'object' || !('option' in answer)) continue;
    const option = q.options?.find((o) => o.id === answer.option);
    const action = isQuestionOption(option) ? option.action : undefined;
    if (action?.kind !== 'file-to') continue;
    const folder = action && ix.byId(action.folderId);
    const path = folder && ix.pathOf(folder.id);
    const subject = subjectKey(q);
    if (!subject) continue;
    const to = folder?.folder && path && MAIN_FOLDERS.includes(path.split('/')[0] ?? '') ? path : null;
    if (to === null) console.error(new BowerError('conflict', 'The chosen folder is no longer available.'), action);
    for (const pile of piles) {
      if (subject === pile.id) chosen.set(pile.id, { place: to === null ? null : { to, name: '' }, record: l.rec.id });
      for (const item of pile.items) if ((subject === pile.id || subject === item.id) && item.name !== PILE_NOTE)
        chosen.set(item.id, { place: to === null ? null : { to, name: item.name }, record: l.rec.id });
    }
  }
  let nextTable = types.table;
  const tableRecords = new Set<string>();
  const proposalSettled = new Set<string>();
  for (const q of questionState.questions) {
    if (!q.proposal) continue;
    const line = latest.get(q.id);
    const answer = line && journalAnswer(line.rec);
    if (!line) continue;
    if (typeof answer === 'object' && 'text' in answer) { proposalSettled.add(line.rec.id); continue; }
    if (typeof answer !== 'boolean') continue;
    if (!answer) { proposalSettled.add(line.rec.id); continue; }
    const frozen = proposals.get(q.proposal.id);
    if (!types.writeAllowed || !sys?.folder || !frozen
      || (await canonical(frozen)).hash !== (await canonical(q.proposal)).hash) continue;
    const existing = nextTable.rows.find((row) => row.id === frozen.payload.row.id);
    if (existing && (!typeRowOk(existing) || (await canonical(existing)).hash !== (await canonical(frozen.payload.row)).hash)) continue;
    if (!existing) nextTable = insertTypeRow(nextTable, frozen.payload.row);
    tableRecords.add(line.rec.id);
    proposalSettled.add(line.rec.id);
  }
  const columnRequests = new Set<string>();
  if (types.writeAllowed && sys?.folder) for (const line of lines) {
    if (line.rec.kind !== 'request') continue;
    const request = /^Show (.+) in the (.+) table[.!]?$/i.exec(line.rec.text ?? '');
    if (!request) continue;
    const matches = nextTable.rows.filter((row) => [row.id, ...row.match].some((name) => name.toLowerCase() === request[2]?.toLowerCase()));
    const row = matches.length === 1 ? matches[0] : undefined;
    const keys = row && Object.keys(row.properties).filter((key) => [key, key.replaceAll('_', ' ')].includes(request[1]?.toLowerCase() ?? ''));
    const key = keys?.length === 1 ? keys[0] : undefined;
    const changed = row && key ? requestTableColumn(row, key, { kind: 'words', recordId: line.rec.id }) : null;
    if (!changed) continue;
    nextTable = { ...nextTable, rows: nextTable.rows.map((old) => old.id === row?.id ? changed.row : old) };
    tableRecords.add(line.rec.id);
    columnRequests.add(line.rec.id);
  }
  // A refused stored destination stays waiting in the same round record until a new asking is saved.
  const reaskOf = (id: string): Ask | undefined => {
    const q = roundFor(rounds, { id: askId(id), subject: id, hash: inboxHashes.get(id) }, inbox, inboxHashes)?.reask;
    // Reuse the model's stored wording, never its expired folder actions. A current proposal supplies new options.
    return q && { text: q.text, yes: q.yes, no: q.no };
  };
  const d: Decisions = { ...opts.decisions,
    thing: (t) => chosen.has(t.fileId) ? chosen.get(t.fileId)?.place ?? null : reaskOf(t.fileId) ? null : opts.decisions.thing(t),
    words: (id, words) => {
      const place = opts.decisions.words(id, words);
      if (!chosen.has(id)) return reaskOf(id) ? null : place;
      const choice = chosen.get(id)?.place;
      return choice && place ? { ...place, to: choice.to } : null;
    },
    thingAsk: (id) => chosen.has(id) ? null : opts.decisions.thingAsk(id) ?? reaskOf(id) ?? null,
    pileAsk: (p) => {
      if (chosen.has(p.id) || p.items.some((i) => chosen.has(i.id))) return null;
      const subjects = subjectMembers({ id: askId(p.id), subject: p.id }, [p], PILE_NOTE, inboxHashes);
      return opts.decisions.pileAsk(p) ?? (/\bforget\b/i.test(p.text) && !boundForget.has(p.id) && !forgetChoices.has(p.id)
        ? { text: 'Which fact should Bower forget?', yes: 'Use this', no: 'Keep it' } : null) ?? (subjects.length === 1 && subjects[0] === p.id ? reaskOf(p.id) ?? null : null);
    },
    ...(opts.decisions.merge ? { merge: (item, yes) => chosen.has(item.id) || reaskOf(item.id) ? null : opts.decisions.merge?.(item, yes) ?? null } : {}),
  };
  const roundOf = (id: string): QuestionRound | undefined => {
    const hash = ix.byId(id)?.md5Checksum;
    return roundFor(rounds, { id: askId(id), subject: id, ...(hash ? { hash } : {}) }, inbox, inboxHashes);
  };
  const exhausted = (id: string): boolean => !!roundOf(id)?.exhausted;
  const mayAsk = (id: string): boolean => (roundOf(id)?.count ?? 0) < 2;
  const optionsOf = (ask: Ask, pile?: Pile): Pick<Question, 'options'> | null => {
    const unavailable = (): null => {
      console.error(new BowerError('conflict', 'Bower could not ask that question.'));
      return null;
    };
    if (pile && /\bforget\b/i.test(pile.text)) {
      const facts = memoryLedger.live.filter((fact, i, all) => shownIds.has(fact.factId)
        && all.findIndex((f) => f.text === fact.text) === i).slice(0, 4);
      // shortcut: offer the first four shown facts; add narrowed retrieval when more choices are needed.
      if (facts.length < 2) return unavailable();
      const options = facts.map((fact, i) => ({ id: `fact-${i + 1}`,
        label: fact.text.length <= 40 ? fact.text : fact.text.slice(0, 39).replace(/\s+\S*$|[\uD800-\uDBFF]$/u, '') + '…',
        action: { kind: 'forget-fact' as const, factId: fact.factId } }));
      if (new Set(options.map((o) => o.label)).size !== options.length) return unavailable();
      return { options };
    }
    if (!ask.options) return {};
    if (ask.options.length < 2 || ask.options.length > 4 || new Set(ask.options.map((o) => o.folderId)).size !== ask.options.length)
      return unavailable();
    const options = [];
    for (const [i, o] of ask.options.entries()) {
      const folder = ix.byId(o.folderId);
      const path = folder && ix.pathOf(folder.id);
      if (!folder?.folder || !path || !MAIN_FOLDERS.includes(path.split('/')[0] ?? '')) return unavailable();
      options.push({ id: `place-${i + 1}`, label: o.label, action: { kind: 'file-to' as const, folderId: folder.id } });
    }
    return { options };
  };
  // A person's request (C05): the one settlement decides what it binds, refuses, reports and waits for.
  const settlement = settleRequest(lines.filter((l) => l.rec.kind === 'request' && !columnRequests.has(l.rec.id)), listing, ix, appends, since);
  // A thing a request's line on a person's note cites is filed and cited, never taken for a copy of one already saved.
  for (const [, b] of settlement.bound) {
    if (b.file.appProperties?.by === 'bower') continue;
    for (const l of d.lines.filter((l) => l.path === b.path)) if (l.cites) dups.delete(l.cites);
    for (const l of d.hubLines?.filter((l) => l.path === b.path) ?? [])
      for (const p of piles) for (const item of p.items) if (item.name === l.cites) dups.delete(item.id);
  }
  const fetched = (fileId: string) => ({ fileId, context, consents: settlement.consents, path: ix.pathOf(fileId), name: ix.byId(fileId)?.name });
  /** Whether a refused request in the run refuses what cites this thing (TL-P4-32 addendum 2 (3)). */
  const refusedSource = (fileId: string | null | undefined): boolean => settlement.refusesSources && !!fileId && things.some((t) => t.file.id === fileId);
  // Notes kept as one: each by its yes, among the lines this run took; one held back (`keep:<answer>`) waits with it.
  // A run with no day to date its lines (outside years 0000-9999) keeps nothing: the answer waits, never archived unmerged.
  const keepDay = timelineDate(opts.requestedAt) !== null;
  if (!keepDay && d.keep.length) console.error('A run with no date cannot keep one note; the answer waits for the next tidy-up');
  // A keep whose notes are not there, or cannot be named in links, waits with its answer: decided here, from the listing.
  const keeps = (keepDay ? d.keep : []).filter((k) => !held.has(`keep:${k.answer}`) && lines.some((l) => l.rec.id === k.answer && l.rec.kind === 'answer' && journalAnswer(l.rec) === true)).flatMap((k) => {
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
    return keepAnswers.has(l.rec.id) || journalAnswer(l.rec) === false || q === ADOPT_STATES_ID || subjectOf({ id: q }).kind === 'state' || subjectLeft({ id: q }, null, notesSeen);
  };
  const inboxIds = new Set(inbox.flatMap((p) => [p.id, ...p.items.map((i) => i.id)]));
  const seenFirst: InboxSeen | null = all ? { ids: inboxIds, hashes: new Set(listing.flatMap((f) => (inboxIds.has(f.id) && f.md5Checksum ? [f.md5Checksum] : []))) } : null;
  // An answer about a thing or pile goes by its question's subject, as Bower's list holds it, never by its id (P4-15b);
  // so does an older pair question, by the names in its words. The list is read for it only when a model's run has
  // such an answer waiting, or when an answer's subject may be gone (its row names what it was about).
  const bySubject = !d.settles ? lines.filter((l) => l.rec.kind === 'answer' && !settlesAlone(l)) : [];
  const maybeGone = lines.some((l) => l.rec.kind === 'answer' && journalAnswer(l.rec) !== false && subjectLeft({ id: l.rec.questionId ?? '' }, seenFirst, notesSeen));
  const listedFile = bySubject.length || maybeGone ? ix.file(SYSTEM.questions) : undefined;
  const listedValue = listedFile && !listedFile.folder ? parsed(await ownText(drive, listedFile)) : null;
  const listed = isRunnerFile(SYSTEM.questions, listedValue) ? listedValue.questions : [];
  const settles = (l: JournalLine): boolean => {
    if (settlesAlone(l)) return true;
    const q = listed.find((x) => answersAsking(l.rec, x));
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
  const yesAnswers = [...lastAnswer.values()].filter((l) => journalAnswer(l.rec) !== false).map((l) => ({ l, q: listed.find((x) => answersAsking(l.rec, x)) ?? { id: l.rec.questionId ?? '' } }));
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
  let journal = lines.filter((l) => {
    if (l.rec.kind === 'request') return columnRequests.has(l.rec.id)
      || (settlement.owned.has(l.rec.id) ? settlement.admitted.has(l.rec.id) : !!d.request);
    if (l.rec.kind !== 'answer') return true;
    const question = questionState.questions.find((q) => answersAsking(l.rec, q));
    if (question && subjectOf(question).kind === 'proposal') return proposalSettled.has(l.rec.id);
    return d.settles?.(l.rec.questionId ?? '') ?? settled.has(l.rec.questionId ?? '');
  });
  // Your rules (TL-P2-20 rules-wording): one change for every rule line, worded below in one edit of Rules.md, or
  // Rules.md made when it is missing; a line whose words cannot be worded stays pending.
  const ruleWords = ruleChangesOf(journal, d.wordRule ?? tidiedRule);
  // A "yes" to keeping one note joins the thing it is about to that note (MERGES), by the answer's line.
  const yes = new Map(journal.filter((l) => l.rec.kind === 'answer' && journalAnswer(l.rec) === true).map((l) => [l.rec.questionId ?? '', l.rec.id]));
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
    if (!p || readiness.get(p.id)?.blocked !== null || (held.has(p.id) && !hasChoice(id)) || (chosen.has(id) && !hasChoice(id))) return false;
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
  const fromWords: Array<{ pileId: string; folder: DriveFile; words: string }> = [];
  /**
   * Piles of words only whose news a Timeline line on a note carries instead of a note of their own (c3-pair-ask, the
   * value gate for words): each goes to the Bin only once every line citing it is written, and waits whole otherwise.
   */
  const citedWords = new Map<string, { folder: DriveFile; lines: WantedLine[]; notes: Set<string> }>();
  const citedByLine = (pileId: string): boolean => all && keepDay && !chosen.has(pileId) && d.lines.some((l) => l.cites === pileId);
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
    if (held.has(pile.id) && !ask && !hasChoice(pile.id) && !pile.items.some((i) => hasChoice(i.id) || reaskOf(i.id))) {
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
    if (chosen.has(pile.id) && !hasChoice(pile.id)) continue;
    const subjects = subjectMembers({ id: askId(pile.id), subject: pile.id }, [pile], PILE_NOTE, inboxHashes);
    if (ask) {
      const options = optionsOf(ask, pile);
      if (!options) continue;
      const waiting = subjects.filter((id) => mayAsk(id) && !exhausted(id));
      // A pile card can cover every waiting member only when none has reached its own cap.
      for (const id of waiting.length === subjects.length ? [pile.id] : waiting) {
        const hash = id === pile.id ? undefined : inboxHashes.get(id);
        askedPiles.push({ id: askId(id), text: ask.text, yes: ask.yes, no: ask.no, subject: id,
          words: pile.text, ...options, ...(hash ? { hash } : {}), askedAt: opts.requestedAt });
      }
      continue;
    }
    if (subjects.length === 1 && subjects[0] === pile.id && exhausted(pile.id) && !forgetChoices.has(pile.id)) continue;
    // Things the model asks about: each stays where it is, named by its question; the rest of the pile goes on.
    const thingAsk = (fileId: string): Ask | undefined => d.thingAsk(fileId) ?? undefined;
    for (const item of pile.items) {
      const q = thingAsk(item.id);
      const hash = listing.find((f) => f.id === item.id)?.md5Checksum;
      if (q && mayAsk(item.id)) {
        const options = optionsOf(q);
        if (options) askedPiles.push({ id: askId(item.id), text: q.text, yes: q.yes, no: q.no, about: join(pile.path ?? '', item.name), subject: item.id, words: pile.text, ...options, ...(hash ? { hash } : {}), askedAt: opts.requestedAt });
      }
    }
    // What stays where it is: what is asked about, and a copy of a thing this run does not file.
    const stays = (fileId: string): boolean => (chosen.has(fileId) && !hasChoice(fileId)) || ((chosen.size > 0 || rounds.some((r) => r.reask)) && !chosen.has(fileId) && fileId !== ix.file(join(pile.path ?? '', PILE_NOTE))?.id && !d.thing({ fileId, name: ix.byId(fileId)?.name ?? '', fileName: ix.byId(fileId)?.name ?? '', kind: kindOf(ix.byId(fileId)?.name ?? ''), words: pile.text, linkText: null })) || !!thingAsk(fileId) || (exhausted(fileId) && !hasChoice(fileId)) || staying.has(fileId);
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
    const words = !note ? '' : note.id === notes[0]?.id ? pile.text : parseNote(join(pile.path ?? '', PILE_NOTE), noteText, fetched(note.id)).body.trim();
    if (note && d.observations?.some((candidate) => candidate && typeof candidate === 'object'
      && 'source' in candidate && candidate.source && typeof candidate.source === 'object'
      && 'fileId' in candidate.source && candidate.source.fileId === note.id)) memoryWords.add(pile.id);
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
    const asLine = wordsOnly && (citedByLine(pile.id) || memoryWords.has(pile.id));
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
    if (asLine || memoryWords.has(pile.id)) citedWords.set(pile.id, { folder, lines: [], notes: new Set() });
    else if (wordsOnly) fromWords.push({ pileId: pile.id, folder, words });
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
  /** A pile card covers its members; a later card for a covered member adds nothing while it is open. */
  const related = (x: string | undefined, y: string | undefined): boolean => relatedSubjects(x, y, inbox);
  /** Equal content is the same subject only for the same thing uploaded again: not the empty file, and not while both are in the inbox. */
  const sameContent = (a: Question, b: Pick<Question, 'hash'>): boolean => sameSubjectContent(a, b, { ids: inInbox });
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
    for (let p = to; p !== at; p = parentOf(p)) {
      checkCreationName(nameOf(p), 'folder');
      if (!missing.includes(p)) missing.push(p);
    }
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
    if (settlement.blocked.has(f.id) || refusedSource(cite?.fileId)) continue;
    const made = want(f, u.path);
    const consent = settlement.consent(f.id, cite?.fileId ?? null, !!cite);
    made.lines.push({ entry: { date: date ?? '', text: u.what, source: cite?.source ?? null }, record: consent?.requestId ?? null, what: u.what, after: cite?.fileId ?? null, ...(consent ? { consent } : {}) });
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
    if (settlement.blocked.has(f.id) || refusedSource(l.cites)) continue;
    const thing = l.cites === null ? undefined : things.find((t) => t.file.id === l.cites && !t.merge);
    // A line citing a pile of words only is written only with that pile taken, and the pile waits for it.
    const words = l.cites === null || thing ? undefined : citedWords.get(l.cites);
    if (l.cites !== null && !thing && !words && pileIds.has(l.cites)) continue;
    const asked = thing ? (d.note(thing.file.id)?.name ?? d.thing(seenOf(thing))?.name) : undefined;
    const consent = settlement.consent(f.id, l.cites, !!thing && asked !== undefined);
    const line: WantedLine = { entry: { date: date ?? '', text: l.text, source: asked === undefined ? null : citeName(asked) }, record: consent?.requestId ?? null, what: l.text, after: asked === undefined ? null : (thing?.file.id ?? null), ...(consent ? { consent } : {}) };
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
      // A yes whose note is not in the folder now (the Bin) writes nothing: its answer settles, and its answered row
      // comes from `answeredRows` above (`answeredGone`, kind state), the one writer of that row (TL-P4-19 addendum 10).
      if (journalAnswer(l.rec) !== true || !q || !f || f.folder || path === undefined) continue;
      grants.set(f.id, { answer: l.rec.id, seen: q.state ?? null, question: q });
      want(f, path);
    }
  }
  /**
   * What Bower last wrote in a note's Current state (`c3-state-mark`): the lines of the earlier state change whose mark
   * the section carries (`stateMark` of its `lines`), by the note's file id, from the run manifests the listing shows in
   * `.bower/runs`, newest first; read only for a section the person edited, each manifest once. Empty when none says so
   * (retention binned that run, or the mark is older than its manifest): then nothing is taken as said, and the line
   * names all that the section lacks. A manifest that cannot be read or parsed is passed over (lenient read).
   */
  const manifestPaths = listing.filter((x) => !x.folder && isManifestName(x.name) && parentOf(parentOf(ix.pathOf(x.id) ?? '')) === RUNS_PATH)
    .sort((a, b) => byCodePoint(b.modifiedTime, a.modifiedTime) || byCodePoint(a.id, b.id));
  const stateChanges = new Map<string, Promise<Array<{ fileId: string; lines: string[] }>>>();
  const changesIn = (file: DriveFile): Promise<Array<{ fileId: string; lines: string[] }>> => {
    let got = stateChanges.get(file.id);
    if (!got) {
      // Read by the one manifest reader (`parseRunManifestV2`), as the engine reads it; one it refuses is passed over.
      got = drive.readBytes(file.id).then(async (bytes) => {
        const read = await parseRunManifestV2(bytes, rootId, RUNNER_WRITES);
        if (read.ok) return stateChangesOf(read.value);
        console.error(`A run manifest could not be read for what Bower last wrote (${file.name}): ${read.reason}`);
        return [];
      }).catch((e: unknown) => {
        console.error(`A run manifest could not be read for what Bower last wrote (${file.name})`, e);
        return [];
      });
      stateChanges.set(file.id, got);
    }
    return got;
  };
  const lastWritten = async (fileId: string, mark: string | null): Promise<string[]> => {
    if (mark === null) return [];
    for (const file of manifestPaths) {
      const found = (await changesIn(file)).find((c) => c.fileId === fileId && stateMark(c.lines) === mark);
      if (found) return found.lines;
    }
    return [];
  };
  // A model's Current states (C05): planned below on the bytes read, only where Bower still owns the section, or the
  // person's yes grants it. A run of your changes only (no pile) writes only a granted one.
  for (const st of date ? d.states : []) {
    const f = ix.file(st.path);
    if (!f || f.folder) continue;
    if (!all && !grants.has(f.id)) continue;
    if (settlement.blocked.has(f.id) || refusedSource(st.cites)) continue;
    const thing = st.cites === null ? undefined : things.find((t) => t.file.id === st.cites && !t.merge);
    const asked = thing ? (d.note(thing.file.id)?.name ?? d.thing(seenOf(thing))?.name) : undefined;
    want(f, st.path).state = { lines: st.lines, source: asked === undefined ? null : citeName(asked), thing: asked === undefined ? null : (thing?.file.id ?? null) };
  }
  // A request's line refused at the fence is appended to the note as read now, citing its source by id (TL-P4-32 6).
  // Its words are the model's line on that note citing the same source, when it proposes one, else the line it waited with.
  for (const r of date ? settlement.retries((id) => {
    const source = listing.find((x) => x.id === id && !x.folder);
    return source ? citeName(source.name) : null;
  }) : []) {
    const source = listing.find((x) => x.id === r.consent.sourceFileId);
    if (source) places.set(source.id, source);
    const text = d.lines.find((l) => l.path === r.path && l.cites === r.consent.sourceFileId)?.text ?? r.entry.text;
    want(r.file, r.path).lines.push({ entry: { ...r.entry, date: date ?? r.entry.date, text }, record: r.consent.requestId, what: text, after: null, consent: r.consent });
  }
  // Every note a request binds is read, so one with no Timeline it can take gets its row with no line proposed.
  for (const [, b] of settlement.bound) if (!settlement.blocked.has(b.file.id)) want(b.file, b.path);
  /** Current states the person edited: what Bower would write goes on the Timeline as a line, and they are asked. */
  const personStates: Array<{ line: WantedLine; file: DriveFile; path: string; seen: string; shown: StateShown }> = [];
  /** Each question about a Current state this run asks, by its note's file id: the build sets the note as left on it. */
  const stateAsks = new Map<string, Question>();
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
      const text = await ownText(drive, rulesNote);
      return ruleLike(managedRules(text, rulesNote.appProperties?.[PROP.by] === 'bower' || parseNote(RULES_PATH, text).byBower), ADOPT_STATES_RULE) !== undefined;
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
    const said = q ? (d.said?.line(q, journalAnswer(l.rec) === true) ?? null) : null;
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
    const lines = carriedLines(parseNote(k.other, await drive.readText(other.id), fetched(other.id)), parseNote(k.kept, was, fetched(kept.id)))
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
  const rulesFiles = ix.filesIn('').filter((f) => !f.folder && f.name === RULES_PATH);
  const rulesFile = rulesFiles[0] ?? ix.file(RULES_PATH);
  if (rulesFiles.length <= 1 && ruleWords.change && rulesFile && !rulesFile.folder) want(rulesFile, RULES_PATH).rules = ruleWords.change;
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
      // A yes to writing over a note that changed under the read is the same fact as a note changed since it was shown:
      // it is asked again in the one re-ask wording (TL-P4-19 addendum 15), with the update it showed.
      const grant = grants.get(f.id);
      if (grant) reasked.push({ ...grant.question, text: STATE_ASK_AGAIN(displayName(nameOf(w.path))), askedAt: opts.requestedAt });
      if (w.renames) holdRenames = true;
      // A passing race, not a refusal: its lines wait for the next run, like those past the cap.
      for (const l of w.lines) lineState.set(l, 'deferred');
      continue;
    }
    let rewrite = false;
    // The bytes the later changes of this one edit apply to: after its link rewrite, which goes first (R3-7 m4).
    let rewritten = bytes;
    if (w.renames) {
      const result = applyChanges(bytes, [{ kind: 'link-rewrite', recordIds: [], renames: w.renames }], fetched(f.id));
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
    const ownership = context.read(f.id, bytes);
    // Invalid layouts reach the author's existing typed refusal, never the display parser's exception.
    const personal = ownership.status !== 'invalid' && ownership.status !== 'v2'
      && !parseNote(w.path, new TextDecoder().decode(bytes), fetched(f.id)).byBower;
    // A person's note takes only its request's one bound line; Bower's own takes lines as before, under the request's id.
    if (personal) w.lines = w.lines.filter((l) => l.consent);
    else for (const l of w.lines) delete l.consent;
    const unwritable = personal && settlement.bound.has(f.id) ? personalTimelineRefusal(bytes, fetched(f.id)) : null;
    if (unwritable) {
      settlement.refuse(f.id, unwritable, w.lines[0]?.consent?.sourceFileId ?? null);
      w.lines = [];
      w.state = null;
    }
    let state: StateRewrite | null = null;
    const grant = grants.get(f.id);
    const section = grant ? currentStateOf(bytes, fetched(f.id), true) : null;
    const mark = stateMarkOf(bytes, fetched(f.id));
    const name = displayName(nameOf(w.path));
    // The note as read now: its checksum and stamp, what a question asked now records as the note was left.
    const stamp = f.appProperties?.[STAMP];
    const asRead = (lines: string[]): StateShown => ({ lines, md5: md5Hex(bytes), ...(stamp === undefined ? {} : { stamp }) });
    // A yes to "Write it" writes the update it was shown (`c3-state-mark`, TL-P4-16 addendum 2), with no model asked; a
    // question from before (no `shown`) writes the model's update computed in this run. Either only while the section
    // reads as asked about (its `state` mark), and the update shown only while the note still carries the stamp and
    // checksum it had when it was asked (write-once's comparison, as the New mark's, TL-P4-19 addendum 5: an If-Match
    // precondition, RFC 9110 13.1.1).
    const shown = grant?.question.shown;
    const update = shown?.lines ?? w.state?.lines;
    const granted = grant && section?.owner === 'person' ? grant : undefined;
    const changed = granted?.seen === null || (!!section && granted?.seen !== stateMark(section.lines));
    const held = !shown || (stamp === shown.stamp && md5Hex(bytes) === shown.md5);
    // Nothing to write: the section already reads as the update (the person wrote it themselves), or there is none
    // (an older question's run had no update, or the note has no mark to grant under). Settled, with its answered row.
    const already = !!update && !!section && section.lines.join('\n') === update.join('\n');
    const change: StateRewrite | null = granted && !already && !changed && held && (mark !== null || personal) && update ? { kind: 'state-rewrite', recordIds: [granted.answer], previous: section?.lines ?? [], lines: update, granted: { answer: granted.answer, mark } } : null;
    const result = change ? applyChanges(bytes, [change], fetched(f.id)) : null;
    // A clash: the write's own check finds the section is not as read (`person-edited`, `state-changed`).
    const clash = !!result && !result.ok && (result.reason === 'person-edited' || result.reason === 'state-changed');
    if (granted && section && !already && (changed || !held || clash)) {
      // The note changed after Bower showed its update (the section, or the note's stamp or checksum: the one check),
      // or the write found it so: the yes was not to this note. It is asked again, in the one re-ask wording
      // (TL-P4-19 addendum 12), with the same update and the note as it reads now; it needs a new answer.
      const q: Question = { id: stateQuestionId(f.id), text: STATE_ASK_AGAIN(name), yes: 'Write it', no: 'Keep mine', about: w.path, state: stateMark(section.lines), ...(shown ? { shown: asRead(shown.lines) } : {}), askedAt: opts.requestedAt };
      reasked.push(q);
      stateAsks.set(f.id, q);
    } else if (change && result?.ok) {
      // The person's yes grants this one write over their lines, as read now; the answer goes with the edit.
      state = change;
    } else if (granted && result && !result.ok && result.reason !== 'unchanged') {
      // Refused for good: the answer settles, nothing is written, and its answered row says so, here and on the note.
      console.error(`A note's Current state was refused (${result.reason}); none is planned for it`);
      answeredRows.set(granted.answer, answeredState(granted.question.id, 'refused', w.path));
    } else if (granted) {
      answeredRows.set(granted.answer, answeredState(granted.question.id, 'nothing-to-write', w.path));
    } else if (w.state && !(grant && section?.owner === 'person') && (!personal || (w.lines.some((l) => l.consent) && oneBulletOf(currentStateOf(bytes, fetched(f.id), true)?.lines, w.state.lines)))) {
      // On a person's note only a proposal changing one bullet is asked about, beside the request's line; any other
      // is refused alone and the line stands (TL-P4-32 addendum 2 (5)). A plain note has no Current state Bower reads.
      const now = currentStateOf(bytes, fetched(f.id), true);
      const adopt = !personal && now?.owner === 'unmarked' && (await adopting());
      if (now && (now.owner === 'bower' || now.owner === 'missing' || adopt)) {
        if (now.lines.join('\n') !== w.state.lines.join('\n')) {
          const change: StateRewrite = { kind: 'state-rewrite', recordIds: [], previous: now.lines, lines: w.state.lines, ...(adopt ? { adopted: true as const } : {}) };
          const result = applyChanges(bytes, [change], fetched(f.id));
          if (result.ok) state = change;
          else console.error(`A note's Current state was refused (${result.reason}); none is planned for it`);
        }
      } else {
        // Never silently dropped: what Bower would write becomes one Timeline line (a person's note takes none).
        // Only what the section lacks; nothing new, no line.
        // Same news twice in one run: a line this run adds to the note citing the same thing already says it.
        const cited = w.state.thing === null ? undefined : w.lines.find((l) => l.after === w.state?.thing && l.entry.source !== null);
        // The person is still asked, once that line is there.
        if (cited && now?.owner === 'person') personStates.push({ line: cited, file: f, path: w.path, seen: stateMark(now.lines), shown: asRead(w.state.lines) });
        if (cited && now?.owner === 'unmarked') unmarkedStates.push(cited);
        const text = cited ? null : stateNewsLine(w.state.lines, now?.lines ?? [], now?.owner === 'person' ? await lastWritten(f.id, mark) : []);
        if (text !== null) {
          const line: WantedLine = { entry: { date: date ?? '', text, source: w.state.source }, record: null, what: text, after: w.state.thing };
          w.lines.push(line);
          lineState.set(line, 'refused');
          if (now?.owner === 'person') personStates.push({ line, file: f, path: w.path, seen: stateMark(now.lines), shown: asRead(w.state.lines) });
          if (now?.owner === 'unmarked') unmarkedStates.push(line);
          if (w.state.thing !== null && w.state.source !== null) modelLines.push({ line, cites: w.state.thing });
        }
      }
    }
    // Each line on its own: one already there (from any day) is dropped; a person's note takes none.
    const lines: WantedLine[] = [];
    // A hub line with nothing to cite is there already when its words are, with or without a source (C06).
    const said = new Set(timelineBullets(new TextDecoder().decode(bytes), fetched(f.id)).flatMap((x) => {
      const m = parseTimelineLine(x);
      return m ? [m.text] : [];
    }));
    for (const l of w.lines) {
      if (l.record === null && l.entry.source === null && said.has(l.entry.text)) {
        lineState.set(l, 'present');
        continue;
      }
      const result = applyChanges(bytes, [{ kind: 'timeline-append', recordIds: l.record === null ? [] : [l.record], entries: [l.entry], ...(l.consent ? { consent: l.consent } : {}) }], fetched(f.id));
      const twin = lines.find((x) => x.entry.text === l.entry.text);
      if (result.ok && twin) twins.set(l, twin);
      else if (result.ok) lines.push(l);
      else if (!result.ok && result.reason === 'unchanged') {
        lineState.set(l, 'present');
        if (l.consent) settlement.present({ line: l, consent: l.consent, file: f, path: w.path, bytes, before });
      }
      else if (!result.ok && result.reason === 'not-bower') lineState.set(l, 'person');
      else if (!result.ok) console.error(`A note's Timeline line was refused (${result.reason}); none is planned for it`);
    }
    // The rules, as applyChanges words them in this edit, after its link rewrite: a rule the rewrite makes a repeat
    // of one there is not written (TL-P2-20 I10). Nothing to write when every one is there already, and a refusal
    // (not Bower's, damaged, too big) leaves them pending (rule 7).
    let rules: RulesWording | null = null;
    if (w.rules && !(personal && f.appProperties?.[PROP.by] === 'bower' && !ownership.payloads?.['rules-added'])) {
      // A rule taken out is matched as it reads after this edit's link rewrite (TL-P2-38); still no match, it is gone.
      const change = rewrite && w.renames ? relinkedRemovals(w.rules, w.renames) : w.rules;
      const result = applyChanges(rewritten, [change], rewritten === bytes ? fetched(f.id) : undefined);
      const worded = result.ok ? wordedBy(new TextDecoder().decode(rewritten), change, result.text) : null;
      if (worded) {
        rules = change;
        rulesWorded = worded;
      } else if (!result.ok && result.reason === 'unchanged') rulesState = 'present';
      // Refusals are logged once, with their pending lines, by rulesPlanOf.
    }
    for (const l of lines) if (l.record !== null) need(l.record).lines.push(l);
    if (rewrite || lines.length || rules || state) candidates.push({ file: f, path: w.path, before, bytes, rewrite, lines, rules, state, stateAfter: state ? (w.state?.thing ?? null) : null });
  }
  // At most editCap edits, in path order; the rest wait for the next run, which plans them again. Their rename lines
  // stay unarchived meanwhile (TL-P2-29 (1)).
  if (candidates.slice(editCap).some((c) => c.rewrite)) holdRenames = true;
  for (const l of candidates.slice(editCap).flatMap((c) => c.lines)) lineState.set(l, 'deferred');
  // Each kept note's changes together, in the contract's order; the text never depends on the record ids.
  const appendOf = (lines: WantedLine[]): Change[] => (lines.length
    ? [{ kind: 'timeline-append', recordIds: [...new Set([...lines, ...[...twins].filter(([, t]) => lines.includes(t)).map(([l]) => l)].flatMap((l) => (l.record === null ? [] : [l.record])))], entries: lines.map((l) => l.entry), ...(lines[0]?.consent ? { consent: lines[0].consent } : {}) }]
    : []);
  /** The answers whose keep a note's link rewrite is for: the notes it links to the other note of each. */
  const keptFor = (bytes: Uint8Array): string[] => keeping.filter((x) => mentions(bytes, [x.rename])).map((x) => x.k.answer);
  const changesOf = (c: (typeof candidates)[number], recordIds: string[]): Change[] =>
    [...(c.state ? [c.state] : []), ...(c.rewrite ? [{ kind: 'link-rewrite' as const, recordIds: [...recordIds, ...keptFor(c.bytes)], renames }] : []), ...appendOf(c.lines), ...(c.rules ? [c.rules] : [])];
  const authored = candidates.slice(0, editCap).flatMap((c) => {
    const result = applyChanges(c.bytes, changesOf(c, []), fetched(c.file.id));
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
    const written = c.lines.flatMap((l, i) => (l.what === null ? [] : [{ what: l.consent ? LINE_ADDED : l.what, line: i }]));
    const rows = written.length ? written : c.state ? [{ what: c.state.granted?.mark === null ? 'Current state updated, as you chose.' : STATE_UPDATED }] : [];
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
    const q: Question = { id: stateQuestionId(p.file.id), text: p.line.consent ? `${thingName(p.line.entry.source ?? '')} also changes the current state of ${displayName(nameOf(p.path))}. Should Bower write its update there?` : STATE_ASK(displayName(nameOf(p.path))), yes: 'Write it', no: 'Keep mine', about: p.path, state: p.seen, shown: p.shown, askedAt: opts.requestedAt };
    askedPiles.push(q);
    stateAsks.set(p.file.id, q);
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
  const wordsWaiting = [...citedWords].filter(([id, w]) => !savedWords.has(id) && !memoryWords.has(id) && (!w.lines.some((l) => lineState.get(l) === 'planned') || !w.lines.every((l) => ['planned', 'present'].includes(lineState.get(l) ?? '')))).map(([id]) => id);
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
  // A request settles only when each note it binds has its line written or there, or its row (`settleRequest`).
  const boundLines = [...wanted.values()].flatMap((w) => w.lines.map((l) => ({ l, fileId: w.file.id })));
  for (const id of settlement.unsettled((requestId, fileId) => boundLines.some(({ l, fileId: at }) => at === fileId
    && l.record === requestId && ['planned', 'present'].includes(lineState.get(l) ?? '')))) waits.add(id);
  if (waits.size) journal = journal.filter((l) => !waits.has(l.rec.id));
  const unwritten = [...waits].filter((id) => !needs.get(id)?.held).length;
  if (unwritten) console.error(`${unwritten} of your changes wait for the next tidy-up: what they add could not be written now`);
  // Admission still refuses an empty instruction press. An already admitted runner must reach maintenance,
  // including when all its instruction lines remain held for the next run.
  if (!all && !journal.length) {
    if (opts.taken) return { kind: 'plan' as const, plan: await nothingReadyPlan(rootId, opts) };
    throw new BowerError('conflict', NOTHING_TO_READ);
  }
  for (const id of settlement.admitted) for (const row of settlement.rowsOf(id)) {
    const f = row.fileId === undefined ? undefined : listing.find((x) => x.id === row.fileId);
    if (f) places.set(f.id, f);
  }
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
  const generated: Array<{ to: string; name: string; text: string; what: string; after: string[]; pileId: string | null; aside: string }> = [];
  for (const { thing, name } of filing) {
    const own = d.ownNote?.(thing.item.name) ?? undefined;
    if (!own || !generatedPlace(parentOf(own))) continue;
    if (freeName(planned, parentOf(own), nameOf(own)) !== nameOf(own)) continue;
    destination(parentOf(own));
    plannedFile(own);
    const what = `A note for ${displayName(name)}.`;
    const text = serializeNote({ summary: what, properties: [], tags: [], currentState: [], body: '', timeline: [{ date: noteDate, text: 'Filed by Bower.', source: name }], byBower: true });
    generated.push({ to: parentOf(own), name: nameOf(own), text, what, after: [thing.file.id], pileId: null, aside: thing.file.name });
  }
  /** The name each filed thing is cited by, as the run makes it: its note's, else its own. */
  const madeAs = new Map(filing.map(({ thing, name, note }) => [thing.file.id, note?.name ?? name]));
  const linkable = listing.flatMap((file) => {
    const path = ix.pathOf(file.id);
    return !file.folder && path?.endsWith('.md') && generatedPlace(parentOf(path)) ? [{ file, path }] : [];
  });
  const groundedAuthoredLinks = async (to: string, note: AuthoredNote, source: { file: DriveFile; name: string }): Promise<string[]> => {
    // Resolve evidence against actual note identities; a name shared by notes is not grounding.
    const authored = new Map<string, typeof linkable[number]>();
    // All authored strings share this admission check, including every section in the body and the summary.
    const words = [...Object.values(note).filter((value): value is string => typeof value === 'string'), JSON.stringify(note.properties ?? {})].join('\n');
    for (const match of words.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      const target = linkTarget(match[1] ?? '').replace(/\.md$/, '');
      const candidates = linkable.filter(({ path }) => target.includes('/')
        ? path.slice(0, -3).toLowerCase() === target
        : displayName(nameOf(path)).toLowerCase() === target);
      const local = candidates.filter(({ path }) => parentOf(path) === to);
      const resolved = local.length ? local : candidates;
      const bound = [source.file.name, source.name, ix.pathOf(source.file.id), join(to, source.name)]
        .some((name) => name !== undefined && linkTarget(name).replace(/\.md$/, '') === target);
      if (bound && resolved.every(({ file }) => file.id === source.file.id)) continue;
      if (resolved.length !== 1 || !resolved[0]) return refused('a template note with an ungrounded authored link');
      authored.set(resolved[0].file.id, resolved[0]);
    }
    if (!note.template) return [];
    // Sources subfolders use their nearest destination hub. Never choose an unrelated fallback note.
    for (let folder = to; folder && generatedPlace(folder); folder = parentOf(folder)) {
      const hubs: typeof linkable = [];
      for (const candidate of linkable.filter(({ path }) => parentOf(path) === folder)) {
        const front = await drive.indexedFront?.(candidate.file)
          ?? indexedFront(await drive.readText(candidate.file.id));
        if (VaultIndex.isHub(candidate.path, candidate.file.name, front.type ?? undefined)) hubs.push(candidate);
      }
      if (!hubs.length) continue;
      const named = hubs.filter(({ file }) => authored.has(file.id));
      const hub = hubs.length === 1 ? hubs[0] : named.length === 1 ? named[0] : undefined;
      if (!hub) return refused('a template note with an ambiguous destination hub');
      const related = [hub, ...[...authored.values()].filter(({ file }) => file.id !== hub.file.id)].slice(0, 5);
      for (const { file } of related) places.set(file.id, file);
      return related.map(({ path }) => path.slice(0, -3));
    }
    // The first note of a new topic is its folder's own hub: it links to itself, never to unrelated notes.
    const self = join(to, note.name);
    if (VaultIndex.isHub(self, note.name, note.template === 'moc' ? 'moc' : undefined)) return [self.slice(0, -3), ...[...authored.values()].map(({ path }) => path.slice(0, -3))].slice(0, 5);
    return refused('a template note without a grounded destination hub');
  };
  // A note a model wrote for a thing (P4-3): beside it, its words as the body, Bower's summary and Timeline around them.
  for (const { thing, to, name, note, merge } of filing) {
    const authored = note || merge ? null : d.note(thing.file.id);
    if (!authored) continue;
    const noteName = freeName(planned, to, authored.name);
    madeAs.set(thing.file.id, noteName);
    plannedFile(join(to, noteName));
    const typeRow = authored.typeRow === undefined ? undefined : types.table.rows.find((row) => row.id === authored.typeRow);
    if ((authored.typeRow !== undefined && !typeRow) || (authored.properties !== undefined && !typeRow)
      || (typeRow && !propertyValuesOk(typeRow, authored.properties ?? {}))) return refused('invalid declared note properties');
    const template = authored.template ?? (typeRow && Object.hasOwn(NOTE_TEMPLATES, typeRow.template) ? typeRow.template as NoteTemplate : undefined);
    if (template === 'profile' || typeRow?.template === 'profile') return refused('the profile template outside profile admission');
    if (typeRow && typeRow.template !== template) return refused('a note template outside its declared type');
    // Only declared, relevant links in the authored evidence; never pad with the folder's other notes.
    const related = await groundedAuthoredLinks(to, { ...authored, template }, { file: thing.file, name });
    const properties = template ? [
      { key: 'type', label: 'Type', value: typeRow?.id ?? template },
      { key: 'created', label: 'Created', value: noteDate },
      { key: 'updated', label: 'Updated', value: noteDate },
      { key: 'source', label: 'Source', value: name },
      { key: 'related', label: 'Related', value: related.map((link) => `[[${link}]]`).join(', ') },
    ] : [];
    for (const [key, value] of Object.entries(authored.properties ?? {})) {
      if (properties.some((property) => property.key === key)) return refused('a declared fact replacing a template property');
      properties.push({ key, label: key, value: typeof value === 'string' ? value : JSON.stringify(value) });
    }
    const text = serializeNote({ template, typeRow, summary: authored.summary, properties, tags: [], currentState: [], body: authored.body,
      ...(template === 'source' ? { original: name } : {}),
      timeline: template && !NOTE_TEMPLATES[template].timeline ? [] : [{ date: noteDate, text: 'Filed by Bower.', source: name }], byBower: true });
    generated.push({ to, name: noteName, text, what: authored.summary, after: [thing.file.id], pileId: null, aside: thing.file.name });
  }
  // Group the row-bound contributions before authoring: one ordinary edit/create per profile.
  for (const row of types.table.rows.filter((row) => row.profile)) {
    const contributions = filing.filter(({ thing }) => d.kinds?.get(thing.file.id) === row.id && d.profiles?.has(thing.file.id));
    if (!contributions.length || /offer/iu.test(row.id)) continue;
    const matches = listing.filter((file) => !file.folder && file.appProperties?.profile === row.id && file.appProperties.by === 'bower');
    if (matches.length > 1) continue;
    const target = matches[0];
    const first = contributions[0];
    if (!first) continue;
    const to = target ? parentOf(ix.pathOf(target.id) ?? '') : first.to;
    if (!generatedPlace(to)) continue;
    const citations = contributions.map(({ name }) => renderLink(thingName(name)));
    const body = contributions.flatMap(({ thing }, i) => (d.profiles?.get(thing.file.id) ?? [])
      .map((sentence) => `${sentence} ${citations[i]}\n`)).join('');
    if (!target) {
      const template = row.profile?.template;
      const related = await groundedAuthoredLinks(to, { name: 'Profile.md', summary: 'Profile from documents.', body: '', template },
        { file: first.thing.file, name: first.name });
      if (!profileTextOk(body)) return refused('a profile beyond its 400 word bound');
      const name = freeName(planned, to, 'Profile.md');
      const scaffold = serializeNote({ template, typeRow: { ...row, template: 'profile' }, summary: 'Profile from documents.',
        properties: [{ key: 'type', label: 'Type', value: row.id }, { key: 'created', label: 'Created', value: noteDate },
          { key: 'updated', label: 'Updated', value: noteDate }, { key: 'source', label: 'Source', value: first.name },
          { key: 'related', label: 'Related', value: related.map((path) => `[[${path}]]`).join(', ') }],
        tags: [], currentState: [], body: '', timeline: [{ date: noteDate, text: 'Filed by Bower.', source: first.name }], byBower: true });
      // The region writer copies source bytes without interpreting them as template sections.
      const result = applyChanges(new TextEncoder().encode(scaffold), [{ kind: 'profile-rewrite', recordIds: [], previous: '\n', text: body }]);
      if (!result.ok) return refused('a profile that could not be written');
      plannedFile(join(to, name));
      generated.push({ to, name, text: result.text, what: 'Profile from documents.', after: contributions.map(({ thing }) => thing.file.id), pileId: null, aside: first.thing.file.name });
      continue;
    }
    const path = ix.pathOf(target.id);
    const before = await verified(target, 'utf8');
    if (!path || !before) continue;
    const bytes = await drive.readBytes(target.id);
    if (before.size !== bytes.byteLength || before.sha256 !== await sha256(new Blob([bytes.slice()]))) continue;
    const ownership = context.read(target.id, bytes);
    const span = ownership.status !== 'invalid' ? ownership.payloads?.profile : undefined;
    if (!span || !parseNote(path, new TextDecoder().decode(bytes), fetched(target.id)).byBower) continue;
    const previous = new TextDecoder().decode(bytes.subarray(span.start, span.end));
    const history = [...previous.matchAll(/\[\[[^\]\r\n]+\]\]/gu)].map(([link]) => link);
    const retained = [...new Set(history)].filter((link) => !citations.includes(link));
    const text = body + (retained.length ? `${retained.join(' ')}\n` : '');
    if (!profileTextOk(text)) return refused('a profile beyond its 400 word bound');
    if (text === previous) continue;
    const change: Change = { kind: 'profile-rewrite', recordIds: [], previous, text };
    const existing = edits.find((edit) => edit.file.id === target.id);
    const changes = [...existing?.changes ?? [], change];
    const result = applyChanges(bytes, changes, fetched(target.id));
    if (!result.ok) continue;
    const after = contributions.map(({ thing }) => thing.file.id);
    if (existing) {
      existing.changes = changes; existing.text = result.text; existing.after = [...new Set([...existing.after, ...after])];
      if (!existing.rows.length) existing.rows.push({ what: 'Profile updated.' });
    }
    else edits.push({ file: target, path, before, bytes, changes, text: result.text, after, keeps: [], rows: [{ what: 'Profile updated.' }] });
    places.set(target.id, target); edited.add(target.id);
  }
  // A request's line already there is satisfied only under the name its source is filed as (TL-P4-32 addendum 2 (6)):
  // under another, it is appended now, after that move.
  const naming = settlement.named((id) => {
    const made = madeAs.get(id);
    return made === undefined ? null : citeName(made);
  });
  const satisfied = naming.satisfied;
  for (const p of naming.append) {
    const change: Change = { kind: 'timeline-append', recordIds: [p.consent.requestId], entries: [p.line.entry], consent: p.consent };
    const result = edits.some((e) => e.file.id === p.file.id) ? null : applyChanges(p.bytes, [change], fetched(p.file.id));
    if (!result?.ok) {
      console.error(`A request's line could not cite the name its thing was given (${result?.reason ?? 'edited'}); the request waits`);
      journal = journal.filter((l) => l.rec.id !== p.consent.requestId);
      continue;
    }
    lineState.set(p.line, 'planned');
    places.set(p.file.id, p.file);
    edits.push({ file: p.file, path: p.path, rows: [{ what: LINE_ADDED, line: 0 }], before: p.before, bytes: p.bytes, changes: [change], text: result.text, after: [p.consent.sourceFileId], keeps: [] });
  }
  for (const p of satisfied) places.set(p.file.id, p.file);
  for (const { pileId, folder, words } of fromWords) {
    const { to, name: title } = wordsPlace(pileId, words);
    destination(to);
    const name = freeName(planned, to, title);
    plannedFile(join(to, name));
    const what = 'Written from a note you added.';
    const text = serializeNote({ summary: words, properties: [{ key: 'kind', label: 'Kind', value: 'Note' }], tags: [], currentState: [], body: words, timeline: [{ date: noteDate, text: what }], byBower: true });
    generated.push({ to, name, text, what, after: [], pileId, aside: folder.name });
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
        stored = parseNote(rule.note, await drive.readText(f.id), fetched(f.id));
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
        read.push(parseNote(path, await drive.readText(f.id), fetched(f.id)));
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
  const answered = answeredAskings(journal.map((l) => l.rec));
  // A question asked again (a granted section changed since) replaces the one its answer drops, under the same id.
  const again = new Set(reasked.map((q) => q.id));
  let toAsk = [...asking.values(), ...disagreeing.map((d) => d.question), ...reasked, ...askedPiles]
    .filter((q, i, all) => (subjectOf(q).kind === 'inbox' || again.has(q.id) || !answered.has(q.id)) && all.findIndex((x) => x.id === q.id) === i);
  // Immutable artifacts retain payload identity after a card closes, including declines.
  const knownPayloads = new Set<string>();
  for (const proposal of [...proposals.values(), ...questionState.questions.flatMap((q) => q.proposal ?? [])]) {
    knownPayloads.add((await canonical(proposal.payload)).hash);
  }
  const declinedIds = new Set<string>();
  if (toAsk.some((q) => q.proposal)) for (const file of listing) {
    const path = ix.pathOf(file.id);
    if (!path || file.folder || parentOf(path) !== SYSTEM.archive || !path.endsWith('.json')) continue;
    const value = parsed(await ownText(drive, file));
    if (isJournalRecord(value) && value.kind === 'answer' && journalAnswer(value) === false && value.questionId) declinedIds.add(value.questionId);
  }
  const openProposals = questionState.questions.filter((q) => q.proposal && !answered.has(q.id) && !answered.has(`${q.id}\n${q.askedAt}`)).length;
  let admittedProposals = 0;
  const admitted: Question[] = [];
  for (const q of toAsk) {
    if (!q.proposal) { admitted.push(q); continue; }
    if (!proposalOk(q.proposal) || q.id !== `q-proposal-${q.proposal.id}`
      || [q.subject, q.hash, q.state, q.shown, q.words, q.options].some((field) => field !== undefined)) continue;
    const key = (await canonical(q.proposal.payload)).hash;
    if (knownPayloads.has(key) || proposalIds.has(q.proposal.id) || declinedIds.has(q.id)
      || admittedProposals >= 2 || openProposals + admittedProposals >= 5
      || nextTable.rows.some((row) => row.id === q.proposal?.payload.row.id)) continue;
    knownPayloads.add(key); admittedProposals++; admitted.push(structuredClone(q));
  }
  toAsk = admitted;
  const questionsFile = ix.file(SYSTEM.questions);
  let questionsText: string | null = null;
  /** The questions that write holds: written by the build, once it has set on each one asked now the note as left. */
  let questionsList: Question[] | null = null;
  let fresh: Question[] = [];
  /** The questions this write closes because their thing or pile left the inbox. */
  const closing: Question[] = [];
  if ((answered.size || toAsk.length || (all && inbox.length && questionsFile && mayHold(questionsFile))) && questionsFile) {
    const value = parsed(await ownText(drive, questionsFile));
    const readable = isRunnerFile(SYSTEM.questions, value);
    // An unreadable list is Bower's own file: replaced with a fresh one (TL-P2-17); the report never claims its old entries.
    if (!readable) console.error(new BowerError('unknown', QUESTIONS_REPLACED), `${SYSTEM.questions} is not a valid questions file`);
    const all = readable ? value.questions : [];
    const open = openQuestions(all, answered, seenNow, notesSeen).filter((q) => {
      const pile = subjectPile(q, inbox, inboxHashes);
      return q.words === undefined || !pile || q.words === pile.text;
    });
    fresh = toAsk.filter((q) => again.has(q.id) || !open.some((x) => sameThing(x, q)));
    // The same content uploaded again keeps its one question, now about the new file (so the reader still shows it).
    const retarget = (x: Question): Question => {
      const again = toAsk.find((q) => q.subject !== undefined && related(subjectKey(x), q.subject) === false && sameContent(x, q));
      return again ? { ...x, subject: again.subject, ...(again.about !== undefined ? { about: again.about } : {}) } : x;
    };
    // A question closed because its thing goes to the Bin now (a saved copy) closes only once that Bin is done (P4-17).
    closing.push(...all.filter((q) => !answered.has(q.id) && !answered.has(`${q.id}\n${q.askedAt}`) && !open.includes(q)));
    const left = [...open.map(retarget), ...fresh];
    if (!readable || left.length !== all.length || fresh.length || left.some((q, i) => q.subject !== all[i]?.subject)) {
      questionsList = left;
      questionsText = questionsJson(left, rounds);
    }
  } else if (toAsk.length && sys?.folder) {
    // A missing list is made again in `.bower` with the question (TL-P2-33 §2a).
    fresh = toAsk;
    questionsList = fresh;
    questionsText = questionsJson(fresh, rounds);
  } else if (toAsk.length) {
    // No `.bower` yet: the run's own records make it; there is no list to ask in, so the question is not asked.
    console.error(new BowerError('unknown', NOT_ASKED), `${SYSTEM.dir} is missing; the question is not asked`);
  }
  // An answer settles each covered member separately; a sibling's placement cannot exhaust or resolve it.
  for (const q of all ? questionState.questions : []) {
    const answer = latest.get(q.id);
    const pile = subjectPile(q, inbox, inboxHashes);
    if (!answer || !pile || !journal.some((l) => l.rec.id === answer.rec.id)) continue;
    for (const subject of subjectMembers(q, inbox, PILE_NOTE, inboxHashes)) {
      const hash = inboxHashes.get(subject);
      let r = roundFor(rounds, { id: askId(subject), subject, hash }, inbox, inboxHashes);
      const unavailable = chosen.has(subject) && !hasChoice(subject);
      // Older stored askings may lack history; preserve that actual asking when its folder has gone.
      if (!r && unavailable) {
        r = { subject, pileId: pile.id, words: pile.text, count: 1, ...(hash ? { hash } : {}), ...(subject === pile.id ? { wordsOnly: true } : {}) };
        rounds.push(r);
      }
      if (!r) continue;
      const filed = things.some((t) => t.file.id === subject) || saved.some((s) => s.file.id === subject)
        || fromWords.some((p) => p.pileId === subject) || citedWords.has(subject);
      if (!filed && r.count >= 2) { r.exhausted = true; delete r.reask; }
      else if (!filed && unavailable) r.reask = q;
    }
  }
  for (const q of fresh) {
    const pile = subjectPile(q, inbox, inboxHashes);
    if (!pile) continue;
    for (const subject of subjectMembers(q, inbox, PILE_NOTE, inboxHashes)) {
      const hash = inboxHashes.get(subject);
      const member = { id: askId(subject), subject, ...(hash ? { hash } : {}) };
      const previous = roundFor(rounds, member, inbox, inboxHashes);
      if (previous) {
        previous.count = Math.min(2, previous.count + 1);
        previous.subject = subject;
        if (hash) previous.hash = hash;
        delete previous.reask;
      }
      else rounds.push({ subject, pileId: pile.id, words: pile.text, count: 1, ...(hash ? { hash } : {}), ...(subject === pile.id ? { wordsOnly: true } : {}) });
    }
  }
  const retained = rounds.filter((r) => !subjectLeft({ id: askId(r.subject), subject: r.subject, ...(r.hash ? { hash: r.hash } : {}) }, seenNow));
  rounds.splice(0, rounds.length, ...retained);
  if (JSON.stringify(rounds) !== JSON.stringify(questionState.rounds ?? [])) {
    questionsList ??= openQuestions(questionState.questions, answered, seenNow, notesSeen);
    questionsText = questionsJson(questionsList, rounds);
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
    if (changesFolder) places.set(changesFolder.id, changesFolder);
    for (const path of [`${SYSTEM.changes}/pending`, `${SYSTEM.changes}/pending/${opts.runId}`]) {
      const folder = ix.file(path);
      if (folder) places.set(folder.id, folder);
    }
  }
  // A runner file made again goes into `.bower`, a captured place.
  if ((!requests || !hashesFile || (!questionsFile && questionsText !== null)) && sys?.folder) places.set(sys.id, sys);
  // The file a thing already saved copies is recorded as the run saw it, so its report row names a captured file.
  for (const s of saved) if (s.dup.of === 'filed') places.set(s.dup.file.id, s.dup.file);
  const newProposals = fresh.flatMap((q) => q.proposal ?? []);
  const proposalFolder = ix.file(SYSTEM.proposals);
  if (newProposals.length && sys?.folder) {
    places.set(sys.id, sys);
    if (proposalFolder?.folder) places.set(proposalFolder.id, proposalFolder);
  }
  const tableChanged = types.writeAllowed && !!sys?.folder && (!typeFile || tableRecords.size > 0);
  const tableWrite = tableChanged ? { file: typeFile ?? null, text: rewriteTypeTable(typeText, types.table, nextTable),
    content: typeFile ? await ownVerified(typeFile) : null } : null;
  if (tableWrite && !typeFile && sys) places.set(sys.id, sys);
  const memoryRecords = new Set<string>();
  const forgetIds = new Set<string>();
  const selectedForget = [...forgetChoices.values()].map((c) => c.factId);
  for (const choice of forgetChoices.values()) { forgetIds.add(choice.factId); memoryRecords.add(choice.recordId); }
  for (const f of d.forget ?? []) {
    const words = forgetWords.filter((p) => boundForget.get(p.id)?.includes(f.factId));
    const questions = questionState.questions.filter((q) => (words.length ? words : forgetWords).some((p) => q.subject === p.id));
    if (questions.length && !selectedForget.includes(f.factId))
      return refused('Forget must name the shown fact selected by the person');
    if (!words.length) continue;
    forgetIds.add(f.factId);
  }
  const tombstones = memoryLedger.live.flatMap((fact) => {
    const bin = journal.find((l) => l.rec.kind === 'trash' && l.rec.fileId === fact.source.fileId);
    if (!forgetIds.has(fact.factId) && !bin) return [];
    if (bin) memoryRecords.add(bin.rec.id);
    return [{ v: 1 as const, kind: 'tombstone' as const, eventId: newKey('tombstone'), date: noteDate, at: opts.requestedAt,
      factId: fact.factId, sourceId: fact.source.fileId, reason: forgetIds.has(fact.factId) ? 'forget' as const : 'bin' as const,
      runId: opts.runId }];
  });
  const hasMemory = (d.observations?.length ?? 0) > 0 || forgetIds.size > 0 || tombstones.length > 0;
  if (hasMemory) {
    if (!sys?.folder) return refused('learned facts need a readable ledger');
    if (memoryFile) places.set(memoryFile.id, memoryFile);
    places.set(sys.id, sys);
  }
  const capturedPlaces = [...places.values()].map((f) => ({ file: seen(f), path: ix.pathOf(f.id) ?? '' })).sort((a, b) => a.path.localeCompare(b.path));
  const captured = journal.map((l) => ({ recordId: l.rec.id, sha256: l.sha256, fileIds: l.files.map((f) => f.id) }));
  const captureValue: ManifestCapture = { piles: capturedPiles, members, journal: captured, places: capturedPlaces };
  const scope = { rootId };
  const captureId = (await canonical({ scope, runScope: opts.scope, capture: captureValue })).hash;
  const evidence: Parameters<typeof observationOf>[1]['admitted'][number][] = [];
  for (const pile of capturedPiles) if (pile.context.kind === 'text') evidence.push({ kind: 'words',
    runId: opts.runId, captureId, pileId: pile.pileId,
    source: { fileId: pile.context.file.fileId, sha256: pile.context.content.sha256 }, words: parseNote(PILE_NOTE, pile.context.text, fetched(pile.context.file.fileId)).body });
  for (const l of journal) {
    const q = questionState.questions.find((q) => answersAsking(l.rec, q));
    const answer = journalAnswer(l.rec);
    if (l.rec.kind !== 'rule' && !(l.rec.kind === 'answer' && q?.subject && typeof answer === 'object' && 'text' in answer)) continue;
    for (const file of l.files) evidence.push({ runId: opts.runId, captureId,
      source: { fileId: file.id, sha256: l.sha256 },
      words: l.rec.kind === 'rule' ? l.rec.text ?? '' : typeof answer === 'object' && 'text' in answer ? answer.text : '',
      ...(l.rec.kind === 'rule' ? { kind: 'rule' as const, recordId: l.rec.id }
        : { kind: 'answer' as const, recordId: l.rec.id, subject: q?.subject ?? '' }) });
  }
  const observations = [];
  for (const candidate of d.observations ?? []) {
    if (candidate && typeof candidate === 'object' && 'source' in candidate && candidate.source
      && typeof candidate.source === 'object' && 'pileId' in candidate.source
      && typeof candidate.source.pileId === 'string' && held.has(candidate.source.pileId)) continue;
    const resolved = observationOf(candidate, { admitted: evidence, lineage: [], date: noteDate, at: opts.requestedAt,
      eventId: newKey('observation'), factId: newKey('fact') });
    if (!resolved.ok) return refused('the observation has no admitted authority for that fact');
    if (resolved.value.origin.kind === 'answer' || resolved.value.origin.kind === 'rule') memoryRecords.add(resolved.value.origin.recordId);
    observations.push(resolved.value);
  }
  const added = [...tombstones, ...observations];
  let memoryWrite: { file: DriveFile | undefined; before: VerifiedContent | null; text: string } | null = null;
  if (hasMemory) {
    const trialText = memoryText + added.map((e) => JSON.stringify(e) + '\n').join('');
    const trial = parseObservations(new TextEncoder().encode(trialText));
    const liveIds = new Set(trial.live.map((f) => f.factId));
    // Replayed/tombstoned candidates are inert, including new hashes and archive copies.
    const accepted = added.filter((e) => e.kind === 'tombstone' || liveIds.has(e.factId));
    const nextText = memoryText + accepted.map((e) => JSON.stringify(e) + '\n').join('');
    const nextLedger = parseObservations(new TextEncoder().encode(nextText));
    const unwritten = observations.filter((fact) => fact.origin.kind === 'words' && !nextLedger.live.some((live) =>
      live.source.fileId === fact.source.fileId && live.source.sha256 === fact.source.sha256 && live.text === fact.text));
    if (unwritten.length) return tryAgain({ editCap, held: new Set([...held, ...unwritten.flatMap((fact) =>
      fact.origin.kind === 'words' ? [fact.origin.pileId] : [])]) });
    if (nextText !== memoryText) memoryWrite = { file: memoryFile, before: memoryFile ? await ownVerified(memoryFile) : null, text: nextText };
    else for (const pileId of memoryWords) savedWords.set(pileId, { as: 'About me', notes: 1 });
  }
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
    kind: 'decided' as const, context, settlement, satisfied, runSources: things.filter((t) => !t.merge).map((t) => t.file.id), run: { runId: opts.runId, requestId: opts.requestId, scope: opts.scope, allowWeb: opts.allowWeb, requestedAt: opts.requestedAt },
    rootId, all, listing, ix, newKey, held, scope, captureId, captureValue, journal, edited, missing, areas: d.areas, filing, fallbackOf, derive, need,
    generated, modelLines, madeAs, edits, lineState, answerLines, keeping, saved, capturedPiles, partly, answers, compared, requestsRead,
    memoryWrite, memoryWords, memoryRecords, requestsBroken, requestsDone, sys, questionsList, rounds, chosen, stateAsks, questionsRead, fresh, asking, disagreeing, closing, related, sameContent, rules, ruleWords,
    tableWrite, tableRecords, newProposals, proposalFolder, rulesState, rulesFile, archiveFolder, changesFolder, hashesFile, hashesBroken, hashesNew, citedWords, savedWords, answeredRows,
  };
}
type Decided = Extract<Awaited<ReturnType<typeof decide>>, { kind: 'decided' }>;

/**
 * Build: the fixed operations and the report rows, each row from the operation it reports, from what was decided.
 * It reads neither Drive nor the reply; the manifest guard and grounding check what it built.
 */
export async function build(decided: Decided): Promise<Ended> {
  const fetched = (fileId: string) => ({ fileId, context: decided.context, consents: decided.settlement.consents, path: decided.ix.pathOf(fileId), name: decided.ix.byId(fileId)?.name });
  const { run: opts, rootId, listing, ix, newKey, held, scope, captureId, captureValue, journal, edited, missing, areas, filing, fallbackOf, derive, need,
    generated, modelLines, madeAs, edits, lineState, answerLines, keeping, saved, capturedPiles, partly, answers, compared, requestsRead,
    memoryWrite, memoryWords, memoryRecords, requestsBroken, requestsDone, sys, questionsList, rounds, chosen, stateAsks, questionsRead, fresh, asking, disagreeing, closing, related, sameContent, rules, ruleWords,
    tableWrite, tableRecords, newProposals, proposalFolder, rulesState, rulesFile, archiveFolder, changesFolder, hashesFile, hashesBroken, hashesNew, citedWords, savedWords, answeredRows, settlement, satisfied, runSources } = decided;

  // The fixed operations, in order: clear last run's marks, make folders, file, the note edits, the merges, Bin the piles,
  // your changes, the hashes.
  const operations: OperationV2[] = [];
  const add = async (effect: EffectV2, dependsOn: string[] = []): Promise<string> => {
    const ordinal = operations.length;
    const operationId = (await canonical({ runId: opts.runId, captureId, ordinal, effect })).hash;
    operations.push({ operationId, ordinal, dependsOn: [...dependsOn], effect });
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
    const choice = chosen.get(thing.file.id);
    if (choice) derive(choice.record, move);
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
  const wordsFiled = new Map<string, ReportContribution>();
  for (const note of generated) {
    const after = note.after.flatMap((id) => moveOf.get(id) ?? []);
    const op = await add({ kind: 'create-text', parent: targetOf(note.to), name: note.name, createKey: newKey('note'), text: note.text, content: await utf8(note.text), purpose: 'generated' }, after);
    const path = join(note.to, note.name);
    const filed = note.pileId === null ? [] : [{ name: 'Your note', title: thingName(note.name), kind: 'note' as const, to: note.to, note: path }];
    if (note.pileId !== null) {
      notesOf.set(note.pileId, op);
      const choice = chosen.get(note.pileId);
      if (choice) derive(choice.record, op);
    }
    reportPlan.push({ requires: [op, ...chainOf(note.to)], when: 'applied', value: { ...empty(), created: [{ path, what: note.what }] } });
    if (filed.length) {
      const row: ReportContribution = { requires: [op, ...chainOf(note.to)], when: 'applied', value: { ...empty(), filed } };
      reportPlan.push(row);
      if (note.pileId !== null) wordsFiled.set(note.pileId, row);
    }
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
    let result = applyChanges(edit.bytes, edit.changes, fetched(edit.file.id));
    if (!result.ok) {
      console.error(`A note's Timeline line could not cite the name its thing was given (${result.reason}); it cites nothing`);
      for (const l of mine) l.entry.source = null;
      result = applyChanges(edit.bytes, edit.changes, fetched(edit.file.id));
    }
    if (!result.ok) throw new BowerError('unknown', B_FAILURE);
    edit.text = result.text;
  }
  // Publish the recovery pointer with an in-place move before any personal append. A crash before the physical
  // pending/archive move can still select exactly this run. The physical move clears the temporary property.
  const pointers = new Map<string, string[]>();
  for (const line of journal) if (line.rec.kind === 'request'
    && edits.some((e) => e.changes.some((c) => c.kind === 'timeline-append' && c.consent?.requestId === line.rec.id))) {
    const sources = settlement.sourcesOf(line.rec.id, runSources).flatMap((id) => moveOf.get(id) ?? []);
    const own: string[] = [];
    for (const f of line.files) own.push(await add({ kind: 'move', before: seen(f), parent: { fileId: f.parents[0] ?? '' },
      name: f.name, properties: { [PROP.run]: opts.runId } }, sources));
    pointers.set(line.rec.id, own);
  }
  // After the filing moves, each note edit (TL-P2-20), then the merges whose moves depend on their line. A Timeline
  // line's note is marked new in place after its edit, and gets its updated row once it applied.
  for (const edit of edits) {
    // A line citing a thing filed by this run waits for that thing's move (C06).
    const cited = [...edit.after.flatMap((id) => moveOf.get(id) ?? []), ...edit.changes.flatMap((c) =>
      c.kind === 'timeline-append' && c.consent ? pointers.get(c.consent.requestId) ?? [] : [])];
    const beforeText = edit.keeps.length || edit.changes.some((change) => change.kind === 'profile-rewrite') ? { beforeText: new TextDecoder().decode(edit.bytes) } : {};
    const op = await add({ kind: 'edit-text', before: seen(edit.file), path: edit.path, beforeContent: edit.before, changes: edit.changes, text: edit.text, content: await utf8(edit.text), ...beforeText }, cited);
    editOf.set(edit.file.id, op);
    for (const answer of edit.keeps) derive(answer, op);
    for (const id of edit.changes.flatMap((c) => (c.kind === 'rules-wording' ? [...c.add, ...c.remove].map((r) => r.recordId) : c.recordIds))) need(id).edits.push(op);
    // Only a Timeline line marks a note new (m3); a link fix never does.
    const appended = edit.changes.reduce((n, c) => n + (c.kind === 'timeline-append' ? c.entries.length : 0), 0);
    // A line's row says how the note is as the run leaves it: the edit's bytes, and the stamp of its last write there,
    // the New mark's (`write-once`), so the screen marks the line only while the note is still so (addendum 5).
    const marked = appended ? await add({ kind: 'move', before: seen(edit.file), parent: { fileId: edit.file.parents[0] ?? '' }, name: edit.file.name, properties: { bowerNew: '1' } }, [op]) : null;
    const asLeft = { md5: md5Hex(new TextEncoder().encode(edit.text)), stamp: stampOf(opts.runId, marked ?? op) };
    const left = marked ? { lines: appended, ...asLeft } : null;
    // A question about this note's Current state asked now records the note as this run leaves it: the same two
    // things the New mark compares (`c3-state-mark`).
    const asked = stateAsks.get(edit.file.id);
    if (asked?.shown) asked.shown = { lines: asked.shown.lines, ...asLeft };
    for (const row of edit.rows) reportPlan.push({ requires: [op], when: 'applied', value: { ...empty(), updated: [{ path: edit.path, what: row.what, op, ...(row.line === undefined || left === null ? {} : { line: row.line, ...left }) }] } });
    // A granted write Drive refused while the run worked keeps its answer, since the answer's archive waits for it (TL-P2-20
    // rule 7); one answered row says so, its sentence by the refusal (`materialize`), never as a thing set aside (TL-P4-19
    // addendum 21). A clash asks again instead, and says nothing here.
    for (const answer of edit.changes.flatMap((c) => (c.kind === 'state-rewrite' && c.granted ? [c.granted.answer] : []))) {
      const questionId = journal.find((l) => l.rec.id === answer)?.rec.questionId;
      if (questionId) reportPlan.push({ requires: [op], when: 'rejected', value: { ...empty(), answered: [{ questionId, kind: 'state', outcome: 'refused', why: stateNotWritten(displayName(nameOf(edit.path)), false), note: edit.path }] } });
    }
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
  const memoryOps: string[] = [];
  if (memoryWrite) {
    const effect: EffectV2 = memoryWrite.file && memoryWrite.before
      ? { kind: 'write-runner-json', before: seen(memoryWrite.file), beforeContent: memoryWrite.before,
        path: '.bower/observations.jsonl', text: memoryWrite.text, content: await utf8(memoryWrite.text) }
      : { kind: 'write-runner-json', before: null, beforeContent: null, parent: { fileId: sys?.id ?? '' },
        createKey: newKey('ledger'), path: '.bower/observations.jsonl', text: memoryWrite.text, content: await utf8(memoryWrite.text) };
    memoryOps.push(await add(effect, [...memoryOps]));
  }
  for (const op of memoryOps) reportPlan.push({ requires: [op], when: 'applied', value: { ...empty(),
    updated: [{ path: 'About me.md', what: 'Brought up to date.', op }] } });
  for (const record of memoryRecords) derive(record, ...memoryOps);
  // Every captured words item waits for its filing or memory effects and carries its read version to the Bin.
  /** The Bin a pile of words already saved is reported by: its pile note's, or (none bound) its folder's. */
  const savedWordsBin = new Map<string, string>();
  for (const pile of capturedPiles) {
    if (pile.context.kind !== 'text') continue;
    const pileId = pile.pileId;
    const w = citedWords.get(pileId);
    const generated = notesOf.get(pileId);
    if (!w && !generated) continue;
    const lines = w ? [...w.notes].flatMap((id) => editOf.get(id) ?? []) : generated ? [generated] : [];
    lines.push(...movesOf.get(pileId) ?? []);
    if (memoryWords.has(pileId)) lines.push(...memoryOps);
    const context = await add({ kind: 'bin', before: pile.context.file, capturedChildIds: [] }, [...new Set(lines)]);
    wordsFiled.get(pileId)?.requires.push(context);
    if ((w || generated) && !savedWords.has(pileId)) {
      reportPlan.push({ requires: [context], when: 'rejected', value: { ...empty(),
        setAside: [{ name: pile.anchor?.name ?? pile.context.file.name, why: WORDS_NOT_WRITTEN }] } });
    }
    if (savedWords.has(pileId)) {
      savedWordsBin.set(pileId, context);
    }
    // Filed as the note its news went into (the first, when it went into more than one), once every such edit applied.
    const into = edits.find((e) => editOf.get(e.file.id) === lines[0]);
    if (w && into) reportPlan.push({ requires: [...new Set(lines), context], when: 'applied', value: { ...empty(), filed: [{ name: 'Your note', title: displayName(nameOf(into.path)), kind: 'note', to: parentOf(into.path), note: into.path }] } });
  }
  for (const pile of capturedPiles) {
    // A pile partly asked about keeps its folder, with what is asked about and its words.
    if (!pile.anchor || partly.has(pile.pileId)) continue;
    // Every child's Bin must settle before its parent can hide it; effects belong to the child's dependencies.
    const children = operations.filter((o) => (o.effect.kind === 'bin' || o.effect.kind === 'move')
      && o.effect.before.parents.includes(pile.anchor?.fileId ?? '')).map((o) => o.operationId);
    const op = await add({ kind: 'bin', before: pile.anchor, capturedChildIds: pile.childFileIds }, children);
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
  if (tableWrite) {
    const content = await utf8(tableWrite.text);
    const op = tableWrite.file && tableWrite.content
      ? await add({ kind: 'write-runner-json', before: seen(tableWrite.file), beforeContent: tableWrite.content,
        path: SYSTEM.typeTable, text: tableWrite.text, content })
      : await add({ kind: 'write-runner-json', before: null, beforeContent: null, parent: { fileId: sys?.id ?? '' },
        createKey: (await runKeys(opts.runId))('table'), path: SYSTEM.typeTable, text: tableWrite.text, content });
    for (const id of tableRecords) derive(id, op);
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
    const answered = [...new Set([...asked.flatMap((l) => [...need(l.rec.id).edits, ...need(l.rec.id).derived]), ...notes])];
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
  const questionsText = questionsList === null ? null : questionsJson(questionsList, rounds);
  if (questionsText !== null) {
    // It waits for every operation derived from the answers it drops (R4-1), so a question stays until its work is done,
    // and for the moves of the piles its new question is about, so it is asked once they are filed.
    const derived = [
      ...journal.flatMap((l) => (l.rec.kind === 'answer' ? need(l.rec.id).derived : [])),
      ...[...stateAsks.keys()].flatMap((id) => {
        const edit = editOf.get(id);
        return edit ? [edit, ...operations.filter((o) => o.effect.kind === 'move' && o.effect.before.fileId === id && o.dependsOn.includes(edit)).map((o) => o.operationId)] : [];
      }),
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
  // Only a published question leaves a frozen artifact that suppresses a later offer.
  if (questionsOp && newProposals.length && sys?.folder) {
    const parent: Target = proposalFolder?.folder ? { fileId: proposalFolder.id }
      : { createdBy: await add({ kind: 'create-folder', parent: { fileId: sys.id }, name: nameOf(SYSTEM.proposals), createKey: newKey('folder') }, [questionsOp]) };
    for (const proposal of newProposals) {
      const text = `${JSON.stringify({ v: 1, ...proposal }, null, 2)}\n`;
      await add({ kind: 'create-text', parent, name: `${proposal.id}.json`, createKey: newKey('runner'), text, content: await utf8(text), purpose: 'runner-json' }, [questionsOp]);
    }
  }
  // Rules.md made from the template's empty one when it is missing (R3-4); every rule line it words waits for it.
  // When it is there, its rules are worded by its one note edit above, which their archives wait for (rule 7).
  const rulesMade = rules.made !== null
    ? await add({ kind: 'create-text', parent: { fileId: rootId }, name: RULES_PATH, createKey: newKey('rules'), text: rules.made, content: await utf8(rules.made), purpose: 'generated' })
    : null;
  if (rulesMade) reportPlan.push({ requires: [rulesMade], when: 'applied', value: {
    ...empty(), updated: [{ path: RULES_PATH, what: 'Rules updated.', op: rulesMade }],
  } });
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
  let pendingTo: Target | null = null;
  if (pointers.size && changesFolder) {
    const path = `${SYSTEM.changes}/pending`;
    const folder = ix.file(path);
    const parent: Target = folder ? { fileId: folder.id } : { createdBy: await add({ kind: 'create-folder',
      parent: { fileId: changesFolder.id }, name: 'pending', createKey: newKey('folder') }) };
    const run = ix.file(`${path}/${opts.runId}`);
    pendingTo = run ? { fileId: run.id } : { createdBy: await add({ kind: 'create-folder', parent,
      name: opts.runId, createKey: newKey('folder') }) };
  }
  /** What each record's archive waits for: the plan's `needs`. */
  const archives = new Map<string, readonly string[]>();
  const satisfiedAppends: SatisfiedAppend[] = [];
  // An original and its inverse taken together give no row and no count (`pairsOf`, TL-P4-27 addendum 3); both apply.
  const paired = pairsOf(journal.map((l) => l.rec));
  for (const line of journal) {
    // Unreachable: a captured line has its changes folder, so its archive is there or planned above.
    if (!archiveTo) throw new BowerError('unknown', OWN_FILES);
    const write = line.rec.kind === 'request' ? requestsOp : line.rec.kind === 'answer' ? questionsOp : null;
    const n = need(line.rec.id);
    // A person's request (`settleRequest`) also waits for the sources it settles on: its lines', or every thing filed.
    const sourceMoves = line.rec.kind === 'request' ? settlement.sourcesOf(line.rec.id, runSources).flatMap((id) => moveOf.get(id) ?? []) : [];
    const derived = [...new Set([...(write ? [write] : []), ...n.edits, ...n.derived, ...sourceMoves])];
    archives.set(line.rec.id, derived);
    const moves: string[] = [];
    for (const f of line.files) {
      const pointer = pointers.get(line.rec.id) ?? [];
      // Pending moves run once append outcomes are known, including a definite clash. The archive still waits
      // for successful edits. Thus only a clash leaves the unchanged request in its originating run's folder.
      const pending = pendingTo && pointer.length ? await add({ kind: 'move', before: seen(f), parent: pendingTo,
        name: f.name, properties: { [PROP.run]: null } }, [...pointer, ...n.edits, ...sourceMoves]) : null;
      moves.push(await add({ kind: 'move', before: seen(f), parent: archiveTo, name: f.name,
        properties: line.waitingRun ? { [PROP.run]: null } : {} }, [...derived, ...(pending ? [pending] : [])]));
    }
    // A line already there completes its request with the request's archive.
    for (const p of satisfied.filter((x) => x.consent.requestId === line.rec.id)) if (moves[0]) {
      satisfiedAppends.push({ consent: p.consent, entry: p.line.entry, before: seen(p.file), path: p.path, text: new TextDecoder().decode(p.bytes), content: p.before, operationId: moves[0], editContract: 2 });
    }
    // Its "Left as you wrote them" rows, once a source it settles on is filed, or in its archive's one row when none is
    // (an archive move has exactly one row, `grounded`).
    const withArchive: LeftAsWritten[] = [];
    for (const { requestId: _, sources: rowSources, ...row } of line.rec.kind === 'request' ? settlement.rowsOf(line.rec.id) : []) {
      const filed = (rowSources ?? runSources).flatMap((id) => moveOf.get(id) ?? []);
      if (!filed.length) withArchive.push(row);
      for (const op of filed) reportPlan.push({ requires: [op], when: 'applied', value: { ...empty(), leftAsWritten: [row] } });
    }
    const left = withArchive.length ? { leftAsWritten: withArchive } : {};
    if (paired.has(line.rec.id)) {
      reportPlan.push({ requires: [...moves, ...archiveChain], when: 'applied', value: { ...empty(), yourChanges: 0 } });
    } else if (line.rec.undoes) {
      // Every later inverse has its existing wording in an ordinary row, after its effects and archive.
      const requires = [...moves, ...archiveChain, ...derived];
      reportPlan.push({ requires, when: 'applied', value: {
        ...empty(), yourChanges: 1, updated: [{ path: line.rec.path ?? RULES_PATH, what: line.rec.what, op: requires[0] }],
      } });
    } else if (rulesOp && rules.worded.has(line.rec.id)) {
      // A rule this run words: counted once it and its line's archive applied.
      reportPlan.push({ requires: [rulesOp, ...moves, ...archiveChain], when: 'applied', value: { ...empty(), rulesWorded: 1 } });
    } else if (line.rec.kind === 'request' && requestsOp) {
      reportPlan.push({ requires: [requestsOp, ...moves, ...archiveChain], when: 'applied', value: { ...empty(), requests: [line.rec.text ?? line.rec.what], ...left } });
    } else {
      // A rule taken out or already there is a rule record, not one of your other changes (TL-P2-23, TL-P2-33 §3).
      // An answer whose subject was gone says so in its answered row, never as a thing set aside.
      const gone = answeredRows.get(line.rec.id);
      reportPlan.push({ requires: [...moves, ...archiveChain], when: 'applied', value: { ...empty(), yourChanges: line.rec.kind === 'rule' ? 0 : 1, ...(gone ? { answered: [gone] } : {}), ...left } });
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
    ...(satisfiedAppends.length ? { satisfiedAppends } : {}),
  };
  // v1 whenever the plan has no edit (TL-P2-20 Format): its identities and bytes are exactly as before.
  const v1: Operation[] = operations.flatMap((o) => (o.effect.kind === 'edit-text' || o.effect.kind === 'maintain' ? [] : [{ ...o, effect: o.effect }]));
  const manifest: Manifest | ManifestV2 = v1.length === operations.length ? { v: 1, ...head, operations: v1 } : { v: 2, ...head, operations };
  const checked = await parseRunManifestV2((await canonical(manifest)).bytes, rootId, RUNNER_WRITES, false);
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
  const checked = await parseRunManifestV2((await canonical(manifest)).bytes, rootId, RUNNER_WRITES, false);
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

/** A journal record and its physical copies; only a waiting request points to earlier run evidence. */
type JournalLine = { rec: JournalRecord; files: DriveFile[]; sha256: string; waitingRun: string | null };

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
    if (!first || all.some((c) => c.sha256 !== first.sha256 || c.file.parents.length !== 1 || ix.waitingRun(c.file.id) !== ix.waitingRun(first.file.id))) {
      left += all.length;
      continue;
    }
    lines.push({ rec: first.rec, files: all.map((c) => c.file), sha256: first.sha256, waitingRun: first.rec.kind === 'request' ? ix.waitingRun(first.file.id) : null });
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
      const out: RuleRemove = { recordId: rec.id, text: rec.removes, since: rec.at };
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
 * The rule lines an applied change words, as `applyChanges` decides them (`ruleSequence`, the one home): each add unless
 * it repeats a rule or a later removal takes it out (an add that repeats one is satisfied and not counted). Null when the text after it would not hold
 * exactly those rules (R3-4: what is counted is what the written text holds).
 */
function wordedBy(before: string, change: RulesWording, after: string): ReadonlySet<string> | null {
  const rules = managedRules(before, parseNote(RULES_PATH, before).byBower);
  const { removed, accepted } = ruleSequence(rules, change.add, change.remove);
  const kept = rules.filter((r) => !removed.has(r.text)).length;
  const worded = new Set(accepted.map((a) => a.recordId));
  return managedRules(after, parseNote(RULES_PATH, after).byBower).length === kept + worded.size ? worded : null;
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
  // Its removals have nothing to take out, but still take back an add before them (`ruleSequence`).
  const result = applyChanges(new TextEncoder().encode(empty), [change]);
  const made = result.ok ? wordedBy(empty, change, result.text) : null;
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
function questionsJson(questions: Question[], rounds: QuestionRound[] = []): string {
  return `${JSON.stringify({ v: 1, questions, ...(rounds.length ? { rounds } : {}) } satisfies QuestionsFile, null, 2)}\n`;
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
type WantedLine = { consent?: TimelineConsent; entry: EditEntry; record: string | null; what: string | null; after: string | null };
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

/** Where the runs' folders are: a run's manifest is in its own folder there (`records.ts`). */
const RUNS_PATH = `${SYSTEM.dir}/${RUNS_NAME}`;
/**
 * The Current state changes a manifest records, each with its note's file id and the lines it wrote (an undo that gives
 * lines back under the mark they had says so: its lines are not Bower's).
 */
function stateChangesOf(m: Manifest | ManifestV2): Array<{ fileId: string; lines: string[] }> {
  return m.operations.flatMap((op) => {
    const e = op.effect;
    if (e.kind !== 'edit-text') return [];
    return e.changes.flatMap((c) => (c.kind === 'state-rewrite' && c.release === undefined && c.mark === undefined ? [{ fileId: e.before.fileId, lines: [...c.lines] }] : []));
  });
}

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
  /** The canonical index rebuilt in memory for a bootstrap or missing-index plan. */
  index?: string;
  /** Bounded persisted hot context, supplied by the runner before semantic reads. */
  hot?: string;
  context?: OwnershipContext;
  rootId: string;
  runId: string;
  allowWeb: boolean;
}
