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

describe('things section normalisation', () => {
  it('two fresh runs of the same case give the same things section hash', async () => {
    const fingerprintThingsSection = async (spare: number, admission: string, runId: string): Promise<{ hash: string }> => {
      const g = await gardenFolder(spare);
      const admitted = await planAdmission(fakeRead(g.drive), g.root, { scope: 'all', clock: () => AT, newId: () => admission });
      if (admitted.kind !== 'manifest') throw new Error('nothing admitted');

      const calls: ClaudeCall[] = [];
      const timing = new RunTiming();
      const spawn: ClaudeSpawn = async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn, timing }, { rootId: g.root, runId, allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] });
      } catch {
        // Expected to throw
      }

      const modelInput = calls[0]?.input ?? '';
      const firstBrace = modelInput.indexOf('{');
      if (firstBrace === -1) throw new Error('No JSON found');

      let braceCount = 0;
      let jsonEnd = firstBrace;
      for (let i = firstBrace; i < modelInput.length; i++) {
        if (modelInput[i] === '{') braceCount++;
        if (modelInput[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEnd = i;
          break;
        }
      }

      const jsonLine = modelInput.slice(firstBrace, jsonEnd + 1);
      const parsedInput = JSON.parse(jsonLine);
      const piles = parsedInput.piles || [];

      const pilesJson = JSON.stringify(piles);
      const normalized = normalizeModelInput(pilesJson);
      const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 6);

      return { hash };
    };

    const run1 = await fingerprintThingsSection(0, 'admission-1', RUN_ID);
    const run2 = await fingerprintThingsSection(1, 'admission-2', 'different-run-id-2');

    console.log('Run 1 things hash:', run1.hash);
    console.log('Run 2 things hash:', run2.hash);

    expect(run1.hash).toBe(run2.hash);
  });
});
