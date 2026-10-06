/**
 * The runner, faked: what a tidy-up does to the Bower folder, done on a
 * FakeDrive with no AI. It walks the real phases on the demo's clock, takes
 * the piles that were in the inbox when it started, files their things
 * where the demo would (the fixture's plan, else a guess from the pile's
 * words), words the rules you typed, marks requests done, drops answered
 * questions and archives the journal. It writes only what the real runner
 * writes (docs/specs/2026-10-04-worker-contract.md).
 */
import type { DriveFile } from '../drive/drive-api';
import { applyChanges, timelineDate } from '../contracts/note-edit';
import { canonicalRecordJson } from '../contracts/record-json';
import { parseRunManifestV2, type Capture as ManifestCapture, type CapturedMember, type CapturedPile, type Change, type EffectV2, type Manifest, type ManifestRunReport, type ManifestV2, type Operation, type OperationV2, type ReportContribution, type Target, type VerifiedContent } from '../contracts/run-manifest';
import type { FakeDrive } from '../drive/fake-drive';
import { FILING, MERGES, guessFolder, saltmereQuestion, seedPiles, wordRule } from '../demo/fixture';
import { PHASE_MS, type TimeScale } from '../demo/scenario';
import { formerNames, rewriteLinks } from '../links';
import { PILE_NOTE, safeInboxName, thingsIn } from '../piles';
import { accountPile, contextRemoved, findDeclaration, journalValues, writable, type Digest } from '../pile-readiness';
import { displayName, freeName, join, kindOf, nameOf, parentOf, thingName } from '../tree';
import { BowerError, PARA_ROOTS, type FiledItem, type Pile, type PileItem, type Question, type Request, type Rule, type RunPhase, type RunReport } from '../types';
import { DriveVault } from '../vault/drive-vault';
import { isJournalRecord, type JournalRecord } from '../vault/journal';
import { PROP, SYSTEM, isRunnerFile, type HashesFile, type QuestionsFile, type RequestsFile } from '../vault/layout';
import { linkTitle, savedLinkAddress, savedLinkUrl } from '../search-text';
import { sha256 } from '../vault/hashes';
import { parseNote, serializeNote } from '../vault/note-format';
import { parseRules, serializeRules } from '../vault/rules-format';
import { VaultIndex } from '../vault/vault-index';
import { canonical, grounded, seen } from './fake-run-records';

export interface FakeRunOptions {
  scope: 'all' | 'instructions';
  scale: TimeScale;
  /** Fails this run in the writing phase, leaving everything as it was. */
  failOnce: boolean;
  onPhase: (phase: RunPhase, total?: number) => void | Promise<void>;
  /** Hears which piles the run took, as soon as it starts. */
  took?: (pileIds: ReadonlySet<string>) => void;
  /** Starts part-way through reading, as a run that was already going (the running situation). */
  readingFor?: number;
}

export type FakeRunResult = { phase: 'done'; report: RunReport } | { phase: 'failed'; failure: string };

export const FAILURE = 'Bower stopped while writing your notes. Nothing was moved; your inbox is as it was.';

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
const UPDATES = [
  { path: 'Projects/Flat hunt/Flat hunt.md', what: 'A fourth flat added; the shortlist compared by commute.' },
  { path: 'Projects/Job hunt/Job hunt.md', what: 'New offer from Ferrowick, scored 7 out of 10 against your CV.' },
];

/** Why a declared pile waits for a later tidy-up, and what you can do about it. */
export const SET_ASIDE = {
  notArrived: 'Some of its things have not arrived yet.',
  notChecked: 'Bower could not check some of its things. Try again.',
  unreadable: 'Bower could not read the list of what is in this pile. Try again.',
  changed: 'Some of its things changed after they were added. Remove it and add them again.',
  declaration: 'Bower found two different lists of what is in this pile. Remove it and add it again.',
  empty: 'Nothing is left in it. Remove it from your inbox.',
} as const;

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
  for (const pile of piles) {
    const folder = pile.path ? ix.file(pile.path) : undefined;
    if (!pile.path || !folder?.folder) continue;
    const children = listing.filter((f) => f.parents[0] === folder.id);
    // What a run record cannot carry waits, with the reason the Inbox shows too (TL-P2-21): names, words, and each
    // pile note's raw text, front matter included, as the capture records it.
    const raw: string[] = [];
    for (const f of children) if (!f.folder && f.name === PILE_NOTE) raw.push(await drive.readText(f.id));
    if (!writable([folder.name, pile.text, ...raw, ...children.filter((f) => !f.folder).map((f) => f.name)])) {
      console.error(new BowerError('unknown', SET_ASIDE.notChecked), 'A pile has text no run record can carry; it waits as not checked');
      out.set(pile.id, { blocked: SET_ASIDE.notChecked });
      continue;
    }
    const notes = children.filter((f) => !f.folder && f.name === PILE_NOTE).map((f) => f.id);
    const present = pile.items.map((i) => i.id).filter((id) => children.some((f) => f.id === id));
    const found = await findDeclaration(listing, rootId, folder, (id) => drive.readBytes(id));
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

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** A run's classification, fixed before any effect: the B path with its manifest, or the legacy path and why. */
export type RunPlan = { path: 'b'; manifest: Manifest | ManifestV2 } | { path: 'legacy'; why: string };

export interface PlanOptions {
  scope: 'all' | 'instructions';
  allowWeb: boolean;
  runId: string;
  requestId: string;
  requestedAt: number;
  /** The hub notes a full run brings up to date; the demo's two by default. */
  updates?: readonly HubUpdate[];
}

/** A hub note a full run brings up to date, and the Timeline line it gets. */
export type HubUpdate = { path: string; what: string };

/**
 * Plans a run on the B path when every effect it needs is a B effect (move,
 * create-folder, a generated note's create-text (TL-P2-17), Bin, write-runner-json, and B.2's edit-text); otherwise the whole run is legacy,
 * with the reason. Decided from one capture before any effect, and never
 * changed during the run. The B plan fixes every operation and every report
 * row (TL-P2-06 §1, contract B guards 7 and 9) and reuses the readiness
 * capture: only ready piles are captured, and their folders go to the Bin
 * only with no child the run did not capture. A pile held for readiness is
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
 * The manifest is v2 only when it holds an edit; otherwise it stays v1.
 * At most `editCap` edits are planned, in code-point path order (TL-P2-29 (1)); when the manifest guard
 * refuses the plan as too big, it is planned again with one edit fewer. The rest wait for the next run.
 */
export async function planRun(drive: FakeDrive, rootId: string, opts: PlanOptions, editCap = EDITS_PER_RUN): Promise<RunPlan> {
  const legacy = (why: string): RunPlan => ({ path: 'legacy', why });
  const all = opts.scope === 'all';
  const listing = await drive.listAll(rootId);
  const ix = VaultIndex.build(rootId, listing);
  const journal = await journalOf(drive, ix);
  if (!Array.isArray(journal)) return legacy(journal.why);
  // An instructions run with no line it can take has nothing to read: the existing refusal, before admission.
  if (!all && !journal.length) throw new BowerError('conflict', NOTHING_TO_READ);
  const requests = ix.file(SYSTEM.requests);
  const hashesFile = ix.file(SYSTEM.hashes);
  if (!requests || !hashesFile) return legacy('runner files');
  const parsed = (text: string): unknown => {
    try {
      return JSON.parse(text);
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(e);
      return null;
    }
  };
  const requestsValue = parsed(await drive.readText(requests.id));
  if (!isRunnerFile(SYSTEM.requests, requestsValue)) return legacy('requests');
  const hashesText = await drive.readText(hashesFile.id);
  if (!isRunnerFile(SYSTEM.hashes, parsed(hashesText))) return legacy('hashes');
  // Answers drop their questions from questions.json, as the legacy runner does.
  const answered = new Set(journal.filter((l) => l.rec.kind === 'answer').map((l) => l.rec.questionId ?? ''));
  const questionsFile = ix.file(SYSTEM.questions);
  let questionsText: string | null = null;
  if (answered.size && questionsFile) {
    const value = parsed(await drive.readText(questionsFile.id));
    const readable = isRunnerFile(SYSTEM.questions, value);
    // An unreadable list is Bower's own file: replaced with a fresh one (TL-P2-17); the report never claims its old entries.
    if (!readable) console.error(new BowerError('unknown', QUESTIONS_REPLACED), `${SYSTEM.questions} is not a valid questions file`);
    const all = readable ? value.questions : [];
    const left = all.filter((q) => !answered.has(q.id));
    if (!readable || left.length !== all.length) questionsText = `${JSON.stringify({ v: 1, questions: left } satisfies QuestionsFile, null, 2)}\n`;
  }

  const reader = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'runner' });
  // An instructions run takes no pile: it reads only your changes.
  const piles = all ? await reader.piles() : [];
  if (all && !piles.length) return legacy('empty');
  const capture = await captureOf(drive, rootId, piles);
  const verified = async (f: DriveFile, encoding: 'utf8' | 'blob'): Promise<VerifiedContent | null> => {
    const d = await storedDigest(drive, f);
    return d ? { encoding, size: d.size, sha256: d.sha256, provenance: 'fake-stored', observedModifiedTime: f.modifiedTime } : null;
  };

  // The ready piles and their things, exactly as captured.
  const capturedPiles: CapturedPile[] = [];
  const members: CapturedMember[] = [];
  const things: Array<{ pile: Pile; folder: DriveFile; item: PileItem; file: DriveFile; content: VerifiedContent; words: string }> = [];
  const fromWords: Array<{ pileId: string; folder: DriveFile; words: string; context: DriveFile | null }> = [];
  for (const pile of piles) {
    const marks = { members: members.length, things: things.length };
    const folder = pile.path ? ix.file(pile.path) : undefined;
    if (!folder?.folder) return legacy('loose pile');
    const cap = capture.get(pile.id);
    if (!cap) return legacy('readiness');
    // A pile that is not ready is held (TL-P2-21): not captured, no effect, no report row; its reason shows in the Inbox.
    if (cap.blocked !== null) continue;
    if (!LOGICAL_ID.test(pile.id) || /saltmere/i.test(pile.text)) return legacy('question');
    const children = listing.filter((f) => f.parents[0] === folder.id);
    const notes = children.filter((f) => !f.folder && f.name === PILE_NOTE);
    const declared = cap.declared;
    // The one context note bound to the pile (TL-P2-21): by its member key when declared, otherwise the first.
    // What is left of a declared pile takes its bound note when it is there, otherwise the first (TL-P2-29).
    // Any other child (a second pile note, a folder) is uncaptured: guard 7 then keeps the folder out of the Bin.
    const contextKey = declared?.contextKey ?? cap.leftover?.contextKey ?? null;
    const bound = contextKey === null ? undefined : children.find((f) => !f.folder && f.appProperties?.[PROP.item] === contextKey);
    // A declared pile whose context was removed (TL-P2-08 b) has none: any pile note in it is unbound.
    const note = declared ? bound : (bound ?? notes[0]);
    // Where its things go is guessed from the bound note's words only, never from an unbound note listed first.
    const words = !note ? '' : note.id === notes[0]?.id ? pile.text : parseNote(join(pile.path ?? '', PILE_NOTE), await drive.readText(note.id)).body.trim();
    const keys: Array<string | null> = [];
    const taken: string[] = [];
    for (const item of pile.items) {
      const file = children.find((f) => f.id === item.id);
      if (file && !file.folder && file.name === PILE_NOTE && file.id !== note?.id) continue;
      if (!file || file.folder) return legacy('sending');
      const key = declared ? (file.appProperties?.[PROP.item] ?? null) : null;
      // A file in a declared pile that is not one of its members stays there for the next run.
      if (declared && (key === null || !declared.memberKeys.has(key))) continue;
      if (item.kind === 'link') return legacy('link');
      if (MERGES.some((m) => m.item === item.name)) return legacy('merge');
      const content = await verified(file, 'blob');
      if (!content) return legacy('not checked');
      keys.push(key);
      taken.push(file.id);
      members.push({ pileId: pile.id, memberKey: key, file: seen(file), content });
      things.push({ pile, folder, item, file, content, words });
    }
    // A pile of words only, or of pile notes only (TL-P2-32), becomes a generated note from its context (TL-P2-17),
    // under a main folder; its other pile notes stay as uncaptured children. A pile with no words either has nothing
    // to write, so it is left as it is, untouched, like a held pile.
    const wordsOnly = !pile.items.length || (!taken.length && !declared);
    if (wordsOnly && (!words.trim() || !generatedPlace(guessFolder(words, 'note')))) continue;
    if (!taken.length && !wordsOnly) return legacy('member key');
    // Every member still in the folder is taken; those accounted for were filed already and are not captured again.
    if (declared && keys.length !== declared.memberKeys.size) return legacy('member key');
    let context: CapturedPile['context'] = { kind: 'absent' };
    if (note) {
      const text = await drive.readText(note.id);
      const stored = await verified(note, 'utf8');
      const raw = new TextEncoder().encode(text);
      if (!stored || stored.size !== raw.byteLength || stored.sha256 !== (await sha256(new Blob([raw])))) return legacy('context');
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
      anchor: seen(folder),
      memberKeys: keys,
      childFileIds: [...taken, ...(note ? [note.id] : [])].sort(),
      context,
    });
    if (wordsOnly) fromWords.push({ pileId: pile.id, folder, words, context: !declared && note ? note : null });
  }

  // Only held piles and nothing else to read: nothing is admitted (TL-P2-21), the existing refusal.
  if (all && !capturedPiles.length && !journal.length) throw new BowerError('conflict', NOTHING_READY);

  // Where each thing goes and under which name, against the folder as it will be.
  const planned = new Map(ix.entries());
  const places = new Map<string, DriveFile>();
  const missing: string[] = [];
  const filing: Array<{ thing: (typeof things)[number]; to: string; name: string }> = [];
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
  for (const thing of things) {
    const to = guessOf(thing.words, thing.item);
    destination(to);
    const name = freeName(planned, to, PLAN_BY_NAME.get(thing.item.name)?.title ?? thing.file.name);
    plannedFile(join(to, name));
    filing.push({ thing, to, name });
  }
  // Generated notes (TL-P2-17): under a main folder, named from the authored title with the naming rules of the
  // Inbox, `.md`, unique against the folder as it will be. A filed thing's own note is written only where none is
  // yet, as the legacy runner does; it follows its thing's move. The words of a pile become its note.
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
  // Hub notes brought up to date: a Timeline line each, planned on the bytes read now (TL-P2-20). applyChanges is
  // the only author: it refuses a note that is not Bower's, a damaged or too big one, and returns `unchanged` when
  // the line is already there (from any day), so nothing is planned for that note and the run goes on without it.
  const edits: Array<{ file: DriveFile; path: string; what: string; before: VerifiedContent; changes: Change[]; text: string }> = [];
  const date = timelineDate(opts.requestedAt);
  for (const u of all && date ? [...(opts.updates ?? UPDATES)].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) : []) {
    // At most editCap edits, in path order; the rest wait for the next run, which skips the lines already there.
    if (edits.length >= editCap) break;
    const f = ix.file(u.path);
    if (!f || f.folder) continue;
    const before = await verified(f, 'utf8');
    if (!before) continue;
    const bytes = await drive.readBytes(f.id);
    if (before.size !== bytes.byteLength || before.sha256 !== (await sha256(new Blob([bytes.slice()])))) {
      console.error('A hub note changed while it was read; no Timeline line is planned for it this time');
      continue;
    }
    const changes: Change[] = [{ kind: 'timeline-append', recordIds: [], entries: [{ date: date ?? '', text: u.what, source: null }] }];
    const result = applyChanges(bytes, changes);
    if (!result.ok) {
      // A person's note and a line already there are expected; anything else is logged with its reason.
      if (result.reason !== 'not-bower' && result.reason !== 'unchanged') console.error(`A hub note's Timeline line was refused (${result.reason}); none is planned for it`);
      continue;
    }
    edits.push({ file: f, path: ix.pathOf(f.id) ?? u.path, what: u.what, before, changes, text: result.text });
    places.set(f.id, f);
  }
  const edited = new Set(edits.map((e) => e.file.id));
  // Your changes go to the archive the legacy runner uses, made in `.bower/changes` when missing.
  const changesFolder = ix.file(SYSTEM.changes);
  const archiveFolder = ix.file(SYSTEM.archive);
  if (journal.length) {
    const place = archiveFolder?.folder ? archiveFolder : changesFolder;
    if (!place?.folder) return legacy('journal');
    places.set(place.id, place);
  }
  const capturedPlaces = [...places.values()].map((f) => ({ file: seen(f), path: ix.pathOf(f.id) ?? '' })).sort((a, b) => a.path.localeCompare(b.path));
  const captured = journal.map((l) => ({ recordId: l.rec.id, sha256: l.sha256, fileIds: l.files.map((f) => f.id) }));
  const captureValue: ManifestCapture = { piles: capturedPiles, members, journal: captured, places: capturedPlaces };
  const scope = { rootId };
  const captureId = (await canonical({ scope, runScope: opts.scope, capture: captureValue })).hash;

  // The fixed operations, in order: clear last run's marks, make folders, file, Bin the piles, the Timeline lines, the hashes.
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
  for (const { thing, to, name } of filing) {
    const isNote = kindOf(name) === 'note';
    const move = await add({
      kind: 'move',
      before: seen(thing.file),
      parent: targetOf(to),
      name,
      properties: { bowerNew: '1', ...(isNote ? { by: 'bower' as const } : {}), asAdded: null, origin: null, kind: null, pile: null },
    });
    movesOf.set(thing.pile.id, [...(movesOf.get(thing.pile.id) ?? []), move]);
    moveOf.set(thing.file.id, move);
    // Rows name the thing as captured (its file name), which grounding checks; a name shown in the Inbox that a
    // file cannot carry (a slash, a clash) is not captured, so the report never claims it.
    reportPlan.push({ requires: [move, ...chainOf(to)], when: 'applied', value: { ...empty(), filed: [{ name: thing.file.name, title: thingName(name), kind: thing.item.kind, to }] } });
    reportPlan.push({ requires: [move], when: 'rejected', value: { ...empty(), setAside: [{ name: thing.file.name, why: NOT_FILED }] } });
  }
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
  for (const pile of capturedPiles) {
    const note = notesOf.get(pile.pileId);
    if (pile.anchor) await add({ kind: 'bin', before: pile.anchor, capturedChildIds: pile.childFileIds }, [...(movesOf.get(pile.pileId) ?? []), ...(note ? [note] : [])]);
  }
  // Each Timeline line: the edit, then the note marked new in place after it, and its updated row once it applied.
  for (const edit of edits) {
    const op = await add({ kind: 'edit-text', before: seen(edit.file), path: edit.path, beforeContent: edit.before, changes: edit.changes, text: edit.text, content: await utf8(edit.text) });
    await add({ kind: 'move', before: seen(edit.file), parent: { fileId: edit.file.parents[0] ?? '' }, name: edit.file.name, properties: { bowerNew: '1' } }, [op]);
    reportPlan.push({ requires: [op], when: 'applied', value: { ...empty(), updated: [{ path: edit.path, what: edit.what }] } });
  }
  // Your changes: requests completed in requests.json, answered questions dropped, then each line archived.
  // A line's archive move depends on every write derived from it, so a rejected write keeps it unarchived.
  const asked = journal.filter((l) => l.rec.kind === 'request');
  let requestsOp: string | null = null;
  if (asked.length) {
    const before = await verified(requests, 'utf8');
    if (!before) return legacy('requests');
    const done: Request[] = [...asked].reverse().map((l) => ({ id: l.rec.id, text: l.rec.text ?? l.rec.what, at: l.rec.at, done: REQUEST_DONE }));
    // A request done before (its line not archived then) keeps one row: the new one.
    const again = new Set(done.map((r) => r.id));
    const text = `${JSON.stringify({ v: 1, done: [...done, ...requestsValue.done.filter((r) => !again.has(r.id))].slice(0, 20) } satisfies RequestsFile, null, 2)}\n`;
    requestsOp = await add({ kind: 'write-runner-json', before: seen(requests), beforeContent: before, path: SYSTEM.requests, text, content: await utf8(text) });
  }
  let questionsOp: string | null = null;
  if (questionsText !== null && questionsFile) {
    const before = await verified(questionsFile, 'utf8');
    if (!before) return legacy('questions');
    questionsOp = await add({ kind: 'write-runner-json', before: seen(questionsFile), beforeContent: before, path: SYSTEM.questions, text: questionsText, content: await utf8(questionsText) });
  }
  const archiveChain: string[] = [];
  let archiveTo: Target | null = archiveFolder?.folder ? { fileId: archiveFolder.id } : null;
  if (journal.length && !archiveTo && changesFolder) {
    const made = await add({ kind: 'create-folder', parent: { fileId: changesFolder.id }, name: nameOf(SYSTEM.archive), createKey: mintKey('folder') });
    archiveChain.push(made);
    archiveTo = { createdBy: made };
  }
  for (const line of journal) {
    if (!archiveTo) return legacy('journal');
    const derived = line.rec.kind === 'request' ? requestsOp : line.rec.kind === 'answer' ? questionsOp : null;
    const moves: string[] = [];
    for (const f of line.files) moves.push(await add({ kind: 'move', before: seen(f), parent: archiveTo, name: f.name, properties: {} }, derived ? [derived] : []));
    if (line.rec.kind === 'request' && requestsOp) {
      reportPlan.push({ requires: [requestsOp, ...moves, ...archiveChain], when: 'applied', value: { ...empty(), requests: [line.rec.text ?? line.rec.what] } });
    } else {
      reportPlan.push({ requires: [...moves, ...archiveChain], when: 'applied', value: { ...empty(), yourChanges: 1 } });
    }
  }

  // `.bower/hashes.json` only on a full run, as the legacy runner writes it.
  if (all) {
    const hashes: Record<string, string> = {};
    const digests = new Map(things.map(({ file, content }) => [file.id, content.sha256]));
    const finalPaths = new Map(filing.map(({ thing, to, name }) => [join(to, name), thing.file.id]));
    for (const [path, entry] of [...planned].sort(([a], [b]) => a.localeCompare(b))) {
      if (entry.type !== 'file' || entry.kind === 'note' || path.startsWith('Inbox/')) continue;
      const id = finalPaths.get(path) ?? ix.idOf(path);
      const f = id ? listing.find((x) => x.id === id) : undefined;
      const hash = (id && digests.get(id)) ?? (f ? (await storedDigest(drive, f))?.sha256 : undefined);
      if (!hash) return legacy('hashes');
      hashes[hash] = path;
    }
    const text = `${JSON.stringify({ v: 1, hashes } satisfies HashesFile, null, 2)}\n`;
    if (text !== hashesText) {
      const before = await verified(hashesFile, 'utf8');
      if (!before) return legacy('hashes');
      await add({ kind: 'write-runner-json', before: seen(hashesFile), beforeContent: before, path: SYSTEM.hashes, text, content: await utf8(text) }, [...movesOf.values()].flat());
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
    if (checked.reason === 'edit' && checked.rule === 'size' && edits.length) return planRun(drive, rootId, opts, edits.length - 1);
    console.error(`A B plan was refused by the manifest guard (${checked.reason}${checked.reason === 'edit' ? `: ${checked.rule}` : ''}); the run takes the legacy path`);
    return legacy('manifest');
  }
  if (!grounded(manifest)) {
    console.error('A B plan has report rows its effects do not ground; the run takes the legacy path');
    return legacy('grounding');
  }
  return { path: 'b', manifest };
}

/** A journal line as a B run captures it: the record, every file it was written to, and their one digest. */
type JournalLine = { rec: JournalRecord; files: DriveFile[]; sha256: string };

/**
 * Your changes since the last tidy-up, each once by its id with all its
 * files, when every one can take the B path: a request (completed in
 * requests.json), an answer (dropped from questions.json) or a change that
 * needs nothing but archiving. A rule, a rename or a move needs an edit B
 * does not have yet (rule wording, link rewrites), so its whole run stays
 * legacy. Your changes are never replaced or discarded (TL-P2-23): a line
 * that cannot be read, a line whose copies differ and a line in more than
 * one place stay where they are, uncaptured, with one BowerError for all of
 * them; the run goes on with the rest. At most the 20 oldest requests are
 * taken; the others wait for the next run. A Drive read failure refuses the
 * plan before admission.
 */
async function journalOf(drive: FakeDrive, ix: VaultIndex): Promise<JournalLine[] | { why: string }> {
  const copies = new Map<string, Array<{ rec: JournalRecord; file: DriveFile; sha256: string }>>();
  let left = 0;
  for (const f of ix.journalFiles()) {
    if (f.folder || !f.name.endsWith('.json')) continue;
    let rec: unknown;
    try {
      rec = JSON.parse(await drive.readText(f.id));
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(e);
      left++;
      continue;
    }
    const digest = await drive.storedDigest(f.id);
    if (!isJournalRecord(rec) || !digest) {
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
  // Every readable line decides the path, captured or not: a rule left behind must not let runs take B.
  const kinds = new Set([...copies.values()].flat().map((c) => c.rec.kind));
  if (kinds.has('rule')) return { why: 'rules' };
  if (kinds.has('rename') || kinds.has('move')) return { why: 'renames' };
  const requests = lines.filter((l) => l.rec.kind === 'request').slice(0, REQUESTS_PER_RUN);
  return lines.filter((l) => l.rec.kind !== 'request' || requests.includes(l));
}

/** Requests a run takes at most, the oldest first: requests.json keeps the last 20 done. */
const REQUESTS_PER_RUN = 20;
/**
 * Note edits a run plans at most, in path order (TL-P2-29 (1)); fewer when the manifest would pass the guard's
 * 8 MiB. Nothing is written for the rest; they stay as they are and the next run plans them.
 */
const EDITS_PER_RUN = 8;
/** The fake Worker's refusal of an instructions run with nothing new (409). */
const NOTHING_TO_READ = 'There is nothing new for Bower to read.';
/** The same refusal of a full run when every waiting pile is held for readiness (409 `nothing`, TL-P2-21). */
const NOTHING_READY = 'Nothing in the inbox is ready yet.';
const JOURNAL_LEFT = 'Bower could not read some of your changes; they stay for the next tidy-up.';
const QUESTIONS_REPLACED = 'Bower replaced its list of questions, which it could not read.';

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

/** A generated note's name from its authored title, by the Inbox's naming rules, as `.md`. */
function generatedName(title: string): string {
  // Control characters (a line break in the words) never reach a name: the manifest refuses them (C0 and DEL).
  const plain = [...title].map((char) => (char.charCodeAt(0) <= 0x1f || char.charCodeAt(0) === 0x7f ? ' ' : char)).join('');
  // Cut by whole characters (grapheme clusters), never inside one: half an emoji is no text a record can carry.
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(plain.replace(/[:*?"<>|]+/g, ' ').replace(/\s+/g, ' '))];
  const safe = graphemes.slice(0, 48).map((g) => g.segment).join('').trim();
  return `${safeInboxName({ name: safe, kind: 'note' })}.md`;
}

/** Why a thing the run captured was not filed (a rejected move). */
export const NOT_FILED = 'It was moved, renamed or removed before Bower could file it.';

const LOGICAL_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Where the fixture or the pile's words send a thing. */
function guessOf(words: string, item: PileItem): string {
  return PLAN_BY_NAME.get(item.name)?.to ?? guessFolder(`${words} ${item.name}`, item.kind);
}

/** A create key, minted once and kept in the manifest; never derived from a name or a time alone. */
function mintKey(kind: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${kind}-${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function runFake(drive: FakeDrive, rootId: string, opts: FakeRunOptions): Promise<FakeRunResult> {
  const reader = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'runner' });
  const piles = opts.scope === 'all' ? await reader.piles() : [];
  const capture = await captureOf(drive, rootId, piles);
  // A pile that has not fully arrived is not taken: nothing of it moves, nothing goes to the Bin.
  const blocked = piles.flatMap((p) => {
    const why = capture.get(p.id)?.blocked;
    return why ? [{ name: nameOf(p.path ?? ''), why }] : [];
  });
  const taken = new Set(piles.filter((p) => p.path && !capture.get(p.id)?.blocked).map((p) => p.id));
  opts.took?.(taken);
  const ms = PHASE_MS[opts.scale];
  if (opts.readingFor === undefined) {
    await opts.onPhase('queued');
    await sleep(ms.queued);
  }
  await opts.onPhase('reading', piles.filter((p) => taken.has(p.id)).reduce((n, p) => n + thingsIn(p), 0));
  await sleep(ms.reading - (opts.readingFor ?? 0));
  await opts.onPhase('writing');
  await sleep(ms.writing);
  if (opts.failOnce) return { phase: 'failed', failure: FAILURE };
  await opts.onPhase('saving');
  await sleep(ms.saving);

  const w = new Writer(drive, rootId, VaultIndex.build(rootId, await drive.listAll(rootId)));
  const journal = await w.journal();
  await w.requests();
  await w.clearNew();
  const report: RunReport = { filed: [], created: [], updated: [], setAside: blocked, questions: [], yourChanges: journal.length };
  const saidYes = new Set(journal.filter((r) => r.kind === 'answer' && r.text === 'yes').map((r) => r.questionId ?? ''));
  if (opts.scope === 'all') {
    for (const pile of piles.filter((p) => taken.has(p.id))) await w.filePile(pile, report, saidYes, capture.get(pile.id));
    for (const u of UPDATES) if (await w.addTimeline(u.path, u.what)) report.updated.push(u);
  }
  await w.followRenames(journal);
  await w.wordRules(journal.filter((r) => r.kind === 'rule'));
  await w.doRequests(journal.filter((r) => r.kind === 'request'));
  const asked = journal.filter((r) => r.kind === 'request').map((r) => r.text ?? r.what);
  const worded = journal.filter((r) => r.kind === 'rule' && !r.removes).length;
  if (asked.length) report.requests = asked;
  if (worded) report.rulesWorded = worded;
  // Each change counts once: the requests and rules the report names are not among the rest.
  report.yourChanges = journal.length - asked.length - worded;
  // The report lists only the questions this run asked; the open ones stay in questions.json with them.
  const filedSaltmere = opts.scope === 'all' && piles.some((p) => taken.has(p.id) && /saltmere/i.test(p.text));
  report.questions = await w.questions(new Set(journal.filter((r) => r.kind === 'answer').map((r) => r.questionId ?? '')), filedSaltmere ? [saltmereQuestion(Date.now())] : []);
  await w.archive(journal);
  if (opts.scope === 'all') await w.hashes();
  return { phase: 'done', report };
}

/** The runner's writes, one helper per step, over a listing it keeps true. */
class Writer {
  constructor(
    private readonly drive: FakeDrive,
    private readonly rootId: string,
    private readonly ix: VaultIndex,
  ) {}

  /** Each change once, by its id (a line written twice is one change), with all its files. */
  async journal(): Promise<Array<JournalRecord & { fileIds: string[] }>> {
    const byId = new Map<string, JournalRecord & { fileIds: string[] }>();
    for (const f of this.ix.journalFiles()) {
      if (f.folder || !f.name.endsWith('.json')) continue;
      try {
        const rec: unknown = JSON.parse(await this.drive.readText(f.id));
        if (!isJournalRecord(rec)) throw new BowerError('unknown', 'Bower could not read your changes.');
        const had = byId.get(rec.id);
        if (had) had.fileIds.push(f.id);
        else byId.set(rec.id, { ...rec, fileIds: [f.id] });
      } catch (e) {
        console.error(e);
        // Keep unreadable lines in place and stop before any writes: nothing may be skipped.
        if (e instanceof SyntaxError) throw new BowerError('unknown', 'Bower could not read your changes.');
        throw e;
      }
    }
    return [...byId.values()].sort((a, b) => a.at - b.at);
  }

  /** Last run's "new" marks go; this run's come next. */
  async clearNew(): Promise<void> {
    for (const f of await this.drive.listAll(this.rootId)) if (f.appProperties?.[PROP.isNew]) this.ix.put(await this.drive.update(f.id, { appProperties: { [PROP.isNew]: null } }));
  }

  async filePile(pile: Pile, report: RunReport, saidYes: ReadonlySet<string>, capture?: Capture): Promise<void> {
    if (!pile.items.length) {
      const to = guessFolder(pile.text, 'note');
      const folder = await this.folder(to);
      const name = freeName(this.ix.entries(), to, `${pile.text.slice(0, 48).replace(/[/\\:*?"<>|]+/g, ' ').trim()}.md`);
      const text = serializeNote({ summary: pile.text, properties: [{ key: 'kind', label: 'Kind', value: 'Note' }], tags: [], currentState: [], body: pile.text, timeline: [{ date: 'Today', text: 'Written from a note you added.' }], byBower: true });
      this.ix.put(await this.drive.createText(folder, name, text, { [PROP.by]: 'bower', [PROP.isNew]: '1' }));
      report.filed.push({ name: 'Your note', title: displayName(name), kind: 'note', to, note: join(to, name) });
    } else {
      for (const item of pile.items) {
        const file = this.byId(item.id);
        if (!file) continue;
        const merge = MERGES.find((m) => m.item === item.name && saidYes.has(m.question));
        if (merge) {
          // You said yes to keeping one note: the thing joins that note instead of making its own.
          const to = parentOf(merge.into);
          const name = freeName(this.ix.entries(), to, merge.title);
          this.ix.put(await this.drive.update(file.id, { name, addParent: await this.folder(to), ...(file.parents[0] ? { removeParent: file.parents[0] } : {}), appProperties: { [PROP.isNew]: '1', [PROP.asAdded]: null, [PROP.origin]: null, [PROP.kind]: null, [PROP.pile]: null } }));
          await this.addTimeline(merge.into, merge.line);
          report.filed.push({ name: item.name, title: displayName(nameOf(merge.into)), kind: item.kind, to, note: merge.into });
          continue;
        }
        // A saved link with no plan is named from its address, as Bower would name it.
        const linkName = !PLAN_BY_NAME.has(item.name) && item.kind === 'link' ? savedLinkUrl(await this.drive.readText(file.id)) : null;
        const plan = PLAN_BY_NAME.get(item.name) ?? { title: linkName ? `${linkTitle(linkName)}.url` : file.name, to: guessFolder(`${pile.text} ${item.name}`, item.kind) };
        const folder = await this.folder(plan.to);
        const name = freeName(this.ix.entries(), plan.to, plan.title);
        const isNote = kindOf(name) === 'note';
        this.ix.put(
          await this.drive.update(file.id, {
            name,
            addParent: folder,
            ...(file.parents[0] ? { removeParent: file.parents[0] } : {}),
            appProperties: { [PROP.isNew]: '1', ...(isNote ? { [PROP.by]: 'bower' } : {}), [PROP.asAdded]: null, [PROP.origin]: null, [PROP.kind]: null, [PROP.pile]: null },
          }),
        );
        // A saved link filed as a note becomes a note about it, its address kept; never the link file's syntax.
        if (isNote && item.kind === 'link') {
          const address = savedLinkAddress(await this.drive.readText(file.id)) ?? item.name;
          const text = serializeNote({ summary: `Saved from ${address}.`, properties: [{ key: 'source', label: 'Source', value: address }], tags: [], currentState: [], body: `Saved from ${address}.`, timeline: [{ date: 'Today', text: 'Saved by you, filed by Bower.', source: address }], byBower: true });
          const f = this.ix.file(join(plan.to, name));
          if (f) this.ix.put(await this.drive.writeText(f.id, text, f.modifiedTime));
        }
        const filed: FiledItem = { name: item.name, title: thingName(name), kind: item.kind, to: plan.to };
        if (plan.note && !this.ix.idOf(plan.note)) {
          const at = await this.folder(parentOf(plan.note));
          const text = serializeNote({ summary: `A note for ${displayName(name)}.`, properties: [], tags: [], currentState: [], body: '', timeline: [{ date: 'Today', text: 'Filed by Bower.', source: name }], byBower: true });
          this.ix.put(await this.drive.createText(at, nameOf(plan.note), text, { [PROP.by]: 'bower', [PROP.isNew]: '1' }));
          filed.note = plan.note;
          report.created.push({ path: plan.note, what: `A note for ${displayName(name)}.` });
        }
        report.filed.push(filed);
      }
    }
    // What is left of the pile (its folder and note) goes to the Bin, where it can be found,
    // unless something the run did not take arrived in it since: then the folder stays.
    const top = pile.path ? this.ix.file(pile.path) : undefined;
    if (top?.folder) {
      const left = (await this.drive.listAll(top.id)).filter((f) => f.parents[0] === top.id);
      if (capture?.blocked === null && left.some((f) => !capture.captured.has(f.id))) return;
      await this.drive.trash(top.id);
      this.ix.drop(top.id);
    }
  }

  /** After renames, every [[link]] to an old name is written with the new one (a label after | stays). */
  async followRenames(journal: JournalRecord[]): Promise<void> {
    const taken = new Set([...this.ix.entries().keys()].filter((p) => p.endsWith('.md')).map((p) => displayName(nameOf(p)).toLowerCase()));
    const former = formerNames(journal.map((r) => ({ id: r.id, at: r.at, kind: r.kind, what: r.what, ...(r.path ? { path: r.path } : {}), ...(r.from ? { from: r.from } : {}) })), taken);
    if (!former.size) return;
    for (const [path] of this.ix.entries()) {
      const f = this.ix.file(path);
      if (!f || f.folder || !path.endsWith('.md') || path.startsWith(`${SYSTEM.dir}/`)) continue;
      const text = await this.drive.readText(f.id);
      const next = rewriteLinks(text, former);
      if (next !== text) this.ix.put(await this.drive.writeText(f.id, next, f.modifiedTime));
    }
  }

  async addTimeline(path: string, what: string): Promise<boolean> {
    const f = this.ix.file(path);
    if (!f) return false;
    const n = parseNote(path, await this.drive.readText(f.id));
    const written = await this.drive.writeText(f.id, serializeNote({ ...n, timeline: [...n.timeline, { date: 'Today', text: what }] }), f.modifiedTime);
    this.ix.put(await this.drive.update(written.id, { appProperties: { [PROP.isNew]: '1' } }));
    return true;
  }

  async wordRules(lines: JournalRecord[]): Promise<void> {
    if (!lines.length) return;
    const typed = lines.filter((r) => !r.removes);
    const removed = new Set(lines.map((r) => r.removes).filter(Boolean));
    const f = this.ix.file('Rules.md');
    const worded = (f ? parseRules(await this.drive.readText(f.id)) : []).filter((r) => !removed.has(r.text));
    const added: Rule[] = [...typed].reverse().map((r) => ({ id: r.id, text: wordRule(r.text ?? r.what), yourWords: r.text ?? r.what, since: r.at }));
    const text = serializeRules([...added, ...worded]);
    if (f) this.ix.put(await this.drive.writeText(f.id, text, f.modifiedTime));
    else this.ix.put(await this.drive.createText(this.rootId, 'Rules.md', text, { [PROP.by]: 'bower' }));
  }

  async doRequests(asked: JournalRecord[]): Promise<void> {
    if (!asked.length) return;
    const old = (await this.requests())?.done ?? [];
    const done: Request[] = [...asked].reverse().map((r) => ({ id: r.id, text: r.text ?? r.what, at: r.at, done: REQUEST_DONE }));
    await this.writeJson(SYSTEM.requests, { v: 1, done: [...done, ...old].slice(0, 20) } satisfies RequestsFile);
  }

  /** Drops the answered questions, adds the new ones; answers the new ones (what the report lists). */
  async questions(answered: ReadonlySet<string>, asked: Question[]): Promise<Question[]> {
    const all = (await this.json<QuestionsFile>(SYSTEM.questions))?.questions ?? [];
    const fresh = asked.filter((q) => !all.some((x) => x.id === q.id));
    const left = [...all.filter((q) => !answered.has(q.id)), ...fresh];
    if (left.length !== all.length || fresh.length) await this.writeJson(SYSTEM.questions, { v: 1, questions: left } satisfies QuestionsFile);
    return fresh;
  }

  async archive(records: Array<{ fileIds: string[] }>): Promise<void> {
    if (!records.length) return;
    const archive = await this.folder(SYSTEM.archive);
    for (const id of records.flatMap((r) => r.fileIds)) {
      const f = this.byId(id);
      if (f) this.ix.put(await this.drive.update(f.id, { addParent: archive, ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) }));
    }
  }

  /** `.bower/hashes.json`: every file outside the inbox, by its content. */
  async hashes(): Promise<void> {
    const out: Record<string, string> = {};
    for (const [path, e] of this.ix.entries()) {
      const id = this.ix.idOf(path);
      if (e.type !== 'file' || e.kind === 'note' || path.startsWith('Inbox/') || !id) continue;
      out[await sha256(new Blob([await this.drive.readText(id)]))] = path;
    }
    await this.writeJson(SYSTEM.hashes, { v: 1, hashes: out } satisfies HashesFile);
  }

  private byId(id: string): DriveFile | undefined {
    const path = this.ix.pathOf(id);
    return path === undefined ? undefined : this.ix.file(path);
  }

  /** The id of a folder, made (with its parents) when missing. */
  private async folder(path: string): Promise<string> {
    if (!path) return this.rootId;
    const known = this.ix.idOf(path);
    if (known) return known;
    const made = await this.drive.createFolder(await this.folder(parentOf(path)), nameOf(path));
    this.ix.put(made);
    return made.id;
  }

  private async json<T>(path: string): Promise<T | null> {
    const id = this.ix.idOf(path);
    if (!id) return null;
    try {
      return JSON.parse(await this.drive.readText(id)) as T;
    } catch (e) {
      // A file that is not JSON reads as missing; a Drive failure stops the run.
      if (e instanceof SyntaxError) return null;
      throw e;
    }
  }

  /** Refuse unreadable history before any effects, including runs with no new requests. */
  async requests(): Promise<RequestsFile | null> {
    const id = this.ix.idOf(SYSTEM.requests);
    if (!id) return null;
    let value: unknown;
    try {
      value = JSON.parse(await this.drive.readText(id));
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(`${SYSTEM.requests} is not valid JSON`);
      throw new BowerError('unknown', 'Bower could not read its latest update. Try again.');
    }
    if (!isRunnerFile(SYSTEM.requests, value)) {
      console.error(`${SYSTEM.requests} has an unsupported shape`);
      throw new BowerError('unknown', 'Bower could not read its latest update. Try again.');
    }
    return value;
  }

  private async writeJson(path: string, body: unknown): Promise<void> {
    const text = `${JSON.stringify(body, null, 2)}\n`;
    const f = this.ix.file(path);
    if (f) this.ix.put(await this.drive.writeText(f.id, text, f.modifiedTime));
    else this.ix.put(await this.drive.createText(await this.folder(parentOf(path)), nameOf(path), text));
  }
}
