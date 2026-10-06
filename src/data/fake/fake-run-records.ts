/**
 * A B run's records in the Bower folder, as contract B lays them out:
 * `.bower/runs/<runId>/manifest-<hash>.json`, `checkpoint-<revision>-<hash>.json`,
 * `report-<hash>.json`, and consumed dispositions in `.bower/piles/`. Every
 * folder is found by its real name and parents, duplicates included; a record
 * is written once, read back and compared byte for byte, and a reply lost
 * after it landed is reconciled by its exact body, never written again.
 * Also the pure parts: report grounding and materialization, effect evidence
 * and consumed dispositions. The pure record guards live in `contracts/`.
 */
import type { DriveFile } from '../drive/drive-api';
import type { FakeDrive, FencedDrive, StoredEvidence } from '../drive/fake-drive';
import { parsePileDisposition, type Disposition } from '../contracts/pile-disposition';
import { canonicalRecordJson, hashRecordJson } from '../contracts/record-json';
import { parseRunCheckpoint, parseRunReport, verifyCheckpointChain, type Checkpoint, type EffectEvidence, type Outcome, type ReportRecord } from '../contracts/run-checkpoint';
import { parseRunManifestV2, type Effect, type Manifest, type OperationV2, type ReportContribution, type SeenFile, type Target } from '../contracts/run-manifest';
import { savedLinkKey } from '../contracts/note-edit';
import { join, parentOf, thingName } from '../tree';
import { BowerError, PARA_ROOTS, type RunReport } from '../types';
import { sha256 } from '../vault/hashes';
import { SYSTEM, isRunnerFile } from '../vault/layout';

/** `.bower/runs`, as Drive names it. */
export const RUNS_NAME = 'runs';
const PILES_NAME = SYSTEM.piles.slice(SYSTEM.dir.length + 1);

export const manifestName = (hash: string): string => `manifest-${hash}.json`;
export const checkpointName = (revision: number, hash: string): string => `checkpoint-${revision}-${hash}.json`;
export const reportName = (hash: string): string => `report-${hash}.json`;
export const dispositionName = (hash: string): string => `disposition-${hash}.json`;

/**
 * A B run's manifest, v1 or v2 (v1 plus `edit-text`, TL-P2-20): both are read by `parseRunManifestV2`, and a v1
 * manifest is one of these as it is.
 */
export type RunManifest = Omit<Manifest, 'v' | 'operations'> & { v: 1 | 2; operations: OperationV2[] };

/** Where a record lives: one run's folder, or the pile records. */
export type Where = { runId: string } | 'piles';

const SAVE_FAILED = 'Bower could not save what it did. Try again later.';
const READ_FAILED = 'Bower could not read what it did. Try again later.';
/** A manifest version later than this build reads (TL-P2-20 R3-7 m9): the run stays saving. */
const NEWER_BOWER = 'This tidy-up needs a newer Bower.';

/** Canonical text and identity of a record; a value outside the record domain is refused, never written. */
export async function canonical(value: unknown): Promise<{ text: string; bytes: Uint8Array; hash: string }> {
  const bytes = canonicalRecordJson(value);
  const hash = await hashRecordJson(value);
  if (!bytes.ok || !hash.ok) {
    console.error(`A run record could not be encoded (${!bytes.ok ? bytes.reason : !hash.ok ? hash.reason : 'unknown'})`);
    throw new BowerError('unknown', SAVE_FAILED);
  }
  return { text: new TextDecoder().decode(bytes.value), bytes: bytes.value, hash: hash.value };
}

/** SHA-256 of a text's exact UTF-8 bytes. */
export async function textHash(text: string): Promise<string> {
  return sha256(new Blob([new TextEncoder().encode(text)]));
}

/** A Drive file as contract B observes it. */
export function seen(f: DriveFile): SeenFile {
  return { fileId: f.id, name: f.name, parents: [...f.parents], folder: f.folder, modifiedTime: f.modifiedTime };
}

/** Stored evidence in the record shape: fake-stored, the bytes observed at this modified time. */
export function toEvidence(ev: StoredEvidence, encoding: 'utf8' | 'blob' = 'blob'): EffectEvidence {
  return {
    file: seen(ev.file),
    trashed: ev.trashed,
    content: ev.content ? { encoding, size: ev.content.size, sha256: ev.content.sha256, provenance: 'fake-stored', observedModifiedTime: ev.file.modifiedTime } : null,
    provenance: 'fake-stored',
  };
}

/** Whether stored evidence shows exactly this effect applied under `parentId` (null when the effect has no parent). */
export function shows(effect: Effect, ev: StoredEvidence, parentId: string | null): boolean {
  const f = ev.file;
  switch (effect.kind) {
    case 'move':
      return !ev.trashed && f.parents.length === 1 && f.parents[0] === parentId && f.name === effect.name
        && Object.entries(effect.properties).every(([key, value]) => (value === null ? f.appProperties?.[key] === undefined : f.appProperties?.[key] === value));
    case 'create-folder':
      return !ev.trashed && f.folder && f.parents.length === 1 && f.parents[0] === parentId && f.name === effect.name && f.appProperties?.bowerItem === effect.createKey;
    case 'bin':
      return ev.trashed;
    case 'write-runner-json':
      return !ev.trashed && ev.content?.size === effect.content.size && ev.content.sha256 === effect.content.sha256;
    case 'create-text':
      // A generated note (TL-P2-17): its create key, place, name and exact bytes; new runner files stay legacy. The
      // "new" mark is not evidence: it may be cleared (the note opened) between a lost reply and recovery.
      return effect.purpose === 'generated' && !ev.trashed && !f.folder && f.parents.length === 1 && f.parents[0] === parentId
        && f.name === effect.name && ev.content?.size === effect.content.size && ev.content.sha256 === effect.content.sha256
        && f.appProperties?.bowerItem === effect.createKey;
  }
}

/** Why a captured thing whose move was rejected stays (TL-P2-34): the precondition found it moved, renamed or removed. */
export const MOVED_AWAY = 'It was moved, renamed or removed before Bower could file it.';
/** Why it stays for any other rejection, a failed dependency included: a sentence that promises nothing. */
export const NOT_FILED = "It couldn't be filed this time.";
/** The failure a move's own precondition gives when its source is not as captured; the service is its only author. */
export const SOURCE_NOT_AS_SEEN = 'It was moved, renamed or removed before Bower could get to it.';

/**
 * The report from the fixed plan and the resolved outcomes: each contribution
 * exactly when all it requires reached its state. Null while any required
 * operation is unresolved: no row is invented for it. A thing set aside for a
 * rejected move says why by the move's cause (TL-P2-34), for every consumer:
 * the specific sentence when the move's own precondition found it moved,
 * renamed or removed, the general one for anything else.
 */
export function materialize(manifest: RunManifest, manifestHash: string, outcomes: readonly Outcome[]): ReportRecord | null {
  const state = new Map(outcomes.map((o) => [o.operationId, o.state]));
  const byId = new Map(outcomes.map((o) => [o.operationId, o]));
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const report: RunReport = { filed: [], created: [], updated: [], setAside: [], questions: [] };
  for (const c of manifest.reportPlan) {
    const states = c.requires.map((id) => state.get(id));
    if (states.some((s) => s !== 'applied' && s !== 'rejected')) return null;
    if (!states.every((s) => s === c.when)) continue;
    report.filed.push(...c.value.filed);
    report.created.push(...c.value.created);
    report.updated.push(...c.value.updated);
    const moves = c.when === 'rejected' && c.requires.every((id) => ops.get(id)?.effect.kind === 'move');
    const moved = c.requires.every((id) => {
      const o = byId.get(id);
      return o?.state === 'rejected' && o.failure.code === 'conflict' && o.failure.message === SOURCE_NOT_AS_SEEN;
    });
    report.setAside.push(...(moves ? c.value.setAside.map((row) => ({ ...row, why: moved ? MOVED_AWAY : NOT_FILED })) : c.value.setAside));
    report.questions.push(...c.value.questions);
    if (c.value.requests) report.requests = [...(report.requests ?? []), ...c.value.requests];
    if (c.value.yourChanges !== undefined) report.yourChanges = (report.yourChanges ?? 0) + c.value.yourChanges;
    if (c.value.rulesWorded !== undefined) report.rulesWorded = (report.rulesWorded ?? 0) + c.value.rulesWorded;
  }
  return { v: 1, kind: 'run-report', scope: { rootId: manifest.scope.rootId }, runId: manifest.runId, captureId: manifest.captureId, manifestHash, report };
}

/**
 * Contract B's grounding for this finite slice. Filing by move: every applied
 * contribution is one filed row backed by one move of a captured member, named
 * as captured, `to` its verified destination path, with every folder made for
 * it required too; every rejected one is that member's set-aside row. Each
 * captured member has both. Your changes (guard 9): a request row requires the
 * requests.json write that persists that captured line's completion with the
 * same wording, and the archive moves of every file of that line, each
 * depending on the write; a `yourChanges` row counts one captured line that is
 * not a completed request, archived by all its moves. Every captured line is
 * archived once and claimed by exactly one row. A hub note brought up to date
 * (TL-P2-20 I10): an applied `updated` row requires exactly one `edit-text`
 * with a Timeline line, names that edit's path and says what one of its lines
 * says; each edit is claimed once. A generated note (TL-P2-17) is claimed by
 * one applied row naming its resolved path and one set-aside row for what it
 * was for (see `noteRow`). Nothing else (questions, rules worded) is claimed.
 */
export function grounded(manifest: RunManifest): boolean {
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const members = new Map(manifest.capture.members.map((m) => [m.file.fileId, m]));
  const places = new Map(manifest.capture.places.map((p) => [p.file.fileId, p.path]));
  // A captured place's path, or the path of a folder the run makes. The scope root is never a captured place, and
  // is the path '' only as the parent of a folder the run makes at the top: a move or a note never goes to ''.
  const pathOf = (t: Target): string | null => {
    if ('fileId' in t) return places.get(t.fileId) ?? null;
    const op = ops.get(t.createdBy);
    if (op?.effect.kind !== 'create-folder') return null;
    const top = op.effect.parent;
    const parent = 'fileId' in top && top.fileId === manifest.scope.rootId ? '' : pathOf(top);
    return parent === null ? null : join(parent, op.effect.name);
  };
  const chainOf = (t: Target): string[] => {
    if ('fileId' in t) return [];
    const op = ops.get(t.createdBy);
    return op?.effect.kind === 'create-folder' ? [t.createdBy, ...chainOf(op.effect.parent)] : [];
  };
  const lineOf = new Map(manifest.capture.journal.flatMap((j) => j.fileIds.map((id) => [id, j] as const)));
  const isArchive = (o: OperationV2): o is OperationV2 & { effect: MoveEffect } => o.effect.kind === 'move' && lineOf.has(o.effect.before.fileId)
    && pathOf(o.effect.parent) === SYSTEM.archive && o.effect.name === o.effect.before.name && Object.keys(o.effect.properties).length === 0;
  const completed = new Map<string, string>();
  for (const o of manifest.operations) {
    if (o.effect.kind !== 'write-runner-json' || o.effect.path !== SYSTEM.requests) continue;
    const done = requestsDone(o.effect.text);
    if (!done) return false;
    for (const [id, text] of done) completed.set(id, text);
  }
  const claimed = new Set<string>();
  const journalRow = (c: ReportContribution): boolean => {
    const v = c.value;
    if (c.when !== 'applied' || v.filed.length || v.created.length || v.updated.length || v.setAside.length || v.questions.length || v.rulesWorded !== undefined) return false;
    const required = c.requires.map((id) => ops.get(id));
    const moves = required.filter((o): o is OperationV2 & { effect: MoveEffect } => !!o && isArchive(o));
    const line = moves[0] ? lineOf.get(moves[0].effect.before.fileId) : undefined;
    if (!line || claimed.has(line.recordId)) return false;
    const files = moves.map((o) => o.effect.before.fileId);
    if (files.length !== line.fileIds.length || !line.fileIds.every((id) => files.includes(id))) return false;
    const chain = new Set(moves.flatMap((o) => chainOf(o.effect.parent)));
    if (![...chain].every((id) => c.requires.includes(id))) return false;
    const writes = required.filter((o): o is OperationV2 => o?.effect.kind === 'write-runner-json');
    const allowed = new Set([...moves, ...writes].map((o) => o.operationId));
    if (required.some((o) => !o || (!allowed.has(o.operationId) && !chain.has(o.operationId)))) return false;
    if (v.requests !== undefined) {
      const [write, ...more] = writes;
      const [text, ...rest] = v.requests;
      if (v.yourChanges !== undefined || !write || more.length || text === undefined || rest.length) return false;
      if (write.effect.kind !== 'write-runner-json' || write.effect.path !== SYSTEM.requests || requestsDone(write.effect.text)?.get(line.recordId) !== text) return false;
      if (!moves.every((o) => o.dependsOn.includes(write.operationId))) return false;
    } else if (v.yourChanges !== 1 || writes.length || completed.has(line.recordId)) return false;
    claimed.add(line.recordId);
    return true;
  };
  const updated = new Set<string>();
  const updatedRow = (c: ReportContribution): boolean => {
    const v = c.value;
    if (c.when !== 'applied' || v.filed.length || v.created.length || v.setAside.length || v.questions.length || v.rulesWorded !== undefined) return false;
    const [row, ...rest] = v.updated;
    const [id, ...more] = c.requires;
    const edit = id === undefined ? undefined : ops.get(id)?.effect;
    if (!row || rest.length || more.length || id === undefined || edit?.kind !== 'edit-text' || edit.path !== row.path || updated.has(id)) return false;
    if (!edit.changes.some((change) => change.kind === 'timeline-append' && change.entries.some((entry) => entry.text === row.what))) return false;
    updated.add(id);
    return true;
  };
  // Generated notes (TL-P2-17): what each is for, from the fixed plan: a filed thing's own note follows that thing's
  // move; a pile's words are written before that pile's folder goes to the Bin.
  // A saved link's note (TL-P2-20 M5, R3-6) comes before the link's move, which depends on it: it is claimed by that
  // link's filed row (`noteGrounded`), not by rows of its own.
  const linkNote = (o: OperationV2): boolean => manifest.operations.some((m) => m.effect.kind === 'move' && members.has(m.effect.before.fileId) && m.dependsOn.includes(o.operationId));
  const generatedOps = manifest.operations.filter((o): o is OperationV2 & { effect: CreateText } => o.effect.kind === 'create-text' && o.effect.purpose === 'generated');
  const notes = generatedOps.filter((o) => !linkNote(o));
  const linkNotes = generatedOps.filter(linkNote);
  const forOf = (o: OperationV2): string | null => {
    const [after, ...others] = o.dependsOn;
    if (after !== undefined && !others.length) {
      const move = ops.get(after)?.effect;
      return move?.kind === 'move' && members.has(move.before.fileId) ? (members.get(move.before.fileId)?.file.name ?? null) : null;
    }
    if (o.dependsOn.length) return null;
    // The pile folder whose Bin waits for it (its context note may go to the Bin after it too).
    const anchors = manifest.operations.flatMap((b) => (b.effect.kind === 'bin' && b.dependsOn.includes(o.operationId)
      && manifest.capture.piles.some((p) => b.effect.kind === 'bin' && p.anchor?.fileId === b.effect.before.fileId) ? [b.effect.before] : []));
    const [anchor, ...more] = anchors;
    return anchor && !more.length ? anchor.name : null;
  };
  const written = new Set<string>();
  const unwritten = new Set<string>();
  /**
   * A generated note's rows: applied, one `created` row with its resolved path, plus a pile's `filed` row naming
   * that note (`filed.note` only when its create is in the same requires set), requiring its create and every folder
   * made for it; rejected, one `setAside` row for what it was for, requiring only its create. Each claimed once.
   */
  const noteRow = (c: ReportContribution): boolean => {
    const v = c.value;
    const [id, ...rest] = c.requires;
    const op = id === undefined ? undefined : ops.get(id);
    if (!op || op.effect.kind !== 'create-text' || op.effect.purpose !== 'generated') return false;
    const e = op.effect;
    const aside = forOf(op);
    const parent = pathOf(e.parent);
    if (aside === null || parent === null || v.updated.length || v.questions.length || v.requests !== undefined || v.yourChanges !== undefined || v.rulesWorded !== undefined) return false;
    if (c.when === 'rejected') {
      const [row, ...more] = v.setAside;
      if (rest.length || v.filed.length || v.created.length || !row || more.length || row.name !== aside || unwritten.has(op.operationId)) return false;
      unwritten.add(op.operationId);
      return true;
    }
    // TL-P2-17: only under a main folder, never Inbox, .bower/ or the root (runner JSON is another purpose).
    if (!MAIN_FOLDERS.includes(parent.split('/')[0] ?? '')) return false;
    const chain = chainOf(e.parent);
    const path = join(parent, e.name);
    const [made, ...others] = v.created;
    if (v.setAside.length || !made || others.length || made.path !== path || !made.what || written.has(op.operationId)) return false;
    if (rest.length !== chain.length || !chain.every((x) => rest.includes(x))) return false;
    const fromWords = op.dependsOn.length === 0;
    const [row, ...more] = v.filed;
    if (more.length || (fromWords ? !row || row.kind !== 'note' || row.to !== parent || row.note !== path || row.title !== thingName(e.name) : row !== undefined)) return false;
    written.add(op.operationId);
    return true;
  };
  const filed = new Set<string>();
  const setAside = new Set<string>();
  const claimedNotes = new Set<string>();
  const alone = new Set<string>();
  for (const c of manifest.reportPlan) {
    const v = c.value;
    if (v.requests !== undefined || v.yourChanges !== undefined) {
      if (!journalRow(c)) return false;
      continue;
    }
    if (c.requires.some((id) => { const o = ops.get(id); return o?.effect.kind === 'create-text' && !linkNote(o); })) {
      if (!noteRow(c)) return false;
      continue;
    }
    if (v.updated.length) {
      if (!updatedRow(c)) return false;
      continue;
    }
    if (v.created.length || v.updated.length || v.questions.length || v.rulesWorded !== undefined) return false;
    const moves = c.requires.flatMap((id) => {
      const op = ops.get(id);
      return op?.effect.kind === 'move' && members.has(op.effect.before.fileId) ? [{ ...op, effect: op.effect }] : [];
    });
    const [moveOp, ...more] = moves;
    const move = moveOp?.effect;
    if (!moveOp || !move || more.length) return false;
    const member = members.get(move.before.fileId);
    if (!member) return false;
    if (c.when === 'rejected') {
      const [row, ...rest] = v.setAside;
      if (v.filed.length || !row || rest.length || row.name !== member.file.name || setAside.has(member.file.fileId)) return false;
      setAside.add(member.file.fileId);
      continue;
    }
    if (!v.filed.length) {
      // TL-P2-35: a thing filed on its own, as its merge could not be planned, says so once its move applied.
      const [row, ...others] = v.setAside;
      if (!row || others.length || c.requires.length !== 1 || row.name !== member.file.name || alone.has(member.file.fileId)) return false;
      alone.add(member.file.fileId);
      continue;
    }
    const [row, ...rest] = v.filed;
    if (v.setAside.length || !row || rest.length) return false;
    if (row.name !== member.file.name || row.to !== pathOf(move.parent) || filed.has(member.file.fileId)) return false;
    if (!chainOf(move.parent).every((id) => c.requires.includes(id))) return false;
    if (row.note !== undefined && !noteGrounded(manifest, c, moveOp, row.note, claimedNotes)) return false;
    filed.add(member.file.fileId);
  }
  // Every captured line's every file is moved once, into the archive, and the line is claimed by one row.
  for (const id of lineOf.keys()) {
    const touching = manifest.operations.filter((o) => 'before' in o.effect && o.effect.before.fileId === id);
    if (touching.length !== 1 || !touching[0] || !isArchive(touching[0])) return false;
  }
  return [...members.keys()].every((id) => filed.has(id) && setAside.has(id))
    && manifest.capture.journal.every((j) => claimed.has(j.recordId))
    && notes.every((o) => written.has(o.operationId) && unwritten.has(o.operationId))
    && linkNotes.every((o) => manifest.reportPlan.some((c) => c.when === 'applied' && c.requires.includes(o.operationId) && c.value.filed.some((r) => r.note !== undefined)));
}

/**
 * A filed row's `note` (TL-P2-20 M5, I4, R4-2): the path of the generated note an applied create-text in the same
 * `requires` writes next to the move's destination, the move depending on it; the note an applied Timeline line in
 * the same `requires` was added to (a merge), the move depending on it; or a note already there, recorded
 * in `capture.places` in the move's destination folder and checked again in the step of the move
 * (`reusedNoteOf`). Each note is claimed once.
 */
function noteGrounded(manifest: RunManifest, c: ReportContribution, moveOp: OperationV2 & { effect: MoveEffect }, note: string, claimed: Set<string>): boolean {
  if (claimed.has(note)) return false;
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const move = moveOp.effect;
  const creates = c.requires.flatMap((id) => {
    const op = ops.get(id);
    return op?.effect.kind === 'create-text' ? [{ op, effect: op.effect }] : [];
  });
  const lines = c.requires.flatMap((id) => {
    const op = ops.get(id);
    return op?.effect.kind === 'edit-text' ? [{ op, effect: op.effect }] : [];
  });
  const [create, ...more] = creates;
  const [line, ...others] = lines;
  if (more.length || others.length || (create && line)) return false;
  if (line) {
    // A merge (I4): the applied Timeline line on that very note, the thing moved after it into the note's folder.
    if (line.effect.path !== note || !line.effect.changes.some((ch) => ch.kind === 'timeline-append')) return false;
    if (!moveOp.dependsOn.includes(line.op.operationId) || parentOf(note) !== placePath(manifest, move.parent)) return false;
    // It names the captured answer that asked for it, whose archive waits on this very move (R3-4).
    const archived = (recordId: string): boolean => {
      const files = manifest.capture.journal.find((j) => j.recordId === recordId)?.fileIds ?? [];
      return files.length > 0 && manifest.operations.some((o) => o.effect.kind === 'move' && files.includes(o.effect.before.fileId) && o.dependsOn.includes(moveOp.operationId));
    };
    const named = line.effect.changes.some((ch) => ch.kind === 'timeline-append' && ch.recordIds.some(archived));
    if (!named) return false;
  } else if (create) {
    const same = JSON.stringify(create.effect.parent) === JSON.stringify(move.parent);
    if (!same || create.effect.purpose !== 'generated' || !moveOp.dependsOn.includes(create.op.operationId)) return false;
    if (join(placePath(manifest, move.parent) ?? '\u0000', create.effect.name) !== note) return false;
  } else {
    // A note already there backs no line and no create: the move depends on neither.
    if (moveOp.dependsOn.some((id) => ['edit-text', 'create-text'].includes(ops.get(id)?.effect.kind ?? ''))) return false;
    const place = manifest.capture.places.find((p) => p.path === note);
    if (!place || place.file.folder || !note.endsWith('.md') || parentOf(note) !== placePath(manifest, move.parent)) return false;
    if (manifest.capture.members.some((m) => m.file.fileId === place.file.fileId)) return false;
  }
  claimed.add(note);
  return true;
}

/** The path a target resolves to: a captured place, or a folder a create-folder in the plan makes. */
function placePath(manifest: RunManifest, t: Target): string | null {
  if ('fileId' in t) return manifest.capture.places.find((p) => p.file.fileId === t.fileId)?.path ?? null;
  const op = manifest.operations.find((o) => o.operationId === t.createdBy);
  if (op?.effect.kind !== 'create-folder') return null;
  const parent = placePath(manifest, op.effect.parent);
  return parent === null ? null : join(parent, op.effect.name);
}

/**
 * The note a filing move files beside without creating it (TL-P2-20 R4-2): the captured place its applied row
 * names when no create-text in that row writes it. The move's dispatch checks it again, in the same step.
 */
export function reusedNoteOf(manifest: RunManifest, op: OperationV2): { file: SeenFile; path: string } | null {
  if (op.effect.kind !== 'move') return null;
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  for (const c of manifest.reportPlan) {
    if (c.when !== 'applied' || !c.requires.includes(op.operationId)) continue;
    const note = c.value.filed[0]?.note;
    if (note === undefined || c.requires.some((id) => ops.get(id)?.effect.kind === 'create-text')) continue;
    if (c.requires.some((id) => ops.get(id)?.effect.kind === 'edit-text')) continue;
    return manifest.capture.places.find((p) => p.path === note) ?? null;
  }
  return null;
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

type MoveEffect = Extract<Effect, { kind: 'move' }>;
type CreateText = Extract<Effect, { kind: 'create-text' }>;
/** Where a generated note may be (TL-P2-17): the main folders, never Inbox. */
const MAIN_FOLDERS: readonly string[] = PARA_ROOTS.filter((root) => root !== 'Inbox');

/** The done requests a requests.json text holds, by id; null when it is not a valid requests file. */
function requestsDone(text: string): Map<string, string> | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    console.error(e);
    return null;
  }
  return isRunnerFile(SYSTEM.requests, value) ? new Map(value.done.map((r) => [r.id, r.text])) : null;
}

/** A filing move: a captured member going to another place (a cleared "new" mark stays where it is). */
export function filingMove(manifest: RunManifest, op: OperationV2): boolean {
  const e = op.effect;
  return e.kind === 'move' && manifest.capture.members.some((m) => m.file.fileId === e.before.fileId);
}

/**
 * Consumed dispositions (guard 13) for declared piles whose every member was
 * filed by this run: the published report, the member keys and the applied
 * moves (and the folder's Bin, when it went). A pile with a member not filed
 * keeps its declaration and gets none.
 */
export function dispositionsFor(manifest: RunManifest, outcomes: readonly Outcome[], reportHash: string): Disposition[] {
  const byOp = new Map(outcomes.map((o) => [o.operationId, o]));
  const out: Disposition[] = [];
  for (const pile of manifest.capture.piles) {
    if (pile.source.kind !== 'declared') continue;
    const files = new Set(manifest.capture.members.filter((m) => m.pileId === pile.pileId).map((m) => m.file.fileId));
    const moves = manifest.operations.filter((o) => filingMove(manifest, o) && o.effect.kind === 'move' && files.has(o.effect.before.fileId));
    const bin = manifest.operations.find((o) => o.effect.kind === 'bin' && o.effect.before.fileId === pile.anchor?.fileId);
    const applied = (o: OperationV2): EffectEvidence | null => {
      const outcome = byOp.get(o.operationId);
      return outcome?.state === 'applied' ? outcome.evidence : null;
    };
    if (!moves.length || moves.length !== files.size || !moves.every((o) => applied(o))) continue;
    const operations = [...moves, ...(bin && applied(bin) ? [bin] : [])].flatMap((o) => {
      const evidence = applied(o);
      return evidence ? [{ operationId: o.operationId, evidence }] : [];
    });
    out.push({
      v: 1, kind: 'pile-disposition', scope: { rootId: manifest.scope.rootId }, pileId: pile.pileId,
      declaration: pile.source.ref, memberKeys: pile.memberKeys.filter((k): k is string => k !== null),
      action: 'consumed', authority: { kind: 'run', runId: manifest.runId, reportHash }, operations,
    });
  }
  return out;
}

/** One verified run's records over the fake Drive, scoped to one root. */
export class RunRecords {
  constructor(
    private readonly drive: FakeDrive,
    private readonly rootId: string,
  ) {}

  /** The folders a record can be in, by real names and parents, duplicates included. */
  private async folders(where: Where): Promise<{ listing: DriveFile[]; bower: DriveFile[]; ns: DriveFile[]; run: DriveFile[] }> {
    const listing = await this.drive.listAll(this.rootId);
    const bower = listing.filter((f) => f.folder && f.name === SYSTEM.dir && f.parents.includes(this.rootId));
    const ns = listing.filter((f) => f.folder && f.name === (where === 'piles' ? PILES_NAME : RUNS_NAME) && f.parents.some((p) => bower.some((b) => b.id === p)));
    const run = where === 'piles' ? ns : listing.filter((f) => f.folder && f.name === where.runId && f.parents.some((p) => ns.some((n) => n.id === p)));
    return { listing, bower, ns, run };
  }

  /** Every record file there. */
  async list(where: Where): Promise<DriveFile[]> {
    const { listing, run } = await this.folders(where);
    return listing.filter((f) => !f.folder && f.parents.some((p) => run.some((r) => r.id === p)));
  }

  /** The bytes of a record, when one is there; copies with other bytes refuse. */
  async read(where: Where, name: string): Promise<Uint8Array | null> {
    let found: Uint8Array | null = null;
    for (const copy of (await this.list(where)).filter((f) => f.name === name)) {
      const bytes = await this.drive.readBytes(copy.id);
      if (found && !same(found, bytes)) {
        console.error(`Run record ${name} has copies with other bytes`);
        throw new BowerError('conflict', READ_FAILED);
      }
      found = bytes;
    }
    return found;
  }

  /**
   * Writes an immutable record once: already there with these bytes is done;
   * other bytes refuse. A failed create whose record landed anyway (a lost
   * reply) is reconciled by its exact body. Confirmed by reading it back.
   */
  async put(w: FencedDrive, where: Where, name: string, text: string): Promise<void> {
    const bytes = new TextEncoder().encode(text);
    const there = async (): Promise<boolean> => {
      const found = await this.read(where, name);
      if (found && !same(found, bytes)) {
        console.error(`Run record ${name} is there with other bytes`);
        throw new BowerError('conflict', SAVE_FAILED);
      }
      return found !== null;
    };
    if (await there()) return;
    const parent = await this.ensure(w, where);
    try {
      await w.createText(parent, name, text);
    } catch (e) {
      if (!(await there())) throw e;
      // The record landed and only its answer was lost: it is the same record, not a second one.
      console.error(e);
      return;
    }
    if (!(await there())) {
      console.error(`Run record ${name} could not be read back`);
      throw new BowerError('unknown', SAVE_FAILED);
    }
  }

  /** The verified manifest the control row names, v1 or v2; anything else refuses. */
  async manifest(runId: string, hash: string): Promise<RunManifest> {
    const bytes = await this.read({ runId }, manifestName(hash));
    const parsed = bytes ? await parseRunManifestV2(bytes, this.rootId) : null;
    if (!parsed?.ok || parsed.sha256 !== hash || parsed.value.runId !== runId) {
      console.error(`The manifest of run ${runId} is ${parsed ? (parsed.ok ? 'another run' : parsed.reason) : 'missing'}`);
      // A later version is named only for the very bytes the run recorded; damaged bytes stay a read failure.
      const later = bytes !== null && parsed?.ok === false && parsed.reason === 'version' && (await sha256(new Blob([bytes.slice()]))) === hash;
      throw new BowerError('unknown', later ? NEWER_BOWER : READ_FAILED);
    }
    return parsed.value;
  }

  /**
   * The committed chain, from the control head back to revision zero by each
   * record's own digest; orphan records are never taken as head. Verified as a
   * monotonic chain (contracts/run-checkpoint).
   */
  async chain(manifest: RunManifest, manifestHash: string, head: string): Promise<Checkpoint[]> {
    const runId = manifest.runId;
    const files = (await this.list({ runId })).filter((f) => f.name.startsWith('checkpoint-'));
    const expected = { rootId: this.rootId, runId, captureId: manifest.captureId, manifestHash, operationIds: manifest.operations.map((o) => o.operationId) };
    const out: Checkpoint[] = [];
    let at: string | null = head;
    while (at) {
      const hash: string = at;
      const named = files.filter((f) => f.name.endsWith(`-${hash}.json`));
      const name = named[0]?.name;
      const bytes = name ? await this.read({ runId }, name) : null;
      const parsed = bytes ? await parseRunCheckpoint(bytes, expected) : null;
      if (!name || !parsed?.ok || parsed.sha256 !== hash || name !== checkpointName(parsed.value.revision, hash)) {
        console.error(`Checkpoint ${hash} of run ${runId} is ${parsed ? (parsed.ok ? 'misnamed' : parsed.reason) : 'missing'}`);
        throw new BowerError('unknown', READ_FAILED);
      }
      out.unshift(parsed.value);
      at = parsed.value.previous;
      // More links than records means a loop: the chain check below refuses it.
      if (out.length > files.length) break;
    }
    const verified = await verifyCheckpointChain(out);
    if (!verified.ok || verified.head !== head) {
      console.error(`The checkpoints of run ${runId} do not chain (${verified.ok ? 'head' : `${verified.reason} at ${verified.at}`})`);
      throw new BowerError('unknown', READ_FAILED);
    }
    return out;
  }

  /** The published report record, read back and bound to this run. */
  async report(manifest: RunManifest, manifestHash: string, hash: string): Promise<ReportRecord> {
    const bytes = await this.read({ runId: manifest.runId }, reportName(hash));
    const parsed = bytes ? await parseRunReport(bytes, { rootId: this.rootId, runId: manifest.runId, captureId: manifest.captureId, manifestHash }) : null;
    if (!parsed?.ok || parsed.sha256 !== hash) {
      console.error(`The report of run ${manifest.runId} is ${parsed ? (parsed.ok ? 'another report' : parsed.reason) : 'missing'}`);
      throw new BowerError('unknown', READ_FAILED);
    }
    return parsed.value;
  }

  /** Writes a consumed disposition after checking it against its pile's full key set. */
  async putDisposition(w: FencedDrive, value: Disposition): Promise<void> {
    const c = await canonical(value);
    const parsed = await parsePileDisposition(c.bytes, this.rootId, value.memberKeys);
    if (!parsed.ok || parsed.sha256 !== c.hash) {
      console.error(`A disposition of pile ${value.pileId} was refused (${parsed.ok ? 'hash' : parsed.reason})`);
      throw new BowerError('unknown', SAVE_FAILED);
    }
    await this.put(w, 'piles', dispositionName(c.hash), c.text);
  }

  /** The record folder, made (with `.bower/runs`) when missing; a lost reply finds the folder that landed. */
  private async ensure(w: FencedDrive, where: Where): Promise<string> {
    const { bower, ns, run } = await this.folders(where);
    if (run[0]) return run[0].id;
    const sys = bower[0]?.id ?? (await this.folder(w, this.rootId, SYSTEM.dir));
    const space = ns[0]?.id ?? (await this.folder(w, sys, where === 'piles' ? PILES_NAME : RUNS_NAME));
    return where === 'piles' ? space : this.folder(w, space, where.runId);
  }

  private async folder(w: FencedDrive, parent: string, name: string): Promise<string> {
    try {
      return (await w.createFolder(parent, name)).id;
    } catch (e) {
      const landed = (await this.drive.listAll(parent)).find((f) => f.folder && f.name === name && f.parents[0] === parent);
      if (!landed) throw e;
      console.error(e);
      return landed.id;
    }
  }
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((x, i) => x === b[i]);
}
