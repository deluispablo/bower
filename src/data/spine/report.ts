/**
 * What a run's report says, and where each admitted item ends (TL-P3-22 point 2), shared by the fake run service
 * and the runner (TL-P3-21 point 2: extracted, not ported). Pure: the report from the fixed plan and the resolved
 * outcomes, the consumed pile dispositions (guard 13), and one disposition for every item the Worker admitted:
 * filed, set aside (it stays in the inbox, untouched) or waiting (it changed since admission, so the run did not
 * take it).
 */
import type { Disposition } from '../contracts/pile-disposition';
import type { EffectEvidence, Outcome, ReportRecord } from '../contracts/run-checkpoint';
import type { OperationV2 } from '../contracts/run-manifest';
import type { RunReport } from '../types';
import type { AdmissionManifest } from './admission';
import type { RunManifest } from './records';

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
  // No other change is said by leaving the count out (TL-P2-23): a claimed line may count 0.
  if (report.yourChanges === 0) delete report.yourChanges;
  return { v: 1, kind: 'run-report', scope: { rootId: manifest.scope.rootId }, runId: manifest.runId, captureId: manifest.captureId, manifestHash, report };
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


/** Where an admitted item ends: exactly one of these. A journal line (one of your changes) has no pile. */
export type ItemDisposition = { fileId: string; pileId: string | null; disposition: 'filed' | 'set-aside' | 'waiting' };

/**
 * One disposition for every item in the admitted manifest, none left out and none twice. An item the run did not
 * capture changed since admission and waits for the next run (`takeAdmitted` leaves its whole pile out). A captured
 * thing is filed when its filing move was applied, and set aside otherwise: it stays in the inbox, untouched. What
 * else is in a captured pile (its pile note) goes with its pile: filed when every thing in it was filed. A journal
 * line the run read is filed when its archive move was applied, and set aside (left in `.bower/changes`) otherwise;
 * one it did not read waits.
 */
export function itemDispositions(admission: AdmissionManifest, manifest: RunManifest, outcomes: readonly Outcome[]): ItemDisposition[] {
  const applied = new Set(outcomes.filter((o) => o.state === 'applied').map((o) => o.operationId));
  const filed = new Set(manifest.operations.flatMap((o) => (o.effect.kind === 'move' && filingMove(manifest, o) && applied.has(o.operationId) ? [o.effect.before.fileId] : [])));
  const members = new Map(manifest.capture.members.map((m) => [m.file.fileId, m.pileId]));
  const captured = new Set(manifest.capture.piles.map((p) => p.pileId));
  const whole = (pileId: string): boolean => {
    const things = manifest.capture.members.filter((m) => m.pileId === pileId);
    return things.length > 0 && things.every((m) => filed.has(m.file.fileId));
  };
  const out: ItemDisposition[] = [];
  const done = new Set<string>();
  for (const pile of admission.piles) {
    for (const item of pile.items) {
      if (done.has(item.fileId)) continue;
      done.add(item.fileId);
      const disposition: ItemDisposition['disposition'] = members.has(item.fileId)
        ? (filed.has(item.fileId) ? 'filed' : 'set-aside')
        : captured.has(pile.pileId) ? (whole(pile.pileId) ? 'filed' : 'set-aside') : 'waiting';
      out.push({ fileId: item.fileId, pileId: pile.pileId, disposition });
    }
  }
  const read = new Set(manifest.capture.journal.flatMap((j) => j.fileIds));
  const archived = new Set(manifest.operations.flatMap((o) => (o.effect.kind === 'move' && applied.has(o.operationId) ? [o.effect.before.fileId] : [])));
  for (const line of admission.journal) {
    if (done.has(line.fileId)) continue;
    done.add(line.fileId);
    const disposition: ItemDisposition['disposition'] = read.has(line.fileId) ? (archived.has(line.fileId) ? 'filed' : 'set-aside') : 'waiting';
    out.push({ fileId: line.fileId, pileId: null, disposition });
  }
  return out;
}
