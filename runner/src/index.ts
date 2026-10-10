/** Derived maintenance uses the manifest, its settled outcomes and the ordinary fenced effects. */
import { sha256Hex } from '../../src/data/contracts/hashes';
import type { Checkpoint } from '../../src/data/contracts/run-checkpoint';
import { parseNote } from '../../src/data/contracts/note-format';
import type { EffectV2, Maintain, OperationV2, RunnerWrite, SeenFile } from '../../src/data/contracts/run-manifest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { driveEffects, type Effects } from '../../src/data/spine/engine';
import { canonical, type RunManifest } from '../../src/data/spine/records';
import { happened, reserveFor, stampOf, type Holder } from '../../src/data/spine/write-once';
import { BowerError } from '../../src/data/types';
import { RUNNER_WRITES, SYSTEM, isHidden, isRunnerFile, type RetrievalFile } from '../../src/data/vault/layout';
import { VaultIndex } from '../../src/data/vault/vault-index';
import type { RunnerDrive } from './drive';

const seen = (f: DriveFile): SeenFile => ({ fileId: f.id, name: f.name, parents: f.parents, folder: f.folder, modifiedTime: f.modifiedTime });
const file = (f: SeenFile): DriveFile => ({ id: f.fileId, name: f.name, parents: f.parents, folder: f.folder, modifiedTime: f.modifiedTime, createdTime: f.modifiedTime });
const unavailable = (): BowerError => new BowerError('unknown', 'Bower could not update its notes. It will try again.');

/** A hidden-only cursor advance is an ordinary manifest write, never maintenance. */
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

/** Freeze declared inputs and reserved ids in the existing immutable manifest. */
export async function withMaintenance(drive: RunnerDrive, manifest: RunManifest): Promise<RunManifest> {
  const rootId = manifest.scope.rootId;
  let listing = await drive.planReads().listAll(rootId);
  let ix = VaultIndex.build(rootId, listing);
  const old = ix.file(SYSTEM.retrieval);
  let state: RetrievalFile | undefined;
  if (old) {
    const value: unknown = JSON.parse(await drive.readListedText(old));
    if (isRunnerFile(SYSTEM.retrieval, value) && value.folderId === rootId) state = value;
  }
  const notesIn = (index: VaultIndex) => [...index.entries()].flatMap(([path]) => {
    const f = index.file(path);
    return f && !f.folder && path.endsWith('.md') && path.split('/')[0] !== 'Inbox' ? [{ path, file: f }] : [];
  });
  // An empty first run has neither indexed changes nor effects to settle.
  if (!state && !notesIn(ix).length && !manifest.operations.length) return manifest;
  const feed = state ? await drive.listChanges(state.cursor) : undefined;
  let cursor = feed?.newStartPageToken ?? await drive.getStartPageToken();
  if (!state) {
    // A bootstrap token must precede its snapshot, so changes racing the listing stay on the next feed.
    listing = await drive.listAll(rootId);
    ix = VaultIndex.build(rootId, listing);
  }
  const previous = ix;
  if (feed) {
    // Feed metadata supersedes the planner's listing; the read cache keys content by this version.
    const files = new Map(listing.map((f) => [f.id, f]));
    for (const change of feed.changes) {
      if (change.removed) files.delete(change.fileId);
      else if (change.file) {
        const listed = files.get(change.fileId);
        if (!listed || listed.modifiedTime <= change.file.modifiedTime) files.set(change.fileId, change.file);
      }
    }
    listing = [...files.values()];
    ix = VaultIndex.build(rootId, listing);
  }
  const notes = notesIn(ix).filter(({ file }) => {
    // Newly discovered visible notes wait for a fresh snapshot; old feed metadata may describe a note now in the Bin.
    if (feed && !previous.byId(file.id)) {
      cursor = state?.cursor ?? cursor;
      return false;
    }
    return true;
  });
  const pathOfChange = (change: { fileId: string; removed?: boolean }): string | undefined => ix.pathOf(change.fileId)
    ?? (change.removed ? previous.pathOf(change.fileId) ?? state?.files[change.fileId]?.path : undefined);
  // Without a resolved full path, leave the feed entry after the committed cursor for a later snapshot.
  if (state && feed?.changes.some((c) => pathOfChange(c) === undefined || (!c.removed && !c.file))) cursor = state.cursor;
  // The existing dot-path rule judges the resolved full path, including newly discovered descendants.
  const changes = (feed?.changes ?? notes.map(({ file }) => ({ fileId: file.id, file }))).filter((c) => {
    const path = pathOfChange(c);
    return path !== undefined && !isHidden(path);
  }).map((c) => c.fileId);
  if (state && !changes.length && !manifest.operations.length) {
    // Bower's own bookkeeping must not start a cursor-write feedback loop on otherwise idle runs.
    const hiddenOutsideRunner = feed?.changes.some((c) => {
      const path = pathOfChange(c);
      return path !== undefined && isHidden(path) && path.split('/')[0] !== SYSTEM.dir;
    });
    return old && hiddenOutsideRunner ? cursorOnly(drive, manifest, old, state, cursor) : manifest;
  }
  const snapshot: RetrievalFile['files'] = {};
  for (const { path, file: f } of notes) {
    const cached = state?.files[f.id];
    const text = cached?.version === f.modifiedTime && cached.path === path ? null : await drive.readListedText(f);
    snapshot[f.id] = cached?.version === f.modifiedTime && cached.path === path ? cached
      : { path, version: f.modifiedTime, summary: text === null ? '(no summary)' : parseNote(path, text).summary || '(no summary)', coverage: { kind: 'prefix', bytes: 4096 } };
  }
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
  const inputs: Maintain['inputs'] = { folderId: rootId, account: state?.account ?? rootId, cursor,
    changes: [...new Set(changes)], operationIds: manifest.operations.map((o) => o.operationId), targets,
    snapshot, listing: listing.map(seen) };
  const effect: Maintain = { kind: 'maintain', inputs };
  const ordinal = manifest.operations.length;
  const operationId = (await canonical({ runId: manifest.runId, captureId: manifest.captureId, ordinal, effect })).hash;
  return { ...manifest, v: 2, operations: [...manifest.operations, { ordinal, operationId, dependsOn: [], effect }] };
}

/** Whole projections from frozen input versions plus successful settled effects; refused effects add nothing. */
function refreshed(op: OperationV2, head: Checkpoint, manifest: RunManifest): RetrievalFile {
  if (op.effect.kind !== 'maintain') throw unavailable();
  const inputs = op.effect.inputs;
  let files: RetrievalFile['files'] = structuredClone(inputs.snapshot ?? {});
  const listing = (inputs.listing ?? []).map(file);
  const ix = VaultIndex.build(inputs.folderId, listing);
  for (const outcome of head.outcomes) {
    if (outcome.state !== 'applied' || !inputs.operationIds.includes(outcome.operationId)) continue;
    const effect = manifest.operations.find((o) => o.operationId === outcome.operationId)?.effect;
    if (!effect) continue;
    if (effect.kind === 'bin') ix.drop(effect.before.fileId);
    else ix.put({ ...file(outcome.evidence.file), ...(effect.kind === 'create-text' ? { mimeType: 'text/markdown' } : {}) });
    const f = outcome.evidence.file;
    if (effect.kind === 'create-text' || effect.kind === 'edit-text') {
      const path = ix.pathOf(f.fileId);
      if (path && !isHidden(path) && path.endsWith('.md') && path.split('/')[0] !== 'Inbox') files[f.fileId] = {
        path, version: f.modifiedTime, summary: parseNote(path, effect.text).summary || '(no summary)', coverage: { kind: 'prefix', bytes: 4096 },
      };
    }
  }
  files = Object.fromEntries(Object.entries(files).flatMap(([id, note]) => {
    const path = ix.pathOf(id);
    return !path || isHidden(path) || path.split('/')[0] === 'Inbox' ? []
      : [[id, { ...note, path, version: ix.byId(id)?.modifiedTime ?? note.version }]];
  }));
  return { v: 1, folderId: inputs.folderId, account: inputs.account, cursor: inputs.cursor, files };
}

export function maintenanceEffects(drive: RunnerDrive): Effects {
  const ordinary = driveEffects(drive);
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
      const state = refreshed(op, head, manifest);
      const index = Object.values(state.files).sort((a, b) => a.path.localeCompare(b.path)).map((f) => `- [[${f.path.split('/').at(-1)?.replace(/\.md$/, '')}]] — ${f.summary}\n`).join('');
      const texts: Partial<Record<RunnerWrite, string>> = { [SYSTEM.index]: index, [SYSTEM.retrieval]: JSON.stringify(state) };
      let last;
      for (const target of op.effect.inputs.targets ?? []) {
        const text = texts[target.path];
        if (text === undefined || !(RUNNER_WRITES as readonly string[]).includes(target.path)) throw unavailable();
        const before = op.effect.inputs.listing?.find((f) => f.fileId === target.fileId);
        const ev = before || replaying.has(op.operationId) ? await drive.evidence(target.fileId) : null;
        const content = { encoding: 'utf8' as const, size: new TextEncoder().encode(text).length, sha256: await rawHash(text) };
        const effect: EffectV2 = before && target.beforeContent ? { kind: 'write-runner-json' as const, before, path: target.path,
          beforeContent: target.beforeContent, text, content }
          : { kind: 'create-text' as const, parent: { fileId: target.parentId }, name: target.path.split('/').at(-1) ?? '', createKey: op.operationId, purpose: 'runner-json' as const, text, content };
        const sub = { ...op, effect };
        const subHead = { ...head, outcomes: head.outcomes.map((o) => o.operationId === op.operationId ? { operationId: o.operationId, state: 'possible-effect' as const, dispatchId: op.operationId, fileId: target.fileId } : o) };
        if (ev && happened({ stamp: stampOf(head.runId, op.operationId) }, ev.file)) {
          const back = await ordinary.readBack(sub, subHead, manifest);
          if (back.state !== 'landed') throw unavailable();
          last = { state: 'applied' as const, evidence: back.evidence };
          continue;
        }
        await sending();
        last = await ordinary.apply(sub, subHead, w, manifest, async () => target.fileId);
        if (last.state !== 'applied') throw unavailable();
      }
      if (!last) throw unavailable();
      // Even a fully reconciled partial effect was already named by the opening checkpoint.
      await sending();
      return last;
    },
  };
}
