import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Proposal, Question, TypeRow } from '../../src/data/contracts/types';
import { loadCase } from '../src/corpus';
import { readTypeTable } from '../../src/data/contracts/note-format';
import { phaseAwareClaude } from './b1-planning-support';
import { AT, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive, paging } from './drive-v3';

const TABLE = '.bower/type-table.json';
const HOME = 'Resources/Garden';
const HUB = `${HOME}/Garden.md`;
const oldPaging = paging.size;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000; });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); paging.size = oldPaging; });

const row = (id: string): TypeRow => ({ id, match: [id], template: 'source',
  properties: { company: { type: 'text' }, tags: { type: 'list' }, hours: { type: 'number' },
    cost: { type: 'money' }, date: { type: 'date' }, stage: { type: 'enum', values: ['new', 'reviewed'] } },
  table: ['company', 'hours', 'cost', 'date'],
});
const proposal = (id: string, declaration = row(id)): Proposal => ({ id, payload: { kind: 'type-row', row: declaration } });
const question = (p: Proposal): Question => ({ id: `q-proposal-${p.id}`, text: `Remember ${p.id} as a type?`,
  yes: 'Yes', no: 'No', askedAt: AT, proposal: p });
const questionsOf = (result: CaseRun): Question[] =>
  (JSON.parse(result.after['.bower/questions.json'] ?? '{"questions":[]}') as { questions: Question[] }).questions;
const artifactsOf = (result: CaseRun): string[] => Object.keys(result.after).filter((path) => path.startsWith('.bower/proposals/'));

async function run(names: string[], proposals: Proposal[] = [], prior: Question[] = []) {
  const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/b1-index-no-change'));
  const table = JSON.stringify(readTypeTable(null).table);
  c.folder = { [HUB]: '---\nsummary: Alex grows mint.\n---\nAlex keeps garden records.\n', [TABLE]: table };
  c.folderBinary = {}; c.inboxBinary = {}; c.journal = []; c.questions = prior; c.bowerOwned = [];
  c.inbox = names.map((name) => ({ line: '', files: [name] }));
  c.inboxFiles = Object.fromEntries(names.map((name) => [name, `Alex keeps ${name.replace('.txt', '').toLowerCase()} material for the garden.`]));
  c.scope = 'all'; c.expected = {}; c.presses = undefined; c.between = undefined;
  const drive = fixedDrive();
  const root = await seedCase(drive, c);
  const replies: unknown[] = [];
  const result = await runOnDrive(c, drive, root, { pacing: { sleep: async () => undefined },
    claude: phaseAwareClaude(async (call) => {
      const shown = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as {
        piles: Array<{ pileId: string; things: Array<{ fileId: string; name: string }> }>;
      };
      const intent = { kind: 'tidy-intent', v: 1,
        things: shown.piles.flatMap((pile) => pile.things.map((item) => ({ fileId: item.fileId, to: HOME,
          name: item.name, basis: HUB, note: { name: item.name.replace('.txt', ' source.md'),
            summary: 'Alex keeps garden material.', body: 'Alex keeps garden material. [[Garden]]' } }))),
        // This optional reply section binds after-filing questions to admitted piles, using the existing askAfter seam.
        ...(proposals.length ? { askAfter: shown.piles.flatMap((pile) => {
          const p = proposals.find((candidate) => pile.things.some((item) => item.name.toLowerCase() === `${candidate.id}.txt`));
          return p ? [{ pileId: pile.pileId, text: question(p).text, yes: 'Yes', no: 'No', proposal: p }] : [];
        }) } : {}),
      };
      replies.push(intent);
      return { code: 0, stderr: '', cut: null,
        stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(intent) }) };
    }, () => ({ drive, root })) }, 1);
  return { result, replies, table, inbox: c.inboxFiles };
}

it('b5b-r2 4 live proposal reaches admission', async () => {
  const plain = await run(['Garden.txt']);
  expect(plain.result.code, 'legacy reply without a proposal still files').toBe(0);
  expect(plain.result.after[`${HOME}/Garden.txt`]).toBe(plain.inbox['Garden.txt']);
  expect(questionsOf(plain.result)).toEqual([]);
  expect(artifactsOf(plain.result)).toEqual([]);
  expect(plain.result.after[TABLE]).toBe(plain.table);

  const invalidRows = [
    { ...row('lease'), match: ['x'.repeat(201)] },
    { ...row('lease'), properties: { stage: { type: 'enum', values: Array.from({ length: 21 }, (_, i) => `stage-${i}`) } }, table: ['stage'] },
    { ...row('lease'), table: ['company', 'hours', 'cost', 'date', 'stage'] },
    { ...row('lease'), unruled: 'Alex' },
  ];
  for (const invalid of invalidRows) {
    const { result, table, inbox } = await run(['Lease.txt'], [proposal('lease', invalid)]);
    expect([0, 1], 'invalid payload is ignored or the reply is refused').toContain(result.code);
    expect(questionsOf(result), 'invalid payload cannot become a question').toEqual([]);
    expect(artifactsOf(result), 'invalid payload cannot be frozen').toEqual([]);
    expect(result.after[TABLE], 'a proposal never installs its row without consent').toBe(table);
    if (result.code === 1) {
      expect(result.wire?.statuses.at(-1)?.phase, 'refusal is reported').toBe('failed');
      expect(result.after['Inbox/Lease.txt'], 'refused reply leaves original material intact').toBe(inbox['Lease.txt']);
      expect(result.after[`${HOME}/Lease.txt`]).toBeUndefined();
    } else expect(result.after[`${HOME}/Lease.txt`], 'ignored payload still files').toBe(inbox['Lease.txt']);
  }

  const boundary = row('lease');
  boundary.match = ['x'.repeat(200)];
  boundary.properties.stage = { type: 'enum', values: Array.from({ length: 20 }, (_, i) => `stage-${i}`) };
  const offered = [proposal('lease', boundary), proposal('permit'), proposal('receipt')];
  for (const open of [0, 4, 5]) {
    const prior = Array.from({ length: open }, (_, i) => question(proposal(`old-${i}`)));
    const { result, replies, table, inbox } = await run(['Lease.txt', 'Permit.txt', 'Receipt.txt'], offered, prior);
    expect(replies.at(-1), 'the scripted Claude reply carries all three payloads').toMatchObject({
      askAfter: offered.map((p) => ({ proposal: p })),
    });
    expect.soft(result.code, 'Claude schema accepts valid payloads and main files novel material').toBe(0);
    for (const name of ['Lease.txt', 'Permit.txt', 'Receipt.txt']) {
      expect.soft(result.after[`${HOME}/${name}`], 'novel material files even when proposal capacity is full').toBe(inbox[name]);
    }
    const admitted = offered.slice(0, Math.min(2, 5 - open));
    expect.soft(questionsOf(result), 'modelDecisions forwards askAfter to the existing admission in item order')
      .toEqual([...prior, ...admitted.map(question)]);
    expect.soft(artifactsOf(result).sort(), 'third new proposal and sixth open proposal are ignored')
      .toEqual(admitted.map((p) => `.bower/proposals/${p.id}.json`).sort());
    for (const p of admitted) {
      expect.soft(JSON.parse(result.after[`.bower/proposals/${p.id}.json`] ?? 'null'), 'frozen payload equals authoritative question')
        .toEqual({ v: 1, ...p });
    }
    expect(result.after[TABLE], 'admission asks for consent without installing a row').toBe(table);
  }
});
