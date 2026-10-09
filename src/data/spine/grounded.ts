/**
 * A plan's report grounding (contract B): the report's rows and the operations they name fit together (`grounded`),
 * and a saved link's note keeps its key (`groundedKeys`). The run records live in `records.ts`, the report in
 * `report.ts`, and the pure record guards in `contracts/`.
 */
import type { DriveFile } from '../drive/drive-api';
import type { OperationV2, SeenFile, Target } from '../contracts/run-manifest';
import { savedLinkKey } from '../contracts/note-edit';
import { join } from '../tree';
import { PARA_ROOTS } from '../types';
import { sha256 } from '../vault/hashes';
import { SYSTEM, isRunnerFile } from '../vault/layout';
import type { RunManifest } from './records';

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
 * operation it reports (op id plus entry), so grounding checks the plan's shape, never a row's words. Every row names
 * operations of this plan, at least one; a set-aside row names its one operation (never paired with one by position);
 * every operation the person is told about has a row: a captured thing's move or Bin (one row for each outcome), a
 * generated note's create, a note's Timeline line or Current state, the Bin of a note kept as one with another, and
 * the archive moves of your changes. The plan's own places hold too: every captured line is moved once, into the
 * archive (TL-P2-33 §1), a runner file is made again only at its own path in `.bower/` (TL-P2-33 §2a), and a
 * generated note only under a main folder (TL-P2-17).
 */
export function grounded(manifest: RunManifest): boolean {
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const members = new Set(manifest.capture.members.map((m) => m.file.fileId));
  const places = new Set(manifest.capture.places.map((p) => p.file.fileId));
  const pathOf = (t: Target): string | null => placePath(manifest, t);
  const rows = { applied: new Set<string>(), rejected: new Set<string>() };
  for (const c of manifest.reportPlan) {
    if (!c.requires.length || !c.requires.every((id) => ops.has(id))) return false;
    if (c.when === 'rejected' && (c.requires.length !== 1 || c.value.setAside.length !== 1)) return false;
    for (const id of c.requires) rows[c.when].add(id);
  }
  const lines = new Set(manifest.capture.journal.flatMap((j) => j.fileIds));
  const rowed = (o: OperationV2): boolean => rows.applied.has(o.operationId) || rows.rejected.has(o.operationId);
  /** Each captured thing's outcomes with a row: filed or saved, and set aside (by its move or Bin, not a cleared mark). */
  const told = { applied: new Set<string>(), rejected: new Set<string>() };
  for (const o of manifest.operations) {
    const e = o.effect;
    if ((e.kind === 'move' || e.kind === 'bin') && members.has(e.before.fileId)) {
      // A filing move goes to a verified destination: a captured place or a folder the run makes, never the root.
      if (e.kind === 'move' && rowed(o) && pathOf(e.parent) === null) return false;
      if (rows.applied.has(o.operationId)) told.applied.add(e.before.fileId);
      if (rows.rejected.has(o.operationId)) told.rejected.add(e.before.fileId);
    } else if (e.kind === 'move' && lines.has(e.before.fileId)) {
      if (pathOf(e.parent) !== SYSTEM.archive || e.name !== e.before.name || Object.keys(e.properties).length || !rowed(o)) return false;
    } else if (e.kind === 'bin' && places.has(e.before.fileId)) {
      if (!rowed(o)) return false;
    } else if (e.kind === 'edit-text' && e.changes.some((c) => c.kind === 'timeline-append' || c.kind === 'state-rewrite')) {
      if (!rowed(o)) return false;
    } else if (e.kind === 'create-text') {
      const parent = pathOf(e.parent);
      const rootRules = e.name === RULES && 'fileId' in e.parent && e.parent.fileId === manifest.scope.rootId;
      const made = parent === SYSTEM.dir ? RUNNER_MADE.find((x) => x === join(parent, e.name)) : undefined;
      if (e.purpose === 'runner-json' && (made === undefined || !holds(made, e.text))) return false;
      if (e.purpose === 'generated' && !rootRules && (!MAIN_FOLDERS.includes(parent?.split('/')[0] ?? '') || !rowed(o))) return false;
    }
  }
  // Every captured thing has a row for either outcome, and every captured line's every file is moved once.
  return [...members].every((id) => told.applied.has(id) && told.rejected.has(id))
    && [...lines].every((id) => manifest.operations.filter((o) => 'before' in o.effect && o.effect.before.fileId === id).length === 1);
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
