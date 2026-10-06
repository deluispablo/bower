/**
 * The runner, faked: what a tidy-up plans for the Bower folder on a FakeDrive,
 * with no AI. It plans one fixed contract B manifest from what it reads: the
 * ready piles in the inbox, their things filed where the demo would (the
 * fixture's plan, else a guess from the pile's words), the rules you typed,
 * your requests, answered questions and the journal. The run service
 * (`fake-run-service.ts`) applies it, recoverably. Nothing writes outside a
 * manifest any more (TL-P2-38): the legacy runner that did is gone, and its
 * records are only read (`fake-worker.ts`).
 */
import type { DriveFile } from '../drive/drive-api';
import { applyChanges, renameOk, renamesFor, ruleAddOk, ruleRemoveOk, savedLinkKey, timelineDate } from '../contracts/note-edit';
import { canonicalRecordJson } from '../contracts/record-json';
import { parseRunManifestV2, recordableId, recordableRecordId, type Capture as ManifestCapture, type CapturedMember, type CapturedPile, type Change, type EditEntry, type EffectV2, type Manifest, type ManifestRunReport, type ManifestV2, type Operation, type OperationV2, type Rename, type ReportContribution, type RuleAdd, type RuleRemove, type Target, type VerifiedContent } from '../contracts/run-manifest';
import type { FakeDrive } from '../drive/fake-drive';
import type { DeclarationResult } from '../contracts/pile-declaration';
import { DISAGREEMENTS, FILING, HUB_UPDATES, MERGES, NOT_LOOKED_UP, citedName, disagreement, disagreementAnswer, guessFolder, saltmereQuestion, scriptedRequest, seedPiles, wordRule, type HubUpdate } from '../demo/fixture';
import { PILE_NOTE, safeInboxName } from '../piles';
import { SET_ASIDE_TEXT, accountLoose, accountPile, contextRemoved, findDeclaration, journalValues, looseSetAside, recordablePile, recordedNote, sameText, writable, type Digest } from '../pile-readiness';
import { displayName, freeName, join, kindOf, nameOf, parentOf, thingName } from '../tree';
import { BowerError, PARA_ROOTS, type Pile, type PileItem, type Question, type Request, type SetAside } from '../types';
import { DriveVault } from '../vault/drive-vault';
import { isJournalRecord, type JournalRecord } from '../vault/journal';
import { PROP, SYSTEM, isRunnerFile, type HashesFile, type QuestionsFile, type RequestsFile } from '../vault/layout';
import { ruleLike } from '../rules';
import { linkTitle, savedLinkAddress, savedLinkUrl } from '../search-text';
import { sha256 } from '../vault/hashes';
import { noteRefusal, parseNote, serializeNote, type ParsedNote } from '../vault/note-format';
import { parseRules, serializeRules } from '../vault/rules-format';
import { VaultIndex } from '../vault/vault-index';
import { NOT_FILED, canonical, grounded, groundedKeys, seen } from './fake-run-records';
import { B_FAILURE } from './fake-run-service';

/** The demo's plan for each sample inbox thing, by the name it was added under. */
const PLAN_BY_NAME = new Map(
  seedPiles(0)
    .flatMap((p) => p.items)
    .flatMap((it) => {
      const plan = FILING[it.id];
      return plan ? [[it.name, plan] as const] : [];
    }),
);

/** Hub notes a full tidy-up brings up to date, as the demo does: on the B path, a Timeline line on Bower's notes only. */
const UPDATES = HUB_UPDATES;

/** Why a declared pile waits for a later tidy-up, and what you can do about it. */
export const SET_ASIDE = {
  notArrived: 'Some of its things have not arrived yet.',
  notChecked: 'Bower could not check some of its things. Try again.',
  unreadable: 'Bower could not read the list of what is in this pile. Try again.',
  changed: 'Some of its things changed after they were added. Remove it and add them again.',
  declaration: 'Bower found two different lists of what is in this pile. Remove it and add it again.',
  empty: 'Nothing is left in it. Remove it from your inbox.',
  noteFormat: "This pile's note needs a newer Bower.",
  noteDamaged: "Bower can't read this pile's note.",
  notTidied: "Bower couldn't tidy this up yet. Try again.",
} as const;

/** The Inbox's refusals of a pile's note that hold it from a run, worded as the report says them. */
const HELD_BY_INBOX: Partial<Record<SetAside, string>> = { 'note-format': SET_ASIDE.noteFormat, 'note-damaged': SET_ASIDE.noteDamaged };

/**
 * What a run takes of a pile folder, fixed when it starts: every child it
 * accounts for, and a declared note to write again first. The folder goes to
 * the Bin only when nothing else is left in it.
 */
type Capture = { blocked: string } | { blocked: null; captured: Set<string>; declared?: Declared; leftover?: Leftover };
/**
 * A ready declared pile's declaration, as the B path captures it. `memberKeys` are the members still in its
 * folder: those accounted for (disposed of, or arrived and left) count as filed (TL-P2-29 second amendment).
 */
type Declared = { ref: { declarationId: string; sha256: string }; contextKey: string | null; memberKeys: ReadonlySet<string> };
/**
 * What is left in a declared pile's folder once every declared member is accounted for (TL-P2-29): an
 * ordinary observed pile, whose context is the note bound by this key when it is there, otherwise the first.
 */
type Leftover = { contextKey: string | null };

/** A file's size and hash from the pretend Drive's stored bytes (`fake-stored`); null when they cannot be read. */
async function storedDigest(drive: FakeDrive, f: DriveFile): Promise<Digest | null> {
  try {
    return await drive.storedDigest(f.id);
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Declared piles are taken only when every member arrived with the bytes declared for it, or was filed with them. */
async function captureOf(drive: FakeDrive, rootId: string, piles: readonly Pile[]): Promise<Map<string, Capture>> {
  const listing = await drive.listAll(rootId);
  const ix = VaultIndex.build(rootId, listing);
  let records: Promise<unknown[]> | null = null;
  const journal = (): Promise<unknown[]> => (records ??= journalValues(ix.journalFiles(true), (id) => drive.readText(id)));
  const out = new Map<string, Capture>();
  // Each declaration copy is read once per run, whichever pile names it.
  const cache = new Map<string, DeclarationResult>();
  for (const pile of piles) {
    const folder = pile.path ? ix.file(pile.path) : undefined;
    // What a run record cannot carry holds only its pile, with the reason the Inbox shows too (TL-P2-38).
    if (pile.setAside === 'not-tidied') {
      out.set(pile.id, { blocked: SET_ASIDE.notTidied });
      continue;
    }
    if (folder && !folder.folder) {
      out.set(pile.id, await looseCapture(drive, rootId, listing, ix.file('Inbox'), folder, cache));
      continue;
    }
    if (!pile.path || !folder?.folder) continue;
    const children = listing.filter((f) => f.parents[0] === folder.id);
    const notes = children.filter((f) => !f.folder && f.name === PILE_NOTE).map((f) => f.id);
    const present = pile.items.map((i) => i.id).filter((id) => children.some((f) => f.id === id));
    // A note Bower will not parse holds its pile with the Inbox's own reason, checked first as the Inbox does.
    const refused = pile.setAside === 'note-format' || pile.setAside === 'note-damaged' ? HELD_BY_INBOX[pile.setAside] : undefined;
    if (refused) {
      out.set(pile.id, { blocked: refused });
      continue;
    }
    const found = await findDeclaration(listing, rootId, folder, (id) => drive.readBytes(id), cache);
    // What a run record cannot carry waits, with the reason the Inbox shows too (TL-P2-21): the names, and the raw
    // text (front matter included) of the one note the run records. Another pile note is never read here.
    const contextKey = found.state === 'found' && found.declaration.context.kind === 'text' ? found.declaration.context.memberKey : null;
    const recorded = recordedNote(children, contextKey);
    let raw: string;
    try {
      raw = recorded ? await drive.readText(recorded.id) : '';
    } catch (e) {
      // A note Drive cannot give back now holds only this pile, as in the Inbox (TL-P2-08 (a)); a sign-out stops all.
      if (!(e instanceof BowerError) || e.code === 'auth') throw e;
      console.error(e);
      out.set(pile.id, { blocked: SET_ASIDE.notChecked });
      continue;
    }
    // A note with text no record can carry is a damaged note, as in the Inbox (TL-P2-36 (9)).
    if (!writable([raw])) {
      console.error(new BowerError('unknown', SET_ASIDE.noteDamaged), 'A pile note has text no run record can carry');
      out.set(pile.id, { blocked: SET_ASIDE.noteDamaged });
      continue;
    }
    // The note a run records is refused by its format or its damage as in the Inbox; nothing else of the pile is read.
    if (recorded) {
      let refusal: ReturnType<typeof noteRefusal> = null;
      try {
        parseNote(join(pile.path, PILE_NOTE), raw);
      } catch (e) {
        refusal = noteRefusal(e);
        if (!refusal) throw e;
        console.error(e);
      }
      if (refusal) {
        out.set(pile.id, { blocked: refusal === 'newer' ? SET_ASIDE.noteFormat : SET_ASIDE.noteDamaged });
        continue;
      }
    }
    if (!writable([folder.name, ...children.filter((f) => !f.folder).map((f) => f.name)])) {
      console.error(new BowerError('unknown', SET_ASIDE.notChecked), 'A pile has text no run record can carry; it waits as not checked');
      out.set(pile.id, { blocked: SET_ASIDE.notChecked });
      continue;
    }
    // A pile the Inbox could not check (its note could not be read there) is held too, and only it (TL-P2-08 (a)).
    if (pile.setAside === 'not-checked') {
      out.set(pile.id, { blocked: SET_ASIDE.notChecked });
      continue;
    }
    if (found.state === 'unmarked') {
      out.set(pile.id, { blocked: null, captured: new Set([...pile.items.map((i) => i.id), ...notes]) });
      continue;
    }
    // A list that cannot be read holds only its own pile (TL-P2-08 (a)); the reader's listing logged it once.
    if (found.state !== 'found') {
      out.set(pile.id, { blocked: found.state === 'conflict' ? SET_ASIDE.declaration : found.state === 'unreadable' ? SET_ASIDE.unreadable : SET_ASIDE.notChecked });
      continue;
    }
    // The accounting the Inbox shares: disposed members are filed, the rest looked up (TL-P2-29 second amendment).
    const readiness = await accountPile(found.declaration, found.sha256, folder, listing, (id) => drive.readBytes(id), (f) => storedDigest(drive, f), (keys) => drive.binnedByItem(rootId, keys));
    if (readiness.blocked) {
      out.set(pile.id, { blocked: readiness.blocked === 'changed' ? SET_ASIDE.changed : readiness.blocked === 'not-arrived' ? SET_ASIDE.notArrived : SET_ASIDE.notChecked });
      continue;
    }
    // The context only has to have arrived: any note is the person's words. Missing though never removed
    // through Bower, the pile waits, held (TL-P2-21): the runner never writes into the Inbox (TL-P2-32); Try
    // again in the app writes it again from its first words (TL-P2-08 b).
    const context = found.declaration.context;
    if (context.kind === 'text' && !children.some((f) => f.appProperties?.[PROP.item] === context.memberKey) && !contextRemoved(await journal(), pile.path)) {
      out.set(pile.id, { blocked: SET_ASIDE.notArrived });
      continue;
    }
    // A blank note is context removed: with no member left, the pile is empty.
    if (!present.length && !pile.text.trim()) {
      out.set(pile.id, { blocked: SET_ASIDE.empty });
      continue;
    }
    // Ready, so every member not disposed of is either still in the folder or arrived and left (accounted for).
    const remaining = readiness.remaining;
    // Every declared member accounted for: what is left is an ordinary pile (TL-P2-29).
    if (found.declaration.members.length && !remaining.length) {
      out.set(pile.id, { blocked: null, captured: new Set([...present, ...notes]), leftover: { contextKey: context.kind === 'text' ? context.memberKey : null } });
      continue;
    }
    const declared: Declared = {
      ref: { declarationId: found.declaration.declarationId, sha256: found.sha256 },
      contextKey: context.kind === 'text' ? context.memberKey : null,
      memberKeys: new Set(remaining),
    };
    out.set(pile.id, { blocked: null, captured: new Set([...present, ...notes]), declared });
  }
  return out;
}

/**
 * A loose file (fixture 07), by the rule the Inbox shares (`accountLoose`): observed when it carries no declaration
 * or every copy is gone; declared, it is ready when its one member is in the inbox with the declared bytes.
 */
async function looseCapture(drive: FakeDrive, rootId: string, listing: readonly DriveFile[], inbox: DriveFile | undefined, file: DriveFile, cache: Map<string, DeclarationResult>): Promise<Capture> {
  const lookup = await findDeclaration(listing, rootId, file, (id) => drive.readBytes(id), cache);
  const loose = await accountLoose(lookup, inbox, listing, (id) => drive.readBytes(id), (f) => storedDigest(drive, f), (keys) => drive.binnedByItem(rootId, keys));
  const why = looseSetAside(loose);
  if (why) return { blocked: SET_ASIDE_TEXT[why] };
  if (!loose.found) return { blocked: null, captured: new Set([file.id]) };
  const { declaration, sha256: hash, accounting } = loose.found;
  // Filed already (a consumed disposition) and put back in the inbox: an ordinary loose file now.
  if (!accounting.remaining.length) return { blocked: null, captured: new Set([file.id]), leftover: { contextKey: null } };
  return { blocked: null, captured: new Set([file.id]), declared: { ref: { declarationId: declaration.declarationId, sha256: hash }, contextKey: null, memberKeys: new Set(accounting.remaining) } };
}

/**
 * A run's plan, fixed before any effect: always the B path with its manifest (TL-P2-38). What it cannot take it holds,
 * and what Bower's own checks refuse is refused before admission; there is no other path.
 */
export type RunPlan = { path: 'b'; manifest: Manifest | ManifestV2 };

export interface PlanOptions {
  scope: 'all' | 'instructions';
  allowWeb: boolean;
  runId: string;
  requestId: string;
  requestedAt: number;
  /** The hub notes a full run brings up to date; the demo's two by default. */
  updates?: readonly HubUpdate[];
}

export type { HubUpdate };

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
export async function planRun(drive: FakeDrive, rootId: string, opts: PlanOptions, editCap = EDITS_PER_RUN, held: ReadonlySet<string> = new Set()): Promise<RunPlan> {
  const all = opts.scope === 'all';
  const listing = await drive.listAll(rootId);
  const ix = VaultIndex.build(rootId, listing);
  const lines = await journalOf(drive, ix);
  let journal = lines;
  // Your rules (TL-P2-20 rules-wording): one change for every rule line, worded below in one edit of Rules.md, or
  // Rules.md made when it is missing; a line whose words cannot be worded stays pending.
  const ruleWords = ruleChangesOf(journal);
  // Bower's own files (TL-P2-17): a failed read refuses before admission and any effect; a malformed one is
  // replaced when the run writes it, its old entries never claimed; a missing one is made again.
  const sys = ix.file(SYSTEM.dir);
  const requests = ix.file(SYSTEM.requests);
  const hashesFile = ix.file(SYSTEM.hashes);
  const parsed = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(e);
      return null;
    }
  };
  const requestsValue = requests ? parsed(await ownText(drive, requests)) : null;
  const requestsBroken = !!requests && !isRunnerFile(SYSTEM.requests, requestsValue);
  const requestsDone = isRunnerFile(SYSTEM.requests, requestsValue) ? requestsValue.done : [];
  const hashesText = hashesFile ? await ownText(drive, hashesFile) : null;
  const hashesBroken = hashesText !== null && !isRunnerFile(SYSTEM.hashes, parsed(hashesText));
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
    const m = MERGES.find((x) => x.item === item.name && yes.has(x.question));
    return m ? { into: follow(m.into), title: m.title, line: m.line, answer: yes.get(m.question) ?? '' } : null;
  };
  /** Answers whose merge waits with its pile: they stay unarchived and keep their question (R4-1). */
  const heldAnswers = new Set<string>();

  const reader = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'runner' });
  // An instructions run takes no pile: it reads only your changes.
  const piles = all ? await reader.piles() : [];
  // An inbox emptied after the Worker looked at it: the Worker's own refusal, before any effect.
  if (all && !piles.length) throw new BowerError('conflict', NOTHING_WAITING);
  const capture = await captureOf(drive, rootId, piles);
  const verified = async (f: DriveFile, encoding: 'utf8' | 'blob'): Promise<VerifiedContent | null> => {
    const d = await storedDigest(drive, f);
    return d ? { encoding, size: d.size, sha256: d.sha256, provenance: 'fake-stored', observedModifiedTime: f.modifiedTime } : null;
  };
  /** A runner file's stored content as planned on; one that cannot be read refuses the run before admission. */
  const ownVerified = async (f: DriveFile): Promise<VerifiedContent> => {
    const v = await verified(f, 'utf8');
    if (!v) throw new BowerError('unknown', OWN_FILES);
    return v;
  };

  // The ready piles and their things, exactly as captured.
  const capturedPiles: CapturedPile[] = [];
  const members: CapturedMember[] = [];
  const things: Array<{ pile: Pile; folder: DriveFile; item: PileItem; file: DriveFile; content: VerifiedContent; words: string; merge: Merge | null }> = [];
  /** Captured piles the run asks a question about (TL-P2-37 Q1 (a)). */
  const asking = new Set<string>();
  const fromWords: Array<{ pileId: string; folder: DriveFile; words: string; context: DriveFile | null }> = [];
  for (const pile of piles) {
    const marks = { members: members.length, things: things.length };
    /**
     * A pile this plan cannot take as it read it is held (TL-P2-38): nothing of it is captured or written, and the
     * rest of the run goes on. A race clears on the next run; what the Inbox can see, it shows (`untidied`).
     */
    const hold = (why: string): void => {
      members.length = marks.members;
      things.length = marks.things;
      console.error(new BowerError('unknown', SET_ASIDE.notTidied), `A pile waits for the next tidy-up: ${why}`);
    };
    const folder = pile.path ? ix.file(pile.path) : undefined;
    // Not in this listing (a loose thing not arrived, or one still on its way): nothing to capture (TL-P2-21).
    if (!folder) continue;
    // A loose pile (TL-P2-16 item 5) has no folder: its one file is its only child, and nothing goes to the Bin.
    const loose = !folder.folder;
    const cap = capture.get(pile.id);
    if (!cap) {
      hold('it changed while the run read the inbox');
      continue;
    }
    // A pile that is not ready is held (TL-P2-21): not captured, no effect, no report row; its reason shows in the Inbox.
    if (cap.blocked !== null) continue;
    // A pile whose merge line waits past the edit cap waits whole, with its answer (planned again without it).
    if (held.has(pile.id)) {
      for (const item of pile.items) {
        const m = mergeOf(item);
        if (m) heldAnswers.add(m.answer);
      }
      continue;
    }
    // A pile id no run record can carry is held (TL-P2-38); the Inbox holds it already, this keeps it so.
    if (!recordableId(pile.id)) {
      hold('its id cannot be recorded');
      continue;
    }
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
    let lost: string | null = null;
    for (const item of pile.items) {
      const file = children.find((f) => f.id === item.id);
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
      things.push({ pile, folder, item, file, content, words, merge: mergeOf(item) });
    }
    // A pile of words only, or of pile notes only (TL-P2-32), becomes a generated note from its context (TL-P2-17),
    // under a main folder; its other pile notes stay as uncaptured children. A pile with no words either has nothing
    // to write, so it is left as it is, untouched, like a held pile.
    const wordsOnly = !pile.items.length || (!taken.length && !declared);
    if (wordsOnly && (!words.trim() || !generatedPlace(guessFolder(words, 'note')))) continue;
    // Every member still in the folder is taken; those accounted for were filed already and are not captured again.
    if (!lost && ((!taken.length && !wordsOnly) || (declared && keys.length !== declared.memberKeys.size))) lost = 'one of its members is not among its things';
    // Its names must be ones a run record can carry, as the Inbox checks them (`recordablePile`).
    if (!lost && !recordablePile(pile.id, [folder.name, ...members.slice(marks.members).map((m) => m.file.name), ...(note ? [note.name] : [])])) lost = 'a name cannot be recorded';
    if (lost) {
      hold(lost);
      continue;
    }
    let context: CapturedPile['context'] = { kind: 'absent' };
    if (note) {
      const text = noteText;
      const stored = await verified(note, 'utf8');
      // The note is recorded as it was read: its text must be the very bytes stored (`sameText`, as in the Inbox).
      if (!stored || !(await sameText(text, stored))) {
        hold('its note is not the text the run read');
        continue;
      }
      // An observed pile invents no keys (guard 6): its context carries none.
      context = { kind: 'text', memberKey: declared ? contextKey : null, file: seen(note), text, content: stored };
    }
    // Everything this pile puts in the plan must be text a record can carry; a pile whose words or names cannot
    // (half of a character) is held alone, untouched, and the rest of the run goes on (review b-dest-review-1).
    const written = { folder: folder.name, words, context: context.kind === 'text' ? context.text : null, names: members.slice(marks.members).map((m) => m.file.name), note: wordsOnly ? generatedName(words) : null };
    if (!canonicalRecordJson(written).ok) {
      members.length = marks.members;
      things.length = marks.things;
      console.error(new BowerError('unknown', NOT_WRITABLE), 'A pile has text no run record can carry; it waits for the next tidy-up');
      continue;
    }
    capturedPiles.push({
      pileId: pile.id,
      source: declared ? { kind: 'declared', ref: declared.ref } : { kind: 'observed' },
      anchor: loose ? null : seen(folder),
      memberKeys: keys,
      childFileIds: [...taken, ...(note ? [note.id] : [])].sort(),
      context,
    });
    if (wordsOnly) fromWords.push({ pileId: pile.id, folder, words, context: !declared && note ? note : null });
    // The question a run asks about this pile (the stand-in for Claude asking), asked once it is filed.
    if (/saltmere/i.test(pile.text)) asking.add(pile.id);
  }

  // Only held piles and nothing else to read: nothing is admitted (TL-P2-21), the existing refusal.
  if (all && !capturedPiles.length && !journal.length) throw new BowerError('conflict', NOTHING_READY);

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
    const made: Wanted = { file: f, path, lines: [], renames: null, rules: null };
    wanted.set(f.id, made);
    return made;
  };
  // A hub line cites the thing this run files for it (C06): the note or file its plan makes of it, never a merge's.
  // The line waits for that thing's move, so it never cites what is not there.
  const citeOf = (name: string | undefined): { source: string; fileId: string } | null => {
    const thing = name === undefined ? undefined : things.find((t) => t.item.name === name && !t.merge);
    const plan = thing ? PLAN_BY_NAME.get(thing.item.name) : undefined;
    return thing && plan ? { source: citedName(plan), fileId: thing.file.id } : null;
  };
  for (const u of all && date ? (opts.updates ?? UPDATES) : []) {
    const f = ix.file(u.path);
    if (!f || f.folder) continue;
    const cite = citeOf(u.cites);
    if (u.onlyCited && !cite) continue;
    const made = want(f, u.path);
    made.lines.push({ entry: { date: date ?? '', text: u.what, source: cite?.source ?? null }, record: null, what: u.what, after: cite?.fileId ?? null });
  }
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
    const scripted = scriptedRequest(l.rec.text ?? l.rec.what);
    if (scripted?.kind !== 'lookup') continue;
    const [path] = scripted.uses;
    const f = ix.file(path);
    if (!f || f.folder) continue;
    const line: WantedLine = { entry: { date: date ?? '', text: scripted.found.text, source: scripted.found.url }, record: l.rec.id, what: scripted.found.text, after: null };
    want(f, path).lines.push(line);
    lookups.set(l.rec.id, line);
  }
  // A disagreement's answer (C07, TL-P2-40): what you said goes on the stored note's Timeline, naming the answer, and
  // its question goes once that line is there (R4-1). The note's Current state waits for P4. The question is read
  // from Bower's questions.json, as it was asked.
  const answerLines = new Map<string, { fileId: string; line: WantedLine }>();
  const disagreed = journal.filter((l) => l.rec.kind === 'answer' && DISAGREEMENTS.some((r) => (l.rec.questionId ?? '').startsWith(`q-${r.id}-`)));
  const openFile = disagreed.length && date ? ix.file(SYSTEM.questions) : undefined;
  const openValue = openFile && !openFile.folder ? parsed(await ownText(drive, openFile)) : null;
  const open = isRunnerFile(SYSTEM.questions, openValue) ? openValue.questions : [];
  for (const l of disagreed) {
    const q = open.find((x) => x.id === l.rec.questionId);
    const said = q ? disagreementAnswer(q, l.rec.text === 'yes') : null;
    const path = said ? follow(said.note) : '';
    const f = said ? ix.file(path) : undefined;
    if (!said || !f || f.folder || !path.endsWith('.md')) continue;
    const line: WantedLine = { entry: { date: date ?? '', text: said.line, source: null }, record: l.rec.id, what: said.line, after: null };
    want(f, path).lines.push(line);
    answerLines.set(l.rec.id, { fileId: f.id, line });
  }
  // The rename and move lines this run takes; their renames as the resolver follows them (chains, `taken`).
  const moved = journal.filter((l) => l.rec.kind === 'rename' || l.rec.kind === 'move');
  const taken = new Set([...ix.entries().keys()].filter((p) => p.endsWith('.md')).map((p) => displayName(nameOf(p)).toLowerCase()));
  const allRenames = renamesFor(moved.map((l) => ({ id: l.rec.id, at: l.rec.at, kind: l.rec.kind, what: l.rec.what, ...(l.rec.path ? { path: l.rec.path } : {}), ...(l.rec.from ? { from: l.rec.from } : {}) })), taken);
  const renames = allRenames.filter(renameOk);
  // A rename no link can be written with keeps its lines where they are, as the resolver still follows them (rule 7).
  let holdRenames = renames.length !== allRenames.length;
  if (holdRenames) console.error('A former name cannot be written into links; the rename lines stay for the next tidy-up');
  if (renames.length) {
    for (const [path, entry] of ix.entries()) {
      if (entry.type !== 'file' || !path.endsWith('.md') || path.startsWith('Inbox/') || path.startsWith(`${SYSTEM.dir}/`)) continue;
      const f = ix.file(path);
      if (f && !f.folder) want(f, path).renames = renames;
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
  const candidates: Array<{ file: DriveFile; path: string; before: VerifiedContent; bytes: Uint8Array; rewrite: boolean; lines: WantedLine[]; rules: RulesWording | null }> = [];
  for (const w of [...wanted.values()].sort((a, b) => byCodePoint(a.path, b.path))) {
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
      if (!result.ok && result.reason !== 'unchanged' && mentions(bytes, w.renames)) {
        console.error(`A note's links could not be rewritten (${result.reason}); the rename lines stay for the next tidy-up`);
        holdRenames = true;
      }
    }
    // Each line on its own: one already there (from any day) is dropped; a person's note takes none.
    const lines: WantedLine[] = [];
    // A hub line with nothing to cite is there already when its words are, with or without a source (C06).
    const said = new Set(new TextDecoder().decode(bytes).split(/\r?\n/).flatMap((x) => {
      const m = /^- .*? · (.*?)(?: · \[\[[^\]]+\]\])?$/.exec(x);
      return m?.[1] === undefined ? [] : [m[1]];
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
    if (rewrite || lines.length || rules) candidates.push({ file: f, path: w.path, before, bytes, rewrite, lines, rules });
  }
  // At most editCap edits, in path order; the rest wait for the next run, which plans them again. Their rename lines
  // stay unarchived meanwhile (TL-P2-29 (1)).
  if (candidates.slice(editCap).some((c) => c.rewrite)) holdRenames = true;
  for (const l of candidates.slice(editCap).flatMap((c) => c.lines)) lineState.set(l, 'deferred');
  // Each kept note's changes together, in the contract's order; the text never depends on the record ids.
  const appendOf = (lines: WantedLine[]): Change[] => (lines.length
    ? [{ kind: 'timeline-append', recordIds: [...new Set([...lines, ...[...twins].filter(([, t]) => lines.includes(t)).map(([l]) => l)].flatMap((l) => (l.record === null ? [] : [l.record])))], entries: lines.map((l) => l.entry) }]
    : []);
  const changesOf = (c: (typeof candidates)[number], recordIds: string[]): Change[] =>
    [...(c.rewrite ? [{ kind: 'link-rewrite' as const, recordIds, renames }] : []), ...appendOf(c.lines), ...(c.rules ? [c.rules] : [])];
  const authored = candidates.slice(0, editCap).flatMap((c) => {
    const result = applyChanges(c.bytes, changesOf(c, []));
    if (result.ok) return [{ c, text: result.text }];
    console.error(`A note edit was refused (${result.reason}); none is planned for it`);
    if (c.rewrite) holdRenames = true;
    return [];
  });
  const renameIds = holdRenames ? [] : moved.map((l) => l.rec.id);
  const edits: Array<{ file: DriveFile; path: string; what: string | null; before: VerifiedContent; changes: Change[]; text: string; after: string[] }> = [];
  for (const { c, text } of authored) {
    for (const l of c.lines) lineState.set(l, 'planned');
    if (c.rules) rulesState = 'planned';
    const what = c.lines.find((l) => l.what !== null)?.what ?? null;
    const after = [...new Set(c.lines.flatMap((l) => (l.after === null ? [] : [l.after])))];
    edits.push({ file: c.file, path: ix.pathOf(c.file.id) ?? c.path, what, before: c.before, changes: changesOf(c, renameIds), text, after });
    places.set(c.file.id, c.file);
  }
  for (const [l, twin] of twins) lineState.set(l, lineState.get(twin) ?? 'refused');
  /** A merge's line, when its note is one a line can go to at all. */
  const lineOf = (m: Merge): WantedLine | undefined => wanted.get(ix.idOf(m.into) ?? '')?.lines.find((l) => l.record === m.answer && l.entry.text === m.line);
  const stateOf = (m: Merge | null): LineState | undefined => {
    const line = m ? lineOf(m) : undefined;
    return line ? lineState.get(line) : undefined;
  };
  // A merge whose line waits past the cap waits with its whole pile and its answer: planned again with that pile
  // held, so its question is never dropped (rule 7, R4-1). A refused line is not a wait (TL-P2-35): see below.
  const waitingPiles = things.filter((t) => stateOf(t.merge) === 'deferred').map((t) => t.pile.id);
  if (waitingPiles.length) return planRun(drive, rootId, opts, editCap, new Set([...held, ...waitingPiles]));
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
  // Lines held back stay where they are, uncaptured, for the next run (rule 7).
  if (holdRenames) journal = journal.filter((l) => !moved.includes(l));
  // An answer whose line is not written waits for the next run with its question, as a merge's does (R4-1).
  const heldSaid = new Set([...answerLines].filter(([, a]) => !['planned', 'present'].includes(lineState.get(a.line) ?? '')).map(([id]) => id));
  if (heldSaid.size) {
    console.error(`${heldSaid.size} answers wait for the next tidy-up: what you said could not be written now`);
    journal = journal.filter((l) => !heldSaid.has(l.rec.id));
  }
  // A lookup whose line is not written (past the cap, a note changed while read, refused) waits for the next run.
  const heldLookups = new Set([...lookups].filter(([, line]) => !['planned', 'present'].includes(lineState.get(line) ?? '')).map(([id]) => id));
  if (heldLookups.size) {
    console.error(`${heldLookups.size} lookup requests wait for the next tidy-up: their result could not be written now`);
    journal = journal.filter((l) => !heldLookups.has(l.rec.id));
  }
  if (heldAnswers.size) journal = journal.filter((l) => !heldAnswers.has(l.rec.id));
  const rules = rulesPlanOf(ruleWords, rulesFile, rulesState, rulesWorded);
  if (rules.left.size) journal = journal.filter((l) => !rules.left.has(l.rec.id));
  // An instructions run with no line it can take, once every held line is left out, has nothing to read: the
  // existing refusal, before admission.
  if (!all && !journal.length) throw new BowerError('conflict', NOTHING_TO_READ);
  const edited = new Set(edits.map((e) => e.file.id));
  const filing: Array<{ thing: (typeof things)[number]; to: string; name: string; note?: SavedNote; merge?: MergeState }> = [];
  for (const thing of things) {
    // A merge that fell back on a refused line: the note it could not join is captured, grounding its row's name.
    const fell = fallbackOf(thing);
    const target = fell && fell.alone !== null ? ix.file(fell.into) : undefined;
    if (target && !target.folder) places.set(target.id, target);
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
    const url = linkText === null || PLAN_BY_NAME.has(thing.item.name) ? null : savedLinkUrl(linkText);
    const title = PLAN_BY_NAME.get(thing.item.name)?.title ?? (url ? `${linkTitle(url)}.url` : thing.file.name);
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
      const to = guessOf(thing.words, thing.item);
      destination(to);
      const noteName = freeName(planned, to, title);
      plannedFile(join(to, noteName));
      const name = freeName(planned, to, thing.file.name);
      plannedFile(join(to, name));
      filing.push({ thing, to, name, note: { name: noteName, key, text, what: `Saved from ${address}.` } });
      continue;
    }
    const to = guessOf(thing.words, thing.item);
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
    const own = PLAN_BY_NAME.get(thing.item.name)?.note;
    if (!own || !generatedPlace(parentOf(own))) continue;
    if (freeName(planned, parentOf(own), nameOf(own)) !== nameOf(own)) continue;
    destination(parentOf(own));
    plannedFile(own);
    const what = `A note for ${displayName(name)}.`;
    const text = serializeNote({ summary: what, properties: [], tags: [], currentState: [], body: '', timeline: [{ date: noteDate, text: 'Filed by Bower.', source: name }], byBower: true });
    generated.push({ to: parentOf(own), name: nameOf(own), text, what, after: thing.file.id, pileId: null, aside: thing.file.name, context: null });
  }
  for (const { pileId, folder, words, context } of fromWords) {
    const to = guessFolder(words, 'note');
    destination(to);
    const name = freeName(planned, to, generatedName(words));
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
    for (const rule of note.pileId === null ? [] : DISAGREEMENTS.filter((r) => r.words.test(words))) {
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
      const question = disagreement(words, displayName(note.name), { name: displayName(nameOf(rule.note)), value }, rule, opts.requestedAt);
      if (question && note.pileId !== null) disagreeing.push({ pileId: note.pileId, question });
    }
  }
  // A comparison request (C08, TL-P2-40 (1)): a generated note under a main folder (TL-P2-17) with a GFM table of
  // the notes it compares, read now, and the list of those sources. Only when every one is there and can be read.
  const compared = new Map<string, { to: string; name: string; text: string; what: string }>();
  for (const l of journal.filter((x) => x.rec.kind === 'request')) {
    const scripted = scriptedRequest(l.rec.text ?? l.rec.what);
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
  const toAsk = [...(asking.size ? [saltmereQuestion(opts.requestedAt)] : []), ...disagreeing.map((d) => d.question)]
    .filter((q, i, all) => !answered.has(q.id) && all.findIndex((x) => x.id === q.id) === i);
  const questionsFile = ix.file(SYSTEM.questions);
  let questionsText: string | null = null;
  let fresh: Question[] = [];
  if ((answered.size || toAsk.length) && questionsFile) {
    const value = parsed(await ownText(drive, questionsFile));
    const readable = isRunnerFile(SYSTEM.questions, value);
    // An unreadable list is Bower's own file: replaced with a fresh one (TL-P2-17); the report never claims its old entries.
    if (!readable) console.error(new BowerError('unknown', QUESTIONS_REPLACED), `${SYSTEM.questions} is not a valid questions file`);
    const all = readable ? value.questions : [];
    fresh = toAsk.filter((q) => !all.some((x) => x.id === q.id));
    const left = [...all.filter((q) => !answered.has(q.id)), ...fresh];
    if (!readable || left.length !== all.length || fresh.length) questionsText = questionsJson(left);
  } else if (toAsk.length && sys?.folder) {
    // A missing list is made again in `.bower` with the question (TL-P2-33 §2a).
    fresh = toAsk;
    questionsText = questionsJson(fresh);
  } else if (toAsk.length) {
    // No `.bower` yet: the run's own records make it; there is no list to ask in, so the question is not asked.
    console.error(new BowerError('unknown', NOT_ASKED), `${SYSTEM.dir} is missing; the question is not asked`);
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
  const capturedPlaces = [...places.values()].map((f) => ({ file: seen(f), path: ix.pathOf(f.id) ?? '' })).sort((a, b) => a.path.localeCompare(b.path));
  const captured = journal.map((l) => ({ recordId: l.rec.id, sha256: l.sha256, fileIds: l.files.map((f) => f.id) }));
  const captureValue: ManifestCapture = { piles: capturedPiles, members, journal: captured, places: capturedPlaces };
  const scope = { rootId };
  const captureId = (await canonical({ scope, runScope: opts.scope, capture: captureValue })).hash;

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
    made.set(path, await add({ kind: 'create-folder', parent: targetOf(parentOf(path)), name: nameOf(path), createKey: mintKey('folder') }));
  }
  const chainOf = (path: string): string[] => (made.has(path) ? [made.get(path) ?? '', ...chainOf(parentOf(path))] : []);
  const reportPlan: ReportContribution[] = [];
  const movesOf = new Map<string, string[]>();
  const moveOf = new Map<string, string>();
  const empty = (): ManifestRunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
  /** Each edit by the journal records it comes from (their archives wait for it, rule 7, R3-4), and by its note. */
  const editsFrom = new Map<string, string[]>();
  const editOf = new Map<string, string>();
  /** The operations derived from each answer (R3-4, R4-1): its merge's line and move. */
  const fromAnswer = new Map<string, string[]>();
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
      fromAnswer.set(fallback.answer, [...(fromAnswer.get(fallback.answer) ?? []), ...(created ? [created] : []), move]);
      if (fallback.alone !== null) {
        reportPlan.push({ requires: [move], when: 'applied', value: { ...empty(), setAside: [{ name: thing.file.name, why: `Bower couldn't add it to ${fallback.alone}, so it was filed on its own.` }] } });
      }
    }
    if (merge) {
      // The line first, then the move after it; filed with the note only when both applied (I4, R3-5).
      const line = merge.line === 'planned' ? editOf.get(ix.idOf(merge.into) ?? '') ?? null : null;
      fromAnswer.set(merge.answer, [...(fromAnswer.get(merge.answer) ?? []), ...(line ? [line] : []), move]);
      const row = line
        ? { name: thing.file.name, title: displayName(nameOf(merge.into)), kind: thing.item.kind, to, note: merge.into }
        : { name: thing.file.name, title: thingName(name), kind: thing.item.kind, to };
      reportPlan.push({ requires: [...(line ? [line] : []), move, ...chainOf(to)], when: 'applied', value: { ...empty(), filed: [row] } });
      reportPlan.push({ requires: [move], when: 'rejected', value: { ...empty(), setAside: [{ name: thing.file.name, why: NOT_FILED }] } });
      return;
    }
    if (note) {
      // R3-5: filed only with every operation for it; a rejected move (or its note's) leaves it to the next run.
      // The note it wrote is listed with the notes the run made; one reused is not (R4-2).
      const made = created && note.what !== null ? [{ path: join(to, note.name), what: note.what }] : [];
      reportPlan.push({ requires: [...(created ? [created] : []), move, ...chainOf(to)], when: 'applied', value: { ...empty(), filed: [{ name: thing.file.name, title: thingName(note.name), kind: thing.item.kind, to, note: join(to, note.name) }], created: made } });
      reportPlan.push({ requires: [move], when: 'rejected', value: { ...empty(), setAside: [{ name: thing.file.name, why: NOT_FILED }] } });
      return;
    }
    reportPlan.push({ requires: [move, ...chainOf(to)], when: 'applied', value: { ...empty(), filed: [{ name: thing.file.name, title: thingName(name), kind: thing.item.kind, to }] } });
    reportPlan.push({ requires: [move], when: 'rejected', value: { ...empty(), setAside: [{ name: thing.file.name, why: NOT_FILED }] } });
  };
  for (const f of filing.filter((x) => !x.merge)) await fileOne(f);
  // Each generated note, keyed by its own createKey; a pile of words goes to the Bin only after its note is written.
  const notesOf = new Map<string, string>();
  for (const note of generated) {
    const after = note.after === null ? undefined : moveOf.get(note.after);
    const op = await add({ kind: 'create-text', parent: targetOf(note.to), name: note.name, createKey: mintKey('note'), text: note.text, content: await utf8(note.text), purpose: 'generated' }, after ? [after] : []);
    const path = join(note.to, note.name);
    const filed = note.pileId === null ? [] : [{ name: 'Your note', title: thingName(note.name), kind: 'note' as const, to: note.to, note: path }];
    if (note.pileId !== null) notesOf.set(note.pileId, op);
    // An observed pile's context note goes to the Bin once its words are written, so a folder kept by another
    // child (a second pile note, a late thing) never has the same words written again on the next run.
    if (note.context) await add({ kind: 'bin', before: seen(note.context), capturedChildIds: [] }, [op]);
    reportPlan.push({ requires: [op, ...chainOf(note.to)], when: 'applied', value: { ...empty(), filed, created: [{ path, what: note.what }] } });
    reportPlan.push({ requires: [op], when: 'rejected', value: { ...empty(), setAside: [{ name: note.aside, why: note.pileId === null ? NOTE_NOT_WRITTEN : WORDS_NOT_WRITTEN }] } });
  }
  // After the filing moves, each note edit (TL-P2-20), then the merges whose moves depend on their line. A Timeline
  // line's note is marked new in place after its edit, and gets its updated row once it applied.
  for (const edit of edits) {
    // A line citing a thing filed by this run waits for that thing's move (C06).
    const cited = edit.after.flatMap((id) => moveOf.get(id) ?? []);
    const op = await add({ kind: 'edit-text', before: seen(edit.file), path: edit.path, beforeContent: edit.before, changes: edit.changes, text: edit.text, content: await utf8(edit.text) }, cited);
    editOf.set(edit.file.id, op);
    for (const id of edit.changes.flatMap((c) => (c.kind === 'rules-wording' ? [...c.add, ...c.remove].map((r) => r.recordId) : c.recordIds))) editsFrom.set(id, [...(editsFrom.get(id) ?? []), op]);
    // Only a Timeline line marks a note new (m3); a link fix never does.
    if (edit.changes.some((c) => c.kind === 'timeline-append')) {
      await add({ kind: 'move', before: seen(edit.file), parent: { fileId: edit.file.parents[0] ?? '' }, name: edit.file.name, properties: { bowerNew: '1' } }, [op]);
    }
    if (edit.what !== null) reportPlan.push({ requires: [op], when: 'applied', value: { ...empty(), updated: [{ path: edit.path, what: edit.what }] } });
  }
  // What a disagreement's answer derives (R4-1): its Timeline line, which the question's removal waits for.
  for (const [id, a] of answerLines) {
    const op = lineState.get(a.line) === 'planned' ? editOf.get(a.fileId) : undefined;
    if (op) fromAnswer.set(id, [...(fromAnswer.get(id) ?? []), op]);
  }
  for (const f of filing.filter((x) => x.merge)) await fileOne(f);
  for (const pile of capturedPiles) {
    const note = notesOf.get(pile.pileId);
    if (pile.anchor) await add({ kind: 'bin', before: pile.anchor, capturedChildIds: pile.childFileIds }, [...(movesOf.get(pile.pileId) ?? []), ...(note ? [note] : [])]);
  }
  // Your changes: requests completed in requests.json, answered questions dropped, then each line archived.
  // A line's archive move depends on every write derived from it, so a rejected write keeps it unarchived.
  const asked = journal.filter((l) => l.rec.kind === 'request');
  /**
   * What a request's done line says (C09, TL-P2-40): a scripted answer names what was found, with links to the notes
   * it used, when every one is there; the plain line only when nothing specific can be named.
   */
  const answerOf = (l: JournalLine): string => {
    const scripted = scriptedRequest(l.rec.text ?? l.rec.what);
    const there = (path: string): boolean => !!ix.file(path) && !ix.file(path)?.folder;
    // A lookup with the web off looks nothing up, and says so (C10); with it on, it names the note its result went to.
    if (scripted?.kind === 'lookup') return !opts.allowWeb ? NOT_LOOKED_UP : lookups.has(l.rec.id) ? scripted.answer : REQUEST_DONE;
    // A comparison names the note it wrote (C08).
    const note = compared.get(l.rec.id);
    if (scripted?.kind === 'compare') return note ? scripted.answer.replace('{note}', displayName(note.name)) : REQUEST_DONE;
    return scripted && scripted.uses.every(there) ? scripted.answer : REQUEST_DONE;
  };
  let requestsOp: string | null = null;
  if (asked.length) {
    const done: Request[] = [...asked].reverse().map((l) => ({ id: l.rec.id, text: l.rec.text ?? l.rec.what, at: l.rec.at, done: answerOf(l) }));
    // A comparison's note, before the answer that links it; claimed by its one created row (C08).
    const notes: string[] = [];
    for (const l of asked) {
      const note = compared.get(l.rec.id);
      if (!note) continue;
      const op = await add({ kind: 'create-text', parent: targetOf(note.to), name: note.name, createKey: mintKey('note'), text: note.text, content: await utf8(note.text), purpose: 'generated' });
      reportPlan.push({ requires: [op, ...chainOf(note.to)], when: 'applied', value: { ...empty(), created: [{ path: join(note.to, note.name), what: note.what }] } });
      notes.push(op);
    }
    // An answer that names what a request did is written once that is done (a lookup's Timeline line, a note).
    const answered = [...new Set([...asked.flatMap((l) => editsFrom.get(l.rec.id) ?? []), ...notes])];
    // A request done before (its line not archived then) keeps one row: the new one.
    const again = new Set(done.map((r) => r.id));
    const text = `${JSON.stringify({ v: 1, done: [...done, ...requestsDone.filter((r) => !again.has(r.id))].slice(0, 20) } satisfies RequestsFile, null, 2)}\n`;
    if (requests) {
      const before = await ownVerified(requests);
      if (requestsBroken) console.error(new BowerError('unknown', REQUESTS_REPLACED), `${SYSTEM.requests} is not a valid requests file`);
      requestsOp = await add({ kind: 'write-runner-json', before: seen(requests), beforeContent: before, path: SYSTEM.requests, text, content: await utf8(text) }, answered);
    } else {
      // Your changes live in `.bower`, so it is there; made again without it would leave the requests undone.
      if (!sys?.folder) throw new BowerError('unknown', OWN_FILES);
      requestsOp = await add({ kind: 'create-text', parent: { fileId: sys.id }, name: nameOf(SYSTEM.requests), createKey: mintKey('runner'), text, content: await utf8(text), purpose: 'runner-json' }, answered);
    }
  }
  let questionsOp: string | null = null;
  if (questionsText !== null) {
    // It waits for every operation derived from the answers it drops (R4-1), so a question stays until its work is done,
    // and for the moves of the piles its new question is about, so it is asked once they are filed.
    const derived = [
      ...journal.flatMap((l) => (l.rec.kind === 'answer' ? fromAnswer.get(l.rec.id) ?? [] : [])),
      ...(fresh.length ? [...asking].flatMap((id) => movesOf.get(id) ?? []) : []),
      // A disagreement is asked once the note it links is written (C07).
      ...disagreeing.filter((d) => fresh.some((q) => q.id === d.question.id)).flatMap((d) => notesOf.get(d.pileId) ?? []),
    ];
    if (questionsFile) {
      const before = await ownVerified(questionsFile);
      questionsOp = await add({ kind: 'write-runner-json', before: seen(questionsFile), beforeContent: before, path: SYSTEM.questions, text: questionsText, content: await utf8(questionsText) }, derived);
    } else if (sys?.folder) {
      questionsOp = await add({ kind: 'create-text', parent: { fileId: sys.id }, name: nameOf(SYSTEM.questions), createKey: mintKey('runner'), text: questionsText, content: await utf8(questionsText), purpose: 'runner-json' }, derived);
    }
    // The question's row is grounded by that one write, with the same fields (contract B).
    if (questionsOp && fresh.length) reportPlan.push({ requires: [questionsOp], when: 'applied', value: { ...empty(), questions: fresh } });
  }
  // Rules.md made from the template's empty one when it is missing (R3-4); every rule line it words waits for it.
  // When it is there, its rules are worded by its one note edit above, which their archives wait for (rule 7).
  const rulesMade = rules.made !== null
    ? await add({ kind: 'create-text', parent: { fileId: rootId }, name: RULES_PATH, createKey: mintKey('rules'), text: rules.made, content: await utf8(rules.made), purpose: 'generated' })
    : null;
  const rulesOp = rulesMade ?? (rulesState === 'planned' && rulesFile ? editOf.get(rulesFile.id) ?? null : null);
  const archiveChain: string[] = [];
  let archiveTo: Target | null = archiveFolder ? { fileId: archiveFolder.id } : null;
  if (journal.length && !archiveTo && changesFolder) {
    const made = await add({ kind: 'create-folder', parent: { fileId: changesFolder.id }, name: nameOf(SYSTEM.archive), createKey: mintKey('folder') });
    archiveChain.push(made);
    archiveTo = { createdBy: made };
  }
  for (const line of journal) {
    // Unreachable: a captured line has its changes folder, so its archive is there or planned above.
    if (!archiveTo) throw new BowerError('unknown', OWN_FILES);
    const write = line.rec.kind === 'request' ? requestsOp : line.rec.kind === 'answer' ? questionsOp : null;
    const derived = [...new Set([...(write ? [write] : []), ...(editsFrom.get(line.rec.id) ?? []), ...(fromAnswer.get(line.rec.id) ?? []), ...(rulesMade && rules.held.has(line.rec.id) ? [rulesMade] : [])])];
    const moves: string[] = [];
    for (const f of line.files) moves.push(await add({ kind: 'move', before: seen(f), parent: archiveTo, name: f.name, properties: {} }, derived));
    if (rulesOp && rules.worded.has(line.rec.id)) {
      // A rule this run words: counted once it and its line's archive applied.
      reportPlan.push({ requires: [rulesOp, ...moves, ...archiveChain], when: 'applied', value: { ...empty(), rulesWorded: 1 } });
    } else if (line.rec.kind === 'request' && requestsOp) {
      reportPlan.push({ requires: [requestsOp, ...moves, ...archiveChain], when: 'applied', value: { ...empty(), requests: [line.rec.text ?? line.rec.what] } });
    } else {
      // A rule taken out or already there is a rule record, not one of your other changes (TL-P2-23, TL-P2-33 §3).
      reportPlan.push({ requires: [...moves, ...archiveChain], when: 'applied', value: { ...empty(), yourChanges: line.rec.kind === 'rule' ? 0 : 1 } });
    }
  }

  // `.bower/hashes.json` only on a full run, as the legacy runner wrote it.
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
    const after = [...movesOf.values()].flat();
    if (hashesFile && text !== hashesText) {
      const before = await ownVerified(hashesFile);
      if (hashesBroken) console.error(new BowerError('unknown', HASHES_REPLACED), `${SYSTEM.hashes} is not a valid hashes file`);
      await add({ kind: 'write-runner-json', before: seen(hashesFile), beforeContent: before, path: SYSTEM.hashes, text, content: await utf8(text) }, after);
    } else if (!hashesFile && sys?.folder) {
      await add({ kind: 'create-text', parent: { fileId: sys.id }, name: nameOf(SYSTEM.hashes), createKey: mintKey('runner'), text, content: await utf8(text), purpose: 'runner-json' }, after);
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
  const checked = await parseRunManifestV2((await canonical(manifest)).bytes, rootId);
  if (!checked.ok) {
    // Past the guard's own size limit: the last edit in path order waits for the next run, and the run is planned again.
    if (checked.reason === 'edit' && checked.rule === 'size' && edits.length) return planRun(drive, rootId, opts, edits.length - 1, held);
    return refused(`the manifest guard refused the plan (${checked.reason}${checked.reason === 'edit' ? `: ${checked.rule}` : ''})`);
  }
  if (!grounded(manifest) || !(await groundedKeys(manifest))) return refused('the plan has report rows its effects do not ground');
  return { path: 'b', manifest };
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
async function journalOf(drive: FakeDrive, ix: VaultIndex): Promise<JournalLine[]> {
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
      console.error(e);
      left++;
      continue;
    }
    let digest: Digest | null;
    try {
      digest = await drive.storedDigest(f.id);
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
function ruleChangesOf(lines: readonly JournalLine[]): { change: RulesWording | null; left: ReadonlySet<string> } {
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
 * How a run words your rules. `worded` are the lines whose rule is written, `held` the lines whose archive waits
 * for that write, `left` the lines that stay pending, uncaptured: a line whose words cannot be worded, or every rule
 * line when Rules.md is not Bower's, is damaged, too big, changed while read or past the edit cap (rule 7). `made`
 * is Rules.md's text when it is missing: authored by `applyChanges` on the template's empty one (R3-4).
 */
type RulesPlan = { worded: ReadonlySet<string>; held: ReadonlySet<string>; left: ReadonlySet<string>; made: string | null };

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
  const none: RulesPlan = { worded: new Set(), held: new Set(), left, made: null };
  if (!change) return none;
  if (file?.folder) {
    console.error(`${RULES_PATH} is a folder`);
    return { ...none, left: new Set([...left, ...ids]) };
  }
  if (file) {
    if (state === 'planned') return { worded, held: new Set(ids), left, made: null };
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
  return { worded: made, held: new Set(change.add.map((r) => r.recordId)), left, made: result.text };
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
async function ownText(drive: FakeDrive, f: DriveFile): Promise<string> {
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
function generatedName(title: string): string {
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
/** What a run wants to change in one note, before applyChanges decides what it may. */
type Wanted = { file: DriveFile; path: string; lines: WantedLine[]; renames: Rename[] | null; rules: RulesWording | null };
/** A thing joining a note you said yes to keeping (MERGES), with the answer that says so. */
type Merge = { into: string; title: string; line: string; answer: string };
/** Where a wanted Timeline line ended up at plan time. */
type LineState = 'planned' | 'present' | 'person' | 'refused' | 'deferred';
/** A merge filed as usual instead: the answer it settles, and the shown name of the note it could not join, if refused. */
type Fallback = { answer: string; into: string; alone: string | null };
/** A merge as planned: after its Timeline line, or beside a line already there from an earlier run. */
type MergeState = Omit<Merge, 'line'> & { line: 'planned' | 'present' };

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

/** Where the fixture or the pile's words send a thing. */
function guessOf(words: string, item: PileItem): string {
  return PLAN_BY_NAME.get(item.name)?.to ?? guessFolder(`${words} ${item.name}`, item.kind);
}

/** A create key, minted once and kept in the manifest; never derived from a name or a time alone. */
function mintKey(kind: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${kind}-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
