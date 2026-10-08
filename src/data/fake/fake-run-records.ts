/**
 * A B run's records in the Bower folder, as contract B lays them out:
 * `.bower/runs/<runId>/manifest-<hash>.json`, `checkpoint-<revision>-<hash>.json`,
 * `report-<hash>.json`, and consumed dispositions in `.bower/piles/`. Every
 * folder is found by its real name and parents, duplicates included; a record
 * is written once, read back and compared byte for byte, and a reply lost
 * after it landed is reconciled by its exact body, never written again.
 * Also the pure parts: report grounding and effect evidence. The report, its
 * record and the consumed dispositions are shared with the runner
 * (`spine/report.ts`, `spine/records.ts`). The pure record guards live in `contracts/`.
 */
import type { DriveFile } from '../drive/drive-api';
import type { StoredEvidence } from '../drive/fake-drive';
import type { EffectEvidence } from '../contracts/run-checkpoint';
import type { Effect, OperationV2, ReportContribution, SeenFile, Target } from '../contracts/run-manifest';
import { STATE_UPDATED, savedLinkKey } from '../contracts/note-edit';
import { displayName, join, nameOf, parentOf, thingName } from '../tree';
import { PARA_ROOTS, type Question } from '../types';
import { sha256 } from '../vault/hashes';
import { SYSTEM, isRunnerFile } from '../vault/layout';
import { parseRules } from '../vault/rules-format';
import type { RunManifest } from '../spine/records';

// The record names, writing and chain reading are shared with the runner (TL-P3-21 point 2).
export { RUNS_NAME, canonical, checkpointName, dispositionName, manifestName, reportName, type RunManifest, type Where } from '../spine/records';

/** The runner files a run may make again when they are missing (TL-P2-33 §2a). */
const RUNNER_MADE: readonly string[] = [SYSTEM.requests, SYSTEM.hashes, SYSTEM.questions];
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
      // A made file, a generated note or a runner file (TL-P2-17, TL-P2-33 §2a): its create key, place, name and exact
      // bytes. The "new" mark is not evidence: it may be cleared (the note opened) between a lost reply and recovery.
      return !ev.trashed && !f.folder && f.parents.length === 1 && f.parents[0] === parentId
        && f.name === effect.name && ev.content?.size === effect.content.size && ev.content.sha256 === effect.content.sha256
        && f.appProperties?.bowerItem === effect.createKey;
  }
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
 * not a completed request, archived by all its moves; a rule line not worded
 * (taken out, or already there) counts 0, since only records that are not
 * requests or rules are counted (TL-P2-23, TL-P2-33 §3). Every captured line is
 * archived once and claimed by exactly one row. A hub note brought up to date
 * (TL-P2-20 I10): an applied `updated` row requires exactly one `edit-text`
 * with a Timeline line, names that edit's path and says what one of its lines
 * says; each edit is claimed once. A generated note (TL-P2-17) is claimed by
 * one applied row naming its resolved path and one set-aside row for what it
 * was for (see `noteRow`). A rule worded (`rulesWorded: 1`) is one captured
 * line's row: it requires the one operation that words Rules.md (its edit
 * naming that line's add, or Rules.md made at the root, whose rows number what
 * parseRules reads from it) and every archive move of the line, each depending
 * on it. A request's write may be requests.json made again in `.bower`.
 * A question the run asks (TL-P2-37 Q1 (a)) is one applied row requiring only
 * the one operation that writes questions.json (its write, or the file made
 * again in `.bower`): each question equals, field for field, an entry that
 * operation writes, is asked at the run's `requestedAt`, and is claimed once.
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
  /** The requests.json text an operation writes: its write, or the file made again in `.bower` (TL-P2-17). */
  const requestsOf = (o: OperationV2 | undefined): string | null => {
    const e = o?.effect;
    if (e?.kind === 'write-runner-json') return e.path === SYSTEM.requests ? e.text : null;
    if (e?.kind !== 'create-text' || e.purpose !== 'runner-json') return null;
    const parent = pathOf(e.parent);
    return parent !== null && join(parent, e.name) === SYSTEM.requests ? e.text : null;
  };
  const completed = new Map<string, string>();
  for (const o of manifest.operations) {
    const text = requestsOf(o);
    if (text === null) continue;
    const done = requestsDone(text);
    if (!done) return false;
    for (const [id, text] of done) completed.set(id, text);
  }
  /** Whether an operation words rules: the edit of the root Rules.md, or Rules.md made at the root (TL-P2-20). */
  const wordsRules = (o: OperationV2 | undefined): boolean => {
    const e = o?.effect;
    if (e?.kind === 'edit-text') return e.path === RULES && e.changes.some((change) => change.kind === 'rules-wording');
    return e?.kind === 'create-text' && e.purpose === 'generated' && e.name === RULES && 'fileId' in e.parent && e.parent.fileId === manifest.scope.rootId;
  };
  /** Rule rows per operation that words them. */
  const worded = new Map<string, number>();
  const claimed = new Set<string>();
  const journalRow = (c: ReportContribution): boolean => {
    const v = c.value;
    if (c.when !== 'applied' || v.filed.length || v.created.length || v.updated.length || v.setAside.length || v.questions.length) return false;
    const required = c.requires.map((id) => ops.get(id));
    const moves = required.filter((o): o is OperationV2 & { effect: MoveEffect } => !!o && isArchive(o));
    const line = moves[0] ? lineOf.get(moves[0].effect.before.fileId) : undefined;
    if (!line || claimed.has(line.recordId)) return false;
    const files = moves.map((o) => o.effect.before.fileId);
    if (files.length !== line.fileIds.length || !line.fileIds.every((id) => files.includes(id))) return false;
    const chain = new Set(moves.flatMap((o) => chainOf(o.effect.parent)));
    if (![...chain].every((id) => c.requires.includes(id))) return false;
    const writes = required.filter((o): o is OperationV2 => o?.effect.kind === 'write-runner-json' || requestsOf(o) !== null || wordsRules(o));
    const allowed = new Set([...moves, ...writes].map((o) => o.operationId));
    if (required.some((o) => !o || (!allowed.has(o.operationId) && !chain.has(o.operationId)))) return false;
    if (v.rulesWorded !== undefined) {
      // A rule worded (TL-P2-20 I10): one row per line, requiring the one operation that words it, which the
      // line's archive waits for; an edit names the line's add, a made Rules.md is counted against its text below.
      const [op, ...more] = writes;
      if (v.requests !== undefined || v.yourChanges !== undefined || v.rulesWorded !== 1 || !op || more.length || !wordsRules(op)) return false;
      if (op.effect.kind === 'edit-text' && !op.effect.changes.some((change) => change.kind === 'rules-wording' && change.add.some((a) => a.recordId === line.recordId))) return false;
      if (!moves.every((o) => o.dependsOn.includes(op.operationId))) return false;
      worded.set(op.operationId, (worded.get(op.operationId) ?? 0) + 1);
    } else if (v.requests !== undefined) {
      const [write, ...more] = writes;
      const [text, ...rest] = v.requests;
      if (v.yourChanges !== undefined || !write || more.length || text === undefined || rest.length) return false;
      const written = requestsOf(write);
      if (written === null || requestsDone(written)?.get(line.recordId) !== text) return false;
      if (!moves.every((o) => o.dependsOn.includes(write.operationId))) return false;
    } else if ((v.yourChanges !== 1 && v.yourChanges !== 0) || writes.length || completed.has(line.recordId)) return false;
    claimed.add(line.recordId);
    return true;
  };
  /** The questions.json text an operation writes: its write, or the file made again in `.bower` (TL-P2-37 Q1). */
  const questionsOf = (o: OperationV2 | undefined): string | null => {
    const e = o?.effect;
    if (e?.kind === 'write-runner-json') return e.path === SYSTEM.questions ? e.text : null;
    if (e?.kind !== 'create-text' || e.purpose !== 'runner-json') return null;
    const parent = pathOf(e.parent);
    return parent !== null && join(parent, e.name) === SYSTEM.questions ? e.text : null;
  };
  const asked = new Set<string>();
  const questionRow = (c: ReportContribution): boolean => {
    const v = c.value;
    if (c.when !== 'applied' || v.filed.length || v.created.length || v.updated.length || v.setAside.length) return false;
    if (v.requests !== undefined || v.yourChanges !== undefined || v.rulesWorded !== undefined) return false;
    const [id, ...more] = c.requires;
    const text = id === undefined || more.length ? null : questionsOf(ops.get(id));
    const written = text === null ? null : questionsWritten(text);
    if (!written) return false;
    for (const q of v.questions) {
      if (asked.has(q.id) || q.askedAt !== manifest.requestedAt || !written.some((w) => sameQuestion(w, q))) return false;
      asked.add(q.id);
    }
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
    // Its row says one of its Timeline lines, or (C05) that its Current state was brought up to date.
    const says = edit.changes.some((change) => (change.kind === 'timeline-append' && change.entries.some((entry) => entry.text === row.what))
      || (change.kind === 'state-rewrite' && row.what === STATE_UPDATED));
    if (!says) return false;
    updated.add(id);
    return true;
  };
  // Generated notes (TL-P2-17): what each is for, from the fixed plan: a filed thing's own note follows that thing's
  // move; a pile's words are written before that pile's folder goes to the Bin.
  // A saved link's note (TL-P2-20 M5, R3-6) comes before the link's move, which depends on it: it is claimed by that
  // link's filed row (`noteGrounded`), not by rows of its own.
  const linkNote = (o: OperationV2): boolean => manifest.operations.some((m) => m.effect.kind === 'move' && members.has(m.effect.before.fileId) && m.dependsOn.includes(o.operationId));
  // Rules.md made at the root is Bower's rule list, not a generated note: its rows are rule rows (TL-P2-20 R3-4).
  // A request's note (C08, TL-P2-40 (1)): the requests.json write answering it waits for it.
  const requestNote = (o: OperationV2): boolean => manifest.operations.some((w) => requestsOf(w) !== null && w.dependsOn.includes(o.operationId));
  const generatedOps = manifest.operations.filter((o): o is OperationV2 & { effect: CreateText } => o.effect.kind === 'create-text' && o.effect.purpose === 'generated' && !wordsRules(o));
  const notes = generatedOps.filter((o) => !linkNote(o) && !requestNote(o));
  const linkNotes = generatedOps.filter(linkNote);
  const requestNotes = generatedOps.filter((o) => !linkNote(o) && requestNote(o));
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
    if (requestNote(op)) return requestNoteRow(c, op, e, rest);
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
  /**
   * A saved link's filed row lists its note as made (TL-P2-40) only when the run writes it: one `created` row with
   * that note's resolved path and some wording, the note's create in the row's requires. A reused note has none.
   */
  const linkNoteMade = (c: ReportContribution, note: string | undefined): boolean => {
    const [made, ...more] = c.value.created;
    if (!made || more.length || note === undefined || made.path !== note || !made.what) return false;
    return c.requires.some((id) => {
      const o = ops.get(id);
      if (o?.effect.kind !== 'create-text' || o.effect.purpose !== 'generated' || !linkNote(o)) return false;
      const parent = pathOf(o.effect.parent);
      return parent !== null && join(parent, o.effect.name) === note;
    });
  };
  /**
   * A request's note's one row (C08): applied, one `created` row with its resolved path under a main folder (TL-P2-17),
   * requiring its create and every folder made for it; claimed once. The requests.json write after it names it as a
   * [[link]] in a done line. A note not written leaves the request for the next tidy-up, so it has no set-aside row.
   */
  function requestNoteRow(c: ReportContribution, op: OperationV2, e: CreateText, rest: string[]): boolean {
    const v = c.value;
    const parent = pathOf(e.parent);
    if (c.when !== 'applied' || parent === null || !MAIN_FOLDERS.includes(parent.split('/')[0] ?? '')) return false;
    if (v.filed.length || v.setAside.length || v.updated.length || v.questions.length || v.requests !== undefined || v.yourChanges !== undefined || v.rulesWorded !== undefined) return false;
    const [made, ...others] = v.created;
    if (!made || others.length || made.path !== join(parent, e.name) || !made.what || written.has(op.operationId)) return false;
    const chain = chainOf(e.parent);
    if (rest.length !== chain.length || !chain.every((x) => rest.includes(x))) return false;
    const named = `[[${displayName(e.name)}]]`;
    if (!manifest.operations.some((w) => w.dependsOn.includes(op.operationId) && (doneLines(requestsOf(w)) ?? []).some((line) => line.includes(named)))) return false;
    written.add(op.operationId);
    return true;
  }
  const areaMade = new Set<string>();
  const areaGrounded = (area: string, chain: string[]): boolean => {
    const id = chain.find((x) => {
      const path = pathOf({ createdBy: x });
      return path !== null && path.startsWith('Areas/') && area.startsWith(`New area ${path.split('/').at(-1) ?? ''}, for `) && area.length > `New area ${path.split('/').at(-1) ?? ''}, for `.length;
    });
    if (id === undefined || areaMade.has(id)) return false;
    areaMade.add(id);
    return true;
  };
  const filed = new Set<string>();
  const setAside = new Set<string>();
  const claimedNotes = new Set<string>();
  const alone = new Set<string>();
  /**
   * A thing already saved (TL-P4-10 addendum 2): one Bin of a captured member, with an applied row saying it is
   * already saved as the file it copies (a captured file of the folder by that name, its Bin depending on nothing;
   * or the thing this run files first, its Bin depending on that one move, under the name that move gives it) and a
   * rejected row setting it aside. Each claimed once.
   */
  const saved = new Set<string>();
  const savedRow = (c: ReportContribution): boolean => {
    const v = c.value;
    const [id, ...more] = c.requires;
    const op = id === undefined ? undefined : ops.get(id);
    if (more.length || op?.effect.kind !== 'bin') return false;
    const member = members.get(op.effect.before.fileId);
    if (!member || v.filed.length || v.created.length || v.updated.length || v.questions.length) return false;
    if (v.requests !== undefined || v.yourChanges !== undefined || v.rulesWorded !== undefined) return false;
    const fileId = member.file.fileId;
    if (c.when === 'rejected') {
      const [row, ...rest] = v.setAside;
      if (v.alreadySaved !== undefined || !row || rest.length || row.name !== member.file.name || setAside.has(fileId)) return false;
      setAside.add(fileId);
      return true;
    }
    const [row, ...rest] = v.alreadySaved ?? [];
    if (v.setAside.length || !row || rest.length || row.name !== member.file.name || saved.has(fileId)) return false;
    const [after, ...others] = op.dependsOn;
    const kept = after === undefined ? undefined : ops.get(after)?.effect;
    const copies = after === undefined
      ? manifest.capture.places.some((p) => !p.file.folder && p.file.name === row.as && !members.has(p.file.fileId))
      : !others.length && kept?.kind === 'move' && members.has(kept.before.fileId) && kept.name === row.as;
    if (!copies) return false;
    saved.add(fileId);
    return true;
  };
  const binsMember = (c: ReportContribution): boolean => c.requires.some((id) => {
    const o = ops.get(id);
    return o?.effect.kind === 'bin' && members.has(o.effect.before.fileId);
  });
  for (const c of manifest.reportPlan) {
    const v = c.value;
    if (v.alreadySaved !== undefined || binsMember(c)) {
      if (!savedRow(c)) return false;
      continue;
    }
    if (v.questions.length) {
      if (!questionRow(c)) return false;
      continue;
    }
    if (v.requests !== undefined || v.yourChanges !== undefined || v.rulesWorded !== undefined) {
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
    if (v.updated.length || v.questions.length || v.rulesWorded !== undefined) return false;
    const moves = c.requires.flatMap((id) => {
      const op = ops.get(id);
      return op?.effect.kind === 'move' && members.has(op.effect.before.fileId) ? [{ ...op, effect: op.effect }] : [];
    });
    const [moveOp, ...more] = moves;
    const move = moveOp?.effect;
    if (!moveOp || !move || more.length) return false;
    const member = members.get(move.before.fileId);
    if (!member) return false;
    // Only a saved link's filed row may list a note as made: the one it wrote, below.
    if (v.created.length && (c.when !== 'applied' || !v.filed.length)) return false;
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
      if (!onItsOwn(manifest, moveOp, row.why)) return false;
      alone.add(member.file.fileId);
      continue;
    }
    const [row, ...rest] = v.filed;
    if (v.setAside.length || !row || rest.length) return false;
    if (row.name !== member.file.name || row.to !== pathOf(move.parent) || filed.has(member.file.fileId)) return false;
    if (!chainOf(move.parent).every((id) => c.requires.includes(id))) return false;
    if (row.note !== undefined && !noteGrounded(manifest, c, moveOp, row.note, claimedNotes)) return false;
    // A new Area's reason (TL-P4-07 addendum 3): says "New area <name>, for <responsibility>" for a folder under Areas this
    // run makes on the way to the move's place, once per folder.
    if (row.area !== undefined && !areaGrounded(row.area, chainOf(move.parent))) return false;
    if (v.created.length && !linkNoteMade(c, row.note)) return false;
    filed.add(member.file.fileId);
  }
  // Every captured line's every file is moved once, into the archive, and the line is claimed by one row.
  for (const id of lineOf.keys()) {
    const touching = manifest.operations.filter((o) => 'before' in o.effect && o.effect.before.fileId === id);
    if (touching.length !== 1 || !touching[0] || !isArchive(touching[0])) return false;
  }
  // A runner file is made again only at its own path under `.bower/` (TL-P2-33 §2a).
  for (const o of manifest.operations) {
    if (o.effect.kind !== 'create-text' || o.effect.purpose !== 'runner-json') continue;
    const parent = pathOf(o.effect.parent);
    if (parent !== SYSTEM.dir || !RUNNER_MADE.includes(join(parent, o.effect.name))) return false;
    // A list of questions made again holds questions (TL-P2-37 Q1 (a)).
    if (join(parent, o.effect.name) === SYSTEM.questions && !questionsWritten(o.effect.text)) return false;
  }
  // A made Rules.md is counted as what parseRules reads from it (R3-4).
  for (const o of manifest.operations) {
    if (o.effect.kind === 'create-text' && wordsRules(o) && (worded.get(o.operationId) ?? 0) !== parseRules(o.effect.text).length) return false;
  }
  return [...members.keys()].every((id) => (filed.has(id) || saved.has(id)) && setAside.has(id))
    && manifest.capture.journal.every((j) => claimed.has(j.recordId))
    && notes.every((o) => written.has(o.operationId) && unwritten.has(o.operationId))
    && requestNotes.every((o) => written.has(o.operationId))
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
    // A generated note's place (TL-P2-17): under a main folder only, never Inbox, `.bower/` or the root.
    if (!MAIN_FOLDERS.includes(placePath(manifest, move.parent)?.split('/')[0] ?? '')) return false;
  } else {
    // A note already there backs no line and no create: the move depends on neither.
    if (moveOp.dependsOn.some((id) => ['edit-text', 'create-text'].includes(ops.get(id)?.effect.kind ?? ''))) return false;
    const place = manifest.capture.places.find((p) => p.path === note);
    if (!place || place.file.folder || !note.endsWith('.md') || parentOf(note) !== placePath(manifest, move.parent)) return false;
    if (!MAIN_FOLDERS.includes(note.split('/')[0] ?? '') || !note.includes('/')) return false;
    if (manifest.capture.members.some((m) => m.file.fileId === place.file.fileId)) return false;
  }
  claimed.add(note);
  return true;
}

/**
 * A merge that fell back to ordinary filing (TL-P2-35): its move depends on no Timeline line (no merge was planned),
 * a captured answer's archive waits on that move (the answer it settles), and the row says, word for word, that it
 * could not be added to a captured note no operation touches (but for clearing its "new" mark in place), by that
 * note's shown name.
 */
function onItsOwn(manifest: RunManifest, moveOp: OperationV2, why: string): boolean {
  const ops = new Map(manifest.operations.map((o) => [o.operationId, o]));
  if (moveOp.dependsOn.some((id) => ops.get(id)?.effect.kind === 'edit-text')) return false;
  const settles = manifest.capture.journal.some((j) => manifest.operations.some((o) => o.effect.kind === 'move'
    && j.fileIds.includes(o.effect.before.fileId) && o.dependsOn.includes(moveOp.operationId)));
  if (!settles) return false;
  // Clearing last run's "new" mark in place (same parent and name, only that mark) leaves the note as it is.
  const markOnly = (o: OperationV2): boolean => o.effect.kind === 'move' && 'fileId' in o.effect.parent && o.effect.parent.fileId === o.effect.before.parents[0]
    && o.effect.name === o.effect.before.name && Object.keys(o.effect.properties).length === 1 && Object.hasOwn(o.effect.properties, 'bowerNew');
  const touched = new Set(manifest.operations.flatMap((o) => ('before' in o.effect && !markOnly(o) ? [o.effect.before.fileId] : [])));
  return manifest.capture.places.some((p) => !p.file.folder && p.path.endsWith('.md') && !touched.has(p.file.fileId)
    && why === `Bower couldn't add it to ${displayName(nameOf(p.path))}, so it was filed on its own.`);
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

/** The done lines a requests.json text holds; null when there is none or it is not a valid requests file. */
function doneLines(text: string | null): string[] | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    console.error(e);
    return null;
  }
  return isRunnerFile(SYSTEM.requests, value) ? value.done.flatMap((r) => (r.done === undefined ? [] : [r.done])) : null;
}

/** The questions a questions.json text holds; null when it is not a valid questions file. */
function questionsWritten(text: string): Question[] | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    console.error(e);
    return null;
  }
  return isRunnerFile(SYSTEM.questions, value) ? value.questions : null;
}

/** The same question, field for field (contract B: a row equals the entry written). */
function sameQuestion(a: Question, b: Question): boolean {
  return a.id === b.id && a.text === b.text && a.yes === b.yes && a.no === b.no && a.about === b.about && a.askedAt === b.askedAt;
}

// The report, its record and the consumed dispositions are shared with the runner (TL-P3-22).
export { RunRecords } from '../spine/records';
export { MOVED_AWAY, NOT_FILED, SOURCE_NOT_AS_SEEN, dispositionsFor, filingMove, materialize } from '../spine/report';
