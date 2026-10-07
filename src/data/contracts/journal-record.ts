/** A line of the change journal as stored in `.bower/changes/`, and its shape check: pure, shared by every runtime. */
import type { ChangeEntry, ChangeKind } from './types';

export interface JournalExtra {
  path?: string;
  /** Where a move or rename came from. */
  from?: string;
  /** Your words: a rule, a request, an answer. */
  text?: string;
  questionId?: string;
  /** The Drive file the change is about, so the runner finds it whatever its path became. */
  fileId?: string;
  /** A rule taken out: its wording, as Rules.md has it. */
  removes?: string;
}

export type JournalRecord = ChangeEntry & JournalExtra & { v: 1; device: string };

const KINDS: readonly ChangeKind[] = ['rule', 'request', 'move', 'rename', 'create', 'trash', 'task', 'answer'];

export function isJournalRecord(v: unknown): v is JournalRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return r.v === 1 && typeof r.id === 'string' && !!r.id && typeof r.device === 'string' && !!r.device && typeof r.at === 'number' && Number.isFinite(r.at) && typeof r.what === 'string' && KINDS.includes(r.kind as ChangeKind) && ['path', 'from', 'text', 'questionId', 'fileId', 'removes'].every((key) => r[key] === undefined || typeof r[key] === 'string');
}
