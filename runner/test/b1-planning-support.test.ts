import { describe, expect, it } from 'vitest';
import { empty, fileIntent, phaseAwareClaude, reply, setup } from './b1-planning-support';
import type { ClaudeCall, ClaudeExit } from '../src/claude';

const value = (exit: ClaudeExit): unknown => JSON.parse((JSON.parse(exit.stdout) as { result: string }).result);

describe('fixture selection and execution transport', () => {
  it('selects only the execution source and target note ids', async () => {
    const b = await setup({ inbox: [{ line: 'Two offers.', files: ['Offer.txt', 'Second.txt'] }] });
    const first = b.sources[0]?.itemId ?? '';
    const intent = { ...fileIntent(b), things: fileIntent(b).things.slice(0, 1),
      lines: [{ note: 'Resources/Careers/Applications.md', cites: first, text: 'Alex has an offer.' }] };
    const spawn = phaseAwareClaude(() => reply(intent), () => ({ drive: b.drive, root: b.root, admission: b.admission }));
    const call = (selection?: unknown): ClaudeCall => ({ command: 'claude', args: [], env: {}, cwd: '/tmp/fixture-step',
      input: JSON.stringify({ piles: b.admission.piles.map((p) => ({ pileId: p.pileId,
        things: p.items.filter((i) => i.name !== 'Pile note.md').map((i) => ({ fileId: i.fileId })) })),
        ...(selection ? { selection } : {}) }), timeoutMs: 1000, maxBytes: 1000 });
    const selection = value(await spawn(call()));
    expect(selection).toEqual({ items: [{ itemId: first, kind: 'unknown', destination: b.id('Projects/Remote search'),
      wants: [b.id('Resources/Careers/Applications.md')] }], asks: [] });
    expect(value(await spawn(call(selection)))).toEqual(intent);
  });

  it('freezes exactly the execution asking and its folder option ids', async () => {
    const b = await setup();
    const ask = { fileId: b.sources[0]?.itemId ?? '', text: 'Where should Alex keep this?', yes: 'Here', no: 'Elsewhere',
      options: ['Projects/Remote search', 'Resources'].map((path) => ({ folderId: b.id(path), label: path })) };
    const intent = { ...empty, asks: [ask] };
    const spawn = phaseAwareClaude(() => reply(intent), () => ({ drive: b.drive, root: b.root, admission: b.admission }));
    const call: ClaudeCall = { command: 'claude', args: [], env: {}, cwd: '/tmp/fixture-asking',
      input: JSON.stringify({ piles: [{ pileId: b.sources[0]?.pileId, things: [{ fileId: ask.fileId }] }] }),
      timeoutMs: 1000, maxBytes: 1000 };
    const selection = value(await spawn(call));
    expect(selection).toEqual({ items: [{ itemId: ask.fileId, kind: 'unknown', destination: b.id('Resources'), wants: [] }], asks: [ask] });
    expect(value(await spawn({ ...call, input: JSON.stringify({ piles: [], selection }) }))).toEqual(intent);
  });

  it('retries the same semantic kind and preserves the execution attempt index', async () => {
    const b = await setup(); const phases: Array<[string, number]> = [];
    const spawn = phaseAwareClaude((_call, _step, attempt, phase) => {
      phases.push([phase, attempt]); return reply(empty);
    }, () => ({ drive: b.drive, root: b.root, admission: b.admission }));
    const call = (execution = false, retry = false): ClaudeCall => ({ command: 'claude', args: [], env: {},
      cwd: '/tmp/fixture-retry', input: `${retry ? 'Your reply was refused: fixture.\n' : ''}${JSON.stringify({ piles: [],
        ...(execution ? { selection: { items: [], asks: [] } } : {}) })}`, timeoutMs: 1000, maxBytes: 1000 });
    const selected = await spawn(call());
    expect(await spawn(call(false, true))).toEqual(selected);
    expect(value(await spawn(call(true)))).toEqual(empty);
    expect(value(await spawn(call(true, true)))).toEqual(empty);
    expect(phases).toEqual([['selection', 0], ['selection', 1], ['execution', 0], ['execution', 1]]);
    expect(phaseAwareClaude(spawn)).toBe(spawn);
  });
});
