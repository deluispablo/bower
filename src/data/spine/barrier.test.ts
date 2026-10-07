import { describe, expect, it, vi } from 'vitest';
import { DriveHttp } from '../drive/drive-http';
import { FakeDrive } from '../drive/fake-drive';
import type { Question, RunReport } from '../types';
import { sha256 } from '../vault/hashes';
import { SYSTEM, type LastRunFile } from '../vault/layout';
import { API, RUN_ID, TICKET, driveV3 } from '../../../runner/test/drive-v3';
import { lastRunText, olderView, saveReport, type ReportSave } from './barrier';

const asked = (id: string, askedAt: number): Question => ({ id, text: `Is ${id} a trip?`, yes: 'Yes', no: 'No', askedAt });

/** A Bower folder whose `.bower` has a question, its hashes, and the view of an earlier run. */
async function folder(drive: FakeDrive): Promise<string> {
  const root = (await drive.createFolder('root', 'Bower')).id;
  const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
  await drive.createText(sys, 'questions.json', `${JSON.stringify({ v: 1, questions: [asked('q1', 1000)] }, null, 2)}\n`);
  await drive.createText(sys, 'hashes.json', '{ "v": 1, "hashes": {} }\n');
  const earlier: LastRunFile = { v: 1, run: { id: 'run-1', scope: 'all', phase: 'done', requestedAt: 1000, phaseAt: 1500, total: 0, finishedAt: 1500 } };
  await drive.createText(sys, 'last-run.json', lastRunText(earlier));
  return root;
}

const report: RunReport = { filed: [{ name: 'receipt.pdf', title: 'Receipt', kind: 'pdf', to: 'Projects' }], created: [], updated: [], setAside: [], questions: [asked('q2', 2000)] };
const run = { id: 'run-2', requestedAt: 2000 };
const view = lastRunText({ v: 1, run: { id: run.id, scope: 'all', phase: 'done', requestedAt: run.requestedAt, phaseAt: 3000, total: 1, finishedAt: 3000, report } });
const digest = (bytes: Uint8Array): Promise<string> => sha256(new Blob([bytes.slice()]));

type Io = Pick<ReportSave, 'rootId' | 'reads' | 'checksum' | 'batch'>;

/** The pretend Drive as the fake run service writes to it. */
async function onFake(): Promise<{ io: Io; drive: FakeDrive }> {
  const drive = new FakeDrive({ clock: () => 0 });
  const rootId = await folder(drive);
  const io: Io = { rootId, reads: drive, checksum: { stored: async (id) => digest(await drive.readBytes(id)), of: digest }, batch: async () => drive.fenced(() => {}) };
  return { io, drive };
}

/** Google Drive v3 over HTTP, as the runner writes to it (a pretend Drive v3 behind `fetch`, no network). */
async function onDrive(): Promise<{ io: Io; drive: FakeDrive }> {
  const drive = new FakeDrive({ clock: () => 0 });
  const rootId = await folder(drive);
  const wire = driveV3(drive);
  const grant = (await (await wire.fetch(`${API}/runner/runs/${RUN_ID}/token`, { headers: { authorization: `Bearer ${TICKET}` } })).json()) as { accessToken: string };
  const http = new DriveHttp({ token: async () => grant.accessToken, fetch: wire.fetch });
  const io: Io = { rootId, reads: http, checksum: { stored: async (id) => digest(await http.readBytes(id)), of: digest }, batch: async () => http };
  return { io, drive };
}

const bower = (drive: FakeDrive): Array<[string, string]> => [...drive.dump()].filter(([path]) => path.startsWith(`${SYSTEM.dir}/`)).sort();

describe('the report barrier', () => {
  it('the shared barrier writes the same report on the fake and on Drive', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = await onFake();
    const real = await onDrive();
    const save = (io: Io) => saveReport({ ...io, report, view, mayReplace: async (stored) => olderView(stored, run) });

    const written = [await save(fake.io), await save(real.io)];

    // The report files the run changes or lacks, in their order, and last-run.json last.
    expect(written[0]).toEqual([SYSTEM.questions, SYSTEM.suggestions, SYSTEM.requests, SYSTEM.lastRun]);
    expect(written[1]).toEqual(written[0]);
    // Byte for byte the same files on both.
    expect(bower(real.drive)).toEqual(bower(fake.drive));
    const files = new Map(bower(fake.drive));
    expect(JSON.parse(files.get(SYSTEM.questions) ?? '')).toEqual({ v: 1, questions: [asked('q1', 1000), asked('q2', 2000)] });
    expect(files.get(SYSTEM.lastRun)).toBe(view);
    expect(JSON.parse(files.get(SYSTEM.suggestions) ?? '')).toEqual({ v: 1, suggestions: [] });

    // Saved again (a redispatch), nothing is written: every file already says it.
    expect(await save(fake.io)).toEqual([]);
    expect(await save(real.io)).toEqual([]);

    // A later run's view is never written over by an earlier one.
    const older = lastRunText({ v: 1, run: { id: 'run-0', scope: 'all', phase: 'done', requestedAt: 500, phaseAt: 600, total: 0, finishedAt: 600 } });
    for (const io of [fake.io, real.io]) {
      await expect(saveReport({ ...io, report: null, view: older, mayReplace: async (stored) => olderView(stored, { id: 'run-0', requestedAt: 500 }) })).rejects.toMatchObject({ code: 'conflict' });
    }
    expect(bower(real.drive)).toEqual(bower(fake.drive));
    expect(new Map(bower(real.drive)).get(SYSTEM.lastRun)).toBe(view);
  });
});
