/** Derived maintenance uses the manifest, its settled outcomes and the ordinary fenced effects. */
import { sha256Hex } from '../../src/data/contracts/hashes';
import type { Checkpoint } from '../../src/data/contracts/run-checkpoint';
import { parseNote } from '../../src/data/contracts/note-format';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
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
type RetrievalState = RetrievalFile & { listing?: DriveFile[] };

function retrievalSummary(path: string, text: string): string {
  // Validate full ownership framing, while only indexing front matter covered by Q3's prefix.
  const note = parseNote(path, text);
  const ownership = parseOwnership(new TextEncoder().encode(text));
  return ownership.status !== 'invalid' && ownership.layout.frontEnd <= 4096 ? note.summary || '(no summary)' : '(no summary)';
}

/** Q8: stable folder traversal and shortest unique suffixes, without exposing Drive ids. */
function projectIndex(files: RetrievalFile['files']): string {
  const notes = Object.values(files).filter((f) => !isHidden(f.path));
  const suffixes = new Map<string, number>();
  for (const note of notes) {
    const parts = note.path.replace(/\.md$/, '').split('/');
    for (let i = 0; i < parts.length; i++) {
      const suffix = parts.slice(i).join('/');
      suffixes.set(suffix, (suffixes.get(suffix) ?? 0) + 1);
    }
  }
  const link = (path: string): string => {
    const parts = path.replace(/\.md$/, '').split('/');
    for (let n = 1; n < parts.length; n++) {
      const suffix = parts.slice(-n).join('/');
      if (suffixes.get(suffix) === 1) return suffix;
    }
    return parts.join('/');
  };
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
    const rows = (direct.get(folder) ?? []).sort((a, b) => a.path.localeCompare(b.path))
      .map((f) => `- [[${link(f.path)}]] — ${f.summary}\n`).join('');
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
  return text;
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

/** Freeze declared inputs and reserved ids in the existing immutable manifest. */
export async function withMaintenance(drive: RunnerDrive, manifest: RunManifest): Promise<RunManifest> {
  const rootId = manifest.scope.rootId;
  let listing = await drive.planReads().listAll(rootId);
  let ix = VaultIndex.build(rootId, listing);
  const old = ix.file(SYSTEM.retrieval);
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
  const notesIn = (index: VaultIndex) => [...index.entries()].flatMap(([path]) => {
    const f = index.file(path);
    return f && !f.folder && path.endsWith('.md') && path.split('/')[0] !== 'Inbox' ? [{ path, file: f }] : [];
  });
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
  const snapshot: RetrievalFile['files'] = {};
  for (const { path, file: f } of notes) {
    const cached = state?.files[f.id];
    let text: string | null;
    try {
      text = cached?.version === f.modifiedTime ? null : await drive.readListedText(f);
    } catch (error) {
      // Drive also reports a trashed media read as not-found; other failures still stop the run.
      if (!(error instanceof BowerError) || error.code !== 'not-found') throw error;
      console.error(error);
      drop(f.id);
      continue;
    }
    snapshot[f.id] = cached?.version === f.modifiedTime ? { ...cached, path }
      : { path, version: f.modifiedTime, summary: text === null ? '(no summary)' : retrievalSummary(path, text), coverage: { kind: 'prefix', bytes: 4096 } };
  }
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
  const inputs: Maintain['inputs'] = { folderId: rootId, account: state?.account ?? rootId, cursor,
    changes: [...new Set(changes)], operationIds: manifest.operations.map((o) => o.operationId), targets,
    snapshot, listing: listing.map(seen) };
  const effect: Maintain = { kind: 'maintain', inputs };
  const ordinal = manifest.operations.length;
  const operationId = (await canonical({ runId: manifest.runId, captureId: manifest.captureId, ordinal, effect })).hash;
  return { ...manifest, v: 2, operations: [...manifest.operations, { ordinal, operationId, dependsOn: [], effect }] };
}

/** Whole projections from frozen input versions plus successful settled effects; refused effects add nothing. */
function refreshed(op: OperationV2, head: Checkpoint, manifest: RunManifest): RetrievalState {
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
        path, version: f.modifiedTime, summary: retrievalSummary(path, effect.text), coverage: { kind: 'prefix', bytes: 4096 },
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
      const index = projectIndex(state.files);
      const texts: Partial<Record<RunnerWrite, string>> = { [SYSTEM.index]: index, [SYSTEM.retrieval]: JSON.stringify(state) };
      let last;
      for (const target of op.effect.inputs.targets ?? []) {
        const text = texts[target.path];
        if (text === undefined || !(RUNNER_WRITES as readonly string[]).includes(target.path)) throw unavailable();
        const before = op.effect.inputs.listing?.find((f) => f.fileId === target.fileId);
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
