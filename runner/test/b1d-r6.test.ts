/** TL-P4-41 addendum 23: independent reds through corpus -> runner main. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { SYSTEM } from '../../src/data/vault/layout';
import { RunnerDrive } from '../src/drive';
import { normalizeModelInput } from '../src/model-input';
import { LedgerExhausted, RunTiming } from '../src/timing';
import { AT } from './corpus-run';
import * as transport from './drive-v3';
import { candidates, empty, fileIntent, folder, HUB, media, note, report,
  run, select, setup, type Base } from './b1-planning-support';

const pageSize = transport.paging.size;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); transport.paging.size = 1000;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); transport.paging.size = pageSize; });

type Result = Awaited<ReturnType<typeof run>>;
function replies(b: Base, selection: unknown, intent: unknown, options: Parameters<typeof run>[2] = {}) {
  const values: unknown[] = [];
  return run(b, values, { ...options, beforeReply: async (turn, frame) => {
    values[turn - 1] = frame.value.selection === undefined ? selection : intent;
  } });
}
function done(r: Result) {
  expect(r.code, r.errors).toBe(0);
  expect(r.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(r.frames, 'valid selection and execution, without retries').toHaveLength(2);
}

/** ASCII makes the byte boundary exact. Only the personal region crosses 4,096. */
function owned(type: string, size = 918, summary = 'Ceramic glazing.', members = '') {
  const regions = { current: '', personal: 'PADDING\n', timeline: '', 'bower-note': '',
    ...(type === 'moc' ? { 'moc-overview': '## Overview\nA collection.\n',
      'moc-figures': '## Figures\n0 notes.\n', 'moc-members': `## Notes\n${members}` } : {}) };
  const text = `---\nsummary: ${summary}\ntype: ${type}\nby: bower\nbower_format: ownership/2\n---\n\n`
    + Object.entries(regions).map(([owner, body]) =>
      `<!-- bower:ownership/2 begin ${owner} -->\n${body}<!-- bower:ownership/2 end ${owner} -->\n`).join('\n');
  const padded = text.replace('PADDING', 'x'.repeat(size - Buffer.byteLength(text) + 'PADDING'.length));
  expect(Buffer.byteLength(padded)).toBe(size);
  expect(parseOwnership(new TextEncoder().encode(padded)).status).toBe('v2');
  return padded;
}

it('b1d-r6 A1 crossing prefixes are advisory for every note type', async () => {
  for (const type of ['source', 'concept', 'project', 'area', 'moc']) {
    const path = `Resources/Ceramics/${type}.md`;
    for (const size of [918, 4918]) {
      const text = owned(type, size);
      const b = await setup({ folder: { ...folder, [path]: text } });
      const id = b.id(path);
      const r = await replies(b, select(b, [b.id(HUB)]), fileIntent(b));
      if (size === 918) {
        done(r);
        expect(report(r).filed, `${type}: complete-prefix control files the offer`).toHaveLength(1);
      } else {
        expect(parseOwnership(new TextEncoder().encode(text.slice(0, 4096))).status).toBe('invalid');
        expect.soft(r.code, `${type}: a valid 4,918-byte unrelated note cannot fail main`).toBe(0);
        expect.soft(r.wire?.statuses.at(-1)?.phase, `${type}: unrelated work reaches done`).toBe('done');
        expect.soft(report(r).filed, `${type}: the unrelated offer still files`).toHaveLength(1);
        expect.soft(media(r, id), `${type}: an unrelated cut prefix requires no planner read; only lint's one maintenance read (AC20)`).toHaveLength(1);
        expect.soft(r.after[path], `${type}: unrelated cut bytes stay intact`).toBe(text);
      }
    }
  }
});

it('b1d-r6 A2 damaged full reads refuse only the needed note', async () => {
  const path = 'Resources/Collection/Collection.md';
  for (const damaged of [false, true]) {
    const valid = owned('moc', 918, 'Remote developer offers.');
    const text = damaged ? valid.replace('<!-- bower:ownership/2 end personal -->', '') : valid;
    expect(parseOwnership(new TextEncoder().encode(text)).status).toBe(damaged ? 'invalid' : 'v2');
    // A short MOC avoids A1: current prefix discovery already exempts MOCs.
    const b = await setup({ folder: { ...folder, [path]: text } });
    const r = await replies(b, select(b, [b.id(HUB)]), fileIntent(b));
    if (!damaged) {
      done(r);
      expect(candidates(r.frames[0], b.sources[0]?.itemId ?? '')).toContain(b.id(path));
      expect(report(r).filed).toHaveLength(1);
      expect(r.after[path], 'valid full ownership also permits ordinary MOC maintenance').not.toBe(text);
    } else {
      expect.soft(r.code, 'one damaged candidate MOC does not abort the unrelated offer').toBe(0);
      expect.soft(r.wire?.statuses.at(-1)?.phase).toBe('done');
      expect.soft(report(r).filed, 'clear work proceeds beside the refused note').toHaveLength(1);
      expect.soft(r.after[path], 'damaged owned bytes are never repaired or rewritten').toBe(text);
      expect.soft(r.errors, 'the existing refusal reports the damaged full read').toMatch(/cannot be read safely/);
    }
    expect.soft(media(r, b.id(path)), 'candidate membership uses one full cached read').toHaveLength(1);
    expect.soft(media(r, b.id('Resources/Gardening/Garden plans.md')), 'unrelated notes remain prefix-only').toHaveLength(0);
  }
});

/** Observe async provenance independently; every production maintenance/meter call still runs unchanged. */
function budgetProbe() {
  const context = new AsyncLocalStorage<boolean>();
  const sends: Array<{ url: string; afterExhaustion: boolean }> = [];
  const reads: Array<{ id: string; afterExhaustion: boolean; pending: Promise<string | null> }> = [];
  let exhausted = false;
  let refused = 0;
  const maintenance = RunTiming.prototype.maintenance;
  const meter = RunTiming.prototype.meter;
  const prefix = RunnerDrive.prototype.readPrefix;
  const maintenanceSpy = vi.spyOn(RunTiming.prototype, 'maintenance').mockImplementation(function<T>(
    this: RunTiming, task: () => Promise<T>, items?: number,
  ): Promise<T> { return context.run(true, () => maintenance.call(this, task, items)) as Promise<T>; });
  const meterSpy = vi.spyOn(RunTiming.prototype, 'meter').mockImplementation(function(this: RunTiming, fetch) {
    const measured = meter.call(this, async (url, init) => {
      if (context.getStore() && new URL(url).origin === 'https://www.googleapis.com') {
        sends.push({ url, afterExhaustion: exhausted });
      }
      return fetch(url, init);
    });
    return async (url, init) => {
      try { return await measured(url, init); }
      catch (error) {
        if (context.getStore() && error instanceof LedgerExhausted) { exhausted = true; refused++; }
        throw error;
      }
    };
  });
  const prefixSpy = vi.spyOn(RunnerDrive.prototype, 'readPrefix').mockImplementation(function(this: RunnerDrive, file, cold) {
    const pending = prefix.call(this, file, cold);
    if (context.getStore()) reads.push({ id: file.id, afterExhaustion: exhausted, pending });
    return pending; // Do not attach a rejection handler: it would conceal the B2 defect.
  });
  return { sends, reads, get refused() { return refused; }, stop() {
    maintenanceSpy.mockRestore(); meterSpy.mockRestore(); prefixSpy.mockRestore(); context.disable();
  } };
}

async function archiveRun(count: number) {
  const archive = Object.fromEntries(Array.from({ length: count }, (_, i) =>
    [`Archive/Record ${i}.md`, note('Unrelated background.', 'Archive evidence.\n')]));
  const b = await setup({ folder: { ...folder, ...archive } });
  const probe = budgetProbe();
  try {
    const r = await replies(b, select(b, [b.id(HUB)]), fileIntent(b));
    // Yield an event-loop turn, not elapsed wall time, before checking rejection handling or inspecting promises.
    let settled: PromiseSettledResult<string | null>[];
    let observed: number;
    do {
      await nextTurn();
      observed = probe.reads.length;
      settled = await Promise.allSettled(probe.reads.map((read) => read.pending));
      await nextTurn();
    } while (probe.reads.length !== observed);
    return { b, r, sends: [...probe.sends], reads: [...probe.reads], refused: probe.refused, settled };
  } finally { probe.stop(); }
}

it('b1d-r6 B1 maintenance charges every send within 300', async () => {
  const control = await archiveRun(10);
  done(control.r);
  expect(control.sends.length).toBeGreaterThan(0);
  expect(control.sends.length).toBeLessThan(300);
  expect(control.refused).toBe(0);
  const full = await archiveRun(180);
  expect(full.refused, 'the real 180-note discovery reaches the maintenance ledger').toBeGreaterThan(0);
  const archiveIds = new Set(Array.from({ length: 180 }, (_, i) => full.b.id(`Archive/Record ${i}.md`)));
  const archiveSends = full.sends.filter(({ url }) => archiveIds.has(new URL(url).pathname.split('/').at(-1) ?? ''));
  expect(archiveSends.length, 'count actual archive requests, excluding fixture seeding and inspection').toBeGreaterThan(0);
  expect.soft(archiveSends.length, '180 archive notes alone cannot exceed the whole maintenance cap').toBeLessThanOrEqual(300);
  expect.soft(full.sends.length, 'every maintenance send, including queued reads, spends the 300 allowance').toBeLessThanOrEqual(300);
  expect(full.sends.filter((send) => !send.afterExhaustion), 'the meter permits exactly 300 sends before refusing').toHaveLength(300);
  expect.soft(full.sends.filter((send) => send.afterExhaustion), 'no uncharged sends escape after exhaustion').toHaveLength(0);
  const sourcePath = full.r.pathsById[full.b.sources[0]?.itemId ?? ''] ?? '';
  // c12-warm-start (WS1): discovery's exhaustion no longer holds the run; its progress and log go outside the ledger.
  expect(sourcePath, 'the run plans on what it knows and files the source').toBe('Projects/Remote search/Offer.txt');
  expect(full.r.after[sourcePath], 'the filed source keeps its bytes').toBe(full.b.c.inboxFiles['Offer.txt']);
});

it('b1d-r6 B2 exhaustion stops read-ahead and handles pending rejections', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
  process.on('unhandledRejection', onUnhandled);
  try {
    const control = await archiveRun(10);
    done(control.r);
    expect(control.settled.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(unhandled).toEqual([]);
    const full = await archiveRun(180);
    expect(full.refused).toBeGreaterThan(0);
    expect(full.settled.some((result) => result.status === 'rejected'
      && result.reason instanceof LedgerExhausted), 'pending reads retain their budget rejection').toBe(true);
    expect.soft(full.reads.filter((read) => read.afterExhaustion), 'the queue starts no more reads after exhaustion').toHaveLength(0);
    expect.soft(full.sends.filter((send) => send.afterExhaustion), 'queued reads cannot send after exhaustion').toHaveLength(0);
    expect.soft(unhandled, 'all pending read rejections have production handlers').toEqual([]);
  } finally { process.off('unhandledRejection', onUnhandled); }
});

it('b1d-r6 C1 request pins count per source', async () => {
  const groups = [['Alpha', 'Beta', 'Gamma'], ['Delta', 'Epsilon', 'Zeta']];
  for (const count of [1, 2]) {
    const b = await setup({ inbox: [{ line: 'Update notes.', files: [] }], folder: { ...folder,
      ...Object.fromEntries(groups.flat().map((name) => [`Resources/Records/${name}.md`,
        note('Independent evidence.', '## Current state\n\n## Timeline\n', true)])),
    } });
    for (const pile of b.admission.piles) await b.drive.trash(pile.anchor?.fileId ?? '');
    b.c.inbox = []; b.c.scope = 'instructions';
    const items = [];
    for (const [i, names] of groups.slice(0, count).entries()) {
      const request = await b.drive.createText(b.id(SYSTEM.changes), `request-${i}.json`, JSON.stringify({
        v: 1, id: `request-${i}`, device: 'device-1', kind: 'request', at: AT - 2 + i,
        what: 'Asked Bower to update notes', text: `Update ${names.map((name) => `[[${name}]]`).join(', ')}.`,
      }));
      items.push({ itemId: request.id, kind: 'unknown', destination: b.id('Resources/Records'),
        wants: names.map((name) => b.id(`Resources/Records/${name}.md`)) });
    }
    const admitted = await planAdmission(fakeRead(b.drive), b.root, {
      scope: 'instructions', clock: () => AT, newId: () => 'r6-requests',
    });
    expect(admitted.kind).toBe('manifest');
    if (admitted.kind !== 'manifest') throw new Error('Expected request admission.');
    expect(admitted.manifest.journal).toHaveLength(count);
    expect(new Set(items.flatMap((item) => item.wants)).size).toBe(count * 3);
    const selection = { items, asks: [] };
    const r = await replies(b, selection, empty, { admission: admitted.manifest });
    if (count === 1) done(r);
    expect.soft(r.code, `${count} independent requests each fit their own five-note allowance`).toBe(0);
    expect.soft(r.frames[1]?.value.selection, 'both requests reach execution without selection retries').toEqual(selection);
    expect.soft(r.wire?.statuses.at(-1)?.phase, 'execution completes for all admitted requests').toBe('done');
  }
});

it('b1d-r6 C2 MOC member ids have one stable fingerprint', async () => {
  const map = 'Resources/Collection/Collection.md';
  const member = 'Resources/Collection/Record.md';
  const fingerprints: string[] = [];
  const inputs: string[] = [];
  const memberIds: string[] = [];
  const createDrive = transport.fixedDrive;
  // Same physical ids twice is the positive control; only the third run shifts the id allocator.
  for (const offset of [0, 0, 10]) {
    const drive = createDrive();
    for (let i = 0; i < offset; i++) await drive.createFolder('root', `Outside ${i}`);
    const factory = vi.spyOn(transport, 'fixedDrive').mockReturnValue(drive);
    let b: Base;
    try { b = await setup({ folder: { ...folder,
      [map]: owned('moc', 918, 'Remote developer offers.', '- [[Record]]\n'),
      [member]: note('Ceramic glazing.', 'Member evidence.\n'),
    } }); } finally { factory.mockRestore(); }
    const r = await replies(b, select(b, [b.id(map)]), fileIntent(b));
    done(r);
    const cards = r.frames[0]?.value.cards as Array<{ id: string; members?: string[] }>;
    expect(cards.find((card) => card.id === b.id(map))?.members, 'the actual main input exposes the MOC member').toEqual([b.id(member)]);
    memberIds.push(b.id(member));
    inputs.push(r.frames[0]?.call.input ?? '');
    const fingerprint = /\binput=([a-f0-9]{12})\b/.exec(r.consoleLines.find((line) => line.startsWith('timing:')) ?? '')?.[1];
    expect(fingerprint).toBeDefined(); fingerprints.push(fingerprint ?? '');
  }
  expect(fingerprints[1], 'identical complete runs are the stable positive control').toBe(fingerprints[0]);
  expect(memberIds[2], 'the failing case actually changes physical ids').not.toBe(memberIds[0]);
  expect.soft(fingerprints[2], 'fresh physical member ids cannot change the semantic fingerprint').toBe(fingerprints[0]);
  expect.soft(normalizeModelInput(inputs[2] ?? ''), 'normalization retains membership without fresh ids').toBe(normalizeModelInput(inputs[0] ?? ''));
});
