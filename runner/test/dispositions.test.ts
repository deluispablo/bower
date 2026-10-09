import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Checkpoint, EffectEvidence } from '../../src/data/contracts/run-checkpoint';
import { hashRecordJson } from '../../src/data/contracts/record-json';
import type { CapturedMember, CapturedPile, OperationV2, ReportContribution, SeenFile } from '../../src/data/contracts/run-manifest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import { PILE_NOTE } from '../../src/data/piles';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import type { RunManifest } from '../../src/data/spine/records';
import { SYSTEM, isRunnerFile } from '../../src/data/vault/layout';
import { runTidy } from '../src/main';
import { providerFor } from '../src/provider';
import type { Admitted } from '../src/spine/admitted';
import { driveEffects, type Effects, type ReadBack, type Settled } from '../../src/data/spine/engine';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);

afterEach(() => vi.restoreAllMocks());

/** Alex's folder with one pile in the inbox: a folder holding only a pile note, its words, admitted by the Worker's rules. */
async function onePileNote(): Promise<{ wire: DriveV3; root: string; admission: AdmissionManifest }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
  const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
  await drive.createFolder(sys, 'changes');
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  const pile = (await drive.createFolder(inbox, 'Reading nook', { pile: 'p-nook' })).id;
  await drive.createText(pile, PILE_NOTE, 'A reading nook under the stairs, with a lamp and a shelf.\n');
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
  const wire = driveV3(drive);
  wire.folderId = root;
  wire.manifest = admitted.manifest;
  return { wire, root, admission: admitted.manifest };
}

/** The path of a file in the folder, from a listing. */
function pathOf(listing: readonly DriveFile[], root: string, id: string): string | null {
  const byId = new Map(listing.map((f) => [f.id, f]));
  const parts: string[] = [];
  for (let f = byId.get(id); f; f = byId.get(f.parents[0] ?? '')) {
    parts.unshift(f.name);
    if (f.parents[0] === root) return parts.join('/');
  }
  return null;
}

type Items = Array<{ fileId: string; pileId: string | null; disposition: string }>;

async function dispositionsOf(wire: DriveV3, root: string): Promise<Items | null> {
  const files = await wire.drive.listAll(root);
  const file = files.find((f) => !f.folder && pathOf(files, root, f.id) === `${SYSTEM.dir}/runs/${RUN_ID}/dispositions.json`);
  return file ? (JSON.parse(await wire.drive.readText(file.id)) as { items: Items }).items : null;
}

async function lastRunOf(wire: DriveV3, root: string): Promise<unknown> {
  const files = await wire.drive.listAll(root);
  const file = files.find((f) => pathOf(files, root, f.id) === SYSTEM.lastRun);
  return file ? (JSON.parse(await wire.drive.readText(file.id)) as unknown) : null;
}

async function hash(value: unknown): Promise<string> {
  const h = await hashRecordJson(value);
  if (!h.ok) throw new Error(h.reason);
  return h.value;
}

/** Effects that apply every operation, except a move of `refused`, which is refused before anything is sent. */
class Stub implements Effects {
  readonly sent = new Set<string>();
  constructor(private readonly refused: string) {}

  async apply(op: OperationV2, _head: Checkpoint, _w: unknown, _m: RunManifest, sending: () => Promise<unknown>): Promise<Settled> {
    if (op.effect.kind === 'move' && op.effect.before.fileId === this.refused) return { state: 'rejected', failure: { code: 'conflict', message: 'It was moved, renamed or removed before Bower could get to it.' } };
    await sending();
    this.sent.add(op.operationId);
    return { state: 'applied', evidence: evidence(op) };
  }

  async observe(op: OperationV2): Promise<EffectEvidence | null> {
    return this.sent.has(op.operationId) ? evidence(op) : null;
  }

  async readBack(op: OperationV2): Promise<ReadBack> {
    const found = await this.observe(op);
    return found ? { state: 'landed', evidence: found } : { state: 'unreadable', why: 'no evidence' };
  }
}

function evidence(op: OperationV2): EffectEvidence {
  return { file: { fileId: `file-${op.ordinal}`, name: `Thing ${op.ordinal}`, parents: ['FOLDER_ID'], folder: false, modifiedTime: '2026-10-07T09:00:00.000Z' }, trashed: false, content: null, provenance: 'adapter-read' };
}

/**
 * A provider whose report plan is not true to its effects: each thing's move to Projects is reported filed whether
 * it lands or not. The run's dispositions then say set aside for a thing its report says was filed.
 */
function untrue(wire: DriveV3, root: string): (taken: Admitted) => Promise<RunManifest> {
  return async ({ taken }) => {
    const projects = (await wire.drive.listAll(root)).find((f) => f.folder && f.name === 'Projects');
    if (!projects) throw new Error('no Projects');
    const seen = (f: { fileId: string; name: string; parents: string[]; modifiedTime: string }, folder = false): SeenFile => ({ fileId: f.fileId, name: f.name, parents: f.parents, folder, modifiedTime: f.modifiedTime });
    const piles: CapturedPile[] = [];
    const members: CapturedMember[] = [];
    for (const pile of taken.piles) {
      for (const item of pile.items) {
        const digest = await wire.drive.storedDigest(item.fileId);
        if (!digest) throw new Error('no digest');
        piles.push({ pileId: pile.pileId, source: { kind: 'observed' }, anchor: null, memberKeys: [null], childFileIds: [item.fileId], context: { kind: 'absent' } });
        members.push({ pileId: pile.pileId, memberKey: null, file: seen(item), content: { encoding: 'blob', size: digest.size, sha256: digest.sha256, provenance: 'adapter-read', observedModifiedTime: item.modifiedTime } });
      }
    }
    const scope = { rootId: root };
    const capture = { piles, members, journal: [], places: [{ file: seen({ fileId: projects.id, name: projects.name, parents: projects.parents, modifiedTime: projects.modifiedTime }, true), path: 'Projects' }] };
    const captureId = await hash({ scope, runScope: 'all', capture });
    const operations: OperationV2[] = [];
    const reportPlan: ReportContribution[] = [];
    const empty = { filed: [], created: [], updated: [], setAside: [], questions: [] };
    for (const [ordinal, m] of members.entries()) {
      const effect = { kind: 'move' as const, before: m.file, parent: { fileId: projects.id }, name: m.file.name, properties: {} };
      const operationId = await hash({ runId: RUN_ID, captureId, ordinal, effect });
      operations.push({ operationId, ordinal, dependsOn: [], effect });
      for (const when of ['applied', 'rejected'] as const) reportPlan.push({ requires: [operationId], when, value: { ...empty, filed: [{ name: m.file.name, title: m.file.name, kind: 'pdf', to: 'Projects' }] } });
    }
    return { v: 1, kind: 'run-manifest', scope, runId: RUN_ID, requestId: 'request-1', runScope: 'all', allowWeb: false, requestedAt: AT, captureId, capture, operations, reportPlan };
  };
}

describe('what dispositions.json says', () => {
  it('a pile written into a new note is filed in its dispositions', async () => {
    const { wire, root, admission } = await onePileNote();
    const items = admission.piles.flatMap((p) => p.items.map((i) => i.fileId));
    expect(items).toHaveLength(1);

    const end = await runTidy({ api: API, runId: RUN_ID, ticket: TICKET, attempt: 1, fetch: wire.fetch, provider: (drive, rootId) => providerFor('scripted', drive, { rootId, runId: RUN_ID, allowWeb: false }), effects: driveEffects });

    expect(end.phase).toBe('done');
    // The report says the pile's words were filed as a note, and its folder went to the Bin with the pile note in it.
    const view = await lastRunOf(wire, root);
    expect(isRunnerFile(SYSTEM.lastRun, view) && view.run.report?.filed.map((f) => f.to)).toEqual(['Resources/Ideas']);
    expect((await wire.drive.evidence(admission.piles[0]?.anchor?.fileId ?? ''))?.trashed).toBe(true);
    // And dispositions.json says the same: filed, not set aside.
    expect(await dispositionsOf(wire, root)).toEqual([{ fileId: items[0], pileId: admission.piles[0]?.pileId, disposition: 'filed' }]);
  });

  it('dispositions never contradict the report', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { wire, root, admission } = await onePileNote();
    // Two loose things; the second one's move is refused, and the untrue plan still reports it filed.
    const inbox = (await wire.drive.listAll(root)).find((f) => f.folder && f.name === 'Inbox');
    const a = await wire.drive.createText(inbox?.id ?? '', 'receipt.pdf', '%PDF receipt', { pile: 'p-receipt' });
    const b = await wire.drive.createText(inbox?.id ?? '', 'ticket.pdf', '%PDF ticket', { pile: 'p-ticket' });
    const admitted = await planAdmission(fakeRead(wire.drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-2' });
    if (admitted.kind !== 'manifest') throw new Error('nothing admitted');
    wire.manifest = { ...admitted.manifest, piles: admitted.manifest.piles.filter((p) => p.items.some((i) => i.fileId === a.id || i.fileId === b.id)) };
    expect(wire.manifest.piles).toHaveLength(2);
    expect(admission.piles).toHaveLength(1);

    const end = await runTidy({ api: API, runId: RUN_ID, ticket: TICKET, attempt: 1, fetch: wire.fetch, provider: () => untrue(wire, root), effects: () => new Stub(b.id) });

    // The run stops before its summary: no dispositions.json, no last-run.json, never done. It changed something
    // (the first move landed), so it stays in saving for a redispatch, and past the ceiling the Worker ends it.
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving']);
    expect(end.phase).toBe('saving');
    expect(await dispositionsOf(wire, root)).toBeNull();
    expect(await lastRunOf(wire, root)).toBeNull();
  });
});
