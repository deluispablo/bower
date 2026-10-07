/**
 * The report barrier (TL-P3-22 point 2; ARCHITECTURE invariant 6: persist the report before publishing success).
 * Stub: the behaviour comes in the next commit.
 */
import type { FencedDrive } from '../drive/fake-drive';
import type { RunReport } from '../types';
import type { LastRunFile } from '../vault/layout';
import type { RecordReads } from './records';

/** A file's checksum as stored, and the same checksum of the bytes meant to be there. */
export interface Checksum {
  stored(id: string): Promise<string>;
  of(bytes: Uint8Array): Promise<string>;
}

export interface ReportSave {
  rootId: string;
  reads: RecordReads;
  checksum: Checksum;
  batch(): Promise<FencedDrive>;
  report: RunReport | null;
  view: string;
  mayReplace(stored: string | null): Promise<boolean>;
}

export async function saveReport(save: ReportSave): Promise<string[]> {
  void save;
  return [];
}

export function lastRunText(body: LastRunFile): string {
  void body;
  return '';
}

export function sameView(a: string | null, b: string | null): boolean {
  void a;
  void b;
  return false;
}

export function olderView(stored: string | null, run: { id: string; requestedAt: number }): boolean {
  void stored;
  void run;
  return false;
}

export async function shownDone(reads: RecordReads, rootId: string, runId: string): Promise<boolean> {
  void reads;
  void rootId;
  void runId;
  return false;
}

export function fixedReport(r: RunReport): RunReport {
  return r;
}
