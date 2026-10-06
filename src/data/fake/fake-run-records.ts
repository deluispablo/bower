/**
 * A B run's records in the Bower folder (`.bower/runs/<runId>/`, consumed
 * dispositions in `.bower/piles/`). Inert stub of its interface until the B
 * path lands: it reads and writes nothing.
 */
import type { DriveFile } from '../drive/drive-api';
import type { FakeDrive, FencedDrive, StoredEvidence } from '../drive/fake-drive';
import type { Disposition } from '../contracts/pile-disposition';
import type { Checkpoint, EffectEvidence, Outcome, ReportRecord } from '../contracts/run-checkpoint';
import type { Effect, Manifest, Operation, SeenFile } from '../contracts/run-manifest';
import { BowerError } from '../types';

export const RUNS_NAME = 'runs';
export const manifestName = (hash: string): string => `manifest-${hash}.json`;
export const checkpointName = (revision: number, hash: string): string => `checkpoint-${revision}-${hash}.json`;
export const reportName = (hash: string): string => `report-${hash}.json`;
export const dispositionName = (hash: string): string => `disposition-${hash}.json`;

/** Where a record lives: one run's folder, or the pile records. */
export type Where = { runId: string } | 'piles';

const NOT_YET = 'Bower cannot keep run records yet.';

export async function canonical(value: unknown): Promise<{ text: string; bytes: Uint8Array; hash: string }> {
  void value;
  throw new BowerError('unknown', NOT_YET);
}

export async function textHash(text: string): Promise<string> {
  void text;
  throw new BowerError('unknown', NOT_YET);
}

export function seen(f: DriveFile): SeenFile {
  return { fileId: f.id, name: f.name, parents: [...f.parents], folder: f.folder, modifiedTime: f.modifiedTime };
}

export function toEvidence(ev: StoredEvidence, encoding: 'utf8' | 'blob' = 'blob'): EffectEvidence {
  void encoding;
  return { file: seen(ev.file), trashed: ev.trashed, content: null, provenance: 'fake-stored' };
}

export function shows(effect: Effect, ev: StoredEvidence, parentId: string | null): boolean {
  void effect;
  void ev;
  void parentId;
  return false;
}

export function materialize(manifest: Manifest, manifestHash: string, outcomes: readonly Outcome[]): ReportRecord | null {
  void manifest;
  void manifestHash;
  void outcomes;
  return null;
}

export function grounded(manifest: Manifest): boolean {
  void manifest;
  return false;
}

export function filingMove(manifest: Manifest, op: Operation): boolean {
  void manifest;
  void op;
  return false;
}

export function dispositionsFor(manifest: Manifest, outcomes: readonly Outcome[], reportHash: string): Disposition[] {
  void manifest;
  void outcomes;
  void reportHash;
  return [];
}

export class RunRecords {
  constructor(drive: FakeDrive, rootId: string) {
    void drive;
    void rootId;
  }

  async list(where: Where): Promise<DriveFile[]> {
    void where;
    return [];
  }

  async read(where: Where, name: string): Promise<Uint8Array | null> {
    void where;
    void name;
    return null;
  }

  async put(w: FencedDrive, where: Where, name: string, text: string): Promise<void> {
    void w;
    void where;
    void name;
    void text;
    throw new BowerError('unknown', NOT_YET);
  }

  async manifest(runId: string, hash: string): Promise<Manifest> {
    void runId;
    void hash;
    throw new BowerError('unknown', NOT_YET);
  }

  async chain(manifest: Manifest, manifestHash: string, head: string): Promise<Checkpoint[]> {
    void manifest;
    void manifestHash;
    void head;
    throw new BowerError('unknown', NOT_YET);
  }

  async report(manifest: Manifest, manifestHash: string, hash: string): Promise<ReportRecord> {
    void manifest;
    void manifestHash;
    void hash;
    throw new BowerError('unknown', NOT_YET);
  }

  async putDisposition(w: FencedDrive, value: Disposition): Promise<void> {
    void w;
    void value;
    throw new BowerError('unknown', NOT_YET);
  }
}
