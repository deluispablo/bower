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
import { parseRunManifest, type Effect, type Manifest, type Operation, type SeenFile, type Target } from '../contracts/run-manifest';
import { join } from '../tree';
import { BowerError, type RunReport } from '../types';
import { sha256 } from '../vault/hashes';
import { SYSTEM } from '../vault/layout';

/** `.bower/runs`, as Drive names it. */
export const RUNS_NAME = 'runs';
const PILES_NAME = SYSTEM.piles.slice(SYSTEM.dir.length + 1);

export const manifestName = (hash: string): string => `manifest-${hash}.json`;
export const checkpointName = (revision: number, hash: string): string => `checkpoint-${revision}-${hash}.json`;
export const reportName = (hash: string): string => `report-${hash}.json`;
export const dispositionName = (hash: string): string => `disposition-${hash}.json`;

/** Where a record lives: one run's folder, or the pile records. */
export type Where = { runId: string } | 'piles';

const SAVE_FAILED = 'Bower could not save what it did. Try again later.';
const READ_FAILED = 'Bower could not read what it did. Try again later.';

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
      // Never planned on this path: generated notes and new runner files stay legacy.
      return false;
  }
}

/**
 * The report from the fixed plan and the resolved outcomes: each contribution
 * exactly when all it requires reached its state. Null while any required
 * operation is unresolved: no row is invented for it.
 */
export function materialize(manifest: Manifest, manifestHash: string, outcomes: readonly Outcome[]): ReportRecord | null {
  const state = new Map(outcomes.map((o) => [o.operationId, o.state]));
  const report: RunReport = { filed: [], created: [], updated: [], setAside: [], questions: [] };
  for (const c of manifest.reportPlan) {
    const states = c.requires.map((id) => state.get(id));
    if (states.some((s) => s !== 'applied' && s !== 'rejected')) return null;
    if (!states.every((s) => s === c.when)) continue;
    report.filed.push(...c.value.filed);
    report.created.push(...c.value.created);
    report.updated.push(...c.value.updated);
    report.setAside.push(...c.value.setAside);
    report.questions.push(...c.value.questions);
    if (c.value.requests) report.requests = [...(report.requests ?? []), ...c.value.requests];
    if (c.value.yourChanges !== undefined) report.yourChanges = (report.yourChanges ?? 0) + c.value.yourChanges;
    if (c.value.rulesWorded !== undefined) report.rulesWorded = (report.rulesWorded ?? 0) + c.value.rulesWorded;
  }
  return { v: 1, kind: 'run-report', scope: { rootId: manifest.scope.rootId }, runId: manifest.runId, captureId: manifest.captureId, manifestHash, report };
}

/**
 * Contract B's grounding for this finite slice (filing by move): every applied
 * contribution is one filed row backed by one move of a captured member, named
 * as captured, `to` its verified destination path, with every folder made for
 * it required too; every rejected one is that member's set-aside row. Each
 * captured member has both. Nothing else (created, updated, questions,
 * requests, counts) is claimed.
 */
export function grounded(manifest: Manifest): boolean {
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const members = new Map(manifest.capture.members.map((m) => [m.file.fileId, m]));
  const places = new Map(manifest.capture.places.map((p) => [p.file.fileId, p.path]));
  const pathOf = (t: Target): string | null => {
    if ('fileId' in t) return places.get(t.fileId) ?? null;
    const op = ops.get(t.createdBy);
    if (op?.effect.kind !== 'create-folder') return null;
    const parent = pathOf(op.effect.parent);
    return parent === null ? null : join(parent, op.effect.name);
  };
  const chainOf = (t: Target): string[] => {
    if ('fileId' in t) return [];
    const op = ops.get(t.createdBy);
    return op?.effect.kind === 'create-folder' ? [t.createdBy, ...chainOf(op.effect.parent)] : [];
  };
  const filed = new Set<string>();
  const setAside = new Set<string>();
  for (const c of manifest.reportPlan) {
    const v = c.value;
    if (v.created.length || v.updated.length || v.questions.length || v.requests !== undefined || v.yourChanges !== undefined || v.rulesWorded !== undefined) return false;
    const moves = c.requires.flatMap((id) => {
      const op = ops.get(id);
      return op?.effect.kind === 'move' && members.has(op.effect.before.fileId) ? [op.effect] : [];
    });
    const [move, ...more] = moves;
    if (!move || more.length) return false;
    const member = members.get(move.before.fileId);
    if (!member) return false;
    if (c.when === 'rejected') {
      const [row, ...rest] = v.setAside;
      if (v.filed.length || !row || rest.length || row.name !== member.file.name || setAside.has(member.file.fileId)) return false;
      setAside.add(member.file.fileId);
      continue;
    }
    const [row, ...rest] = v.filed;
    if (v.setAside.length || !row || rest.length || row.note !== undefined) return false;
    if (row.name !== member.file.name || row.to !== pathOf(move.parent) || filed.has(member.file.fileId)) return false;
    if (!chainOf(move.parent).every((id) => c.requires.includes(id))) return false;
    filed.add(member.file.fileId);
  }
  return [...members.keys()].every((id) => filed.has(id) && setAside.has(id));
}

/** A filing move: a captured member going to another place (a cleared "new" mark stays where it is). */
export function filingMove(manifest: Manifest, op: Operation): boolean {
  const e = op.effect;
  return e.kind === 'move' && manifest.capture.members.some((m) => m.file.fileId === e.before.fileId);
}

/**
 * Consumed dispositions (guard 13) for declared piles whose every member was
 * filed by this run: the published report, the member keys and the applied
 * moves (and the folder's Bin, when it went). A pile with a member not filed
 * keeps its declaration and gets none.
 */
export function dispositionsFor(manifest: Manifest, outcomes: readonly Outcome[], reportHash: string): Disposition[] {
  const byOp = new Map(outcomes.map((o) => [o.operationId, o]));
  const out: Disposition[] = [];
  for (const pile of manifest.capture.piles) {
    if (pile.source.kind !== 'declared') continue;
    const files = new Set(manifest.capture.members.filter((m) => m.pileId === pile.pileId).map((m) => m.file.fileId));
    const moves = manifest.operations.filter((o) => filingMove(manifest, o) && o.effect.kind === 'move' && files.has(o.effect.before.fileId));
    const bin = manifest.operations.find((o) => o.effect.kind === 'bin' && o.effect.before.fileId === pile.anchor?.fileId);
    const applied = (o: Operation): EffectEvidence | null => {
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

  /** The verified manifest the control row names; anything else refuses. */
  async manifest(runId: string, hash: string): Promise<Manifest> {
    const bytes = await this.read({ runId }, manifestName(hash));
    const parsed = bytes ? await parseRunManifest(bytes, this.rootId) : null;
    if (!parsed?.ok || parsed.sha256 !== hash || parsed.value.runId !== runId) {
      console.error(`The manifest of run ${runId} is ${parsed ? (parsed.ok ? 'another run' : parsed.reason) : 'missing'}`);
      throw new BowerError('unknown', READ_FAILED);
    }
    return parsed.value;
  }

  /**
   * The committed chain, from the control head back to revision zero by each
   * record's own digest; orphan records are never taken as head. Verified as a
   * monotonic chain (contracts/run-checkpoint).
   */
  async chain(manifest: Manifest, manifestHash: string, head: string): Promise<Checkpoint[]> {
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
  async report(manifest: Manifest, manifestHash: string, hash: string): Promise<ReportRecord> {
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
