/**
 * A run's records in the Bower folder, as contract B lays them out (TL-P3-21 point 3):
 * `.bower/runs/<runId>/manifest-<hash>.json`, `checkpoint-<revision>-<hash>.json` and `report-<hash>.json`, and
 * consumed dispositions in `.bower/piles/`, with the report record read back and a disposition checked before it is
 * written. Shared by the fake run service and the runner (TL-P3-21 point 2:
 * extracted, not ported): the reads come through a small interface, the writes through a `FencedDrive`, and time and
 * ids are handed in. Every folder is found by its real name and parents, duplicates included; a record is made once
 * by its reserved id and confirmed by its answer's checksum (`write-once.ts`), and a reply lost after it landed is
 * found again by that id, never written again. The pure record guards live in `contracts/`.
 */
import type { DriveFile, FencedDrive } from '../drive/drive-api';
import { makeFolder, makeText, type Gets } from './write-once';
import { canonicalRecordJson, hashRecordJson, parseRecordJson, type RecordJsonValue } from '../contracts/record-json';
import { parsePileDisposition, type Disposition } from '../contracts/pile-disposition';
import { parseRunCheckpoint, verifyCheckpointChain, type Checkpoint, type Outcome } from '../contracts/run-checkpoint';
import { parseRunManifestV2, type Manifest, type OperationV2 } from '../contracts/run-manifest';
import { BowerError } from '../types';
import { sha256 } from '../vault/hashes';
import { PROP, RUNNER_WRITES, SYSTEM, recordStamp } from '../vault/layout';

/** `.bower/runs`, as Drive names it. */
export const RUNS_NAME = 'runs';
/** Discovery hint only; replay authority remains the verified manifest and checkpoint chain. */
const APPENDS_RECORD_KEY = 'bowerAppends';
const PILES_NAME = SYSTEM.piles.slice(SYSTEM.dir.length + 1);

export const manifestName = (hash: string): string => `manifest-${hash}.json`;
export const checkpointName = (revision: number, hash: string): string => `checkpoint-${revision}-${hash}.json`;
export const reportName = (hash: string): string => `report-${hash}.json`;
export const dispositionName = (hash: string): string => `disposition-${hash}.json`;

const MANIFEST_FILE = /^manifest-([0-9a-f]{64})\.json$/;
/** Whether a file in a run's folder is its manifest, by its name. */
export const isManifestName = (name: string): boolean => MANIFEST_FILE.test(name);
const CHECKPOINT_FILE = /^checkpoint-(0|[1-9][0-9]*)-([0-9a-f]{64})\.json$/;

/**
 * A B run's manifest, v1 or v2 (v1 plus `edit-text`, TL-P2-20): both are read by `parseRunManifestV2`, and a v1
 * manifest is one of these as it is.
 */
export type RunManifest = Omit<Manifest, 'v' | 'operations'> & { v: 1 | 2; operations: OperationV2[] };

/** Where a record lives: one run's folder, or the pile records. */
export type Where = { runId: string } | 'piles';

export interface RecordItem { name: string; text: string; stamp?: Record<string, string> }

/** What the records read: everything under a folder that is not in the Bin, a file's stored bytes, and a file by its id. */
export interface RecordReads extends Gets {
  listAll(rootId: string): Promise<DriveFile[]>;
  readBytes(id: string): Promise<Uint8Array>;
}

/** The attempt that writes a checkpoint. */
export interface AttemptMark {
  attemptId: string;
  epoch: number;
}

export type CheckpointPatch = Partial<Pick<Checkpoint, 'phase' | 'phaseAt' | 'outcomes' | 'report' | 'retainedPileIds'>>;

/**
 * A run's folder as found: nothing yet, its verified manifest and chain (empty when only the manifest landed, with
 * `head` null), or something that cannot be verified, which is never written to.
 */
export type Found =
  | { kind: 'new' }
  | { kind: 'run'; manifest: RunManifest; manifestHash: string; chain: Checkpoint[]; head: string | null }
  | { kind: 'broken'; why: string };

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

/** A run's first checkpoint: queued, every operation not dispatched, written before any operation. */
export function firstCheckpoint(manifest: RunManifest, manifestHash: string, mark: AttemptMark, at: number): Checkpoint {
  const appendBindings = [...manifest.operations.flatMap((o) => o.effect.kind === 'edit-text' ? o.effect.changes.flatMap((c) =>
    c.kind === 'timeline-append' && c.consent ? [{ operationId: o.operationId, requestId: c.consent.requestId, targetFileId: c.consent.targetFileId }] : []) : []),
    ...(manifest.satisfiedAppends ?? []).map((s) => ({ operationId: s.operationId, requestId: s.consent.requestId, targetFileId: s.consent.targetFileId }))];
  return {
    v: 1, kind: 'run-checkpoint', scope: { rootId: manifest.scope.rootId }, runId: manifest.runId, manifestHash,
    revision: 0, previous: null, attemptId: mark.attemptId, epoch: mark.epoch, phase: 'queued', phaseAt: at,
    outcomes: manifest.operations.map((o): Outcome => ({ operationId: o.operationId, state: 'not-dispatched' })),
    report: { state: 'not-ready' }, retainedPileIds: [],
    ...(appendBindings.length ? { appendBindings } : {}),
  };
}

/** The checkpoint after `head` (whose digest is `previous`), written by `mark`. */
export function nextCheckpoint(head: Checkpoint, previous: string, mark: AttemptMark, patch: CheckpointPatch): Checkpoint {
  const outcomes = patch.outcomes ?? head.outcomes;
  const completed = new Map((head.completedAppends ?? []).map((r) => [JSON.stringify([r.requestId, r.targetFileId]), r]));
  for (const b of head.appendBindings ?? []) if (outcomes.some((o) => o.operationId === b.operationId && o.state === 'applied'))
    completed.set(JSON.stringify([b.requestId, b.targetFileId]), { requestId: b.requestId, targetFileId: b.targetFileId });
  return { ...head, ...patch, revision: head.revision + 1, previous, attemptId: mark.attemptId, epoch: mark.epoch,
    ...(completed.size ? { completedAppends: [...completed.values()] } : {}) };
}

/** The folders a record can be in, and the listing they were found in. */
type Folders = { listing: DriveFile[]; bower: DriveFile[]; ns: DriveFile[]; run: DriveFile[] };
type Walk = { ok: true; chain: Checkpoint[] } | { ok: false; why: string };

/** The folders in `.bower/runs` (any of its duplicates) of a listing. */
const runFoldersIn = (listing: readonly DriveFile[], ns: readonly DriveFile[]): DriveFile[] => listing.filter((f) => f.folder && f.parents.some((p) => ns.some((n) => n.id === p)));

/** One run's records, scoped to one root. */
export class RunRecords {
  /**
   * `placed` keeps, across instances, the record folder each run's records were last written to, so a record whose
   * name no earlier write can have used is written there without listing the folder again (`putNew`).
   */
  constructor(
    protected readonly reads: RecordReads,
    protected readonly rootId: string,
    protected readonly placed: Map<string, string> = new Map(),
  ) {}

  private placeOf(where: Where): string {
    return `${this.rootId}/${where === 'piles' ? 'piles' : `runs/${where.runId}`}`;
  }

  /** The folders a record can be in, by real names and parents, duplicates included. */
  private async folders(where: Where): Promise<Folders> {
    const listing = await this.reads.listAll(this.rootId);
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
    return this.readIn(await this.folders(where), name);
  }

  /** The same, from a listing already taken. */
  private async readIn({ listing, run }: Pick<Folders, 'listing' | 'run'>, name: string): Promise<Uint8Array | null> {
    let found: Uint8Array | null = null;
    for (const copy of listing.filter((f) => !f.folder && f.name === name && f.parents.some((p) => run.some((r) => r.id === p)))) {
      const bytes = await this.reads.readBytes(copy.id);
      if (found && !same(found, bytes)) {
        console.error(`Run record ${name} has copies with other bytes`);
        throw new BowerError('conflict', READ_FAILED);
      }
      found = bytes;
    }
    return found;
  }

  /** Writes an immutable record once: already there with these bytes is done; other bytes refuse. */
  async put(w: FencedDrive, where: Where, name: string, text: string, stamp?: Record<string, string>): Promise<void> {
    return this.putAll(w, where, [{ name, text, ...(stamp ? { stamp } : {}) }]);
  }

  /** Reads and checks the whole group before making its missing records together. */
  async putAll(w: FencedDrive, where: Where, items: readonly RecordItem[]): Promise<void> {
    const names = new Set<string>();
    for (const { name } of items) {
      if (names.has(name)) {
        console.error(`Run record ${name} is repeated in one write group`);
        throw new BowerError('conflict', SAVE_FAILED);
      }
      names.add(name);
    }
    const found = await this.folders(where);
    const missing: RecordItem[] = [];
    for (const item of items) {
      const stored = await this.readIn(found, item.name);
      if (stored && !same(stored, new TextEncoder().encode(item.text))) {
        console.error(`Run record ${item.name} is there with other bytes`);
        throw new BowerError('conflict', SAVE_FAILED);
      }
      if (!stored) missing.push(item);
    }
    if (!missing.length) return;
    const parent = await this.ensure(w, where, found);
    this.placed.set(this.placeOf(where), parent);
    const results = await Promise.allSettled(missing.map(({ name, text, stamp }) => {
      const props = markOf(where, stamp, text);
      return makeText(w, this.reads, { parent, name, ...(props ? { props } : {}) }, text);
    }));
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
  }

  /**
   * Writes a record whose name no earlier write can have used: a checkpoint names its revision and its own hash, and
   * its body names the attempt that writes it. So it is written into the folder its run's records were last written
   * to, with no listing first. With no folder known yet it goes through `put`.
   */
  async putNew(w: FencedDrive, where: Where, name: string, text: string): Promise<void> {
    const parent = this.placed.get(this.placeOf(where));
    if (!parent) return this.put(w, where, name, text);
    try {
      const props = markOf(where, undefined, text);
      await makeText(w, this.reads, { parent, name, ...(props ? { props } : {}) }, text);
    } catch (e) {
      // The next write looks for its folder again.
      this.placed.delete(this.placeOf(where));
      throw e;
    }
  }

  /** The verified manifest the control row names, v1 or v2; anything else refuses. */
  async manifest(runId: string, hash: string): Promise<RunManifest> {
    const bytes = await this.read({ runId }, manifestName(hash));
    const parsed = bytes ? await parseRunManifestV2(bytes, this.rootId, RUNNER_WRITES) : null;
    if (!parsed?.ok || parsed.sha256 !== hash || parsed.value.runId !== runId) {
      console.error(`The manifest of run ${runId} is ${parsed ? (parsed.ok ? 'another run' : parsed.reason) : 'missing'}`);
      // A later version is named only for the very bytes the run recorded; damaged bytes stay a read failure.
      const later = bytes !== null && parsed?.ok === false && parsed.reason === 'version' && (await sha256(new Blob([bytes.slice()]))) === hash;
      throw new BowerError('unknown', later ? NEWER_BOWER : READ_FAILED);
    }
    return parsed.value;
  }

  /**
   * A run's folder with no control row to name its head (the runner, TL-P3-21 point 3): only this run's folder is
   * read. Its one manifest, then its chain from the one checkpoint of the highest revision; every checkpoint there
   * must be on that chain, so a fork or a stray record is never taken for the run. A failed read throws as usual.
   */
  async found(runId: string): Promise<Found> {
    const folders = await this.folders({ runId });
    return this.foundIn(folders, runId);
  }

  private async foundIn(folders: Pick<Folders, 'listing' | 'run'>, runId: string): Promise<Found> {
    const files = folders.listing.filter((f) => !f.folder && f.parents.some((p) => folders.run.some((r) => r.id === p)));
    const names = [...new Set(files.map((f) => f.name))];
    const manifests = names.filter((n) => n.startsWith('manifest-'));
    const checkpoints = names.filter((n) => n.startsWith('checkpoint-'));
    if (!manifests.length) return checkpoints.length ? broken(`Run ${runId} has checkpoints and no manifest`) : { kind: 'new' };
    const [only, ...more] = manifests;
    const manifestHash = only ? MANIFEST_FILE.exec(only)?.[1] : undefined;
    if (!manifestHash || more.length) return broken(`Run ${runId} has ${manifests.length} manifests or a misnamed one`);
    const bytes = await this.readIn(folders, manifestName(manifestHash));
    const parsed = bytes ? await parseRunManifestV2(bytes, this.rootId, RUNNER_WRITES) : null;
    if (!parsed?.ok || parsed.sha256 !== manifestHash || parsed.value.runId !== runId) {
      return broken(`The manifest of run ${runId} is ${parsed ? (parsed.ok ? 'another run' : parsed.reason) : 'missing'}`);
    }
    const manifest: RunManifest = parsed.value;
    if (!checkpoints.length) return { kind: 'run', manifest, manifestHash, chain: [], head: null };
    const numbered = checkpoints.map((n) => CHECKPOINT_FILE.exec(n));
    if (numbered.some((m) => !m)) return broken(`Run ${runId} has a misnamed checkpoint`);
    const top = Math.max(...numbered.map((m) => Number(m?.[1])));
    const heads = numbered.filter((m) => Number(m?.[1]) === top).map((m) => m?.[2] ?? '');
    const [head, ...others] = heads;
    if (head === undefined || others.length) return broken(`Run ${runId} has ${heads.length} checkpoints of revision ${top}`);
    const records = files.filter((f) => f.name.startsWith('checkpoint-'));
    const walked = await this.walk(records, (name) => this.readIn(folders, name), manifest, manifestHash, head);
    if (!walked.ok) return broken(walked.why);
    if (walked.chain.length !== checkpoints.length) return broken(`Run ${runId} has checkpoints off its chain`);
    return { kind: 'run', manifest, manifestHash, chain: walked.chain, head };
  }

  /** The chain from `head` back to revision zero, verified; why not, when it is not. */
  private async walk(files: DriveFile[], readOne: (name: string) => Promise<Uint8Array | null>, manifest: RunManifest, manifestHash: string, head: string): Promise<Walk> {
    const runId = manifest.runId;
    const expected = { rootId: this.rootId, runId, captureId: manifest.captureId, manifestHash, operationIds: manifest.operations.map((o) => o.operationId) };
    const out: Checkpoint[] = [];
    let at: string | null = head;
    while (at) {
      const hash: string = at;
      const named = files.filter((f) => f.name.endsWith(`-${hash}.json`));
      const name = named[0]?.name;
      const bytes = name ? await readOne(name) : null;
      const parsed = bytes ? await parseRunCheckpoint(bytes, expected) : null;
      if (!name || !parsed?.ok || parsed.sha256 !== hash || name !== checkpointName(parsed.value.revision, hash)) {
        return { ok: false, why: `Checkpoint ${hash} of run ${runId} is ${parsed ? (parsed.ok ? 'misnamed' : parsed.reason) : 'missing'}` };
      }
      out.unshift(parsed.value);
      at = parsed.value.previous;
      // More links than records means a loop: the chain check below refuses it.
      if (out.length > files.length) break;
    }
    const first = out[0];
    const expectedFirst = first ? firstCheckpoint(manifest, manifestHash, { attemptId: first.attemptId, epoch: first.epoch }, first.phaseAt) : null;
    if (first && expectedFirst && (JSON.stringify(first.appendBindings ?? []) !== JSON.stringify(expectedFirst.appendBindings ?? [])
      || JSON.stringify(first.completedAppends ?? []) !== JSON.stringify(expectedFirst.completedAppends ?? []))) return { ok: false, why: 'The checkpoint has unrelated append bindings' };
    const verified = await verifyCheckpointChain(out);
    if (!verified.ok || verified.head !== head) {
      return { ok: false, why: `The checkpoints of run ${runId} do not chain (${verified.ok ? 'head' : `${verified.reason} at ${verified.at}`})` };
    }
    return { ok: true, chain: out };
  }

  /** The folders in `.bower/runs`, finished or not, as the listing these reads give shows them (no record read). */
  async runFolders(): Promise<DriveFile[]> {
    const { listing, ns } = await this.folders({ runId: '' });
    return runFoldersIn(listing, ns);
  }

  /** Writes a consumed disposition after checking it against its pile's full key set. */
  async putDisposition(w: FencedDrive, value: Disposition): Promise<void> {
    const item = await dispositionRecord(value, this.rootId);
    await this.put(w, 'piles', item.name, item.text, item.stamp);
  }

  /**
   * The record folder, made (with `.bower/runs`) when missing; a lost reply finds the folder that landed by its id. A
   * run's folder carries Bower's mark, its run id, from its create (retention acts only on folders that carry it).
   */
  private async ensure(w: FencedDrive, where: Where, { bower, ns, run }: Folders): Promise<string> {
    if (run[0]) return run[0].id;
    const sys = bower[0]?.id ?? (await makeFolder(w, this.reads, { parent: this.rootId, name: SYSTEM.dir })).id;
    const space = ns[0]?.id ?? (await makeFolder(w, this.reads, { parent: sys, name: where === 'piles' ? PILES_NAME : RUNS_NAME })).id;
    return where === 'piles' ? space : (await makeFolder(w, this.reads, { parent: space, name: where.runId, props: { [PROP.run]: where.runId } })).id;
  }
}

/**
 * What a record's create carries: in a run's folder, that run's mark (`bowerRun`, its run id), riding on the create, so
 * retention bins a run folder only when everything inside is Bower's own record of that run (retention round 6).
 */
function markOf(where: Where, stamp: Record<string, string> | undefined, text: string): Record<string, string> | undefined {
  if (where === 'piles') return stamp;
  const parsed = parseRecordJson(new TextEncoder().encode(text));
  const object = (v: RecordJsonValue | undefined): v is { [key: string]: RecordJsonValue } => v !== null && typeof v === 'object' && !Array.isArray(v);
  const m = parsed.ok && object(parsed.value) ? parsed.value : null;
  const appends = m?.kind === 'run-manifest' && ((Array.isArray(m.satisfiedAppends) && m.satisfiedAppends.length > 0)
    || (Array.isArray(m.operations) && m.operations.some((o) => object(o) && object(o.effect) && o.effect.kind === 'edit-text'
      && Array.isArray(o.effect.changes) && o.effect.changes.some((c) => object(c) && c.kind === 'timeline-append' && object(c.consent)))));
  return { ...stamp, [PROP.run]: where.runId, ...(appends ? { [APPENDS_RECORD_KEY]: '1' } : {}) };
}

/** A consumed disposition, checked before any write in its group starts. */
export async function dispositionRecord(value: Disposition, rootId: string): Promise<RecordItem> {
  const c = await canonical(value);
  const parsed = await parsePileDisposition(c.bytes, rootId, value.memberKeys);
  if (!parsed.ok || parsed.sha256 !== c.hash) {
    console.error(`A disposition of pile ${value.pileId} was refused (${parsed.ok ? 'hash' : parsed.reason})`);
    throw new BowerError('unknown', SAVE_FAILED);
  }
  return { name: dispositionName(c.hash), text: c.text, stamp: recordStamp(value.pileId) };
}

function broken(why: string): Found {
  console.error(why);
  return { kind: 'broken', why };
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((x, i) => x === b[i]);
}
