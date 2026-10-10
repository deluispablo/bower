import { describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { NOTES, SEEDS, seedQuestions } from '../demo/fixture';
import { parseNote } from '../vault/note-format';
import { isHidden, SYSTEM } from '../vault/layout';
import { seedFakeDrive } from './seed';

const NOW = Date.parse('2026-10-04T12:00:00Z');

async function seeded(scenario: Parameters<typeof seedFakeDrive>[1]) {
  const drive = new FakeDrive({ clock: () => NOW });
  const root = await seedFakeDrive(drive, scenario, NOW);
  return { drive, root, files: root ? drive.dump(root) : new Map<string, string>(), paths: root ? (await drive.listAll(root)).map((f) => drive.pathOf(f.id, root)) : [] };
}

describe("seeding Alex's folder", () => {
  it("seed makes Alex's folder", async () => {
    const { paths, files } = await seeded('default');
    for (const s of SEEDS) expect(paths).toContain(s.path.replace(/\/$/, ''));
    for (const [path, seed] of Object.entries(NOTES)) {
      const text = files.get(path);
      expect(text, path).toBeDefined();
      expect(parseNote(path, text ?? '').summary).toBe(seed.summary);
    }
    expect(paths).toContain('Rules.md');
    expect(paths).toContain('About me.md');
  });

  it('keeps the ages of things', async () => {
    const { drive, root } = await seeded('default');
    if (!root) throw new Error('no root');
    const lease = (await drive.listAll(root)).find((f) => f.name === 'Lease draft.pdf');
    expect(Date.parse(lease?.modifiedTime ?? '')).toBeLessThan(NOW - 8 * 86_400_000);
  });

  it('marks what Bower wrote', async () => {
    const { drive, root } = await seeded('default');
    if (!root) throw new Error('no root');
    const all = await drive.listAll(root);
    expect(all.find((f) => f.name === 'Flat hunt.md')?.appProperties?.by).toBe('bower');
    expect(all.find((f) => f.name === 'Lease draft.pdf')?.appProperties?.by).toBeUndefined();
  });

  it('puts the piles in the inbox, each with its note', async () => {
    const { paths, files } = await seeded('default');
    const pile = paths.find((p) => /^Inbox\/\d{4}-\d{2}-\d{2} Receipts from the Saltmere weekend$/.test(p));
    expect(pile).toBeDefined();
    expect(files.get(`${pile}/Pile note.md`)).toBe('Receipts from the Saltmere weekend');
    expect(paths).toContain('Inbox/Dentist reminder.pdf');
  });

  it('writes what the runner keeps in .bower', async () => {
    const { files } = await seeded('default');
    const q = JSON.parse(files.get(SYSTEM.questions) ?? '{}') as { v: number; questions: unknown[] };
    expect(q.v).toBe(1);
    expect(q.questions).toHaveLength(seedQuestions(NOW).length);
    expect(files.get('Rules.md')).toContain('## Rules');
  });

  it('seed per scenario', async () => {
    expect((await seeded('first')).root).toBeNull();
    expect((await seeded('empty')).paths.filter((p) => p.startsWith('Inbox/'))).toEqual([]);
    const back = await seeded('back');
    const run = JSON.parse(back.files.get(SYSTEM.lastRun) ?? '{}') as { run?: { phase: string } };
    expect(run.run?.phase).toBe('done');
    expect((await seeded('default')).files.has(SYSTEM.lastRun)).toBe(false);
  });
});

describe('what is hidden', () => {
  it('isHidden hides system files only', () => {
    expect(isHidden('.bower/changes/x.json')).toBe(true);
    expect(isHidden('index.md')).toBe(false);
    expect(isHidden('log.md')).toBe(false);
    expect(isHidden('hot.md')).toBe(false);
    expect(isHidden('Projects/.obsidian')).toBe(true);
    expect(isHidden('Projects/index.md')).toBe(false);
    expect(isHidden('Rules.md')).toBe(false);
  });
});

describe('pile ids', () => {
  it("seeded piles keep the demo's ids", async () => {
    const { drive, root } = await seeded('default');
    if (!root) throw new Error('no root');
    const all = await drive.listAll(root);
    const ids = all.filter((f) => f.appProperties?.pile).map((f) => f.appProperties?.pile).sort();
    expect(ids).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
