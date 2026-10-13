import { phaseAwareClaude } from './b1-planning-support';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead, type ScriptedRead } from '../../src/data/spine/read';
import { listedPiles } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import { serializeNote } from '../../src/data/vault/note-format';
import type { FakeDrive } from '../../src/data/drive/fake-drive';
import type { ClaudeExit, ClaudeSpawn } from '../src/claude';
import { claudeProvider } from '../src/claude';
import type { SectionHashes } from '../src/timing';
import { RunTiming } from '../src/timing';
import { RUN_ID, fixedDrive } from './drive-v3';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const AT = Date.UTC(2026, 9, 7, 9);

const bytesOf = (path: string): Uint8Array => new Uint8Array(readFileSync(resolve(ROOT, path)));

function fakeScripted(drive: FakeDrive): ScriptedRead {
  const reads = fakeRead(drive);
  return { ...reads, piles: (rootId) => listedPiles(reads, rootId), provenance: 'fake-stored' };
}

const envelope = (intent: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(intent), usage: { input_tokens: 10, output_tokens: 10 } });

/** Garden folder with optional spare folders to offset IDs. */
async function gardenFolder(spare = 0, usePileProperty = true): Promise<{ drive: FakeDrive; root: string }> {
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
  const props = usePileProperty ? { pile: 'p-1' } : undefined;
  await drive.upload(box, 'Community garden newsletter, autumn.pdf', new Blob([bytesOf('c04-garden-newsletter/inbox/Community garden newsletter, autumn.pdf').slice()]), undefined, props);
  return { drive, root };
}

/** Timing wrapper that captures section hashes. */
class CapturingTiming extends RunTiming {
  capturedHashes: SectionHashes | null = null;

  override setSectionHashes(hashes: SectionHashes): void {
    this.capturedHashes = hashes;
    super.setSectionHashes(hashes);
  }
}

describe('things section normalisation', () => {
  it('two fresh runs of the same case give the same things section hash', async () => {
    const captureThingsHash = async (spare: number, usePile: boolean, admission: string, runId: string): Promise<string> => {
      const g = await gardenFolder(spare, usePile);
      const admitted = await planAdmission(fakeRead(g.drive), g.root, { scope: 'all', clock: () => AT, newId: () => admission });
      if (admitted.kind !== 'manifest') throw new Error('nothing admitted');

      const timing = new CapturingTiming();
      const spawn: ClaudeSpawn = async () => ({ code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: g.drive, root: g.root })), timing }, { rootId: g.root, runId, allowWeb: false }, fakeScripted(g.drive))({ taken: admitted.manifest, deferred: [] });
      } catch {
        // Expected to throw
      }

      if (!timing.capturedHashes?.things) {
        throw new Error('No things hash captured from timing');
      }

      return timing.capturedHashes.things;
    };

    // First run uses pile property 'p-1', second run doesn't (falls back to file ID)
    // This ensures different pileIds despite same folder structure
    const hash1 = await captureThingsHash(0, true, 'admission-1', RUN_ID);
    const hash2 = await captureThingsHash(1, false, 'admission-2', 'different-run-id-2');

    console.log('Run 1 things hash:', hash1);
    console.log('Run 2 things hash:', hash2);

    expect(hash1).toBe(hash2);
  });

  it('a multi-thing pile with a link gives the same things section hash on fresh runs', async () => {
    const captureThingsHash = async (createInOrder: boolean, runId: string): Promise<string> => {
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

      // Create a pile with 4 things: PDF, image, PDF, link (in different orders per run)
      const pileFolder = (await drive.createFolder(box, 'Job offer and a flat near it. Compare the commute.', { pile: 'p-1' })).id;

      type FileSpec = { name: string; file: string };
      const uploadByIndex: Record<number, FileSpec> = {
        0: { name: 'Offer_letter_final(2).pdf', file: 'c04-offer-and-flat/inbox/Offer_letter_final(2).pdf' },
        1: { name: 'IMG_2301.jpg', file: 'c04-offer-and-flat/inbox/IMG_2301.jpg' },
        2: { name: 'Payslip_Aug.pdf', file: 'c04-offer-and-flat/inbox/Payslip_Aug.pdf' },
        3: { name: 'listing-88213.example.url', file: 'c04-offer-and-flat/inbox/listing-88213.example.url' },
      };

      // Shuffle the order on second run to simulate different listing order on live
      const uploadOrder = createInOrder ? [0, 1, 2, 3] : [2, 0, 3, 1];

      for (const idx of uploadOrder) {
        const upload = uploadByIndex[idx];
        if (upload) {
          await drive.upload(pileFolder, upload.name, new Blob([bytesOf(upload.file).slice()]));
        }
      }

      const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
      if (admitted.kind !== 'manifest') throw new Error('nothing admitted');

      const timing = new CapturingTiming();
      const spawn: ClaudeSpawn = async () => ({ code: 0, stderr: '', cut: null, stdout: envelope('not intent') } satisfies ClaudeExit);
      vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await claudeProvider({ env: { CLAUDE_CODE_OAUTH_TOKEN: 'made-up' }, spawn: phaseAwareClaude(spawn, () => ({ drive: drive, root: root })), timing }, { rootId: root, runId, allowWeb: false }, fakeScripted(drive))({ taken: admitted.manifest, deferred: [] });
      } catch {
        // Expected to throw
      }

      if (!timing.capturedHashes?.things) {
        throw new Error('No things hash captured from timing');
      }

      return timing.capturedHashes.things;
    };

    // Two fresh runs with different file ordering (simulating different Drive listing order)
    const hash1 = await captureThingsHash(true, RUN_ID);
    const hash2 = await captureThingsHash(false, 'different-run-id-2');

    console.log('Multi-thing pile run 1 hash:', hash1);
    console.log('Multi-thing pile run 2 hash:', hash2);

    expect(hash1).toBe(hash2);
  });
});
