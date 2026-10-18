import { isQuestionAnswer, type QuestionAnswer } from './questions';
/** A line of the change journal as stored in `.bower/changes/`, and its shape check: pure, shared by every runtime. */
import type { ChangeEntry, ChangeKind } from './types';

export interface JournalExtra {
  path?: string;
  /** Where a move or rename came from. */
  from?: string;
  /** Your words: a rule, a request, an answer. */
  text?: string;
  questionId?: string;
  askedAt?: number;
  answer?: QuestionAnswer;
  /** The Drive file the change is about, so the runner finds it whatever its path became. */
  fileId?: string;
  /** A rule taken out: its wording, as Rules.md has it. */
  removes?: string;
  /**
   * An inverse line (an Undo, TL-P4-27 addenda 2 and 3): the id of the line it takes back. Additive: a reader that checks
   * only the keys it lists reads it, and a line without it is an ordinary change.
   */
  undoes?: string;
}

export type JournalRecord = ChangeEntry & JournalExtra & { v: 1; device: string };

const KINDS: readonly ChangeKind[] = ['rule', 'request', 'move', 'rename', 'create', 'trash', 'task', 'answer'];

export function isJournalRecord(v: unknown): v is JournalRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (r.answer === undefined || isQuestionAnswer(r.answer)) && (r.askedAt === undefined || (typeof r.askedAt === 'number' && Number.isFinite(r.askedAt))) && r.v === 1 && typeof r.id === 'string' && !!r.id && typeof r.device === 'string' && !!r.device && typeof r.at === 'number' && Number.isFinite(r.at) && typeof r.what === 'string' && KINDS.includes(r.kind as ChangeKind) && ['path', 'from', 'text', 'questionId', 'fileId', 'removes', 'undoes'].every((key) => r[key] === undefined || typeof r[key] === 'string');
}

/**
 * The ids of the lines that fold as pairs among `lines` (TL-P4-27 addenda 3 and 4 (2)): every line whose `undoes` names a
 * line in the set, and that line, while the inverse stands: an inverse undone in turn pairs nothing, so its original
 * stands (qa4-undo-remove-rule R3, R10). Two inverses of one original fold with it as one pair. The one home for
 * pairing, used by "Since the last tidy-up" and by the run report. For moves and Bin restores it is presentation and
 * counting only: a run still applies both lines in order. Rule lines that pair cancel (R2): the rule list and the run's
 * rules wording leave them out, since a removal and its re-add are not the identity on Rules.md. An inverse whose
 * original is not among `lines` (taken by an earlier run) is ordinary.
 */
export function pairsOf(lines: readonly JournalRecord[]): Set<string> {
  const ids = new Set(lines.map((l) => l.id));
  const undone = new Set(lines.flatMap((l) => (l.undoes === undefined ? [] : [l.undoes])));
  const out = new Set<string>();
  for (const l of lines) {
    if (l.undoes === undefined || !ids.has(l.undoes) || undone.has(l.id)) continue;
    out.add(l.id).add(l.undoes);
  }
  return out;
}
