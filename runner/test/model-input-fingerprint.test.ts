/**
 * Model input fingerprint (TL-P4-07): the timing line adds input=<first 12 hex of sha256 of the model input>,
 * and a golden test of the C04 fixture input ensures future changes are intentional.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead, type ScriptedRead } from '../../src/data/spine/read';
import { listedPiles } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import { serializeNote } from '../../src/data/vault/note-format';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { ClaudeCall, ClaudeExit, ClaudeSpawn } from '../src/claude';
import { claudeProvider } from '../src/claude';
import { RunTiming } from '../src/timing';
import { loadCorpus } from '../src/corpus';
import { runWithClaude } from './corpus-run';
import { RUN_ID, fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');
const AT = Date.UTC(2026, 9, 7, 9);

const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(resolve(ROOT, path)));

function fakeScripted(drive: FakeDrive): ScriptedRead {
  const reads = fakeRead(drive);
  return { ...reads, piles: (rootId) => listedPiles(reads, rootId), provenance: 'fake-stored' };
}

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });

/** Alex's folder with the garden newsletter in the inbox and Bower's plot note. */
async function gardenFolder(): Promise<{ drive: FakeDrive; root: string }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const box = (await drive.createFolder(root, 'Inbox')).id;
  const ids = new Map<string, string>();
  const folder = async (path: string): Promise<string> => {
    let parent = root;
    let at = '';
    for (const part of path.split('/').filter(Boolean)) {
      at = at ? `${at}/${part}` : part;
      const known = ids.get(at) ?? (await drive.createFolder(parent, part)).id;
      ids.set(at, known);
      parent = known;
    }
    return parent;
  };
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await folder(name);
  const sys = await folder(SYSTEM.dir);
  await drive.createFolder(sys, 'changes');
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  const plot = serializeNote({ summary: 'Alex\'s plot.', properties: [], tags: [], currentState: [], body: '', timeline: [{ date: '2026-09-12', text: 'Planted garlic.', source: '' }], byBower: true });
  await drive.createText(await folder('Areas/Home'), 'Garden plot.md', plot, { by: 'bower' });
  await drive.upload(box, 'Community garden newsletter, autumn.pdf', new Blob([bytesOf('c04-garden-newsletter/inbox/Community garden newsletter, autumn.pdf').slice()]), undefined, { pile: 'p-1' });
  return { drive, root };
}

describe('model input fingerprint', () => {
  it('the model input on the C04 fixture equals its golden copy', async () => {
    // The corpus case runs through main() on the Drive v3 fake with a fake spawn: the runner's own reads decide what the model sees.
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-garden-newsletter');
    if (!c) throw new Error('the C04 garden newsletter case is missing');
    const calls: ClaudeCall[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await runWithClaude(c, async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit));
    expect(calls).toHaveLength(1);

    // Only run-dependent ids and times are normalised.
    const normalized = (calls[0]?.input ?? '')
      .replaceAll(RUN_ID, 'RUN_ID')
      .replace(/"at":\d+/g, '"at":0')
      .replace(/"runId":"[^"]+"/g, '"runId":"RUN_ID"')
      .replace(/"id":"[^"]+"/g, '"id":"ID"');

    // Verify against golden file (must exist; golden files are not created by tests)
    const goldenPath = resolve(import.meta.dirname, 'fixtures/model-input-c04.golden.txt');
    expect(normalized).toBe(readFileSync(goldenPath, 'utf8'));
  });

  it('the timing line carries the model input fingerprint', async () => {
    const g = await gardenFolder();
    const admitted = await planAdmission(fakeRead(g.drive), g.root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error('nothing admitted');

    const calls: ClaudeCall[] = [];
    const timing = new RunTiming();
    const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn, timing }, { rootId: g.root, runId: RUN_ID, allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();

    // The timing line should have the model input fingerprint
    const modelInput = calls[0]?.input ?? '';
    const expectedHash = createHash('sha256').update(modelInput).digest('hex').slice(0, 12);
    const line = timing.line('done');

    expect(line).toContain(`input=${expectedHash}`);
  });

  it('two runs of the same case on fresh ids give the same input fingerprint', async () => {
    const g = await gardenFolder();
    const admitted = await planAdmission(fakeRead(g.drive), g.root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error('nothing admitted');

    const calls1: ClaudeCall[] = [];
    const timing1 = new RunTiming();
    const spawn: ClaudeSpawn = async (call) => (calls1.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // First run with RUN_ID
    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn, timing: timing1 }, { rootId: g.root, runId: RUN_ID, allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();
    const input1 = calls1[0]?.input ?? '';
    const line1 = timing1.line('done');

    // Second run with a different run ID on the same folder structure
    const calls2: ClaudeCall[] = [];
    const timing2 = new RunTiming();
    const spawn2: ClaudeSpawn = async (call) => (calls2.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);

    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: spawn2, timing: timing2 }, { rootId: g.root, runId: 'different-run-id-2', allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();
    const input2 = calls2[0]?.input ?? '';
    const line2 = timing2.line('done');

    // The raw inputs differ due to different run IDs
    expect(input1).not.toBe(input2);

    // Extract the input fingerprints from the timing lines
    const extractInput = (line: string): string => {
      const match = line.match(/input=([0-9a-f]+)/);
      return match?.[1] ?? '';
    };
    const fingerprint1 = extractInput(line1);
    const fingerprint2 = extractInput(line2);

    // Both fingerprints should be present
    expect(fingerprint1).toMatch(/^[0-9a-f]{12}$/);
    expect(fingerprint2).toMatch(/^[0-9a-f]{12}$/);

    // The fingerprints should be the same when inputs are normalized
    expect(fingerprint1).toBe(fingerprint2);
  });
});
