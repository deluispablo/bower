/**
 * What a run's report says, and where each admitted item ends (TL-P3-22 point 2), shared by the fake run service
 * and the runner (TL-P3-21 point 2: extracted, not ported). Pure: the report from the fixed plan and the resolved
 * outcomes, the consumed pile dispositions (guard 13), and one disposition for every item the Worker admitted:
 * filed, set aside (it stays in the inbox, untouched) or waiting (it changed since admission, so the run did not
 * take it).
 */
import type { Disposition } from '../contracts/pile-disposition';
import type { EffectEvidence, Outcome, ReportRecord } from '../contracts/run-checkpoint';
import type { OperationV2, Maintain } from '../contracts/run-manifest';
import type { RunReport } from '../types';
import { KEEP_REFUSED, mocEdit, mocMembership, mocSnapshot, type Notes } from '../contracts/note-edit';
import { parseNote } from '../contracts/note-format';
import { parseOwnership } from '../contracts/ownership-format';
import { VaultIndex } from '../vault/vault-index';
import { isHidden, type RetrievalFile } from '../vault/layout';
import type { DriveFile } from '../drive/drive-api';
import type { SeenFile } from '../contracts/run-manifest';
import { stateNotWritten } from '../contracts/questions';
import { displayName, nameOf } from '../tree';
import { savedWordsPile } from './duplicates';
import type { AdmissionManifest } from './admission';
import type { RunManifest } from './records';

/** Why a captured thing whose move was rejected stays (TL-P2-34): the precondition found it moved, renamed or removed. */
export const MOVED_AWAY = 'It was moved, renamed or removed before Bower could file it.';
/** Why it stays for any other rejection, a failed dependency included: a sentence that promises nothing. */
export const NOT_FILED = "It couldn't be filed this time.";
/**
 * A thing possibly changed (its answer lost, or named as possibly sent by an attempt that stopped), then emptied from
 * the Bin before Bower read it back: Drive keeps nothing to tell landed from never sent (TL-P4-14 addendum 7).
 */
export const UNCONFIRMED_GONE = "Bower couldn't confirm this; the file is gone.";
/**
 * A thing possibly moved (its answer lost), then changed by another writer, the app's Bin or restore or another run,
 * before Bower read it back: its stamp is that writer's, so nothing tells whether Bower's change landed.
 */
export const UNCONFIRMED_CHANGED = "Bower couldn't confirm this; it was changed while Bower was filing it.";
const UNCONFIRMED = [UNCONFIRMED_GONE, UNCONFIRMED_CHANGED];
/** The failure a move's own precondition gives when its source is not as captured; the service is its only author. */
export const SOURCE_NOT_AS_SEEN = 'It was moved, renamed or removed before Bower could get to it.';

/** The other note of two kept as one (C05): a note captured as a place, which the plan bins, never a pile's thing. */
export function keptOther(op: OperationV2 | undefined, manifest: RunManifest): boolean {
  const e = op?.effect;
  return e?.kind === 'bin' && !e.before.folder && !manifest.capture.members.some((m) => m.file.fileId === e.before.fileId) && manifest.capture.places.some((p) => p.file.fileId === e.before.fileId);
}

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
    // Maintain rows are selected only from the settled shared author result below.
    if (ops.get(c.requires[0] ?? '')?.effect.kind !== 'maintain') report.updated.push(...c.value.updated);
    if (c.value.leftAsWritten?.length) report.leftAsWritten = [...new Map([...(report.leftAsWritten ?? []), ...c.value.leftAsWritten]
      .map((r) => [JSON.stringify([r.fileId, r.why]), r])).values()];
    // A set-aside row is its contribution's one move's (`grounded`): by op id, never by the name a row carries (two
    // things may share one) nor by position.
    const own = c.when === 'rejected' && c.requires.length === 1 ? byId.get(c.requires[0] ?? '') : undefined;
    // A keep's other note that stayed says what its Bin's refusal found (P4-19b): moved, binned by the person, or changed.
    const kept = own?.state === 'rejected' && keptOther(ops.get(own.operationId), manifest) && KEEP_REFUSED.includes(own.failure.message) ? own.failure.message : null;
    if (kept !== null) report.setAside.push(...c.value.setAside.map((row) => ({ ...row, why: kept })));
    else if (own?.state !== 'rejected' || ops.get(own.operationId)?.effect.kind !== 'move') report.setAside.push(...c.value.setAside);
    else {
      const moved = own.failure.code === 'conflict' && own.failure.message === SOURCE_NOT_AS_SEEN;
      const why = own.failure.code === 'unknown' ? own.failure.message : null;
      // A thing Bower couldn't confirm is on its own line, never counted as set aside (TL-P4-14 addendum 8).
      for (const row of c.value.setAside) {
        if (why && UNCONFIRMED.includes(why)) report.unconfirmed = [...(report.unconfirmed ?? []), { ...row, why }];
        else report.setAside.push({ ...row, why: moved ? MOVED_AWAY : NOT_FILED });
      }
    }
    report.questions.push(...c.value.questions);
    if (c.value.requests) report.requests = [...(report.requests ?? []), ...c.value.requests];
    if (c.value.yourChanges !== undefined) report.yourChanges = (report.yourChanges ?? 0) + c.value.yourChanges;
    if (c.value.rulesWorded !== undefined) report.rulesWorded = (report.rulesWorded ?? 0) + c.value.rulesWorded;
    if (c.value.alreadySaved?.length) report.alreadySaved = [...(report.alreadySaved ?? []), ...c.value.alreadySaved];
    // A granted write refused while the run worked says why by its refusal; a clash asks again and says nothing here.
    const refusal = own?.state === 'rejected' && ops.get(own.operationId)?.effect.kind === 'edit-text' ? own.failure : null;
    const answered = refusal === null ? c.value.answered ?? [] : refusal.code === 'conflict' ? []
      : (c.value.answered ?? []).map((row) => ({ ...row, why: stateNotWritten(row.note === undefined ? null : displayName(nameOf(row.note)), refusal.code === 'auth' || refusal.code === 'not-found') }));
    if (answered.length) report.answered = [...(report.answered ?? []), ...answered];
  }
  for (const op of manifest.operations) {
    if (op.effect.kind !== 'maintain') continue;
    const outcome = byId.get(op.operationId);
    if (outcome?.state !== 'applied' && outcome?.state !== 'rejected') return null;
    if (outcome.state !== 'applied') continue;
    // Every input operation must settle before deriving the exact same write set as maintenance.
    if (op.effect.inputs.operationIds.some((id) => state.get(id) !== 'applied' && state.get(id) !== 'rejected')) return null;
    const snapshot = refreshed(op.effect.inputs, outcomes, manifest);
    const members = mocMembership(snapshot.files);
    for (const target of op.effect.inputs.targets ?? []) {
      const note = snapshot.files[target.fileId];
      if (!note?.moc || !mocEdit(target.fileId, snapshot.files, members)) continue;
      if (!report.updated.some((row) => row.op === op.operationId && row.path === target.path)) {
        report.updated.push({ path: target.path, what: 'Updated map.', op: op.operationId });
      }
    }
  }
  // No other change is said by leaving the count out (TL-P2-23): a claimed line may count 0.
  if (report.yourChanges === 0) delete report.yourChanges;
  // A full run that captured nothing (every pile it was admitted to take was held when it read them, TL-P3-25):
  // its report says nothing was ready yet, rather than that everything has its place.
  if (manifest.runScope === 'all' && !manifest.capture.piles.length && !manifest.capture.journal.length) report.nothingReady = true;
  return { v: 1, kind: 'run-report', scope: { rootId: manifest.scope.rootId }, runId: manifest.runId, captureId: manifest.captureId, manifestHash, report };
}

/**
 * The notes a run's rows name, once each, in report order (P4-45 m4): a note with N new Timeline lines has N rows
 * and is one note. The one count of distinct paths, for Home, Replay, the run links and the corpus scorer.
 */
export function distinctPaths(rows: readonly { path: string }[]): string[] {
  return [...new Set(rows.flatMap((r) => (r.path ? [r.path] : [])))];
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


/** The Bin of a thing already saved (TL-P4-10 addendum 2): a captured member binned, rather than moved. */
export function savedBin(manifest: RunManifest, op: OperationV2): boolean {
  const e = op.effect;
  return e.kind === 'bin' && manifest.capture.members.some((m) => m.file.fileId === e.before.fileId);
}

/** Where an admitted item ends: exactly one of these. A journal line (one of your changes) has no pile. */
export type ItemDisposition = { fileId: string; pileId: string | null; disposition: 'filed' | 'set-aside' | 'waiting' };

/**
 * One disposition for every item in the admitted manifest, none left out and none twice. An item the run did not
 * capture changed since admission and waits for the next run (`takeAdmitted` leaves its whole pile out). A captured
 * thing is filed when its filing move (or, already saved, its Bin) was applied, and set aside otherwise: it stays in the inbox, untouched. What
 * else is in a captured pile (its pile note) goes with its pile: filed when every thing in it was filed and the note
 * written from its words (a pile of words only) was made, so a pile written into a new note is filed as its report
 * says. What a captured pile leaves out of its capture (a thing asked about, and the pile note kept beside it, TL-P4-08
 * addendum 4) stays where it is and waits. A journal line the run read is filed when its archive move was applied, and set aside (left in
 * `.bower/changes`) otherwise; one it did not read waits.
 */
export function itemDispositions(admission: AdmissionManifest, manifest: RunManifest, outcomes: readonly Outcome[]): ItemDisposition[] {
  const applied = new Set(outcomes.filter((o) => o.state === 'applied').map((o) => o.operationId));
  const members = new Map(manifest.capture.members.map((m) => [m.file.fileId, m.pileId]));
  // Filed: moved to its place, or (a thing already saved) gone to the Bin, so it left the inbox too.
  const filed = new Set(manifest.operations.flatMap((o) => (applied.has(o.operationId) && (filingMove(manifest, o) || savedBin(manifest, o)) && 'before' in o.effect ? [o.effect.before.fileId] : [])));
  const captured = new Map(manifest.capture.piles.map((p) => [p.pileId, new Set(p.childFileIds)]));
  const whole = (pileId: string): boolean => {
    const things = manifest.capture.members.filter((m) => m.pileId === pileId);
    const notes = wordsNotes(manifest, pileId);
    // A pile of words already saved (`duplicates.ts`) is filed once its Bin is done, as a copy is.
    if (!things.length && !notes.length) return manifest.operations.some((o) => applied.has(o.operationId) && savedWordsPile(manifest, o) === pileId);
    return things.every((m) => filed.has(m.file.fileId)) && notes.every((id) => applied.has(id));
  };
  const out: ItemDisposition[] = [];
  const done = new Set<string>();
  for (const pile of admission.piles) {
    for (const item of pile.items) {
      if (done.has(item.fileId)) continue;
      done.add(item.fileId);
      const disposition: ItemDisposition['disposition'] = members.has(item.fileId)
        ? (filed.has(item.fileId) ? 'filed' : 'set-aside')
        : captured.get(pile.pileId)?.has(item.fileId) ? (whole(pile.pileId) ? 'filed' : 'set-aside') : 'waiting';
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

/**
 * The notes a pile's words are written into (a pile of words only): the made notes, or the notes whose Timeline lines
 * carry its news (c3-pair-ask), its folder or its pile note go to the Bin after. None for a pile of things.
 */
function wordsNotes(manifest: RunManifest, pileId: string): string[] {
  const pile = manifest.capture.piles.find((p) => p.pileId === pileId);
  if (!pile) return [];
  const binned = new Set([pile.anchor?.fileId, pile.context.kind === 'text' ? pile.context.file.fileId : undefined].filter((id): id is string => id !== undefined));
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const notes = manifest.operations.flatMap((o) => (o.effect.kind === 'bin' && binned.has(o.effect.before.fileId) ? o.dependsOn : []));
  return [...new Set(notes)].filter((id) => ops.get(id)?.effect.kind === 'create-text' || ops.get(id)?.effect.kind === 'edit-text');
}

/**
 * Where the report and the dispositions disagree (TL-P3-24 point 1); empty when they agree. Each filed and set-aside
 * row is traced, through the plan step that gave it, to the admitted items it is about: a filed thing's move, the
 * pile whose words a made note holds, the thing a note of its own follows. Every row must name at least one item.
 * Every item a filed row names is filed; every item a set-aside row names is filed (filed on its own, or its note
 * not written) or set aside, never waiting. And the other way: a set-aside item is one a set-aside row names, or in
 * a pile such a row names; a filed thing is one a filed row names (a pile note, its pile); a waiting item is named
 * by no row. Journal lines have no rows: the report only counts them.
 */
export function reportContradictions(admission: AdmissionManifest, manifest: RunManifest, outcomes: readonly Outcome[], items: readonly ItemDisposition[]): string[] {
  const state = new Map(outcomes.map((o) => [o.operationId, o.state]));
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const members = new Set(manifest.capture.members.map((m) => m.file.fileId));
  const pileItems = new Map(admission.piles.map((p) => [p.pileId, p.items.map((i) => i.fileId)]));
  const notesOf = new Map(manifest.capture.piles.map((p) => [p.pileId, wordsNotes(manifest, p.pileId)]));
  const by = new Map(items.map((i) => [i.fileId, i]));
  const thingOf = (id: string): string[] => {
    const op = ops.get(id);
    return (op?.effect.kind === 'move' || op?.effect.kind === 'bin') && (filingMove(manifest, op) || savedBin(manifest, op)) ? [op.effect.before.fileId] : [];
  };
  const subjects = (c: RunManifest['reportPlan'][number]): Set<string> => new Set(c.requires.flatMap((id) => {
    const op = ops.get(id);
    const saved = op ? savedWordsPile(manifest, op) : null;
    if (saved !== null) return (pileItems.get(saved) ?? []).filter((f) => !members.has(f));
    if (op?.effect.kind !== 'create-text' && op?.effect.kind !== 'edit-text') return thingOf(id);
    const piles = [...notesOf].filter(([, notes]) => notes.includes(id)).map(([pileId]) => pileId);
    return [...piles.flatMap((p) => (pileItems.get(p) ?? []).filter((f) => !members.has(f))), ...op.dependsOn.flatMap(thingOf)];
  }));
  const given = manifest.reportPlan.filter((c) => {
    const states = c.requires.map((id) => state.get(id));
    return states.every((s) => s === c.when);
  });
  const wrong: string[] = [];
  const named = { filed: new Set<string>(), setAside: new Set<string>() };
  const trace = (row: string, from: RunManifest['reportPlan'], allowed: ReadonlyArray<ItemDisposition['disposition']>, into: Set<string>): void => {
    const about = new Set(from.flatMap((c) => [...subjects(c)]));
    if (!about.size) wrong.push(`The report row ${row} names no item the run took`);
    for (const fileId of about) {
      into.add(fileId);
      const d = by.get(fileId)?.disposition;
      if (!d || !allowed.includes(d)) wrong.push(`The report row ${row} names ${fileId}, whose disposition is ${d ?? 'missing'}`);
    }
  };
  // A keep's other note that stayed (C05) is a note of the folder, not an item the run took: its row names no item.
  const keptBin = (id: string): boolean => keptOther(ops.get(id), manifest);
  // Each row through the contribution that gave it, by its operations: never by the name or fields it carries.
  for (const c of given) {
    for (const row of c.value.filed) trace(`filed ${row.name}`, [c], ['filed'], named.filed);
    for (const row of c.value.alreadySaved ?? []) trace(`already saved ${row.name}`, [c], ['filed'], named.filed);
    if (c.requires.every(keptBin)) continue;
    for (const row of c.value.setAside) trace(`set aside ${row.name}`, [c], ['filed', 'set-aside'], named.setAside);
  }
  const pileNamed = (set: ReadonlySet<string>, pileId: string | null): boolean => pileId !== null && (pileItems.get(pileId) ?? []).some((f) => set.has(f));
  for (const item of items) {
    if (item.pileId === null) continue;
    const ok = item.disposition === 'waiting'
      ? !named.filed.has(item.fileId) && !named.setAside.has(item.fileId)
      : item.disposition === 'set-aside'
        ? named.setAside.has(item.fileId) || pileNamed(named.setAside, item.pileId)
        : members.has(item.fileId) ? named.filed.has(item.fileId) : pileNamed(named.filed, item.pileId);
    if (!ok) wrong.push(`${item.fileId} is ${item.disposition}, which the report does not say`);
  }
  return wrong;
}

export type MaintenanceState = Omit<RetrievalFile, 'files'> & { files: Notes; listing?: DriveFile[] };
const file = (f: SeenFile): DriveFile => ({ id: f.fileId, name: f.name, parents: f.parents, folder: f.folder, modifiedTime: f.modifiedTime, createdTime: f.modifiedTime });

export function retrievalSummary(path: string, text: string): string {
  // Validate full ownership framing, while only indexing front matter covered by Q3's prefix.
  const note = parseNote(path, text);
  const ownership = parseOwnership(new TextEncoder().encode(text));
  return ownership.status !== 'invalid' && ownership.layout.frontEnd <= 4096 ? note.summary || '(no summary)' : '(no summary)';
}

/** Whole projections from frozen input versions plus successful settled effects; refused effects add nothing. */
export function refreshed(inputs: Maintain['inputs'], outcomes: readonly Outcome[], manifest: RunManifest): MaintenanceState {
  let files: Notes = structuredClone(inputs.snapshot ?? {});
  const listing = (inputs.listing ?? []).map(file);
  const ix = VaultIndex.build(inputs.folderId, listing);
  for (const outcome of outcomes) {
    if (outcome.state !== 'applied' || !inputs.operationIds.includes(outcome.operationId)) continue;
    const effect = manifest.operations.find((o) => o.operationId === outcome.operationId)?.effect;
    if (!effect) continue;
    if (effect.kind === 'bin') ix.drop(effect.before.fileId);
    else ix.put({ ...file(outcome.evidence.file), ...(effect.kind === 'create-text' ? { mimeType: 'text/markdown' } : {}) });
    const f = outcome.evidence.file;
    if (effect.kind === 'create-text' || effect.kind === 'edit-text') {
      const path = ix.pathOf(f.fileId);
      if (path && !isHidden(path) && path.endsWith('.md') && path.split('/')[0] !== 'Inbox') files[f.fileId] = {
        path, version: f.modifiedTime, summary: retrievalSummary(path, effect.text), coverage: { kind: 'prefix', bytes: 4096 },
        ...(mocSnapshot(effect.text) ? { moc: mocSnapshot(effect.text) ?? undefined } : {}),
      };
    }
  }
  files = Object.fromEntries(Object.entries(files).flatMap(([id, note]) => {
    const path = ix.pathOf(id);
    return !path || isHidden(path) || path.split('/')[0] === 'Inbox' ? []
      : [[id, { ...note, path, version: ix.byId(id)?.modifiedTime ?? note.version }]];
  }));
  const ancestry = [...ix.entries()].flatMap(([path]) => {
    const f = ix.file(path);
    return f && (f.folder || files[f.id]) && path.split('/')[0] !== 'Inbox' ? [f] : [];
  });
  return { v: 1, folderId: inputs.folderId, account: inputs.account, cursor: inputs.cursor, files, listing: ancestry };
}
