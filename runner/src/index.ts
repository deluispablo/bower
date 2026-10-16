/** Derived maintenance uses the manifest, its settled outcomes and the ordinary fenced effects. */
import { sha256Hex } from '../../src/data/contracts/hashes';
import { frontValues, indexedFront, lintFacts, noteRefusal, propertyValue, readTypeTable, timelineBullets } from '../../src/data/contracts/note-format';
import type { TypeRow, TypeTable } from '../../src/data/contracts/types';
import { computedBy, VIEW_LIMITS } from '../../src/data/contracts/view-format';
import { evaluateAggregate, evaluateFormulas, EVALUATOR_VERSION, inSetFolder, setMembers, storedFormulas, storedViews, viewBlock, type SetNote } from './views';
import { lintEvidenceOk } from '../../src/data/contracts/run-manifest';
import { failureKind } from '../../src/data/drive/transport';
import { PREFIX_BYTES } from '../../src/data/drive/drive-api';
import { freeName } from '../../src/data/contracts/tree';
import { HEALTH_NAME, renderHealth } from './lint';
import { opKey } from '../../src/data/contracts/op-key';
import type { EditText, EffectV2, LintEvidence, Maintain, MaintenanceDeclaration, MaintenanceNote, OperationV2, RunnerWrite, SeenFile, VerifiedContent } from '../../src/data/contracts/run-manifest';
import type { DriveFile, StoredEvidence } from '../../src/data/drive/drive-api';
import { driveEffects, type Effects, type Settled } from '../../src/data/spine/engine';
import { filingMove, materialize, refreshed, wordsNotes } from '../../src/data/spine/report';
import { limiter, READ_AHEAD } from '../../src/data/spine/read';
import { canonical, type RunManifest } from '../../src/data/spine/records';
import { emptyManifest, runKeys } from '../../src/data/spine/scripted';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { happened, reserveFor, stampOf, type Holder } from '../../src/data/spine/write-once';
import { BowerError } from '../../src/data/types';
import { isFormulaRecord, isRunnerPath, SYSTEM, isHidden, isRunnerFile, type FormulaOutput, type RetrievalFile, type ViewRecord } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import type { RunnerDrive } from './drive';
import { applyChanges, isBowerMoc, timelineDate } from '../../src/data/contracts/note-edit';
import { leafCount, mocEdit, mocMembership, mocSnapshot, noteLinks, type Notes } from './moc';

import type { Outcome } from '../../src/data/contracts/run-checkpoint';
import { isJournalRecord, pairsOf, type JournalRecord } from '../../src/data/contracts/journal-record';
import { subjectOf } from '../../src/data/contracts/questions';
import { parseTimelineLine } from '../../src/data/contracts/timeline-line';
import { renderHot, sameExceptDate, type HotInputs } from './hot';
import { LedgerExhausted, type RunTiming } from './timing';
import { ABOUT_SECTIONS, learnedLines, learnedTimeline, parseObservations, validLearnedBlock } from '../../src/data/contracts/observations';
import { ABOUT_REGIONS, createOwnershipContext, parseOwnership } from '../../src/data/contracts/ownership-format';
import { appendLog, logEvents } from './log';
import { formatLogEvent } from '../../src/data/contracts/log-format';
import { FOLDER_TEMPLATE } from '../../src/data/contracts/folder-template';

/** Every derived kind joins this slot; declarations persist inside maintain, never in a separate store. */
export interface DeclaredTarget {
  kind: string;
  path: string;
  declare?(drive: RunnerDrive, manifest: RunManifest, index: VaultIndex, notes: Notes): Promise<MaintenanceDeclaration>;
  /** Visible notes supply their guarded changes along with the rendered bytes. */
  render(declaration: MaintenanceDeclaration | undefined, state: ReturnType<typeof refreshed>, outcomes: readonly Outcome[], manifest: RunManifest): string | Pick<EditText, 'text' | 'changes'>;
  unchanged?(before: string, after: string): boolean;
  /** Use declared bytes for the first content check; the live version/place fence still runs before sending. */
  cachedCheck?: boolean;
}

const indexTarget: DeclaredTarget = { kind: 'index', path: SYSTEM.index, render: (_declaration, state) => projectIndex(state.files) };

/** About me is a projection of settled ledger events, never a primary memory effect. */
const aboutTarget: DeclaredTarget = {
  kind: 'about', path: 'About me.md', unchanged: (before, after) => before === after,
  async declare(drive, manifest, index) {
    const sources: MaintenanceDeclaration['sources'] = [];
    for (const path of ['About me.md', '.bower/observations.jsonl']) {
      const f = index.file(path);
      if (!f) continue;
      sources.push(await readSource(drive, path, f));
    }
    return { at: new Date(manifest.requestedAt).toISOString(), sources };
  },
  render(declaration, _state, outcomes, manifest) {
    if (!declaration) throw unavailable();
    let ledgerText = declaration.sources.find((s) => s.path === '.bower/observations.jsonl')?.text ?? '';
    for (const op of manifest.operations) {
      if (!outcomes.some((o) => o.operationId === op.operationId && o.state === 'applied')) continue;
      const e = op.effect;
      if (e.kind === 'write-runner-json' && e.path === '.bower/observations.jsonl'
        || e.kind === 'create-text' && e.purpose === 'runner-json' && e.name === 'observations.jsonl') ledgerText = e.text;
    }
    const ledger = parseObservations(new TextEncoder().encode(ledgerText));
    const before = declaration.sources.find((s) => s.path === 'About me.md')?.text
      ?? FOLDER_TEMPLATE.find((f) => f.path === 'About me.md')?.content;
    if (before === undefined) throw unavailable();
    const bytes = new TextEncoder().encode(before);
    const ownership = parseOwnership(bytes);
    if (ownership.status === 'invalid') throw unavailable();
    const changes: EditText['changes'] = [];
    const payloads = ABOUT_REGIONS.map((region) => `### ${ABOUT_SECTIONS[region].label}\n`
      + learnedLines(ledger, region).map((l) => learnedTimeline(l) + '\n').join(''));
    if (!ownership.payloads?.['about-you']) {
      changes.push({ kind: 'about-append', recordIds: [], text: '## What Bower has learned\n'
        + ABOUT_REGIONS.map((region, i) => `<!-- bower:ownership/2 begin ${region} -->\n${payloads[i]}<!-- bower:ownership/2 end ${region} -->\n`).join('') });
    } else for (const [i, region] of ABOUT_REGIONS.entries()) {
      const span = ownership.payloads?.[region];
      if (!span) throw unavailable();
      const previous = new TextDecoder().decode(bytes.subarray(span.start, span.end));
      const text = payloads[i] ?? '';
      if (previous !== text) changes.push({ kind: 'about-rewrite', region, recordIds: [], previous, text,
        factIds: ledger.live.filter((f) => f.section === region).map((f) => f.factId) });
    }
    const result = changes.length ? applyChanges(bytes, changes) : { ok: true, text: before };
    if (!result.ok || !validLearnedBlock(result.text, ledger)) throw unavailable();
    return { text: result.text, changes };
  },
};

const hub = (path: string, note: MaintenanceNote): boolean => note.owner === 'bower'
  && ['Projects', 'Areas'].includes(path.split('/')[0] ?? '')
  && VaultIndex.isHub(path, path.split('/').at(-1) ?? '', note.type ?? undefined);

/** Hot rebuilds live sections from primary evidence and carries its bounded recent-change window. */
export const hotTarget: DeclaredTarget = {
  kind: 'hot', path: SYSTEM.hot, unchanged: sameExceptDate, cachedCheck: true,
  async declare(drive, manifest, index, notes) {
    const at = timelineDate(manifest.requestedAt);
    if (!at) throw unavailable();
    const sources: MaintenanceDeclaration['sources'] = [];
    const questions = index.file(SYSTEM.questions);
    const previous = index.file(SYSTEM.hot);
    // The existing question reader uses the same listing-size shortcut for an empty list.
    const readQuestions = questions && (!previous || questions.size === undefined || questions.size > 40);
    // Keep primary request wording too: a whole-run Undo request may not be admitted.
    // These versioned reads reuse the planner's cache and never include the archive.
    const journal = index.journalFiles();
    const candidates = [...(previous ? [previous] : []), ...(readQuestions ? [questions] : []), ...journal,
      ...Object.entries(notes).flatMap(([id, note]) => {
        const f = index.byId(id);
        return f && hub(note.path, note) ? [f] : [];
      })];
    for (const f of candidates) {
      const path = index.pathOf(f.id);
      if (!path) continue;
      sources.push(await readSource(drive, path, f));
    }
    return { at: new Date(manifest.requestedAt).toISOString(), sources };
  },
  render(declaration, state, outcomes, manifest) {
    if (!declaration) throw unavailable();
    const today = timelineDate(Date.parse(declaration.at));
    if (!today) throw unavailable();
    const sources = new Map(declaration.sources.map((source) => [source.file.fileId, { ...source }]));
    let questions = declaration.sources.find((source) => source.path === SYSTEM.questions)?.text;
    const applied = new Set(outcomes.filter((outcome) => outcome.state === 'applied').map((outcome) => outcome.operationId));
    const archived = new Set<string>();
    // Explorer ancestry omits hidden folders. Use the planner's captured archive place,
    // or the settled creation of that place, without discovering or reading its contents.
    const archiveParents = new Set(manifest.capture.places.filter((place) => place.path === SYSTEM.archive).map((place) => place.file.fileId));
    for (const op of manifest.operations) {
      if (op.effect.kind !== 'create-folder' || op.effect.name !== SYSTEM.archive.split('/').at(-1)) continue;
      const outcome = outcomes.find((outcome) => outcome.operationId === op.operationId);
      if (outcome?.state === 'applied' && outcome.evidence.file.parents.some((id) =>
        manifest.capture.places.some((place) => place.file.fileId === id && place.path === SYSTEM.changes))) archiveParents.add(outcome.evidence.file.fileId);
    }
    for (const op of manifest.operations) {
      if (!applied.has(op.operationId)) continue;
      const e = op.effect;
      if (e.kind === 'bin') sources.delete(e.before.fileId);
      if (e.kind === 'move' && manifest.capture.journal.some((line) => line.fileIds.includes(e.before.fileId))) {
        const outcome = outcomes.find((outcome) => outcome.operationId === op.operationId);
        if (outcome?.state === 'applied' && outcome.evidence.file.parents.some((id) => archiveParents.has(id))) {
          archived.add(e.before.fileId);
        }
      }
      if (e.kind === 'edit-text' || e.kind === 'write-runner-json') {
        const source = e.before && sources.get(e.before.fileId);
        if (source) source.text = e.text;
        if ('path' in e && e.path === SYSTEM.questions) questions = e.text;
      }
      if (e.kind === 'create-text' && e.purpose === 'runner-json' && e.name === 'questions.json') questions = e.text;
    }
    const parsed = (text: string): unknown => {
      try { return JSON.parse(text); } catch (cause) {
        console.error(new BowerError('unknown', 'Bower could not read its saved context.', undefined, { cause }));
        return null;
      }
    };
    const questionValue = questions === undefined ? null : parsed(questions);
    const hubs: HotInputs['hubs'][number][] = [];
    for (const [id, note] of Object.entries(state.files)) {
      if (!hub(note.path, note)) continue;
      const created = manifest.operations.find((op) => applied.has(op.operationId) && op.effect.kind === 'create-text'
        && outcomes.some((outcome) => outcome.operationId === op.operationId && outcome.state === 'applied' && outcome.evidence.file.fileId === id));
      const text = created?.effect.kind === 'create-text' ? created.effect.text : sources.get(id)?.text;
      if (text === undefined) continue;
      const dates = timelineBullets(text).flatMap((line) => {
        const entry = parseTimelineLine(line);
        const date = entry && timelineDate(Date.parse(entry.date));
        return date === entry?.date ? [date] : [];
      }).filter((date): date is string => date !== null).sort();
      hubs.push({ path: note.path, lastSettledChange: dates.at(-1) ?? null });
    }
    // Only captured lines whose archive move settled belong to this run; no archive is read.
    const journal: JournalRecord[] = [...sources.values()].flatMap((source) => {
      if (!archived.has(source.file.fileId) || !source.path.startsWith(SYSTEM.changes + '/')
        || source.path.startsWith(SYSTEM.archive + '/')) return [];
      const value = parsed(source.text);
      return isJournalRecord(value) ? [value] : [];
    });
    const undone = pairsOf(journal);
    // Run folder names in the persisted listing supply key namespaces, without record or archive reads.
    const listing = manifest.operations.flatMap((op) => op.effect.kind === 'maintain' ? op.effect.inputs.listing ?? [] : []);
    const index = VaultIndex.build(manifest.scope.rootId, listing.map(file));
    const runIds = new Set([manifest.runId, ...index.filesIn('.bower/runs').filter((f) => f.folder).map((f) => f.name)]);
    const removedKeys = journal.flatMap((line) => line.undoes === undefined ? []
      : [...runIds].map((runId) => opKey(manifest.scope.rootId, runId, line.undoes ?? '')));
    const changes: HotInputs['changes'][number][] = journal.flatMap((line) => {
      const day = timelineDate(line.at);
      return day && !undone.has(line.id) ? [{ id: line.id, at: new Date(line.at).toISOString(), text: line.what }] : [];
    });
    // Inverses keep their own wording. Only a primary whole-run request supplies Undo's label.
    if (journal.some((line) => line.undoes !== undefined && !undone.has(line.id))) {
      for (const source of sources.values()) {
        if (!source.path.startsWith(SYSTEM.changes + '/') || source.path.startsWith(SYSTEM.archive + '/')) continue;
        const request = parsed(source.text);
        if (isJournalRecord(request) && request.kind === 'request' && request.text === 'Undo the last tidy-up'
          && !journal.some((line) => line.id === request.id)) {
          changes.push({ id: request.id, at: new Date(request.at).toISOString(), text: request.what });
        }
      }
    }
    // The settled run's report is its journal of Bower changes; proposed rows never enter hot.
    const operations = manifest.operations.filter((op) => op.effect.kind !== 'maintain');
    for (const contribution of manifest.reportPlan) {
      const report = materialize({ ...manifest, operations, reportPlan: [contribution] }, '', outcomes)?.report;
      if (!report) continue;
      const required = contribution.requires.flatMap((id) => operations.filter((op) => op.operationId === id && applied.has(id)));
      const filing = required.find((op) => filingMove(manifest, op))
        ?? required.find((op) => op.effect.kind === 'create-text' || op.effect.kind === 'edit-text');
      const created = required.find((op) => op.effect.kind === 'create-text');
      if (filing) for (const row of report.filed) changes.push({ id: filing.operationId, at: declaration.at, text: `Filed ${row.title}.` });
      for (const row of report.updated) {
        if (row.op && applied.has(row.op)) changes.push({ id: row.op, at: declaration.at, text: row.what });
      }
      if (created) for (const row of report.created) changes.push({ id: created.operationId, at: declaration.at, text: row.what });
    }
    const openQuestions = isRunnerFile(SYSTEM.questions, questionValue) ? questionValue.questions.map((question) => {
      const subject = subjectOf(question);
      const named = subject.kind === 'inbox' ? manifest.capture.members.find((member) => member.file.fileId === subject.id)?.file
        ?? manifest.operations.flatMap((op) => op.effect.kind === 'maintain' ? op.effect.inputs.listing ?? [] : []).find((f) => f.fileId === subject.id) : undefined;
      return { id: question.id, text: named ? `Inbox: ${named.name} — ${question.text}` : question.text };
    }) : [];
    return renderHot({ today, rootId: manifest.scope.rootId, runId: manifest.runId, removedKeys, openQuestions, hubs, changes,
      previousHot: declaration.sources.find((source) => source.path === SYSTEM.hot)?.text }).text;
  },
};

async function readSource(drive: RunnerDrive, path: string, f: DriveFile): Promise<MaintenanceDeclaration['sources'][number]> {
  const text = await drive.readListedText(f);
  return { path, file: seen(f), text, content: { encoding: 'utf8', size: new TextEncoder().encode(text).length,
    sha256: await rawHash(text), provenance: drive.provenance, observedModifiedTime: f.modifiedTime } };
}

const seen = (f: DriveFile): SeenFile => ({ fileId: f.id, name: f.name, parents: f.parents, folder: f.folder, modifiedTime: f.modifiedTime });
const file = (f: SeenFile): DriveFile => ({ id: f.fileId, name: f.name, parents: f.parents, folder: f.folder, modifiedTime: f.modifiedTime, createdTime: f.modifiedTime });
const unavailable = (): BowerError => new BowerError('unknown', 'Bower could not update its notes. It will try again.');
type RetrievalState = Omit<RetrievalFile, 'files'> & { files: Notes; listing?: DriveFile[] };

/** Q8: stable folder traversal and shortest unique suffixes, without exposing Drive ids. */
function projectIndex(files: Notes): string {
  const notes = Object.values(files).filter((f) => !isHidden(f.path));
  const links = noteLinks(files);
  const ids = new Map(Object.entries(files).map(([id, f]) => [f.path, id]));
  const members = mocMembership(files);
  const direct = new Map<string, typeof notes>();
  const children = new Map<string, Set<string>>();
  for (const note of notes) {
    const parts = note.path.split('/');
    parts.pop();
    const folder = parts.join('/');
    const members = direct.get(folder) ?? [];
    members.push(note);
    direct.set(folder, members);
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      const child = parts.slice(0, i + 1).join('/');
      const siblings = children.get(parent) ?? new Set<string>();
      siblings.add(child);
      children.set(parent, siblings);
    }
  }
  const para = ['Projects', 'Areas', 'Resources', 'Archive'];
  const chunks: string[] = [];
  const visit = (folder: string): void => {
    const heading = folder ? `${'#'.repeat(Math.min(6, folder.split('/').length + 1))} ${folder.split('/').at(-1)}\n\n` : '';
    const map = (direct.get(folder) ?? []).find((f) => isBowerMoc(f) && f.path.replace(/\.md$/, '').split('/').at(-1) === folder.split('/').at(-1));
    if (map) {
      const id = ids.get(map.path) ?? '';
      chunks.push(`${heading}→ [[${links.get(id)}]] (${leafCount(id, members)})\n\n`);
      return;
    }
    const rows = (direct.get(folder) ?? []).sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => `- [[${links.get(ids.get(f.path) ?? '')}]] — ${f.summary}\n`).join('');
    if (heading || rows) chunks.push(heading + rows + (rows ? '\n' : ''));
    const subfolders = [...(children.get(folder) ?? [])].sort((a, b) => {
      if (!folder) {
        const rank = (p: string): number => para.includes(p) ? para.indexOf(p) : para.length;
        const order = rank(a) - rank(b);
        if (order) return order;
      }
      return a.localeCompare(b);
    });
    for (const child of subfolders) visit(child);
  };
  visit('');
  let text = '# Index\n\n';
  for (let i = 0; i < chunks.length; i++) {
    const cut = `index cut: ${chunks.length - i} folders omitted\n`;
    if (text.length + (chunks[i]?.length ?? 0) + (i + 1 < chunks.length ? cut.length : 0) > 32000) return text + cut;
    text += chunks[i];
  }
  return text.replace(/\n+$/, '\n');
}

/** An ignored-feed cursor advance is an ordinary manifest write, never maintenance. */
async function cursorOnly(drive: RunnerDrive, manifest: RunManifest, ix: VaultIndex, old: DriveFile, state: RetrievalFile, cursor: string): Promise<RunManifest> {
  return state.cursor === cursor ? manifest : retrievalWrite(drive, manifest, ix, old, JSON.stringify({ ...state, cursor }));
}

/**
 * A run that ends on the ledger before its chain keeps what it read (R6-R8): the state as read and validated, `files`
 * gaining this run's entries, its cursor and every other key unchanged; never charged to maintenance's ledger (R13).
 * Its manifest captures nothing and plans nothing else, with no model and no scripted plan (R7, R19): what the run
 * took, its questions and its requests wait for a run that completes discovery.
 */
export async function withProgress(drive: RunnerDrive, run: { rootId: string; runId: string; allowWeb: boolean; taken: AdmissionManifest },
  refreshed: Awaited<ReturnType<typeof refreshPlanning>>): Promise<RunManifest> {
  const { ix, old, state, snapshot, lints, cursor } = refreshed;
  const manifest: RunManifest = await emptyManifest(run.rootId,
    { scope: run.taken.scope, allowWeb: run.allowWeb, runId: run.runId, requestId: run.taken.id, requestedAt: run.taken.at });
  const files: Notes = {};
  // Stored entries stay as stored, under their path now; a note binned or gone loses its entry (R8, R11).
  for (const [id, stored] of Object.entries(state?.files ?? {})) {
    const path = ix.pathOf(id);
    if (path !== undefined && !isHidden(path) && path.split('/')[0] !== 'Inbox') files[id] = { ...stored, path };
  }
  for (const [id, note] of Object.entries(snapshot)) {
    if (files[id]?.version === note.version) continue;
    const entry: MaintenanceNote = { ...note, ...(lints[id] ? { lint: lints[id] } : {}) };
    // A map's text and members come only from a completing run's whole snapshot (R15).
    delete entry.moc;
    delete entry.members;
    files[id] = entry;
  }
  // A cold folder keeps its bootstrap token, taken before its listing, so the next feed misses no change (R8, R9).
  return retrievalWrite(drive, manifest, ix, old, JSON.stringify(state ? { ...state, files } : { v: 1, folderId: run.rootId, account: run.rootId, cursor, files }));
}

/** The retrieval state as an ordinary manifest write: an update at the version read, else a create with a reserved id. */
async function retrievalWrite(drive: RunnerDrive, manifest: RunManifest, ix: VaultIndex, old: DriveFile | undefined, text: string): Promise<RunManifest> {
  const content = { encoding: 'utf8' as const, size: new TextEncoder().encode(text).length, sha256: await rawHash(text) };
  let effect: EffectV2;
  if (old) {
    const bytes = new TextEncoder().encode(await drive.readListedText(old));
    effect = { kind: 'write-runner-json', before: seen(old), path: SYSTEM.retrieval,
      beforeContent: { encoding: 'utf8', size: bytes.length, sha256: await sha256Hex(bytes), provenance: drive.provenance, observedModifiedTime: old.modifiedTime },
      text, content };
  } else {
    const own = ix.file(SYSTEM.dir);
    if (!own?.folder) throw unavailable();
    // The engine reserves the create's id and stamps it, so a redispatch never makes a second file (R17).
    effect = { kind: 'create-text', parent: { fileId: own.id }, name: 'retrieval.json',
      createKey: (await runKeys(manifest.runId))('runner'), text, content, purpose: 'runner-json' };
  }
  const ordinal = manifest.operations.length;
  const operationId = (await canonical({ runId: manifest.runId, captureId: manifest.captureId, ordinal, effect })).hash;
  const operation = { operationId, ordinal, dependsOn: [], effect };
  if (manifest.v === 1) return { ...manifest, operations: [...manifest.operations, { ...operation, effect }] };
  return { ...manifest, operations: [...manifest.operations, operation] };
}
const rawHash = (text: string): Promise<string> => sha256Hex(new TextEncoder().encode(text));

/**
 * Bower's health note (TL-P4-50 Q6, R22): the stored id counts only as a live note directly in the root whose stored
 * bytes say `by: bower`; `text` is its bytes when this check would change them. Undefined: Bower creates its own.
 */
async function healthNote(drive: RunnerDrive, ix: VaultIndex, state: RetrievalState | undefined, manifest: RunManifest,
  inputs: Pick<Maintain['inputs'], 'folderId' | 'snapshot' | 'listing'>): Promise<{ file: DriveFile; text?: string } | undefined> {
  const stored = state?.health ? ix.byId(state.health) : undefined;
  if (!stored || stored.folder || stored.parents.length !== 1 || stored.parents[0] !== inputs.folderId || ix.pathOf(stored.id) !== stored.name) return undefined;
  const healthText = healthOf(inputs, plannedPlaces(drive, manifest, inputs));
  // Listed bytes that are this very check prove both identity and no change, without a read.
  if (stored.sha256 === await rawHash(healthText)) return { file: stored };
  const text = await drive.readListedText(stored);
  return indexedFront(text).owner === 'bower' ? { file: stored, ...(text === healthText ? {} : { text }) } : undefined;
}

/** Health from the frozen start of the run, named at each note's place after it (`after`, by id; amended ruling 3). */
function healthOf(inputs: Pick<Maintain['inputs'], 'folderId' | 'snapshot' | 'listing'>, after: Notes): string {
  const ix = VaultIndex.build(inputs.folderId, (inputs.listing ?? []).map(file));
  const files = [...ix.entries()].flatMap(([path]) => ix.file(path)?.folder === false && !isHidden(path) ? [path] : []);
  return renderHealth(inputs.snapshot ?? {}, files, after);
}

/**
 * Each note's place once every declared operation applies, so declaration knows whether health changes before the
 * run settles; apply renders from the settled outcomes instead. Moves, new folders and bins are what move a note.
 * shortcut: a refused move or bin can leave health naming the planned place until the next run, rare in normal use.
 */
function plannedPlaces(drive: RunnerDrive, manifest: RunManifest, inputs: Pick<Maintain['inputs'], 'folderId' | 'snapshot' | 'listing'>): Notes {
  const parent = (target: { fileId: string } | { createdBy: string }): string => 'fileId' in target ? target.fileId : target.createdBy;
  const outcomes = manifest.operations.flatMap(({ operationId, effect }): Outcome[] => {
    const f: SeenFile | undefined = effect.kind === 'move' ? { ...effect.before, parents: [parent(effect.parent)], name: effect.name }
      : effect.kind === 'create-folder' ? { fileId: operationId, name: effect.name, parents: [parent(effect.parent)], folder: true, modifiedTime: new Date(manifest.requestedAt).toISOString() }
      : effect.kind === 'bin' ? effect.before : undefined;
    return f ? [{ operationId, state: 'applied', evidence: { file: f, trashed: effect.kind === 'bin', content: null, provenance: drive.provenance } }] : [];
  });
  return refreshed({ ...inputs, account: '', cursor: '', changes: [], operationIds: outcomes.map((o) => o.operationId) }, outcomes, manifest).files;
}

async function readState(drive: RunnerDrive, rootId: string, old: DriveFile | undefined): Promise<RetrievalState | undefined> {
  let state: RetrievalState | undefined;
  if (old) {
    const text = await drive.readListedText(old);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      console.error(new BowerError('unknown', 'Bower could not read its saved notes and will rebuild them.', undefined, { cause: error }));
    }
    if (isRunnerFile(SYSTEM.retrieval, value) && value.folderId === rootId) {
      const stored = value as RetrievalState;
      // Older state has no ancestry. Ignore malformed optional metadata rather than changing its notes.
      const ancestry: unknown = stored.listing;
      state = { ...value };
      delete state.listing;
      // A malformed health id means no health note (R22): Bower creates its own, never touching another file.
      if (typeof stored.health !== 'string' || !stored.health) delete state.health;
      if (Array.isArray(ancestry) && ancestry.every((f: unknown) =>
        typeof f === 'object' && f !== null && 'id' in f && typeof f.id === 'string'
        && 'name' in f && typeof f.name === 'string' && 'folder' in f && typeof f.folder === 'boolean'
        && 'parents' in f && Array.isArray(f.parents) && f.parents.every((p: unknown) => typeof p === 'string')
        && 'modifiedTime' in f && typeof f.modifiedTime === 'string'
        && 'createdTime' in f && typeof f.createdTime === 'string')) state.listing = ancestry as DriveFile[];
    }
  }
  return state;
}

const notesIn = (index: VaultIndex) => [...index.entries()].flatMap(([path]) => {
  const f = index.file(path);
  return f && !f.folder && path.endsWith('.md') && path.split('/')[0] !== 'Inbox' ? [{ path, file: f }] : [];
});

const NOTE_READS = 200;
const cut = (f: DriveFile, text?: string): boolean => f.size !== undefined ? f.size > PREFIX_BYTES
  : text === undefined || new TextEncoder().encode(text).length >= PREFIX_BYTES - 3;
const lintOf = (f: DriveFile, path: string, text: string | null): LintEvidence | undefined =>
  text === null || cut(f, text) ? undefined : lintFacts(path, text) ?? undefined;
/** A note Drive refuses to give is named as not checked (AC16); retries and waits still stop the run. */
function unreadable(error: unknown): void {
  if (failureKind(error) !== 'permanent') throw error;
  console.error(error);
}

/** A type row's stored `views` (B11): its list, or none. */
const rowViews = (row: TypeRow): unknown[] => {
  const views: unknown = (row as TypeRow & { views?: unknown }).views;
  return Array.isArray(views) ? views : [];
};
const textValues = (v: unknown): v is Record<string, string> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string');

/** One note's computed edit (B11 R51): its values to set or remove; `settle` records what its write did. */
type ComputedWrite = { id: string; path: string; values: Array<{ key: string; value: string | null }>; text?: string;
  settle(written: { file: SeenFile; text: string } | 'stale' | 'refused'): void };

/**
 * B11: the views maintain computes after settled effects, with one retrieval store of evidence and records (R55).
 * Bower maps' declared figures (AC9-AC14): a set is its declared folder and type (R36); member properties come from
 * retrieval's evidence for the same id and version, else one prefix read (R28, R29). Type rows' formulas (AC23-AC29):
 * each Bower note of the type gets its computed lines, its records driving cleanup (R35, R49). Nothing is read for a
 * folder whose maps declare no views and whose notes have no type.
 */
function computedViews(drive: RunnerDrive, inputs: Maintain['inputs'], state: RetrievalState, asOf: string, writtenTable?: string) {
  const frozen = VaultIndex.build(inputs.folderId, (inputs.listing ?? []).map(file));
  const places = VaultIndex.build(inputs.folderId, state.listing ?? []);
  const readJson = async (path: string): Promise<string | null> => {
    const f = frozen.file(path);
    return f ? drive.readListedText(f) : null;
  };
  type Kept = { files: Record<string, { version?: unknown; properties?: unknown; doubled?: unknown; type?: unknown } | undefined>; views: Record<string, unknown> };
  let kept: Promise<Kept> | undefined;
  let table: Promise<TypeTable> | undefined;
  const reads = new Map<string, Promise<Record<string, string> | null>>();
  const evidence = new Map<string, Record<string, string>>();
  const records = new Map<string, ViewRecord>();
  const stored = (): Promise<Kept> => kept ??= readJson(SYSTEM.retrieval).then((text) => {
    try {
      const value: unknown = text === null ? null : JSON.parse(text);
      const part = (key: 'files' | 'views'): Record<string, never> => {
        const v: unknown = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : null;
        return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, never> : {};
      };
      return { files: part('files'), views: part('views') };
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return { files: {}, views: {} };
    }
  });
  const types = (): Promise<TypeTable> => table ??= (writtenTable === undefined ? readJson(SYSTEM.typeTable) : Promise.resolve(writtenTable))
    .then((text) => readTypeTable(text).table);
  // Keys a note writes on more than one line, by note; kept beside its evidence (`doubled`), so readers take the first (ruling 4).
  const doubled = new Map<string, Set<string>>();
  const valuesOf = (id: string, text: string): Record<string, string> | null => {
    const duplicates = new Set<string>();
    const values = frontValues(text, duplicates);
    if (duplicates.size) doubled.set(id, duplicates);
    else doubled.delete(id);
    return values;
  };
  const read = async (id: string, note: MaintenanceNote): Promise<Record<string, string> | null> => {
    const kept = (await stored()).files[id];
    // Malformed evidence, or evidence for another version, is rebuilt from a fresh read (AC12).
    // Evidence that never noted its duplicate keys (an earlier build's) is read again once (ruling 4).
    if (kept?.version === note.version && textValues(kept.properties) && Array.isArray(kept.doubled) && kept.doubled.every((k) => typeof k === 'string')) {
      if (kept.doubled.length) doubled.set(id, new Set(kept.doubled as string[]));
      return kept.properties;
    }
    const f = places.byId(id);
    try {
      const text = f ? await drive.readPrefix(f) : null;
      return text === null ? null : valuesOf(id, text);
    } catch (error) {
      if (error instanceof BowerError && error.code === 'not-found') console.error(error);
      else unreadable(error);
      return null;
    }
  };
  const propertiesOf = (id: string, note: MaintenanceNote): Promise<Record<string, string> | null> => {
    const once = reads.get(id) ?? read(id, note);
    reads.set(id, once);
    return once;
  };
  /** A note's whole text, once, for a computed edit (R37); undefined when Drive will not give it. */
  const texts = new Map<string, Promise<string | undefined>>();
  const whole = (id: string): Promise<string | undefined> => {
    const once = texts.get(id) ?? (async () => {
      const f = places.byId(id);
      try {
        return f ? await drive.readListedText(f) : undefined;
      } catch (error) {
        if (error instanceof BowerError && error.code === 'not-found') console.error(error);
        else unreadable(error);
        return undefined;
      }
    })();
    texts.set(id, once);
    return once;
  };
  /** Drops a map's records; true when it had any. */
  const forget = (mapId: string): boolean => {
    const keys = [...records.keys()].filter((key) => key.startsWith(`${mapId}/`));
    for (const key of keys) records.delete(key);
    return keys.length > 0;
  };
  return {
    forget,
    whole,
    /** The blocks after the map's count line; '' when it declares none. */
    async render(mapId: string): Promise<string> {
      forget(mapId);
      const line = frontValues(state.files[mapId]?.moc?.text ?? '')?.bower_views;
      if (line === undefined) return '';
      const table = await types();
      const blocks: string[] = [];
      for (const view of storedViews(line, table)) {
        const row = table.rows.find((r) => r.id === view.set.type);
        const folder = places.pathOf(view.set.folderId);
        // A binned folder takes its figure and record with it (R35).
        if (!row || folder === undefined || view.set.folderId !== inputs.folderId && !places.byId(view.set.folderId)?.folder) continue;
        // A map is never a member, even one whose indexed prefix could not tell its type.
        const inFolder = Object.entries(state.files).filter(([, n]) => !n.moc && inSetFolder(n.path, folder, view.set.recursive));
        const members = inFolder.filter(([, n]) => n.type === view.set.type);
        // Counted from the listing before any read (R31); a note whose type cannot be told may be a member (R29).
        const over = members.length > VIEW_LIMITS.notes;
        let notes: Array<{ id: string; properties: Record<string, string> }> | 'unreadable' = [];
        if (!over) {
          const candidates: SetNote[] = [];
          for (const [id, n] of inFolder) {
            // No type at all: its read was refused, so it may be a member (R29); null is a readable note without one.
            if (n.type === undefined) candidates.push({ id, path: n.path, properties: null });
            if (n.type !== view.set.type && (typeof n.type === 'string' || n.type === undefined || !n.incomplete)) continue;
            const properties = await propertiesOf(id, n);
            candidates.push({ id, path: n.path, properties });
            if (properties?.type === view.set.type) evidence.set(id, properties);
          }
          // The figure counts every member, its `where` applied by the evaluator (R27).
          const set = setMembers({ type: view.set.type }, row, candidates);
          notes = set.unread ? 'unreadable' : set.members.map((id) => ({ id, properties: evidence.get(id) ?? {} }));
        }
        blocks.push(viewBlock(view, row, over ? members.map(([id]) => ({ id, properties: {} })) : notes));
        records.set(`${mapId}/${view.id}`, { hash: (await canonical(view)).hash, evaluator: EVALUATOR_VERSION, asOf,
          inputs: members.map(([id, n]): [string, string] => [id, n.version]).sort(([a], [b]) => a < b ? -1 : 1),
          result: over ? 'over' : notes === 'unreadable' ? 'unreadable' : evaluateAggregate(view, row, notes) });
      }
      return blocks.join('\n');
    },
    /**
     * B11 (AC23-AC29): each Bower note whose computed lines change, with all its formulas' values and removals for one
     * edit (R51). A note needing none is recorded here; one to write is recorded by `settle` once its write is known.
     */
    async formulas(): Promise<ComputedWrite[]> {
      const { files: before, views: kept } = await stored();
      // Readable formula records by note (ruling 2); any other record is a map's, rebuilt by its render, or broken (R49).
      const old = new Map<string, Map<string, ViewRecord>>();
      for (const [key, record] of Object.entries(kept)) {
        const at = key.indexOf('/');
        if (at > 0 && isFormulaRecord(record)) old.set(key.slice(0, at), (old.get(key.slice(0, at)) ?? new Map<string, ViewRecord>()).set(key.slice(at + 1), record));
      }
      const keep = (id: string): void => {
        for (const [viewId, record] of old.get(id) ?? []) records.set(`${id}/${viewId}`, record);
      };
      // A note whose front matter runs past the prefix may be one of Bower's (R37): it is read whole.
      const cutFront = (n: MaintenanceNote): boolean => n.incomplete === true && n.owner === 'person' && n.type === null;
      const typed = Object.entries(state.files).filter(([id, n]) => !n.moc && (n.owner === 'bower' && typeof n.type === 'string' || cutFront(n) || old.has(id)));
      if (!typed.length) return [];
      // A note's type as its last full read established it: the prefix cannot tell a long front matter's (R37).
      const typeOf = (id: string, n: MaintenanceNote): unknown => n.type ?? before[id]?.type;
      const rows = (await types()).rows.filter((row) => rowViews(row).length || typed.some(([id, n]) => old.has(id) && typeOf(id, n) === row.id));
      const writes: ComputedWrite[] = [];
      for (const row of rows) {
        const declared = new Set(rowViews(row).flatMap((v) => (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? [(v as { id: string }).id] : [])));
        const held = computedBy(row);
        const formulas = storedFormulas(row);
        const outputType = new Map(formulas.flatMap((f) => f.outputs.map((o) => [o.property, o.type] as const)));
        const hashes = new Map(await Promise.all(formulas.map(async (f) => [f.id, (await canonical(f)).hash] as const)));
        const listed = typed.filter(([, n]) => n.owner === 'bower' && n.type === row.id);
        // Counted from the listing before any read (R15): over the bound no formula computes and every record stays.
        if (formulas.some((f) => evaluateFormulas(f, row, listed.map(([id]) => ({ id, properties: {} })), asOf) === 'over')) {
          for (const [id] of listed) keep(id);
          continue;
        }
        const members: Array<{ id: string; note: MaintenanceNote; properties: Record<string, string>; text?: string }> = [];
        for (const [id, note] of [...listed, ...typed.filter(([, n]) => cutFront(n))]) {
          let properties = await propertiesOf(id, note);
          let text: string | undefined;
          if (properties === null) {
            text = await whole(id);
            properties = text === undefined ? null : valuesOf(id, text);
          }
          if (properties === null) { keep(id); continue; }
          evidence.set(id, properties);
          if (properties.by !== 'bower' || properties.type !== row.id) continue;
          members.push({ id, note, properties, ...(text === undefined ? {} : { text }) });
          // Kept in retrieval, so the next run's cleanup knows the member the whole read found (R35, R37).
          state.files[id] = { ...note, owner: 'bower', type: row.id };
        }
        const results = formulas.map((f) => evaluateFormulas(f, row, members, asOf));
        if (results.some((r) => r === 'over')) {
          for (const { id } of members) keep(id);
          continue;
        }
        for (const { id, note, properties, text } of members) {
          const values = new Map<string, string | null>();
          const own = new Map<string, ViewRecord>();
          for (const [viewId, record] of old.get(id) ?? []) {
            if (formulas.some((f) => f.id === viewId)) continue;
            // Still declared, though refused or skipped: its lines and record stay as last written (R47).
            if (declared.has(viewId)) { own.set(viewId, record); continue; }
            // Taken out of the row while the note kept its type: its readable record's lines go, but a property another
            // formula now holds stays its own (R35, R49, R54). A note new to this type drops the record only (ruling 1).
            if (before[id]?.type === row.id) for (const key of Object.keys(record.result as object)) if (!held.has(key)) values.set(key, null);
          }
          formulas.forEach((f, i) => {
            const result = (results[i] as Record<string, Record<string, FormulaOutput>>)[id] ?? {};
            for (const output of f.outputs) {
              const out = result[output.property];
              values.set(output.property, out && 'value' in out ? output.type === 'date' ? String(out.value) : JSON.stringify(out.value) : null);
            }
            own.set(f.id, { hash: hashes.get(f.id) ?? '', evaluator: EVALUATOR_VERSION, asOf, inputs: [[id, note.version]], result });
          });
          // Equal as values (R46, R50): decoded under the output's own type; an absent output is a line to remove. A key on
          // more than one line is never equal, so the write leaves one line and no stale copy survives (ruling 4).
          const same = (key: string, value: string | null): boolean => !doubled.get(id)?.has(key) && (value === null ? properties[key] === undefined : (() => {
            const decl = { ...row, properties: { [key]: { type: outputType.get(key) ?? 'text' } } };
            const a = propertyValue(decl, key, properties[key]), b = propertyValue(decl, key, value);
            return typeof a === 'object' && typeof b === 'object' && JSON.stringify(a.value) === JSON.stringify(b.value);
          })());
          const record = (): void => { for (const [viewId, r] of own) records.set(`${id}/${viewId}`, r); };
          if ([...values].every(([key, value]) => same(key, value))) { record(); continue; }
          writes.push({ id, path: note.path, values: [...values].map(([key, value]) => ({ key, value })), ...(text === undefined ? {} : { text }),
            settle: (written) => {
              // Refused (the person changed the note while Bower worked, R10, R34): it keeps what it had.
              if (written === 'refused') { keep(id); return; }
              // R39: a landed write the note has changed since claims nothing; the next run reads it again.
              if (written === 'stale') { evidence.delete(id); return; }
              state.files[id] = { ...note, owner: 'bower', type: row.id, version: written.file.modifiedTime };
              state.listing = state.listing?.map((x) => x.id === id ? file(written.file) : x);
              const next = valuesOf(id, written.text) ?? properties;
              evidence.set(id, next);
              reads.set(id, Promise.resolve(next));
              record();
            } });
        }
      }
      return writes;
    },
    /** Retrieval with the views' evidence and records; exactly the state when nothing declares views (R2, R55). */
    retrieval(s: RetrievalState): RetrievalState {
      // The ancestry keeps the table the figures read, so the next run knows its previous path (R35).
      const chain = table ? SYSTEM.typeTable.split('/').flatMap((_, i, parts) => frozen.file(parts.slice(0, i + 1).join('/')) ?? []) : [];
      const ancestry = s.listing;
      if (ancestry) s = { ...s, listing: [...ancestry, ...chain.filter((f) => !ancestry.some((k) => k.id === f.id))] };
      if (!records.size && !evidence.size) return s;
      return { ...s, files: Object.fromEntries(Object.entries(s.files).map(([id, n]) => [id, evidence.has(id) ? { ...n, properties: evidence.get(id), doubled: [...doubled.get(id) ?? []] } : n])),
        ...(records.size ? { views: Object.fromEntries(records) } : {}) };
    },
  };
}

/**
 * The index's ordinary prefix supplies summary and per-version owner/type, without a discovery read. Reads stop when
 * maintenance's ledger refuses (`exhausted`): what completed is kept, the rest waits for the next run.
 */
async function snapshotNotes(drive: RunnerDrive, ix: VaultIndex, state: RetrievalState | undefined, drop: (id: string) => void, prefix = false,
  lints: Record<string, LintEvidence> = {}): Promise<{ snapshot: Notes; read: number; exhausted?: LedgerExhausted }> {
  const limit = limiter(prefix ? READ_AHEAD : 1, (error) => error instanceof LedgerExhausted);
  let exhausted: LedgerExhausted | undefined;
  let read = 0;
  // A projection left by partial maintenance already has a listed snapshot; catch-up needs only Range reads.
  const cold = prefix && !ix.file(SYSTEM.index);
  // The health note is never a lint subject, an inbound edge or an indexed note (R23).
  const notes = notesIn(ix).filter(({ file: f }) => f.id !== state?.health);
  const one = async ({ path, file: f }: (typeof notes)[number]): Promise<Array<readonly [string, MaintenanceNote]>> => {
    const cached = state?.files[f.id];
    const same = cached?.version === f.modifiedTime;
    // Malformed or absent lint evidence is rebuilt from one read of this version (R26).
    const evidence = same && lintEvidenceOk(cached.lint) ? cached.lint : undefined;
    let text: string | null;
    try {
      // A stored entry holding what a read of its version gives (its owner too) is reused with or without the
      // projection (R3); an older entry without one needs its prefix when the projection is missing.
      const map = VaultIndex.isHub(path, f.name) && cached?.type === undefined;
      if (same && !map && (!prefix || cached.owner !== undefined)) text = await drive.keptPrefix(f) ?? null;
      else { read++; text = await drive.readPrefix(f, cold); }
    } catch (error) {
      // Drive also reports a trashed media read as not-found; other failures still stop the run.
      if (error instanceof BowerError && error.code === 'not-found') {
        console.error(error);
        drop(f.id);
        return [];
      }
      unreadable(error);
      text = null;
    }
    let entry: MaintenanceNote = same ? { path, version: cached.version, summary: cached.summary, coverage: cached.coverage,
      ...(cached.incomplete === true ? { incomplete: true } : {}) }
      : { path, version: f.modifiedTime, summary: '(no summary)', coverage: { kind: 'prefix', bytes: 4096 } };
    if (text !== null) entry = { ...entry, ...indexedFront(text) };
    else if (cached?.owner === 'bower' || cached?.owner === 'person') entry = { ...entry, owner: cached.owner,
      ...(cached.type === null || typeof cached.type === 'string' ? { type: cached.type } : {}) };
    // Kept apart from the planner's notes, so lint evidence never reaches the model input (AC17).
    const lint = lintOf(f, path, text) ?? evidence;
    if (lint) lints[f.id] = lint;
    // Previously frozen complete bytes remain usable only for the exact indexed version.
    const moc = same && typeof cached?.moc?.text === 'string' ? mocSnapshot(cached.moc.text) : null;
    if (moc) entry = { ...entry, moc,
      ...(Array.isArray(cached?.members) && cached.members.every((id) => typeof id === 'string')
        ? { members: [...new Set(cached.members)] } : {}) };
    return [[f.id, entry]];
  };
  // Reads queue in path order (R4), so a run the ledger stops leaves the rest of the frontier for the next one; the
  // snapshot keeps the listing's order.
  const queued = new Map([...notes].sort((a, b) => a.path.localeCompare(b.path)).map((n) => [n.file.id, limit(() => one(n)).catch((error: unknown) => {
    if (!(error instanceof LedgerExhausted)) throw error;
    exhausted = error;
    return [];
  })] as const));
  const entries = await Promise.all(notes.map(({ file: f }) => queued.get(f.id) ?? []));
  const snapshot: Notes = Object.fromEntries(entries.flat());
  for (const [id, members] of mocMembership(snapshot)) {
    const note = snapshot[id];
    if (note?.moc) note.members = members;
  }
  return { snapshot, read, ...(exhausted ? { exhausted } : {}) };
}

/** The index refresh is read-only; maintain declares and persists these same observations later. */
export async function refreshPlanning(drive: RunnerDrive, rootId: string) {
  let listing = await drive.planReads().listAll(rootId);
  let ix = VaultIndex.build(rootId, listing);
  const old = ix.file(SYSTEM.retrieval);
  const state = await readState(drive, rootId, old);
  const feed = state ? await drive.listChanges(state.cursor) : undefined;
  const cursor = feed?.newStartPageToken ?? await drive.getStartPageToken();
  if (!state) {
    // A bootstrap token must precede its snapshot, so changes racing the listing stay on the next feed.
    listing = await drive.listAll(rootId);
    ix = VaultIndex.build(rootId, listing);
  }
  // Stored parent ids retain vanished subtrees even when the planner already omitted them.
  const files = new Map([...(state?.listing ?? []), ...listing].map((f) => [f.id, f]));
  const previous = VaultIndex.build(rootId, state?.listing ?? listing);
  ix = VaultIndex.build(rootId, [...files.values()]);
  // Feed removals and missing content reads forget the same indexed file and descendants.
  const drop = (id: string): void => {
    ix.drop(id);
    for (const fileId of files.keys()) if (!ix.byId(fileId)) files.delete(fileId);
  };
  if (feed) {
    // Feed metadata supersedes the planner's listing; the read cache keys content by this version.
    for (const change of feed.changes) {
      if (change.removed || change.file?.trashed) drop(change.fileId);
      else if (change.file) {
        const listed = files.get(change.fileId);
        if (!listed || listed.modifiedTime <= change.file.modifiedTime) {
          // Partial feed metadata keeps listed checksums only for the exact same content version.
          const updated = listed?.modifiedTime === change.file.modifiedTime ? { ...listed, ...change.file } : change.file;
          files.set(change.fileId, updated);
          ix.put(updated);
          if (previous.pathOf(change.fileId) !== undefined && ix.pathOf(change.fileId) === undefined) drop(change.fileId);
        }
      }
    }
  }
  const notes = notesIn(ix);
  const pathOfChange = (change: { fileId: string; removed?: boolean; file?: DriveFile }): string | undefined => ix.pathOf(change.fileId)
    ?? previous.pathOf(change.fileId) ?? state?.files[change.fileId]?.path;
  // The existing dot-path rule judges the resolved full path, including newly discovered descendants.
  // Bower's own health write is no change of the person's (R21, R23). A state no complete run wrote (no listing and no
  // index: only reading progress) has never been discovered, so every note is new, as with no state at all.
  const discovered = !!state?.listing || !!ix.file(SYSTEM.index);
  const changes = (feed && discovered ? feed.changes : notes.map(({ file }) => ({ fileId: file.id, file }))).filter((c) => {
    const path = pathOfChange(c);
    return path !== undefined && !isHidden(path) && c.fileId !== state?.health;
  }).map((c) => c.fileId);
  // A type-table edit is hidden, yet it can change or invalidate any map's declared figures (R35).
  // Its current and its previous path each count, so a rename away, a Bin, a create or an edit all refresh.
  const tableChanged = !!feed?.changes.some((c) => ix.pathOf(c.fileId) === SYSTEM.typeTable || previous.pathOf(c.fileId) === SYSTEM.typeTable);
  const lints: Record<string, LintEvidence> = {};
  const { snapshot, read, exhausted } = await snapshotNotes(drive, ix, state, drop, !state || !ix.file(SYSTEM.index), lints);
  return { index: projectIndex(snapshot), listing: [...files.values()], ix, old, state, cursor, changes, tableChanged, snapshot, lints, read, drop, exhausted };
}

export async function planningIndex(drive: RunnerDrive, rootId: string,
  prepared?: Awaited<ReturnType<typeof refreshPlanning>>): Promise<string | undefined> {
  return (prepared ?? await refreshPlanning(drive, rootId)).index;
}

/** Freeze declared inputs and reserved ids in the existing immutable manifest. */
export async function withMaintenance(drive: RunnerDrive, manifest: RunManifest, declared: readonly DeclaredTarget[] = [hotTarget],
  prepared?: Awaited<ReturnType<typeof refreshPlanning>>): Promise<RunManifest> {
  // New words plans need their item Bin; stored manifests and recovery retain their frozen graph.
  for (const pile of manifest.capture.piles) {
    if (pile.context.kind !== 'text' || !pile.anchor
      || pile.memberKeys.length && !wordsNotes(manifest, pile.pileId).length) continue;
    const context = pile.context.file;
    const parentId = pile.anchor.fileId;
    for (const parent of manifest.operations.filter((op) => op.effect.kind === 'bin' && op.effect.before.fileId === parentId)) {
      if (!manifest.operations.some((child) => parent.dependsOn.includes(child.operationId)
        && child.effect.kind === 'bin' && child.effect.before.fileId === context.fileId
        && child.effect.before.parents.includes(parentId))) throw unavailable();
    }
  }
  const rootId = manifest.scope.rootId;
  const refreshed = prepared ?? await refreshPlanning(drive, rootId);
  // Unfinished discovery declares nothing from a partial view (R6, R10); the run keeps its progress (`withProgress`).
  if (refreshed.exhausted) throw refreshed.exhausted;
  let { listing, snapshot } = refreshed;
  // Maintenance freezes each note with its lint evidence; the planner saw the same notes without it.
  snapshot = Object.fromEntries(Object.entries(snapshot).map(([id, note]) => {
    const lint = refreshed.lints[id];
    return [id, lint ? { ...note, lint } : note];
  }));
  const { ix, old, state, cursor, changes, drop } = refreshed;
  const files = new Map(listing.map((f) => [f.id, f]));
  const ledgerFile = ix.file('.bower/observations.jsonl');
  const hasLedgerEffect = manifest.operations.some(({ effect: e }) => e.kind === 'write-runner-json' && e.path === '.bower/observations.jsonl');
  const aboutDeclaration = ledgerFile || hasLedgerEffect ? await aboutTarget.declare?.(drive, manifest, ix, snapshot) : undefined;
  const ledgerText = aboutDeclaration?.sources.find((s) => s.path === '.bower/observations.jsonl')?.text ?? '';
  const aboutBefore = aboutDeclaration?.sources.find((s) => s.path === 'About me.md')?.text;
  const aboutRendered = ledgerText ? aboutTarget.render(aboutDeclaration, { v: 1, folderId: rootId, account: state?.account ?? rootId, cursor, files: snapshot }, [], manifest) : undefined;
  const needsAbout = hasLedgerEffect || !!ledgerText && (typeof aboutRendered === 'object' && aboutRendered.text !== aboutBefore);
  if (!needsAbout && !state && !notesIn(ix).length && !manifest.operations.length && !ix.file(SYSTEM.hot) && !manifest.capture.journal.length) return manifest;
  // A folder without a health note keeps the cursor-only press (R21). Once Bower keeps one, a lost note or a note
  // still not checked is a coverage change it owes the person (TL-P4-50 Q7, R22, R26).
  const owed = (id: string, note: MaintenanceNote): boolean => {
    const f = files.get(id);
    return !note.lint && !!f && f.size !== undefined;
  };
  const healthKept = async (): Promise<boolean> => !state?.health || !Object.entries(snapshot).some(([id, note]) => owed(id, note))
    && await healthNote(drive, ix, state, manifest, { folderId: rootId, snapshot, listing: listing.map(seen) }) !== undefined;
  // Maps that declare views owe their figures again after any type-table edit, even on an idle run (R35).
  const figuresOwed = refreshed.tableChanged && Object.values(state?.files ?? {}).some((n) => n.moc && frontValues(n.moc.text)?.bower_views !== undefined);
  // Formulas owe their values on a new as-of day since a record, or after a type-table edit (R52).
  const formulasOwed = async (): Promise<boolean> => {
    const recorded = Object.values(state?.views && typeof state.views === 'object' ? state.views : {}).filter((r) => isFormulaRecord(r));
    if (recorded.some((r) => r.asOf !== timelineDate(manifest.requestedAt))) return true;
    const table = refreshed.tableChanged && !recorded.length ? ix.file(SYSTEM.typeTable) : undefined;
    return refreshed.tableChanged && (!!recorded.length || !!table && readTypeTable(await drive.readListedText(table)).table.rows
      .some((row) => rowViews(row).length > 0));
  };
  if (!needsAbout && state && ix.file(SYSTEM.index) && !changes.length && !figuresOwed && !manifest.operations.length && !await formulasOwed() && await healthKept()) {
    return old ? cursorOnly(drive, manifest, ix, old, state, cursor) : manifest;
  }
  // Evidence absent, malformed or unreadable before is rebuilt from one read of this version (R26).
  const reads = limiter(READ_AHEAD, (error) => error instanceof LedgerExhausted);
  // A run reads at most NOTE_READS notes for the index and lint together, lint's in path order; the notes left stay owed
  // for the next run, and the index's own reads (a cold folder) are never refused.
  const turn = Object.entries(snapshot).filter(([id, note]) => owed(id, note)).sort(([, a], [, b]) => a.path.localeCompare(b.path))
    .slice(0, Math.max(0, NOTE_READS - refreshed.read));
  await Promise.all(turn.map(([id, note]) => reads(async () => {
    const f = files.get(id);
    if (!f) return;
    try {
      // A note past the prefix is read whole once per version through the shared read cache.
      const lint = cut(f) ? lintFacts(note.path, await drive.readListedText(f)) ?? undefined : lintOf(f, note.path, await drive.readPrefix(f));
      if (lint) note.lint = lint;
    } catch (error) {
      if (!(error instanceof BowerError) || error.code !== 'not-found') unreadable(error);
      else console.error(error);
    }
  })));
  // A write or migration needs complete owned regions; unchanged maps reuse retrieval state's snapshot and members.
  for (const [id, note] of Object.entries(snapshot)) {
    const before = files.get(id);
    if (note.moc || !before) continue;
    // Declared figures need the map's full text, even when the declaration runs past the indexed prefix (R37); the
    // whole read is then validated by the same ownership parser.
    const prefix = note.incomplete ? await drive.keptPrefix(before) ?? '' : '';
    const front = frontValues(prefix);
    // Front matter cut by the prefix: its complete lines, closed here, say whether it could still be a Bower map.
    const lines = front ?? frontValues(`${prefix.slice(0, prefix.lastIndexOf('\n') + 1)}---\n`) ?? {};
    // Figures computed before may need cleanup (declaration removed, view invalid, folder binned, R35), which the
    // prefix cannot show: a recorded map is read whole too.
    const recorded = !!state?.views && typeof state.views === 'object' && Object.keys(state.views).some((key) => key.startsWith(`${id}/`));
    const figures = note.incomplete === true && (recorded || (front ? front.bower_views !== undefined
      : (lines.by ?? 'bower') === 'bower' && (lines.type ?? 'moc') === 'moc'));
    if (!figures && (note.owner !== 'bower' || note.type !== 'moc')) continue;
    // Advisory incomplete regions cannot authorize an unrelated map edit.
    if (note.incomplete && !figures) {
      console.log(`Skipped ${note.path}: its prefix has incomplete regions and this run does not need its full text.`);
      continue;
    }
    try {
      const moc = mocSnapshot(await drive.readListedText(before));
      if (moc) note.moc = moc;
      else delete note.members;
    } catch (error) {
      if (noteRefusal(error)) { console.error(error); continue; }
      if (!(error instanceof BowerError) || error.code !== 'not-found') throw error;
      console.error(error);
      drop(id);
    }
  }
  snapshot = Object.fromEntries(Object.entries(snapshot).filter(([id]) => ix.pathOf(id) !== undefined));
  for (const [id, members] of mocMembership(snapshot)) {
    const note = snapshot[id];
    if (note?.moc) note.members = members;
  }
  listing = [...files.values()];
  const own = ix.file(SYSTEM.dir);
  if (!own?.folder) throw unavailable();
  const logDeclaration: MaintenanceDeclaration = { at: new Date(manifest.requestedAt).toISOString(), sources: [] };
  const tags = ix.file(SYSTEM.tags);
  for (const f of [...ix.journalFiles(), ...(tags && manifest.operations.some((op) => op.effect.kind === 'write-runner-json' && op.effect.path === SYSTEM.tags) ? [tags] : [])]) {
    const path = ix.pathOf(f.id);
    if (path) logDeclaration.sources.push(await readSource(drive, path, f));
  }
  const plannedEvents = logEvents(manifest, logDeclaration);
  const firstEvent = plannedEvents[0];
  const logPath = firstEvent ? formatLogEvent(firstEvent).path : undefined;
  const logFolder = '.bower/log';
  const missingLogFolder = logPath && !ix.file(logFolder);
  const kinds = [indexTarget, ...declared, ...(needsAbout ? [aboutTarget] : [])];
  if (new Set(kinds.map((kind) => kind.path)).size !== kinds.length) throw unavailable();
  const paths = [...kinds.map((kind) => kind.path), SYSTEM.retrieval, ...(missingLogFolder ? [logFolder] : []), ...(logPath ? [logPath] : [])];
  const missing = paths.filter((path) => !ix.file(path));
  const health = await healthNote(drive, ix, state, manifest, { folderId: rootId, snapshot, listing: listing.map(seen) });
  const holders: Holder[] = [...missing.map(() => ({})), ...(health ? [] : [{}])];
  await reserveFor(drive.fencedWrites(), holders);
  const targets: NonNullable<Maintain['inputs']['targets']> = [];
  const places = new Map(manifest.capture.places.map((place) => [place.file.fileId, place]));
  if (logPath) places.set(own.id, { path: SYSTEM.dir, file: seen(own) });
  const logFolderId = missingLogFolder ? holders[missing.indexOf(logFolder)]?.reserved : ix.idOf(logFolder);
  const existingLogFolder = ix.file(logFolder);
  if (logPath && existingLogFolder) places.set(existingLogFolder.id, { path: logFolder, file: seen(existingLogFolder) });
  if (missingLogFolder && logFolderId) places.set(logFolderId, { path: logFolder, file: { fileId: logFolderId,
    name: 'log', parents: [own.id], folder: true, modifiedTime: new Date(manifest.requestedAt).toISOString() } });
  for (const path of paths) {
    const before = ix.file(path);
    const text = before ? await drive.readListedText(before) : undefined;
    const bytes = text === undefined ? undefined : new TextEncoder().encode(text);
    const kind = kinds.find((kind) => kind.path === path);
    const declaration = path === logPath ? logDeclaration : kind === aboutTarget ? aboutDeclaration : await kind?.declare?.(drive, manifest, ix, snapshot);
    if (kind === aboutTarget || path === logPath) for (const source of declaration?.sources ?? []) {
      const resolved = ix.pathOf(source.file.fileId);
      if (resolved === undefined) throw unavailable();
      places.set(source.file.fileId, { file: source.file, path: resolved });
    }
    const parentPath = path.split('/').slice(0, -1).join('/');
    const parentId = parentPath === logFolder ? logFolderId : ix.idOf(parentPath);
    if (!parentId || (parentPath && !ix.byId(parentId)?.folder && !(missingLogFolder && parentPath === logFolder))) throw unavailable();
    const fileId = before?.id ?? holders[missing.indexOf(path)]?.reserved;
    const resolvedParent = places.get(parentId)?.path ?? ix.pathOf(parentId);
    const name = path.split('/').at(-1);
    const resolvedPath = before ? ix.pathOf(before.id) : resolvedParent === undefined ? undefined : [resolvedParent, name].filter(Boolean).join('/');
    if (!fileId || !name || resolvedPath === undefined) throw unavailable();
    places.set(fileId, { file: before ? seen(before) : { fileId, name, parents: [parentId], folder: path === logFolder,
      modifiedTime: new Date(manifest.requestedAt).toISOString() }, path: resolvedPath });
    targets.push({ path, ...(path === logPath ? { kind: 'log' } : path === logFolder ? { kind: 'log-folder' } : kind ? { kind: kind.kind } : {}), ...(declaration ? { declaration } : {}), fileId, parentId,
      ...(before && bytes ? { beforeContent: { encoding: 'utf8', size: bytes.length, sha256: await sha256Hex(bytes), provenance: drive.provenance, observedModifiedTime: before.modifiedTime } } : {}) });
  }
  // MOC inputs contain the exact original bytes and every owned region; no whole-note permission is inferred.
  for (const [id, note] of Object.entries(snapshot)) {
    const before = files.get(id);
    if (!note.moc || !before || before.parents.length !== 1 || paths.includes(note.path)) continue;
    const path = ix.pathOf(id);
    if (path === undefined) throw unavailable();
    places.set(id, { file: seen(before), path });
    const bytes = new TextEncoder().encode(note.moc.text);
    targets.splice(targets.findIndex((target) => target.path === SYSTEM.retrieval), 0, { path: note.path, fileId: id, parentId: before.parents[0] ?? '',
      beforeContent: { encoding: 'utf8', size: bytes.length, sha256: await sha256Hex(bytes), provenance: drive.provenance, observedModifiedTime: before.modifiedTime } });
  }
  // Declared only to change it, after retrieval stores its id (R20); a create uses its reserved id.
  const healthId = health?.file.id ?? holders.at(-1)?.reserved;
  if (!healthId) throw unavailable();
  if (!health || health.text !== undefined) {
    const name = health?.file.name ?? freeName(ix.entries(), '', HEALTH_NAME);
    places.set(healthId, { path: name, file: health ? seen(health.file)
      : { fileId: healthId, name, parents: [rootId], folder: false, modifiedTime: new Date(manifest.requestedAt).toISOString() } });
    const bytes = health?.text === undefined ? undefined : new TextEncoder().encode(health.text);
    targets.push({ path: name, kind: 'health', fileId: healthId, parentId: rootId, ...(health && bytes ? { beforeContent: { encoding: 'utf8',
      size: bytes.length, sha256: await sha256Hex(bytes), provenance: drive.provenance, observedModifiedTime: health.file.modifiedTime } } : {}) });
  }
  const capture = { ...manifest.capture, places: [...places.values()] };
  const captureId = (await canonical({ scope: manifest.scope, runScope: manifest.runScope, capture })).hash;
  // Added places change the capture digest, so every operation and reference must be sealed against it again.
  const ids = new Map<string, string>();
  const stamps = new Map<string, string>();
  const operations: OperationV2[] = [];
  for (const op of manifest.operations) {
    let effect = op.effect;
    if (effect.kind === 'edit-text' && effect.createdBy) {
      const createdBy = ids.get(effect.createdBy);
      if (!createdBy) throw unavailable();
      effect = { ...effect, createdBy };
    }
    if ('parent' in effect && 'createdBy' in effect.parent) {
      const createdBy = ids.get(effect.parent.createdBy);
      if (!createdBy) throw unavailable();
      effect = { ...effect, parent: { createdBy } };
    }
    if (effect.kind === 'write-runner-json' && effect.path === '.bower/observations.jsonl'
      || effect.kind === 'create-text' && effect.purpose === 'runner-json' && effect.name === 'observations.jsonl') {
      const events = parseObservations(new TextEncoder().encode(effect.text)).events;
      const lines = effect.text ? effect.text.slice(0, -1).split('\n') : [];
      const text = lines.map((line) => {
        if (!line) return line;
        const event = events.find((e) => e.eventId === (JSON.parse(line) as { eventId: string }).eventId);
        if (event?.kind === 'observation' && event.origin.runId === manifest.runId)
          return JSON.stringify({ ...event, origin: { ...event.origin, captureId } });
        if (event?.kind === 'consolidation' && event.runId === manifest.runId)
          return JSON.stringify({ ...event, operationId: ids.get(event.operationId) ?? event.operationId });
        return line;
      }).join('\n') + (effect.text ? '\n' : '');
      effect = { ...effect, text, content: { encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: await rawHash(text) } };
    }
    if (effect.kind === 'write-runner-json' && effect.path === SYSTEM.questions
      || effect.kind === 'create-text' && effect.purpose === 'runner-json' && effect.name === 'questions.json') {
      const questions: unknown = JSON.parse(effect.text);
      if (!isRunnerFile(SYSTEM.questions, questions)) throw unavailable();
      let changed = false;
      for (const question of questions.questions) {
        const stamp = question.shown?.stamp && stamps.get(question.shown.stamp);
        if (stamp && question.shown) { question.shown.stamp = stamp; changed = true; }
      }
      if (changed) {
        const text = `${JSON.stringify(questions, null, 2)}\n`;
        effect = { ...effect, text, content: { encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: await rawHash(text) } };
      }
    }
    const operationId = (await canonical({ runId: manifest.runId, captureId, ordinal: op.ordinal, effect })).hash;
    ids.set(op.operationId, operationId);
    stamps.set(stampOf(manifest.runId, op.operationId), stampOf(manifest.runId, operationId));
    operations.push({ ...op, operationId, effect, dependsOn: op.dependsOn.map((id) => ids.get(id) ?? id) });
  }
  const reportPlan = manifest.reportPlan.map((row) => ({ ...row, requires: row.requires.map((id) => ids.get(id) ?? id),
    value: { ...row.value, updated: row.value.updated.map((note) => ({ ...note,
      ...(note.op ? { op: ids.get(note.op) ?? note.op } : {}),
      ...(note.stamp ? { stamp: stamps.get(note.stamp) ?? note.stamp } : {}) })) } }));
  const inputs: Maintain['inputs'] = { folderId: rootId, account: state?.account ?? rootId, cursor,
    changes: [...new Set(changes)], operationIds: operations.map((o) => o.operationId), targets,
    snapshot, listing: listing.map(seen), health: healthId };
  const effect: Maintain = { kind: 'maintain', inputs };
  const ordinal = manifest.operations.length;
  const operationId = (await canonical({ runId: manifest.runId, captureId, ordinal, effect })).hash;
  const lastMemory = operations.findLast(({ effect: e }) => e.kind === 'write-runner-json' && e.path === '.bower/observations.jsonl'
    || e.kind === 'edit-text' && e.path === 'About me.md'
    || e.kind === 'create-text' && (e.purpose === 'about-archive' || e.purpose === 'runner-json' && e.name === 'observations.jsonl'
      || e.name === 'About me.md' && 'fileId' in e.parent && e.parent.fileId === rootId));
  return { ...manifest, v: 2, capture, captureId, reportPlan,
    ...(manifest.satisfiedAppends ? { satisfiedAppends: manifest.satisfiedAppends.map((row) => ({ ...row,
      operationId: ids.get(row.operationId) ?? row.operationId })) } : {}),
    operations: [...operations, { ordinal, operationId, dependsOn: lastMemory ? [lastMemory.operationId] : [], effect }] };
}

export function maintenanceEffects(drive: RunnerDrive, declared: readonly DeclaredTarget[] = [hotTarget], timing?: RunTiming,
  reached: { health?: Settled } = {}): Effects {
  if (timing) {
    const effects = maintenanceEffects(drive, declared, undefined, reached);
    return { ...effects,
      readBack: (...args) => timing.maintenance(() => effects.readBack(...args)),
      apply: async (...args) => {
        delete reached.health;
        try { return await timing.maintenance(() => effects.apply(...args)); }
        catch (error) {
          if (!(error instanceof LedgerExhausted)) throw error;
          console.error(error);
          // A landed health note keeps its outcome and row when a later target is unreached (TL-P4-50 Q5, ruling 2).
          if (reached.health) {
            console.error(new BowerError('unknown', 'Bower will finish updating its notes next time.'));
            return reached.health;
          }
          // shortcut: exhaustion may leave the monthly log absent, revisit if normal runs reach the maintain budget.
          return { state: 'rejected', failure: { code: 'unknown', message: 'Bower will finish updating its notes next time.' } };
        }
      },
    };
  }
  // The ordinary edit guard still reads live metadata; unchanged bytes share B1a's versioned read cache.
  let cachedCheck: StoredEvidence | undefined;
  const ordinary = driveEffects(new Proxy(drive, {
    get(target, key) {
      if (key === 'evidence') return async (id: string) => {
        const cached = cachedCheck;
        cachedCheck = undefined;
        return cached?.file.id === id ? cached : target.evidence(id);
      };
      if (key === 'readBytes') return async (id: string) => new TextEncoder().encode(await target.readListedText(await target.get(id)));
      const value: unknown = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }));
  // The engine always calls readBack before replay; fresh reserved creates need no existence probe.
  const replaying = new Set<string>();
  return {
    async readBack(op, head, manifest) {
      if (op.effect.kind !== 'maintain') throw unavailable();
      replaying.add(op.operationId);
      // Landed only on the stamp of the last target this attempt sends (R20): the log, else health, else retrieval.
      const log = op.effect.inputs.targets?.find((t) => t.kind === 'log');
      const target = log && logEvents(manifest, log.declaration, head.outcomes).length ? log
        : op.effect.inputs.targets?.find((t) => t.kind === 'health') ?? op.effect.inputs.targets?.find((t) => t.path === SYSTEM.retrieval);
      if (!target) throw unavailable();
      try {
        const ev = await drive.evidence(target.fileId);
        if (!ev || !happened({ stamp: stampOf(head.runId, op.operationId) }, ev.file)) return { state: 'not-landed' };
        return { state: 'landed', evidence: { file: seen(ev.file), trashed: ev.trashed,
          content: ev.content ? { encoding: 'utf8', ...ev.content, provenance: drive.provenance, observedModifiedTime: ev.file.modifiedTime } : null, provenance: drive.provenance } };
      } catch (error) {
        console.error(error);
        return { state: 'unreadable', why: 'The maintenance target could not be read.' };
      }
    },
    async apply(op, head, w, manifest, sending) {
      if (op.effect.kind !== 'maintain') throw unavailable();
      const state = refreshed(op.effect.inputs, head.outcomes, manifest);
      const members = mocMembership(state.files);
      for (const [id, ids] of members) {
        const note = state.files[id];
        if (note) note.members = ids;
      }
      const index = projectIndex(state.files);
      const asOf = timelineDate(manifest.requestedAt);
      if (!asOf) throw unavailable();
      // A table this run wrote (a formula install, B11e R11) is the one maintain computes with; the listing froze the one before.
      const tableWrite = manifest.operations.findLast((o) => o.effect.kind === 'write-runner-json' && o.effect.path === SYSTEM.typeTable
        && head.outcomes.some((outcome) => outcome.operationId === o.operationId && outcome.state === 'applied'));
      const figures = computedViews(drive, op.effect.inputs, state, asOf, tableWrite?.effect.kind === 'write-runner-json' ? tableWrite.effect.text : undefined);
      const stamp = stampOf(head.runId, op.operationId);
      const subHead = (fileId: string) => ({ ...head, outcomes: head.outcomes.map((o) => o.operationId === op.operationId ? { operationId: o.operationId, state: 'possible-effect' as const, dispatchId: op.operationId, fileId } : o) });
      // Computed values first, each note in one edit under the maintain's stamp, so figures read them (B11 R51). A landed
      // write found on redispatch counts as applied (R39); a write refused for the person's change skips that note (R10).
      for (const write of await figures.formulas()) {
        const f = state.listing?.find((x) => x.id === write.id);
        const before = f === undefined ? undefined : write.text ?? await figures.whole(write.id);
        if (f === undefined || before === undefined) { write.settle('refused'); continue; }
        const changes: EditText['changes'] = [{ kind: 'computed-set', recordIds: [], values: write.values }];
        const result = applyChanges(new TextEncoder().encode(before), changes, { fileId: f.id, context: createOwnershipContext(), path: write.path, name: f.name });
        if (!result.ok) {
          if (result.reason !== 'unchanged') console.error(new BowerError('unknown', 'Bower could not update a computed property.', undefined, { cause: result.reason }));
          write.settle('refused');
          continue;
        }
        const content = { encoding: 'utf8' as const, size: result.bytes.byteLength, sha256: await rawHash(result.text) };
        const beforeContent: VerifiedContent = { encoding: 'utf8', size: new TextEncoder().encode(before).length, sha256: await rawHash(before),
          provenance: drive.provenance, observedModifiedTime: f.modifiedTime };
        const sub = { ...op, effect: { kind: 'edit-text' as const, before: seen(f), path: write.path, beforeContent, changes, text: result.text, content } };
        if (replaying.has(op.operationId)) {
          const ev = await drive.evidence(write.id);
          if (ev && happened({ stamp }, ev.file)) {
            const back = await ordinary.readBack(sub, subHead(write.id), manifest);
            if (back.state !== 'landed') throw unavailable();
            write.settle(back.evidence.content?.sha256 === content.sha256 ? { file: back.evidence.file, text: result.text } : 'stale');
            continue;
          }
        }
        await sending();
        const settled = await ordinary.apply(sub, subHead(write.id), w, manifest, async () => write.id);
        write.settle(settled.state === 'applied' ? { file: settled.evidence.file, text: result.text } : 'refused');
      }
      let last: Settled | undefined;
      // Person-facing projections, then retrieval (holding the health id), health and the log (R20).
      const rank = (target: NonNullable<Maintain['inputs']['targets']>[number]): number =>
        target.kind === 'log' || target.kind === 'log-folder' ? 3 : target.kind === 'health' ? 2 : Number(target.path === SYSTEM.retrieval);
      const targets = [...(op.effect.inputs.targets ?? [])].sort((a, b) => rank(a) - rank(b));
      for (const target of targets) {
        const frozen = op.effect.inputs.listing?.find((f) => f.fileId === target.fileId);
        const settled = state.listing?.find((f) => f.id === target.fileId);
        const before = settled ? seen(settled) : frozen;
        const kind = [indexTarget, ...declared, aboutTarget].find((kind) => target.kind ? kind.kind === target.kind && kind.path === target.path : kind.path === target.path);
        if (kind === aboutTarget) {
          const source = target.declaration?.sources.find((s) => s.path === '.bower/observations.jsonl');
          const written = manifest.operations.findLast((o) => o.effect.kind === 'write-runner-json'
            && o.effect.path === '.bower/observations.jsonl' && head.outcomes.some((outcome) =>
              outcome.operationId === o.operationId && outcome.state === 'applied'));
          const outcome = written && head.outcomes.find((o) => o.operationId === written.operationId);
          const expected = outcome?.state === 'applied' ? outcome.evidence.file : source?.file;
          const hash = written?.effect.kind === 'write-runner-json' ? written.effect.content.sha256 : source?.content.sha256;
          const live = expected ? await drive.evidence(expected.fileId) : null;
          if (expected && (!live || live.trashed || live.content?.sha256 !== hash
            || live.file.modifiedTime !== expected.modifiedTime || live.file.name !== expected.name
            || live.file.parents.join() !== expected.parents.join())) {
            const error = unavailable(); console.error(error);
            return { state: 'rejected', failure: { code: 'unknown' as const, message: error.message } };
          }
        }
        const log = target.kind === 'log';
        const logFolder = target.kind === 'log-folder';
        const events = log || logFolder ? logEvents(manifest,
          targets.find((t) => t.kind === 'log')?.declaration, head.outcomes) : [];
        if ((log || logFolder) && !events.length) continue;
        if (logFolder) {
          const effect: EffectV2 = { kind: 'create-folder', parent: { fileId: target.parentId }, name: 'log', createKey: op.operationId };
          const sub = { ...op, effect };
          if (replaying.has(op.operationId)) {
            const back = await ordinary.readBack(sub, subHead(target.fileId), manifest);
            if (back.state === 'landed') { last = { state: 'applied', evidence: back.evidence }; continue; }
            if (back.state !== 'not-landed') throw unavailable();
          }
          await sending();
          const written = await w.createFolder(target.parentId, 'log', { bowerItem: op.operationId, bowerOp: stamp }, target.fileId);
          last = { state: 'applied', evidence: { file: seen(written), trashed: false, content: null, provenance: drive.provenance } };
          continue;
        }
        // Health is wholly Bower's note, rewritten whole under its read version and bytes (AC12).
        const health = target.kind === 'health';
        const owned = !isRunnerPath(target.path) && !health;
        const logEvidence = log && (before || replaying.has(op.operationId)) ? await drive.evidence(target.fileId) : null;
        const logBefore = logEvidence ? await drive.readListedText(logEvidence.file) : '# Log\n';
        const rendered = log ? appendLog(logBefore, events) : health ? healthOf(op.effect.inputs, state.files) : kind ? kind.render(target.declaration, state, head.outcomes, manifest)
          : owned ? mocEdit(target.fileId, state.files, members, await figures.render(target.fileId))
          : target.path === SYSTEM.retrieval ? JSON.stringify(figures.retrieval(state)) : undefined;
        if (!kind && owned && !rendered) continue;
        const edit = typeof rendered === 'object' && rendered !== null ? rendered : null;
        const text = typeof rendered === 'string' ? rendered : edit?.text;
        if (text === undefined) throw unavailable();
        if (owned && before && !edit) throw unavailable();
        // Versions and the feed cursor belong to state, not to the derived projection's date.
        if (target.path === SYSTEM.index && before) {
          const previous = (await drive.readListedText(file(before))).replace(/^> Generated by Bower[^\n]*\n/gm, '').trim();
          const snapshot = op.effect.inputs.snapshot ?? {};
          const legacy = Object.values(snapshot).sort((a, b) => a.path.localeCompare(b.path))
            .map((f) => `- [[${f.path.split('/').at(-1)?.replace(/\.md$/, '')}]] — ${f.summary}\n`).join('').trim();
          if (previous === index.trim() || (previous === legacy && projectIndex(snapshot) === index)) continue;
        }
        if (before && kind?.unchanged && kind.unchanged(await drive.readListedText(file(before)), text)) continue;
        const ev = log ? logEvidence : (before && !kind?.cachedCheck) || replaying.has(op.operationId) ? await drive.evidence(target.fileId) : null;
        const content = { encoding: 'utf8' as const, size: new TextEncoder().encode(text).length, sha256: await rawHash(text) };
        const beforeText = kind === aboutTarget ? target.declaration?.sources.find((s) => s.path === 'About me.md')?.text
          : state.files[target.fileId]?.moc?.text;
        const beforeContent: VerifiedContent | undefined = owned && before && beforeText !== undefined ? { encoding: 'utf8' as const,
          size: new TextEncoder().encode(beforeText).length, sha256: await rawHash(beforeText),
          provenance: drive.provenance, observedModifiedTime: before.modifiedTime } : target.beforeContent;
        const effect: EffectV2 = owned && before && beforeContent && edit ? { kind: 'edit-text', before,
          path: target.path, beforeContent, changes: edit.changes, beforeText, text, content }
          : before && target.beforeContent ? { kind: 'write-runner-json' as const, before, path: target.path as RunnerWrite,
          beforeContent: target.beforeContent, text, content }
          : { kind: 'create-text' as const, parent: { fileId: target.parentId }, name: target.path.split('/').at(-1) ?? '', createKey: op.operationId, purpose: owned || health ? 'generated' as const : 'runner-json' as const, text, content };
        const sub = { ...op, effect };
        if (ev && happened({ stamp }, ev.file)) {
          const back = await ordinary.readBack(sub, subHead(target.fileId), manifest);
          if (back.state !== 'landed') throw unavailable();
          last = { state: 'applied' as const, evidence: back.evidence };
          if (health) reached.health = last;
          if (owned && state.files[target.fileId]) {
            // R39: the landed write counts as applied; figures recomputed now from newer evidence claim nothing about
            // it (no record, no snapshot), and the next run reads the map whole and catches up.
            const stale = back.evidence.content?.sha256 !== content.sha256 && figures.forget(target.fileId);
            state.files[target.fileId] = { ...state.files[target.fileId] as MaintenanceNote, version: back.evidence.file.modifiedTime,
              moc: stale ? undefined : mocSnapshot(text) ?? undefined, lint: stale ? undefined : lintFacts(target.path, text) ?? undefined };
            state.listing = state.listing?.map((f) => f.id === target.fileId ? file(back.evidence.file) : f);
          }
          continue;
        }
        await sending();
        // Reconciliation always reads live evidence; only this fresh precheck reuses exact declared bytes.
        if (kind?.cachedCheck && before && beforeContent) cachedCheck = { file: file(before), trashed: false,
          content: { size: beforeContent.size, sha256: beforeContent.sha256 } };
        try {
          last = await ordinary.apply(sub, subHead(target.fileId), w, manifest, async () => target.fileId);
        } finally {
          cachedCheck = undefined;
        }
        if (last.state !== 'applied') {
          if (kind === aboutTarget) return last;
          throw unavailable();
        }
        if (health) reached.health = last;
        if (owned && state.files[target.fileId]) {
          state.files[target.fileId] = { ...state.files[target.fileId] as MaintenanceNote,
            version: last.evidence.file.modifiedTime, moc: mocSnapshot(text) ?? undefined, lint: lintFacts(target.path, text) ?? undefined };
          const written = last.evidence.file;
          state.listing = state.listing?.map((f) => f.id === target.fileId ? file(written) : f);
        }
      }
      if (!last) throw unavailable();
      // Even a fully reconciled partial effect was already named by the opening checkpoint.
      await sending();
      return last;
    },
  };
}
