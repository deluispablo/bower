import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { scriptedDecisions } from '../../src/data/demo/script';
import { parseNote } from '../../src/data/contracts/note-format';
import type { TypeRow } from '../../src/data/contracts/types';
import { planScripted, runKeys, type Decisions } from '../../src/data/spine/scripted';
import { loadCase } from '../src/corpus';
import * as providers from '../src/provider';
import { readTypeTable } from '../src/type-table';
import { AT, runOnDrive, seedCase } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';

const TABLE = '.bower/type-table.json';
const HOME = 'Resources/Garden';
const oldPaging = paging.size;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000; });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPaging; });

const row = (id: string, table = ['e', 'd', 'c', 'a']): TypeRow => ({
  id, match: [id], template: 'source',
  properties: { a: { type: 'text' }, b: { type: 'text' }, c: { type: 'text' },
    d: { type: 'text' }, e: { type: 'text' }, f: { type: 'text' } }, table,
});

async function setup(table: string, names = ['Garden.txt'], request?: string) {
  const c = await loadCase(resolve(import.meta.dirname, '../../harness/corpus/b1-index-no-change'));
  c.folder = { [`${HOME}/Garden.md`]: '---\nsummary: Alex grows mint.\n---\nAlex keeps garden records.\n', [TABLE]: table };
  c.folderBinary = {}; c.inboxBinary = {}; c.questions = []; c.bowerOwned = [];
  c.journal = request ? [{ kind: 'request', text: request }] : [];
  c.inbox = names.map((name) => ({ line: '', files: [name] }));
  c.inboxFiles = Object.fromEntries(names.map((name) => [name, `${name}: Alex records garden facts.`]));
  c.scope = names.length ? 'all' : 'instructions'; c.expected = {};
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  return { c, drive, root };
}

// Replace model decisions only; admission, main, planning, manifests and writes stay real.
function decisions(extra: Partial<Decisions> = {}): void {
  vi.spyOn(providers, 'providerFor').mockImplementation((_name, drive, run) => async ({ taken }) => {
    const d: Decisions = { ...scriptedDecisions([], []),
      thing: (item) => ({ to: HOME, name: item.fileName }),
      words: () => null, ownNote: () => null, note: () => null, merge: () => null,
      pileAsk: () => null, thingAsk: () => null, askAfter: () => null, ...extra,
    };
    return (await planScripted(providers.runnerScripted(drive), taken.rootId, {
      ...run, scope: taken.scope, taken, requestId: taken.id, requestedAt: taken.at,
      decisions: d, mintKey: await runKeys(run.runId),
    })).manifest;
  });
}

async function run(base: Awaited<ReturnType<typeof setup>>, press = 1) {
  const result = await runOnDrive(base.c, base.drive, base.root, { pacing: { sleep: async () => undefined } }, press);
  expect(result.code, 'production main completes').toBe(0);
  return result;
}

it('b5b-r2 1 source role by one helper', async () => {
  const base = await setup(JSON.stringify({ v: 1, rows: [row('offer')] }), ['Offer.txt', 'Source.txt', 'Concept.txt']);
  decisions({ note: (id) => {
    const name = base.drive.pathOf(id, base.root).split('/').at(-1);
    if (!['Offer.txt', 'Source.txt', 'Concept.txt'].includes(name ?? '')) return null;
    return { name: name?.replace('.txt', '.md') ?? '', summary: 'Alex records a garden fact.',
      template: name === 'Concept.txt' ? 'concept' : 'source',
      ...(name === 'Offer.txt' ? { typeRow: 'offer', properties: {} } : {}),
      body: 'Alex grows mint. [[Garden]]',
    };
  } });
  const first = await run(base);
  for (const [name, type] of [['Offer', 'offer'], ['Source', 'source'], ['Concept', 'concept']]) {
    expect(parseNote(`${name}.md`, first.after[`${HOME}/${name}.md`] ?? '').properties)
      .toContainEqual(expect.objectContaining({ key: 'type', value: type }));
  }
  const files = await base.drive.listAll(base.root);
  const folder = files.find((file) => base.drive.pathOf(file.id, base.root) === HOME);
  const inbox = files.find((file) => base.drive.pathOf(file.id, base.root) === 'Inbox');
  expect(folder).toBeDefined(); expect(inbox).toBeDefined();
  const legacy = '---\nby: bower\ntype: source\nsummary: Alex saved a garden fact.\n---\nAlex grows mint.\n\n## Timeline\n- 2026-10-07 · Saved by Alex.\n';
  await base.drive.createText(folder?.id ?? '', 'Legacy.md', legacy);
  await base.drive.createText(inbox?.id ?? '', 'Update.txt', 'Alex reviews a garden fact.');
  const text = 'Alex reviewed the garden fact.';
  decisions({ lines: ['Offer', 'Source', 'Legacy', 'Concept'].map((name) => ({ path: `${HOME}/${name}.md`, text, cites: null })) });
  const errors = vi.spyOn(console, 'error');
  const second = await run(base, 2);
  expect(second.after[`${HOME}/Concept.md`]).not.toBe(first.after[`${HOME}/Concept.md`]);
  expect(parseNote('Concept.md', second.after[`${HOME}/Concept.md`] ?? '').timeline)
    .toContainEqual(expect.objectContaining({ text }));
  expect(second.after[`${HOME}/Source.md`], 'unclassified Source control stays immutable').toBe(first.after[`${HOME}/Source.md`]);
  expect(second.after[`${HOME}/Legacy.md`], 'legacy type: source control stays immutable').toBe(legacy);
  const refusals = errors.mock.calls.filter(([message]) => typeof message === 'string' && message.includes('Timeline line was refused (unsupported)'));
  expect(refusals.length, 'both Source controls refuse with unsupported').toBeGreaterThanOrEqual(2);
  expect.soft(second.after[`${HOME}/Offer.md`], 'classified Source keeps every byte').toBe(first.after[`${HOME}/Offer.md`]);
  expect.soft(refusals, 'classified Source refuses as the other Sources do').toHaveLength(3);
});

it('b5b-r2 2 more than four columns', async () => {
  decisions();
  for (const columns of [['e', 'd', 'c', 'b'], ['e', 'd', 'c', 'b', 'a'], ['e', 'd', 'c', 'b', 'a', 'f']]) {
    const stored = JSON.stringify({ v: 1, rows: [row('lease', columns)] });
    const base = await setup(stored);
    const result = await run(base);
    expect(result.after[`${HOME}/Garden.txt`], 'unrelated material still files').toBe('Garden.txt: Alex records garden facts.');
    const read = readTypeTable(stored);
    if (columns.length === 4) {
      expect(read.table.rows).toEqual([row('lease', columns)]);
      expect(result.after[TABLE], 'four-column control is byte-identical').toBe(stored);
    } else {
      expect.soft(read.table.rows.find((item) => item.id === 'lease')?.table, `${columns.length} stored columns project their first four`)
        .toEqual(columns.slice(0, 4));
      expect.soft(result.after[TABLE], 'an unrelated run never reseeds or drops the stored row').toBe(stored);
    }
  }
});

it('b5b-r2 3 row-level splice', async () => {
  const unchanged = '{ "id" : "permit", "match" : ["permit"], "template" : "source", "properties" : {}, "table" : [], "future_id":9007199254740993 }';
  const unknown = '"future_id":9007199254740993, "future" : { "who" : "Alex", "number" : 1e+09 }';
  const changed = JSON.stringify(row('lease')).replace(/}$/, `, ${unknown}}`);
  const prefix = '{ "v" : 1, "future_id":9007199254740993, "rows" : [\n  ';
  const suffix = `,\n\t${unchanged}\n], "future" : { "who" : "Alex" } }\n`;
  const stored = `${prefix}${changed}${suffix}`;
  const base = await setup(stored, [], 'Show b in the lease table.');
  decisions();
  const result = await run(base);
  const after = result.after[TABLE] ?? '';
  expect(readTypeTable(after).table.rows.find((item) => item.id === 'lease')?.table, 'trusted request changes only column four')
    .toEqual(['e', 'd', 'c', 'b']);
  expect.soft(after, 'unchanged row preserves its exact text').toContain(unchanged);
  expect.soft(after, 'unknown changed-row keys preserve their exact text and integer').toContain(unknown);
  expect.soft(after.startsWith(prefix), 'bytes before the changed row stay unchanged').toBe(true);
  expect.soft(after.endsWith(suffix), 'bytes after the changed row stay unchanged').toBe(true);
});
