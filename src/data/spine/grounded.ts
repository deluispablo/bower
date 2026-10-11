/**
 * A plan's report grounding (contract B): the report's rows and the operations they name fit together (`grounded`),
 * and a saved link's note keeps its key (`groundedKeys`). The run records live in `records.ts`, the report in
 * `report.ts`, and the pure record guards in `contracts/`.
 */
import type { DriveFile } from '../drive/drive-api';
import { requestMoveKind, type EffectV2, type OperationV2, type ReportContribution, type SeenFile, type Target } from '../contracts/run-manifest';
import { savedLinkKey } from '../contracts/note-edit';
import { savedWordsPile } from './duplicates';
import { md5Hex } from '../contracts/hashes';
import { join, nameOf, parentOf } from '../tree';
import { PARA_ROOTS } from '../types';
import { sha256 } from '../vault/hashes';
import { SYSTEM, isRunnerFile } from '../vault/layout';
import type { RunManifest } from './records';
import { filingMove } from './report';
import { stampOf } from './write-once';

/** The runner files a run may make again when they are missing (TL-P2-33 §2a). */
const RUNNER_MADE = [SYSTEM.requests, SYSTEM.hashes, SYSTEM.questions] as const;
/** The one note rules are worded in, at the root of the Bower folder. */
const RULES = 'Rules.md';

/** SHA-256 of a text's exact UTF-8 bytes. */
export async function textHash(text: string): Promise<string> {
  return sha256(new Blob([new TextEncoder().encode(text)]));
}

/** A Drive file as contract B observes it. */
export function seen(f: DriveFile): SeenFile {
  return { fileId: f.id, name: f.name, parents: [...f.parents], folder: f.folder, modifiedTime: f.modifiedTime };
}

/**
 * Contract B's grounding, structural only (TL-P4-14 stage 3 contract 5): the planner builds each row from the
 * operation it reports (op id plus entry), so grounding checks the plan's shape, never a row's words. Shape includes
 * how many rows and where (P4-45b): every row names operations of this plan, at least one and each once; a set-aside
 * row names its one operation; an updated row names its edit (`op`) and a line that edit appends, once (TL-P4-19
 * addendum 3). Every operation the person is told about has exactly the rows it implies: a captured thing's move or
 * Bin one row for each outcome, a generated note one created row (and one set-aside row, unless a
 * thing's move or a runner file waits for it), a note's edit one row per Timeline line it writes (one for a Current
 * state alone), the Bin of a note kept as one with another one set-aside row, and each archive move of your changes
 * one row. A row's path agrees with its operation: a filed thing's place with its move's (or its note's create's), its
 * note with the note made or edited, a created or updated note's path with its create or edit. The plan's own places
 * hold too: every captured line is moved once, into the archive (TL-P2-33 §1), a runner file is made again only at
 * its own path in `.bower/` (TL-P2-33 §2a), and a generated note only under a main folder (TL-P2-17).
 */
export function grounded(manifest: RunManifest): boolean {
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const members = new Set(manifest.capture.members.map((m) => m.file.fileId));
  const places = new Set(manifest.capture.places.map((p) => p.file.fileId));
  const pathOf = (t: Target): string | null => placePath(manifest, t);
  const madeAt = (e: EffectV2): string | null => {
    // Rules is the one generated root note; its creation words the person's rules too.
    if (e.kind === 'create-text' && e.name === RULES && 'fileId' in e.parent && e.parent.fileId === manifest.scope.rootId) return RULES;
    const parent = e.kind === 'create-text' ? pathOf(e.parent) : null;
    return e.kind === 'create-text' && parent !== null ? join(parent, e.name) : e.kind === 'edit-text' ? e.path : null;
  };
  const applied = new Map<string, ReportContribution[]>();
  const rejected = new Map<string, number>();
  const lines = new Set(manifest.capture.journal.flatMap((j) => j.fileIds));
  // An answer whose granted write was refused keeps it, in one answered row on that edit, rejected (TL-P4-19 addendum 21).
  const notWritten = (c: ReportContribution): boolean => {
    const e = c.requires.length === 1 ? ops.get(c.requires[0] ?? '')?.effect : undefined;
    return c.when === 'rejected' && !c.value.setAside.length && !c.value.filed.length && !c.value.updated.length && c.value.answered?.length === 1 && e?.kind === 'edit-text'
      && e.changes.some((x) => x.kind === 'state-rewrite' && x.granted !== undefined);
  };
  for (const c of manifest.reportPlan) {
    if (!c.requires.length || new Set(c.requires).size !== c.requires.length || !c.requires.every((id) => ops.has(id))) return false;
    if (notWritten(c)) continue;
    if (c.when === 'rejected' && (c.requires.length !== 1 || c.value.setAside.length !== 1)) return false;
    // An updated row names the operation that wrote it: its contribution's first (TL-P4-19 addendum 3).
    if (c.value.updated.some((r) => r.op !== c.requires[0])) return false;
    // An answered row is said once its answer's line is archived (TL-P4-19 addendum 10): on that move, applied.
    if (c.value.answered?.length && (c.when !== 'applied' || !c.requires.some((id) => { const e = ops.get(id)?.effect; return e?.kind === 'move' && lines.has(e.before.fileId); }))) return false;
    for (const id of c.requires) {
      if (c.when === 'rejected') rejected.set(id, (rejected.get(id) ?? 0) + 1);
      else applied.set(id, [...(applied.get(id) ?? []), c]);
    }
    const required = c.requires.flatMap((id) => ops.get(id)?.effect ?? []);
    // A filed row's place is its thing's move's, or its note's create's, or (a pile of words carried as Timeline lines)
    // its note's edit's; its note the one made or edited, or in that place.
    const move = required.find((e) => e.kind === 'move' && members.has(e.before.fileId));
    const made = required.find((e) => e.kind === 'create-text' || e.kind === 'edit-text');
    const to = move?.kind === 'move' ? pathOf(move.parent) : made?.kind === 'create-text' ? pathOf(made.parent) : made?.kind === 'edit-text' ? parentOf(made.path) : null;
    for (const r of c.value.filed) {
      if (to === null || r.to !== to) return false;
      if (r.note !== undefined && r.note !== (made ? madeAt(made) : join(r.to, nameOf(r.note)))) return false;
    }
    // A created or updated row names the note its first operation makes or edits.
    const first = ops.get(c.requires[0] ?? '')?.effect;
    const at = first ? madeAt(first) : null;
    // A single row of a change already made is grounded by that journal line's archive operation.
    const journalRow = c.when === 'applied' && c.value.yourChanges === 1 && first?.kind === 'move'
      && lines.has(first.before.fileId) && pathOf(first.parent) === SYSTEM.archive
      && c.value.updated.length === 1 && !c.value.created.length && !c.value.filed.length
      && !c.value.setAside.length && !c.value.questions.length && !c.value.answered?.length
      && !c.value.alreadySaved?.length && !c.value.requests?.length && c.value.rulesWorded === undefined
      && c.value.updated[0]?.line === undefined;
    const maintained = first?.kind === 'maintain' ? first.inputs.targets?.filter((t) => {
      const note = first.inputs.snapshot?.[t.fileId];
      return note?.moc && note.path === t.path && t.beforeContent !== undefined;
    }).map((t) => t.path) ?? [] : [];
    if (first?.kind === 'maintain') {
      if (c.when !== 'applied' || c.value.created.length || c.value.filed.length || c.value.setAside.length
        || c.value.updated.some((r) => !maintained.includes(r.path) || r.line !== undefined)
        || new Set(c.value.updated.map((r) => r.path)).size !== c.value.updated.length) return false;
    } else if (!journalRow && [...c.value.created, ...c.value.updated].some((r) => r.path !== at)) return false;
  }
  const rows = (o: OperationV2): ReportContribution[] => applied.get(o.operationId) ?? [];
  /** How many set-aside rows each operation must have: none but the ones counted below. */
  const asides = new Map<string, number>();
  /** Each captured thing's outcomes with a row: filed or saved, and set aside (by its move or Bin, not a cleared mark). */
  const told = { applied: new Set<string>(), rejected: new Set<string>() };
  for (const o of manifest.operations) {
    const e = o.effect;
    const mine = rows(o);
    const aside = rejected.get(o.operationId) ?? 0;
    if ((e.kind === 'move' || e.kind === 'bin') && members.has(e.before.fileId)) {
      if (!mine.length && !aside) continue;
      // Filed (or already saved) once, set aside once; a filing move goes to a verified destination, never the root.
      if (mine.reduce((n, c) => n + c.value.filed.length + (c.value.alreadySaved?.length ?? 0), 0) !== 1) return false;
      if (e.kind === 'move' && pathOf(e.parent) === null) return false;
      asides.set(o.operationId, 1);
      told.applied.add(e.before.fileId);
      told.rejected.add(e.before.fileId);
    } else if (savedWordsPile(manifest, o) !== null) {
      // A pile of words already saved: its Bin is told as a copy's is, once for each outcome.
      asides.set(o.operationId, 1);
    } else if (e.kind === 'move' && lines.has(e.before.fileId)) {
      const relocating = requestMoveKind(manifest, o);
      if (relocating) {
        if (mine.length || aside || e.name !== e.before.name) return false;
      } else if (pathOf(e.parent) !== SYSTEM.archive || e.name !== e.before.name
        || Object.keys(e.properties).some((key) => key !== 'bowerRun')
        || (Object.hasOwn(e.properties, 'bowerRun') && e.properties.bowerRun !== null) || mine.length !== 1) return false;
    } else if (e.kind === 'bin' && places.has(e.before.fileId)) {
      asides.set(o.operationId, 1);
    } else if (e.kind === 'edit-text') {
      // One row per Timeline line it writes, or one for a Current state alone; a kept note's lines carried from the
      // other note are said in the keep's one row instead.
      const entries = e.changes.reduce((n, c) => n + (c.kind === 'timeline-append' ? c.entries.length : 0), 0);
      const want = entries || (e.changes.some((c) => c.kind === 'state-rewrite') ? 1 : 0);
      const own = mine.filter((c) => c.requires.length === 1).reduce((n, c) => n + c.value.updated.length, 0);
      // Each line row names one line the edit appended (its ordinal), once, with the note as the run leaves it: the
      // edit's bytes and its New mark's stamp (TL-P4-19 addenda 4 and 5); a Current state's row names none.
      const rowsOf = mine.filter((c) => c.requires.length === 1).flatMap((c) => c.value.updated);
      const at = rowsOf.map((r) => r.line);
      if (at.some((l) => (entries ? l === undefined || l >= entries : l !== undefined)) || new Set(at).size !== at.length) return false;
      const mark = manifest.operations.find((x) => x.dependsOn.includes(o.operationId) && x.effect.kind === 'move' && x.effect.before.fileId === e.before.fileId && x.effect.properties.bowerNew === '1');
      const left = entries && mark ? { lines: entries, md5: md5Hex(new TextEncoder().encode(e.text)), stamp: stampOf(manifest.runId, mark.operationId) } : null;
      if (rowsOf.some((r) => r.line !== undefined && (left === null || r.lines !== left.lines || r.md5 !== left.md5 || r.stamp !== left.stamp))) return false;
      const kept = mine.some((c) => c.requires[0] === o.operationId && c.requires.length > 1 && c.value.updated.length);
      if (kept ? own > want : own !== want) return false;
    } else if (e.kind === 'create-text') {
      const parent = pathOf(e.parent);
      const rootRules = e.name === RULES && 'fileId' in e.parent && e.parent.fileId === manifest.scope.rootId;
      const made = parent === SYSTEM.dir ? RUNNER_MADE.find((x) => x === join(parent, e.name)) : undefined;
      if (e.purpose === 'runner-json' && (made === undefined || !holds(made, e.text))) return false;
      if (e.purpose !== 'generated' || rootRules) continue;
      if (!MAIN_FOLDERS.includes(parent?.split('/')[0] ?? '') || mine.reduce((n, c) => n + c.value.created.length, 0) !== 1) return false;
      // A link's note is set aside with its link; a request's note with the answer that names it.
      const waited = manifest.operations.some((x) => x.dependsOn.includes(o.operationId)
        && (filingMove(manifest, x) || (x.effect.kind === 'write-runner-json' ? x.effect.path : madeAt(x.effect)) === SYSTEM.requests));
      if (!waited) asides.set(o.operationId, 1);
    }
  }
  // Exactly the set-aside rows counted; every captured thing has a row for either outcome; every captured line's
  // every file is moved once.
  return manifest.operations.every((o) => (rejected.get(o.operationId) ?? 0) === (asides.get(o.operationId) ?? 0))
    && [...members].every((id) => told.applied.has(id) && told.rejected.has(id))
    && [...lines].every((id) => manifest.operations.filter((o) => 'before' in o.effect && o.effect.before.fileId === id && !requestMoveKind(manifest, o)).length === 1);
}

/** Whether a runner file made again holds what its path holds (a list of questions holds questions, TL-P2-37 Q1). */
function holds(path: (typeof RUNNER_MADE)[number], text: string): boolean {
  try {
    return isRunnerFile(path, JSON.parse(text));
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    console.error(e);
    return false;
  }
}

/** The path a target resolves to: a captured place, or a folder a create-folder in the plan makes. */
function placePath(manifest: RunManifest, t: Target): string | null {
  if ('fileId' in t) return manifest.capture.places.find((p) => p.file.fileId === t.fileId)?.path ?? null;
  const op = manifest.operations.find((o) => o.operationId === t.createdBy);
  if (op?.effect.kind !== 'create-folder') return null;
  const parent = 'fileId' in op.effect.parent && op.effect.parent.fileId === manifest.scope.rootId ? '' : placePath(manifest, op.effect.parent);
  return parent === null ? null : join(parent, op.effect.name);
}

/**
 * The keys grounding cannot check without hashing (TL-P2-20 Ratification 6): the create key of every saved-link
 * note is recomputed from the file id of the link its row files (`savedLinkKey`, R4-3 m-f).
 */
export async function groundedKeys(manifest: RunManifest): Promise<boolean> {
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  for (const c of manifest.reportPlan) {
    if (c.when !== 'applied' || c.value.filed[0]?.note === undefined) continue;
    const required = c.requires.map((id) => ops.get(id)?.effect);
    const create = required.find((e) => e?.kind === 'create-text');
    const move = required.find((e) => e?.kind === 'move' && manifest.capture.members.some((m) => m.file.fileId === e.before.fileId));
    if (create?.kind !== 'create-text' || move?.kind !== 'move') continue;
    if (create.createKey !== await savedLinkKey(move.before.fileId)) return false;
  }
  return true;
}

/** Where a generated note may be (TL-P2-17): the main folders, never Inbox. */
const MAIN_FOLDERS: readonly string[] = PARA_ROOTS.filter((root) => root !== 'Inbox');

// The report, its record and the consumed dispositions are shared with the runner (TL-P3-22).
