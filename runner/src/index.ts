/** Derived maintenance uses the manifest, its settled outcomes and the ordinary fenced effects. */
import { sha256Hex } from '../../src/data/contracts/hashes';
import { parseNote } from '../../src/data/contracts/note-format';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import type { EffectV2, Maintain, MaintenanceNote, SeenFile, VerifiedContent } from '../../src/data/contracts/run-manifest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { driveEffects, type Effects, type Settled } from '../../src/data/spine/engine';
import { refreshed, retrievalSummary } from '../../src/data/spine/report';
import { limiter, READ_AHEAD } from '../../src/data/spine/read';
import { canonical, type RunManifest } from '../../src/data/spine/records';
import { happened, reserveFor, stampOf, type Holder } from '../../src/data/spine/write-once';
import { BowerError } from '../../src/data/types';
import { RUNNER_WRITES, SYSTEM, isHidden, isRunnerFile, type RetrievalFile } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import type { RunnerDrive } from './drive';
import { leafCount, mocEdit, mocMembership, mocSnapshot, noteLinks, type Notes } from './moc';

const seen = (f: DriveFile): SeenFile => ({ fileId: f.id, name: f.name, parents: f.parents, folder: f.folder, modifiedTime: f.modifiedTime });
const file = (f: SeenFile): DriveFile => ({ id: f.fileId, name: f.name, parents: f.parents, folder: f.folder, modifiedTime: f.modifiedTime, createdTime: f.modifiedTime });
const unavailable = (): BowerError => new BowerError('unknown', 'Bower could not update its notes. It will try again.');
type RetrievalState = Omit<RetrievalFile, 'files'> & { files: Notes; listing?: DriveFile[] };

/** Q8: stable folder traversal and shortest unique suffixes, without exposing Drive ids. */
function projectIndex(files: Notes): string {
  const notes = Object.values(files).filter((f) => !isHidden(f.path));
  const links = noteLinks(files);
  const ids = new Map(Object.entries(files).map(([id, f]) => [f.path, id]));
  const members = mocMembership(files);
  const direct = new Map<string, typeof notes>();
  const children = new Map<string, Set<string>>();
  for (const note of notes) {
    const parts = note.path.split('/');
    parts.pop();
    const folder = parts.join('/');
    const members = direct.get(folder) ?? [];
    members.push(note);
    direct.set(folder, members);
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      const child = parts.slice(0, i + 1).join('/');
      const siblings = children.get(parent) ?? new Set<string>();
      siblings.add(child);
      children.set(parent, siblings);
    }
  }
  const para = ['Projects', 'Areas', 'Resources', 'Archive'];
  const chunks: string[] = [];
  const visit = (folder: string): void => {
    const heading = folder ? `${'#'.repeat(Math.min(6, folder.split('/').length + 1))} ${folder.split('/').at(-1)}\n\n` : '';
    const map = (direct.get(folder) ?? []).find((f) => f.moc && f.path.replace(/\.md$/, '').split('/').at(-1) === folder.split('/').at(-1));
    if (map) {
      const id = ids.get(map.path) ?? '';
      chunks.push(`${heading}→ [[${links.get(id)}]] (${leafCount(id, members)})\n\n`);
      return;
    }
    const rows = (direct.get(folder) ?? []).sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => `- [[${links.get(ids.get(f.path) ?? '')}]] — ${f.summary}\n`).join('');
    if (heading || rows) chunks.push(heading + rows + (rows ? '\n' : ''));
    const subfolders = [...(children.get(folder) ?? [])].sort((a, b) => {
      if (!folder) {
        const rank = (p: string): number => para.includes(p) ? para.indexOf(p) : para.length;
        const order = rank(a) - rank(b);
        if (order) return order;
      }
      return a.localeCompare(b);
    });
    for (const child of subfolders) visit(child);
  };
  visit('');
  let text = '# Index\n\n';
  for (let i = 0; i < chunks.length; i++) {
    const cut = `index cut: ${chunks.length - i} folders omitted\n`;
    if (text.length + (chunks[i]?.length ?? 0) + (i + 1 < chunks.length ? cut.length : 0) > 32000) return text + cut;
    text += chunks[i];
  }
  return text.replace(/\n+$/, '\n');
}

/** An ignored-feed cursor advance is an ordinary manifest write, never maintenance. */
async function cursorOnly(drive: RunnerDrive, manifest: RunManifest, old: DriveFile, state: RetrievalFile, cursor: string): Promise<RunManifest> {
  if (state.cursor === cursor) return manifest;
  const text = JSON.stringify({ ...state, cursor });
  const bytes = new TextEncoder().encode(await drive.readListedText(old));
  const effect: EffectV2 = { kind: 'write-runner-json', before: seen(old), path: SYSTEM.retrieval,
    beforeContent: { encoding: 'utf8', size: bytes.length, sha256: await sha256Hex(bytes), provenance: drive.provenance, observedModifiedTime: old.modifiedTime },
    text, content: { encoding: 'utf8', size: new TextEncoder().encode(text).length, sha256: await rawHash(text) } };
  const ordinal = manifest.operations.length;
  const operationId = (await canonical({ runId: manifest.runId, captureId: manifest.captureId, ordinal, effect })).hash;
  const operation = { operationId, ordinal, dependsOn: [], effect };
  if (manifest.v === 1) return { ...manifest, operations: [...manifest.operations, { ...operation, effect }] };
  return { ...manifest, operations: [...manifest.operations, operation] };
}
const rawHash = (text: string): Promise<string> => sha256Hex(new TextEncoder().encode(text));

async function readState(drive: RunnerDrive, rootId: string, old: DriveFile | undefined): Promise<RetrievalState | undefined> {
  let state: RetrievalState | undefined;
  if (old) {
    const text = await drive.readListedText(old);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      console.error(new BowerError('unknown', 'Bower could not read its saved notes and will rebuild them.', undefined, { cause: error }));
    }
    if (isRunnerFile(SYSTEM.retrieval, value) && value.folderId === rootId) {
      const stored = value as RetrievalState;
      // Older state has no ancestry. Ignore malformed optional metadata rather than changing its notes.
      const ancestry: unknown = stored.listing;
      state = { ...value };
      delete state.listing;
      if (Array.isArray(ancestry) && ancestry.every((f: unknown) =>
        typeof f === 'object' && f !== null && 'id' in f && typeof f.id === 'string'
        && 'name' in f && typeof f.name === 'string' && 'folder' in f && typeof f.folder === 'boolean'
        && 'parents' in f && Array.isArray(f.parents) && f.parents.every((p: unknown) => typeof p === 'string')
        && 'modifiedTime' in f && typeof f.modifiedTime === 'string'
        && 'createdTime' in f && typeof f.createdTime === 'string')) state.listing = ancestry as DriveFile[];
    }
  }
  return state;
}

const notesIn = (index: VaultIndex) => [...index.entries()].flatMap(([path]) => {
  const f = index.file(path);
  return f && !f.folder && path.endsWith('.md') && path.split('/')[0] !== 'Inbox' ? [{ path, file: f }] : [];
});

/** Both projections read the same versions through B1a's cache; MOC discovery keeps full ownership bytes. */
async function snapshotNotes(drive: RunnerDrive, ix: VaultIndex, state: RetrievalState | undefined, drop: (id: string) => void, prefix = false): Promise<Notes> {
  const limit = limiter(prefix ? READ_AHEAD : 1);
  const entries = await Promise.all(notesIn(ix).map(({ path, file: f }) => limit(async (): Promise<Array<readonly [string, MaintenanceNote]>> => {
    const cached = state?.files[f.id];
    let text: string | null;
    let full = !prefix || f.appProperties?.by === 'bower' || cached?.moc !== undefined;
    try {
      const discover = cached?.moc === undefined && cached?.mocChecked !== true && f.appProperties?.by === 'bower';
      text = cached?.version === f.modifiedTime && !discover ? null : full ? await drive.readListedText(f) : await drive.readPrefix(f);
      if (!full && text !== null) {
        const ownership = parseOwnership(new TextEncoder().encode(text));
        const note = ownership.status === 'invalid' ? undefined : parseNote(path, text);
        // A cut ownership frame must be validated against complete bytes, never accepted as a damaged note.
        if (ownership.status === 'invalid' || (note?.byBower && note.properties.some((p) => p.key === 'type' && p.value === 'moc'))) {
          text = await drive.readListedText(f);
          full = true;
        }
      }
    } catch (error) {
      // Drive also reports a trashed media read as not-found; other failures still stop the run.
      if (!(error instanceof BowerError) || error.code !== 'not-found') throw error;
      console.error(error);
      drop(f.id);
      return [];
    }
    let entry: MaintenanceNote = cached?.version === f.modifiedTime ? { path, version: cached.version, summary: cached.summary, coverage: cached.coverage }
      : { path, version: f.modifiedTime, summary: text === null ? '(no summary)' : retrievalSummary(path, text), coverage: { kind: 'prefix', bytes: 4096 } };
    if ((full && text !== null) || cached?.mocChecked === true) entry = { ...entry, mocChecked: true };
    // Optional metadata in an old retrieval file is never ownership authority: derive it again from its bytes.
    const moc = text === null ? typeof cached?.moc?.text === 'string' && mocSnapshot(cached.moc.text) : mocSnapshot(text);
    if (moc) entry = { ...entry, moc,
      ...(text === null && Array.isArray(cached?.members) && cached.members.every((id) => typeof id === 'string')
        ? { members: [...new Set(cached.members)] } : {}) };
    return [[f.id, entry]];
  })));
  const snapshot: Notes = Object.fromEntries(entries.flat());
  for (const [id, members] of mocMembership(snapshot)) {
    const note = snapshot[id];
    if (note) note.members = members;
  }
  return snapshot;
}

/** A cold plan receives the canonical projection in memory, without reserves or effects. */
export async function planningIndex(drive: RunnerDrive, rootId: string): Promise<string | undefined> {
  const ix = VaultIndex.build(rootId, await drive.planReads().listAll(rootId));
  // A warm run keeps B1a's two discovery reads inside maintain, where they have always lived.
  if (ix.file(SYSTEM.retrieval) && ix.file(SYSTEM.index)) return undefined;
  const state = await readState(drive, rootId, ix.file(SYSTEM.retrieval));
  return projectIndex(await snapshotNotes(drive, ix, state, (id) => ix.drop(id), true));
}

/** Freeze declared inputs and reserved ids in the existing immutable manifest. */
export async function withMaintenance(drive: RunnerDrive, manifest: RunManifest): Promise<RunManifest> {
  const rootId = manifest.scope.rootId;
  let listing = await drive.planReads().listAll(rootId);
  let ix = VaultIndex.build(rootId, listing);
  const old = ix.file(SYSTEM.retrieval);
  const state = await readState(drive, rootId, old);
  // An empty first run has neither indexed changes nor effects to settle.
  if (!state && !notesIn(ix).length && !manifest.operations.length) return manifest;
  const feed = state ? await drive.listChanges(state.cursor) : undefined;
  const cursor = feed?.newStartPageToken ?? await drive.getStartPageToken();
  if (!state) {
    // A bootstrap token must precede its snapshot, so changes racing the listing stay on the next feed.
    listing = await drive.listAll(rootId);
    ix = VaultIndex.build(rootId, listing);
  }
  // Stored parent ids retain vanished subtrees even when the planner already omitted them.
  const files = new Map([...(state?.listing ?? []), ...listing].map((f) => [f.id, f]));
  const previous = VaultIndex.build(rootId, state?.listing ?? listing);
  ix = VaultIndex.build(rootId, [...files.values()]);
  // Feed removals and missing content reads forget the same indexed file and descendants.
  const drop = (id: string): void => {
    ix.drop(id);
    for (const fileId of files.keys()) if (!ix.byId(fileId)) files.delete(fileId);
  };
  if (feed) {
    // Feed metadata supersedes the planner's listing; the read cache keys content by this version.
    for (const change of feed.changes) {
      if (change.removed || change.file?.trashed) drop(change.fileId);
      else if (change.file) {
        const listed = files.get(change.fileId);
        if (!listed || listed.modifiedTime <= change.file.modifiedTime) {
          files.set(change.fileId, change.file);
          ix.put(change.file);
          if (previous.pathOf(change.fileId) !== undefined && ix.pathOf(change.fileId) === undefined) drop(change.fileId);
        }
      }
    }
  }
  const notes = notesIn(ix);
  const pathOfChange = (change: { fileId: string; removed?: boolean; file?: DriveFile }): string | undefined => ix.pathOf(change.fileId)
    ?? previous.pathOf(change.fileId) ?? state?.files[change.fileId]?.path;
  // The existing dot-path rule judges the resolved full path, including newly discovered descendants.
  const changes = (feed?.changes ?? notes.map(({ file }) => ({ fileId: file.id, file }))).filter((c) => {
    const path = pathOfChange(c);
    return path !== undefined && !isHidden(path);
  }).map((c) => c.fileId);
  if (state && ix.file(SYSTEM.index) && !changes.length && !manifest.operations.length) {
    return old ? cursorOnly(drive, manifest, old, state, cursor) : manifest;
  }
  const snapshot = await snapshotNotes(drive, ix, state, drop, !state || !ix.file(SYSTEM.index));
  listing = [...files.values()];
  const own = ix.file(SYSTEM.dir);
  if (!own?.folder) throw unavailable();
  const paths = [SYSTEM.index, SYSTEM.retrieval] as const;
  const missing = paths.filter((path) => !ix.file(path));
  const holders: Holder[] = missing.map(() => ({}));
  await reserveFor(drive.fencedWrites(), holders);
  const targets: NonNullable<Maintain['inputs']['targets']> = [];
  for (const path of paths) {
    const before = ix.file(path);
    const text = before ? await drive.readListedText(before) : undefined;
    const bytes = text === undefined ? undefined : new TextEncoder().encode(text);
    targets.push({ path, fileId: before?.id ?? holders[missing.indexOf(path)]?.reserved ?? '', parentId: own.id,
      ...(before && bytes ? { beforeContent: { encoding: 'utf8', size: bytes.length, sha256: await sha256Hex(bytes), provenance: drive.provenance, observedModifiedTime: before.modifiedTime } } : {}) });
  }
  // MOC inputs contain the exact original bytes and every owned region; no whole-note permission is inferred.
  for (const [id, note] of Object.entries(snapshot)) {
    const before = files.get(id);
    if (!note.moc || !before || before.parents.length !== 1) continue;
    const bytes = new TextEncoder().encode(note.moc.text);
    targets.splice(targets.length - 1, 0, { path: note.path, fileId: id, parentId: before.parents[0] ?? '',
      beforeContent: { encoding: 'utf8', size: bytes.length, sha256: await sha256Hex(bytes), provenance: drive.provenance, observedModifiedTime: before.modifiedTime } });
  }
  const inputs: Maintain['inputs'] = { folderId: rootId, account: state?.account ?? rootId, cursor,
    changes: [...new Set(changes)], operationIds: manifest.operations.map((o) => o.operationId), targets,
    snapshot, listing: listing.map(seen) };
  const effect: Maintain = { kind: 'maintain', inputs };
  const ordinal = manifest.operations.length;
  const operationId = (await canonical({ runId: manifest.runId, captureId: manifest.captureId, ordinal, effect })).hash;
  return { ...manifest, v: 2, operations: [...manifest.operations, { ordinal, operationId, dependsOn: [], effect }] };
}

export function maintenanceEffects(drive: RunnerDrive): Effects {
  // The ordinary edit guard still reads live metadata; unchanged bytes share B1a's versioned read cache.
  const ordinary = driveEffects(new Proxy(drive, {
    get(target, key) {
      if (key === 'readBytes') return async (id: string) => new TextEncoder().encode(await target.readListedText(await target.get(id)));
      const value: unknown = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }));
  // The engine always calls readBack before replay; fresh reserved creates need no existence probe.
  const replaying = new Set<string>();
  return {
    async readBack(op, head) {
      if (op.effect.kind !== 'maintain') throw unavailable();
      replaying.add(op.operationId);
      const target = op.effect.inputs.targets?.find((t) => t.path === SYSTEM.retrieval);
      if (!target) throw unavailable();
      try {
        const ev = await drive.evidence(target.fileId);
        if (!ev || !happened({ stamp: stampOf(head.runId, op.operationId) }, ev.file)) return { state: 'not-landed' };
        return { state: 'landed', evidence: { file: seen(ev.file), trashed: ev.trashed,
          content: ev.content ? { encoding: 'utf8', ...ev.content, provenance: drive.provenance, observedModifiedTime: ev.file.modifiedTime } : null, provenance: drive.provenance } };
      } catch (error) {
        console.error(error);
        return { state: 'unreadable', why: 'The retrieval commit could not be read.' };
      }
    },
    async apply(op, head, w, manifest, sending) {
      if (op.effect.kind !== 'maintain') throw unavailable();
      const state = refreshed(op.effect.inputs, head.outcomes, manifest);
      const members = mocMembership(state.files);
      for (const [id, ids] of members) {
        const note = state.files[id];
        if (note) note.members = ids;
      }
      const index = projectIndex(state.files);
      let last: Settled | undefined;
      // Retrieval is the commit record: every MOC and projection must settle before it is sent.
      const targets = [...(op.effect.inputs.targets ?? [])].sort((a, b) => Number(a.path === SYSTEM.retrieval) - Number(b.path === SYSTEM.retrieval));
      for (const target of targets) {
        const frozen = op.effect.inputs.listing?.find((f) => f.fileId === target.fileId);
        const settled = state.listing?.find((f) => f.id === target.fileId);
        const before = settled ? seen(settled) : frozen;
        const owned = !(RUNNER_WRITES as readonly string[]).includes(target.path);
        const edit = owned ? mocEdit(target.fileId, state.files, members) : null;
        if (owned && !edit) continue;
        const text = owned ? edit?.text : target.path === SYSTEM.index ? index : target.path === SYSTEM.retrieval ? JSON.stringify(state) : undefined;
        if (text === undefined) throw unavailable();
        // Versions and the feed cursor belong to state, not to the derived projection's date.
        if (target.path === SYSTEM.index && before) {
          const previous = (await drive.readListedText(file(before))).replace(/^> Generated by Bower[^\n]*\n/gm, '').trim();
          const snapshot = op.effect.inputs.snapshot ?? {};
          const legacy = Object.values(snapshot).sort((a, b) => a.path.localeCompare(b.path))
            .map((f) => `- [[${f.path.split('/').at(-1)?.replace(/\.md$/, '')}]] — ${f.summary}\n`).join('').trim();
          if (previous === index.trim() || (previous === legacy && projectIndex(snapshot) === index)) continue;
        }
        const ev = before || replaying.has(op.operationId) ? await drive.evidence(target.fileId) : null;
        const content = { encoding: 'utf8' as const, size: new TextEncoder().encode(text).length, sha256: await rawHash(text) };
        const beforeText = state.files[target.fileId]?.moc?.text;
        const beforeContent: VerifiedContent | undefined = owned && before && beforeText !== undefined ? { encoding: 'utf8' as const,
          size: new TextEncoder().encode(beforeText).length, sha256: await rawHash(beforeText),
          provenance: drive.provenance, observedModifiedTime: before.modifiedTime } : target.beforeContent;
        const effect: EffectV2 = owned && before && beforeContent && edit ? { kind: 'edit-text', before,
          path: target.path, beforeContent, changes: edit.changes, beforeText, text, content }
          : before && target.beforeContent ? { kind: 'write-runner-json' as const, before, path: target.path as typeof SYSTEM.index | typeof SYSTEM.retrieval,
          beforeContent: target.beforeContent, text, content }
          : { kind: 'create-text' as const, parent: { fileId: target.parentId }, name: target.path.split('/').at(-1) ?? '', createKey: op.operationId, purpose: 'runner-json' as const, text, content };
        const sub = { ...op, effect };
        const subHead = { ...head, outcomes: head.outcomes.map((o) => o.operationId === op.operationId ? { operationId: o.operationId, state: 'possible-effect' as const, dispatchId: op.operationId, fileId: target.fileId } : o) };
        if (ev && happened({ stamp: stampOf(head.runId, op.operationId) }, ev.file)) {
          const back = await ordinary.readBack(sub, subHead, manifest);
          if (back.state !== 'landed') throw unavailable();
          last = { state: 'applied' as const, evidence: back.evidence };
          if (owned && state.files[target.fileId]) {
            state.files[target.fileId] = { ...state.files[target.fileId] as MaintenanceNote,
              version: back.evidence.file.modifiedTime, moc: mocSnapshot(text) ?? undefined };
            state.listing = state.listing?.map((f) => f.id === target.fileId ? file(back.evidence.file) : f);
          }
          continue;
        }
        await sending();
        last = await ordinary.apply(sub, subHead, w, manifest, async () => target.fileId);
        if (last.state !== 'applied') throw unavailable();
        if (owned && state.files[target.fileId]) {
          state.files[target.fileId] = { ...state.files[target.fileId] as MaintenanceNote,
            version: last.evidence.file.modifiedTime, moc: mocSnapshot(text) ?? undefined };
          const written = last.evidence.file;
          state.listing = state.listing?.map((f) => f.id === target.fileId ? file(written) : f);
        }
      }
      if (!last) throw unavailable();
      // Even a fully reconciled partial effect was already named by the opening checkpoint.
      await sending();
      return last;
    },
  };
}
