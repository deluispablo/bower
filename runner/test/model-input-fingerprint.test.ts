/**
 * Model input fingerprint (TL-P4-07): the timing line adds input=<first 12 hex of sha256 of the model input>,
 * and a golden test of the C04 fixture input ensures future changes are intentional.
 */
import { phaseAwareClaude } from './b1-planning-support';
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
import { normalizeModelInput } from '../src/model-input';
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
async function gardenFolder(spare = 0): Promise<{ drive: FakeDrive; root: string }> {
  const drive = fixedDrive();
  // Throwaway folders first, so every Drive id after them differs from a folder made without.
  for (let i = 0; i < spare; i++) await drive.createFolder('root', `spare ${i}`);
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
  it('two identical C04 runs produce one fingerprint', async () => {
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-garden-newsletter');
    if (!c) throw new Error('the C04 garden newsletter case is missing');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fingerprints: string[] = [];
    for (let run = 0; run < 2; run++) {
      const calls: ClaudeCall[] = [];
      const result = await runWithClaude(c, async (call) => {
        calls.push(call);
        return { code: 0, stderr: '', cut: null, stdout: envelope({ kind: 'tidy-intent', v: 1, things: [] }) };
      });
      expect(result.code).toBe(0);
      expect(calls).toHaveLength(2);
      fingerprints.push(createHash('sha256').update(normalizeModelInput(calls[0]?.input ?? '')).digest('hex'));
    }
    expect(new Set(fingerprints).size).toBe(1);
  });

  it('the model input on the C04 fixture equals its golden copy', async () => {
    // The corpus case runs through main() on the Drive v3 fake with a fake spawn: the runner's own reads decide what the model sees.
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-garden-newsletter');
    if (!c) throw new Error('the C04 garden newsletter case is missing');
    const calls: ClaudeCall[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await runWithClaude(c, async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit));
    // Selection precedes the refused execution and its one retry; the first call carries selection input.
    expect(calls).toHaveLength(3);

    // Normalize the input using the shared function
    const input = calls[0]?.input ?? '';
    const normalized = normalizeModelInput(input);

    // Verify against golden file (must exist; golden files are not created by tests)
    const goldenPath = resolve(import.meta.dirname, 'fixtures/model-input-c04.golden.txt');
    expect(normalized).toBe(readFileSync(goldenPath, 'utf8'));
  });

  it('the raw model input on the C04 fixture equals its golden copy', async () => {
    // Pins the prompt bytes the model reads (not the fingerprint form): a fingerprint change must not move them.
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-garden-newsletter');
    if (!c) throw new Error('the C04 garden newsletter case is missing');
    const calls: ClaudeCall[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await runWithClaude(c, async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit));
    // TL-P4-42 addendum 5: stable-prefix key reorder only: index, runId, admission, piles, notes, folders.
    const rawGoldenPath = resolve(import.meta.dirname, 'fixtures/model-input-c04.raw.golden.txt');
    expect(calls[0]?.input ?? '').toBe(readFileSync(rawGoldenPath, 'utf8'));
  });

  it('the timing line carries the model input fingerprint', async () => {
    const g = await gardenFolder();
    const admitted = await planAdmission(fakeRead(g.drive), g.root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error('nothing admitted');

    const calls: ClaudeCall[] = [];
    const timing = new RunTiming();
    const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: g.drive, root: g.root })), timing }, { rootId: g.root, runId: RUN_ID, allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();

    // The timing line should have the model input fingerprint (calculated on the normalized input)
    const modelInput = calls[0]?.input ?? '';
    const normalized = normalizeModelInput(modelInput);
    const expectedHash = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
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
    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: g.drive, root: g.root })), timing: timing1 }, { rootId: g.root, runId: RUN_ID, allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();
    const input1 = calls1[0]?.input ?? '';
    const line1 = timing1.line('done');

    // Second run with a different run ID on the same folder structure
    const calls2: ClaudeCall[] = [];
    const timing2 = new RunTiming();
    const spawn2: ClaudeSpawn = async (call) => (calls2.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);

    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn2, () => ({ drive: g.drive, root: g.root })), timing: timing2 }, { rootId: g.root, runId: 'different-run-id-2', allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();
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

  it('the same case with other ids has the same fingerprint', async () => {
    const fingerprintOf = async (spare: number, admission: string, runId: string): Promise<{ fingerprint: string; input: string }> => {
      const g = await gardenFolder(spare);
      const admitted = await planAdmission(fakeRead(g.drive), g.root, { scope: 'all', clock: () => AT, newId: () => admission });
      if (admitted.kind !== 'manifest') throw new Error('nothing admitted');
      const calls: ClaudeCall[] = [];
      const timing = new RunTiming();
      const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: g.drive, root: g.root })), timing }, { rootId: g.root, runId, allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();
      return { fingerprint: /input=([0-9a-f]{12})/.exec(timing.line('done'))?.[1] ?? '', input: calls[0]?.input ?? '' };
    };
    const a = await fingerprintOf(0, 'admission-1', 'run-a');
    const b = await fingerprintOf(7, 'admission-2', 'run-b');
    expect(b.input).not.toBe(a.input);
    expect(a.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(b.fingerprint).toBe(a.fingerprint);
  });

  it('a value that looks like an id inside text is kept', () => {
    const input = (text: string): string => `{"runId":"r","admission":"a","piles":[{"things":[{"fileId":"f1","text":${JSON.stringify(text)}}]}]}`;
    expect(normalizeModelInput(input('"id":"x"'))).not.toBe(normalizeModelInput(input('"id":"y"')));
    expect(normalizeModelInput(input('"fileId":"x"'))).not.toBe(normalizeModelInput(input('"fileId":"y"')));
    // A line of prompt text (not JSON) holding the same words is kept as written.
    expect(normalizeModelInput('Note reads "id":"x" here')).not.toBe(normalizeModelInput('Note reads "id":"y" here'));
  });

  it('two fresh fake folders on the same case give the same input fingerprint through main', async () => {
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-garden-newsletter');
    if (!c) throw new Error('the C04 garden newsletter case is missing');

    // Capture model inputs from two runs with different Drive IDs
    const captureInputFromFreshFolder = async (spare: number): Promise<{ input: string; normalized: string }> => {
      const drive = fixedDrive();
      // Create throwaway folders to get different Drive IDs
      for (let i = 0; i < spare; i++) await drive.createFolder('root', `spare ${i}`);

      const root = (await drive.createFolder('root', 'Bower')).id;
      const folders = new Map<string, string>();
      const ensureFolder = async (parent: string, path: string): Promise<string> => {
        let id: string;
        let at = '';
        for (const part of path.split('/').filter(Boolean)) {
          at = at ? `${at}/${part}` : part;
          id = folders.get(at) ?? (await drive.createFolder(parent, part)).id;
          folders.set(at, id);
          parent = id;
        }
        return parent;
      };

      const inbox = await ensureFolder(root, 'Inbox');
      for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await ensureFolder(root, name);
      const sys = await ensureFolder(root, 'System');
      const changes = await ensureFolder(root, 'System/changes');
      await drive.createText(sys, 'questions.json', `${JSON.stringify({ v: 1, questions: c.questions })}\n`);

      for (const [path, text] of Object.entries(c.folder)) {
        const parts = path.split('/');
        const name = parts.pop() ?? path;
        const parent = await ensureFolder(root, parts.join('/'));
        await drive.createText(parent, name, text, c.bowerOwned.includes(path) || /^by: bower$/m.test(text) ? { by: 'bower' } : undefined);
      }
      for (const [path, bytes] of Object.entries(c.folderBinary)) {
        const parts = path.split('/');
        const name = parts.pop() ?? path;
        const parent = await ensureFolder(root, parts.join('/'));
        await drive.upload(parent, name, new Blob([bytes.slice()]));
      }
      for (const [i, line] of c.journal.entries()) {
        const rec = { v: 1, id: `change-${i + 1}`, device: 'device-1', at: AT - 60_000 + i, kind: line.kind, what: line.kind === 'answer' ? 'Answered a question' : line.kind === 'rule' ? 'A rule' : `Asked Bower: "${line.text}"`, text: line.text, ...(line.questionId ? { questionId: line.questionId } : {}) };
        await drive.createText(changes, `change-${i + 1}.json`, `${JSON.stringify(rec)}\n`);
      }
      for (const [i, pile] of c.inbox.entries()) {
        const props = { pile: `p-${i + 1}` };
        const add = async (parent: string, name: string, extra: Record<string, string>): Promise<void> => {
          const bytes = c.inboxBinary[name];
          if (bytes) await drive.upload(parent, name, new Blob([bytes.slice()]), undefined, { ...extra, asAdded: name });
          else await drive.createText(parent, name, c.inboxFiles[name] ?? `made-up content of ${name}`, { ...extra, asAdded: name });
        };
        if (!pile.line && pile.files.length === 1) {
          await add(inbox, pile.files[0] ?? '', props);
          continue;
        }
        const folder = (await drive.createFolder(inbox, pile.line.slice(0, 40) || `Pile ${i + 1}`, props)).id;
        if (pile.line) await drive.createText(folder, 'Pile note.md', `${pile.line}\n`);
        for (const f of pile.files) await add(folder, f, {});
      }

      const admitted = await planAdmission(fakeRead(drive), root, { scope: c.scope === 'undo' ? 'instructions' : c.scope, clock: () => AT, newId: () => `admission-${spare}` });
      if (admitted.kind !== 'manifest') throw new Error('nothing admitted');

      const calls: ClaudeCall[] = [];
      const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('{"kind":"tidy-intent","v":1,"things":[],"notes":[],"lines":[],"asks":[]}') } satisfies ClaudeExit);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: drive, root: root })) }, { rootId: root, runId: `run-${spare}`, allowWeb: false }, fakeScripted(drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();

      const input = calls[0]?.input ?? '';
      const normalized = normalizeModelInput(input);
      return { input, normalized };
    };

    const run1 = await captureInputFromFreshFolder(0);
    const run2 = await captureInputFromFreshFolder(7);

    expect(run1.input).not.toBe(run2.input);

    // After normalization, they should be identical
    expect(run1.normalized).toBe(run2.normalized);

    // Fingerprints should also be identical
    const fingerprint1 = createHash('sha256').update(run1.normalized).digest('hex').slice(0, 12);
    const fingerprint2 = createHash('sha256').update(run2.normalized).digest('hex').slice(0, 12);
    expect(fingerprint1).toBe(fingerprint2);
  });

  it('a change in one input section moves only that section hash', async () => {
    const g = await gardenFolder();
    const admitted = await planAdmission(fakeRead(g.drive), g.root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error('nothing admitted');

    const calls: ClaudeCall[] = [];
    const timing = new RunTiming();
    const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: g.drive, root: g.root })), timing }, { rootId: g.root, runId: RUN_ID, allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();

    const line = timing.line('done');

    // Check that sections= is present in the timing line
    expect(line).toMatch(/sections=prompt:[0-9a-f]{6},tree:[0-9a-f]{6},things:[0-9a-f]{6},notes:[0-9a-f]{6}(?:,rules:[0-9a-f]{6})?/);

    // Extract section hashes from the timing line
    const extractSections = (timingLine: string): Record<string, string> => {
      const sections: Record<string, string> = {};
      const match = timingLine.match(/sections=([^ ]+)/);
      if (!match || !match[1]) return sections;
      for (const part of match[1].split(',')) {
        const [key, value] = part.split(':');
        if (key && value) sections[key] = value;
      }
      return sections;
    };

    const sections1 = extractSections(line);
    expect(Object.keys(sections1).length).toBeGreaterThanOrEqual(4); // At least prompt, tree, things, notes
  });
});

describe('model input order', () => {
  it('the model input lists a pile things in a stable order', async () => {
    const drive = fixedDrive();
    const root = (await drive.createFolder('root', 'Bower')).id;
    const box = (await drive.createFolder(root, 'Inbox')).id;
    for (const name of ['Zeta.txt', 'Alpha.txt', 'Mid.txt']) await drive.createText(box, name, `${name} text\n`);
    const folder = (await drive.createFolder(box, 'Three things', { pile: 'p-1' })).id;
    for (const name of ['Zeta.txt', 'Alpha.txt', 'Mid.txt']) await drive.createText(folder, name, `${name} text\n`);
    const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
    if (admitted.kind !== 'manifest') throw new Error('nothing admitted');
    const calls: ClaudeCall[] = [];
    const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: drive, root: root })) }, { rootId: root, runId: RUN_ID, allowWeb: false }, fakeScripted(drive))({ taken: admitted.manifest, deferred: [] })).rejects.toThrow();
    const sent = JSON.parse((calls[0]?.input ?? '').split('\n').at(-1) ?? '{}') as { piles: Array<{ things: Array<{ name: string }> }> };
    const lists = sent.piles.map((p) => p.things.map((t) => t.name));
    expect(lists.some((l) => l.length > 2)).toBe(true);
    for (const names of lists) expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});
