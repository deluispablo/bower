import fc from 'fast-check';
import { expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { driveError, driveFailure } from '../drive/drive-api';
import { seedFakeDrive } from '../fake/seed';
import { isJournalRecord, pairsOf, type JournalRecord } from '../contracts/journal-record';
import { BowerError } from '../types';
import { DriveVault } from './drive-vault';
import { Journal, outboxKey } from './journal';

// TL-P4-28(2): the implementer must not change this adversarial red.
// Standard model runner: https://fast-check.dev/docs/advanced/model-based-testing/
// fakeLocks in upload-queue.test.ts is local, not exported. Reuse its held/waiting/wake
// stub here, adapting request's two-argument form and preserving the callback result.
function webLocks() {
  const held = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();
  return {
    async request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      if (held.has(name)) await new Promise<void>((resolve) => {
        waiting.set(name, [...(waiting.get(name) ?? []), resolve]);
      });
      held.add(name);
      try { return await callback(); }
      finally {
        held.delete(name);
        waiting.get(name)?.shift()?.();
      }
    },
  };
}

class Tab extends DriveVault {
  // Expose the real port for direct record/retract commands, not Journal internals.
  port(): Journal { return this.journal; }
}

type Outcome = 'landed' | 'refused' | 'unknown' | 'offline' | 'signin' | 'permission';
type Kind = 'bin' | 'move' | 'add' | 'remove';
interface Change {
  line: JournalRecord;
  kind: Kind;
  tab: number;
  undone: boolean;
  undo?: () => Promise<unknown>;
}
interface Model { changes: Change[] }
interface Real {
  drive: FakeDrive;
  root: string;
  tabs: [Tab, Tab];
  outcome: Outcome;
  observed: Map<string, JournalRecord>;
  arrivals: JournalRecord[];
  attempts: JournalRecord[];
  dropped: Set<string>;
  refused: Set<string>;
  confirmed: Set<string>;
  fifoViolations: string[];
  baselineRules: Set<string>;
  baselineThings: Map<string, string>;
  decisions: Array<{ id: string; result: 'dropped' | 'sent' }>;
  reserveGate?: () => Promise<void>;
}

function tabAt(r: Real, tab: number): Tab { return tab % 2 === 0 ? r.tabs[0] : r.tabs[1]; }

// Only transport errors are accepted as an unresolved send. Assertions and coding errors propagate.
async function transport(work: () => Promise<unknown>): Promise<void> {
  try { await work(); }
  catch (e) {
    if (!(e instanceof BowerError)) throw e;
    expect(['offline', 'auth', 'unknown']).toContain(e.code);
  }
}

async function driveLines(r: Real): Promise<JournalRecord[]> {
  // Independent oracle input: raw Drive bytes, never Journal.list/outbox/cache.
  const lines: JournalRecord[] = [];
  for (const [path, text] of r.drive.dump(r.root)) {
    if (!path.startsWith('.bower/changes/') || !path.endsWith('.json')) continue;
    const value: unknown = JSON.parse(text);
    expect(isJournalRecord(value)).toBe(true);
    if (isJournalRecord(value)) lines.push(value);
  }
  return lines.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

async function observe(r: Real): Promise<void> {
  for (const line of [...await tabAt(r, 0).port().list(), ...r.attempts]) r.observed.set(line.id, line);
}

async function invariants(r: Real): Promise<void> {
  // TL-P4-27 addendum 4(5): transport observations are asserted outside Journal's error-catching boundary.
  expect(r.fifoViolations).toEqual([]);
  const sent = new Set<string>();
  for (const line of r.arrivals) {
    // TL-P4-27 addendum 2(2), superseded lock scope in addendum 4(6).
    expect(r.dropped.has(line.id), `dropped ${line.id} reached Drive`).toBe(false);
    // TL-P4-27 addendum 2(3), addendum 4(5): original before inverse, no failed inverse.
    if (line.undoes) {
      expect(sent.has(line.undoes), `inverse preceded ${line.undoes}`).toBe(true);
      expect(r.refused.has(line.undoes)).toBe(false);
    }
    sent.add(line.id);
  }
  // TL-P4-27 addendum 4(5): first unresolved/waits head blocks all later lines.
  // at is globally monotonic in this fixture, so it is also admission order across tabs.
  const ordered = [...r.observed.values()].sort((a, b) => a.at - b.at);
  let blocked = false;
  let lastAt = -Infinity;
  for (const line of ordered) {
    if (r.dropped.has(line.id) || r.refused.has(line.id)) continue;
    if (!sent.has(line.id)) blocked = true;
    else expect(blocked, `FIFO passed unresolved ${line.id}`).toBe(false);
  }
  for (const line of r.arrivals) {
    expect(line.at).toBeGreaterThanOrEqual(lastAt);
    lastAt = line.at;
  }
  // TL-P4-27 addendum 4(5): a failed original cannot acquire a sent inverse later.
  const failed = await tabAt(r, 0).port().failed();
  for (const { id } of failed) {
    expect(r.arrivals.some((line) => line.undoes === id)).toBe(false);
  }
}

async function change(m: Model, r: Real, kind: Kind, tab: number, api: boolean): Promise<void> {
  const client = tabAt(r, tab);
  const n = r.observed.size;
  const text = `Keep category ${n} together`;
  let undo: Change['undo'];
  let fileId: string | undefined;
  let path: string | undefined;
  let removal: string | undefined;
  // Seed physical things without recording a create, so Bin tests cannot fold the create instead.
  if (kind === 'bin' || kind === 'move') {
    const parent = (await r.drive.listAll(r.root)).find((f) => f.folder && f.name === 'Resources');
    if (!parent) throw new Error('Missing Resources fixture');
    const f = await r.drive.createText(parent.id, `Thing ${n}.md`, '# Thing\n');
    fileId = f.id;
    path = `Resources/${f.name}`;
    r.baselineThings.set(f.id, path);
  }
  if (kind === 'remove') {
    // Independent subjects keep the person-state oracle separate from Journal's folding mechanisms.
    removal = [...r.baselineRules].find((text) => !m.changes.some((c) => c.line.removes === text));
    if (!removal) return;
  }
  await Promise.all(r.tabs.map((t) => t.refresh()));
  const before = new Set(r.observed.keys());
  await transport(async () => {
    if (!api) {
      await client.port().record(kind === 'bin' ? 'trash' : kind === 'move' ? 'move' : 'rule', text,
        kind === 'bin' ? { path, fileId } : kind === 'move' ? { from: path, path: `Areas/Thing ${n}.md`, fileId } :
          kind === 'add' ? { text, path: 'Rules.md' } : { removes: removal, path: 'Rules.md' });
    } else if (kind === 'bin') {
      if (!path) throw new Error('Missing Bin path');
      const originalPath = path;
      await client.trash(originalPath);
      undo = () => client.restore(originalPath);
    } else if (kind === 'move') {
      if (!path) throw new Error('Missing move path');
      const moved = await client.move(path, 'Areas');
      undo = async () => { await client.refresh(); return client.move(moved, 'Resources', { undo: true }); };
    } else if (kind === 'add') {
      const rule = await client.addRule(text);
      undo = () => client.removeRule(rule.id);
    } else {
      const rule = (await client.rules()).find((rule) => rule.text === removal);
      if (!rule) throw new Error('Missing baseline rule');
      if (rule.pending) {
        // This is a distinct forward removal, rather than folding an earlier pending add.
        await client.port().record('rule', 'Removed the rule', { removes: removal, path: 'Rules.md' });
      } else undo = await client.removeRule(rule.id);
    }
  });
  await observe(r);
  const original = [...r.observed.values()].find((line) => !before.has(line.id));
  if (!original) throw new Error('The change did not record a line');
  // Addendum 4(5): record's immediate refusal offers no Undo. Retry refusals of already offered lines do.
  if (r.refused.has(original.id)) return;
  m.changes.push({ line: original, kind, tab, undone: false, ...(undo ? { undo } : {}) });
}

async function undo(m: Model, r: Real, index: number, tab: number, api: boolean): Promise<void> {
  const c = m.changes[index % m.changes.length];
  if (!c) return;
  // A dropped change has no second Undo button. Two-tab repeated Undo is exercised for sent changes.
  if (c.undone && r.dropped.has(c.line.id)) return;
  const before = new Set(r.observed.keys());
  const decisionCount = r.decisions.length;
  try {
  if (api && c.undo && !c.undone && !r.refused.has(c.line.id)) {
    await c.undo();
  } else {
    const journal = tabAt(r, tab).port();
    const result = await journal.retract(c.line.id);
    if (result === 'sent') {
      const extra = c.kind === 'add' ? { removes: c.line.text, path: 'Rules.md' } :
        c.kind === 'remove' ? { text: c.line.removes, path: 'Rules.md' } :
          { fileId: c.line.fileId, path: c.line.from ?? c.line.path, from: c.line.path };
      await journal.record(c.kind === 'add' || c.kind === 'remove' ? 'rule' : 'move', 'Undid the change',
        { ...extra, undoes: c.line.id });
    }
  }
  } catch (e) {
    // Addendum 2(6), 4(5): an inverse whose send was refused/waits has not resolved its Undo.
    if (!(e instanceof BowerError)) throw e;
    expect(['offline', 'auth', 'unknown']).toContain(e.code);
    await observe(r);
    return;
  }
  await observe(r);
  const decision = r.decisions.slice(decisionCount).find((d) => d.id === c.line.id);
  // TL-P4-27 addendum 4(3): every production Undo uses retract, never remove or a separate decision.
  expect(decision, `Undo bypassed retract for ${c.kind}`).toBeDefined();
  const added = [...r.observed.values()].filter((line) => !before.has(line.id));
  // TL-P4-27 addendum 4(3),(5): a resolved Undo drops and records nothing, or records exactly one inverse.
  if (decision?.result === 'dropped') expect(added).toEqual([]);
  else {
    expect(added).toHaveLength(1);
    expect(added[0]?.undoes).toBe(c.line.id);
  }
  c.undone = true;
}

async function oracle(m: Model, r: Real): Promise<void> {
  const lines = await driveLines(r);
  const things = new Map<string, string | null>(r.baselineThings);
  const rules = new Set(r.baselineRules);
  // TL-P4-27 addendum 4(7): independent Drive-only replay in at order.
  // Addendum 3: pairsOf affects rows/counts ONLY; replay must apply BOTH lines.
  for (const line of lines) {
    if (line.kind === 'rule') {
      if (line.removes) rules.delete(line.removes);
      else if (line.text) rules.add(line.text);
    } else if (line.fileId) {
      if (line.kind === 'trash') things.set(line.fileId, null);
      else if (line.kind === 'move') things.set(line.fileId, line.path ?? null);
    }
  }
  const expectedThings = new Map<string, string | null>(r.baselineThings);
  const expectedRules = new Set(r.baselineRules);
  // Expectation comes from the person's commands and Undo choices, not from the observed Drive lines.
  for (const c of m.changes) {
    if (c.undone) continue;
    if (c.kind === 'add' && c.line.text) expectedRules.add(c.line.text);
    if (c.kind === 'remove' && c.line.removes) expectedRules.delete(c.line.removes);
    if (c.line.fileId && c.kind === 'bin') expectedThings.set(c.line.fileId, null);
    if (c.line.fileId && c.kind === 'move') expectedThings.set(c.line.fileId, c.line.path ?? null);
  }
  expect(things).toEqual(expectedThings);
  expect(rules).toEqual(expectedRules);
  // TL-P4-27 addendum 3 and addendum 4(2): hide every inverse, including two tabs' inverses of one original.
  const pairedIds = new Set(lines.flatMap((line) => line.undoes && lines.some((x) => x.id === line.undoes)
    ? [line.id, line.undoes] : []));
  expect(new Set(pairsOf(lines))).toEqual(pairedIds);
  expect(lines.filter((line) => !pairedIds.has(line.id)).map((line) => line.id).sort())
    .toEqual(m.changes.filter((c) => !c.undone).map((c) => c.line.id).sort());
}

type Action = { op: 'change'; kind: Kind; tab: number; api: boolean } |
  { op: 'undo' | 'race'; index: number; tab: number; api: boolean } |
  { op: 'send'; outcome: Outcome; tab: number };
class Command implements fc.AsyncCommand<Model, Real> {
  constructor(readonly action: Action) {}
  check(m: Readonly<Model>): boolean { return this.action.op === 'change' || this.action.op === 'send' || m.changes.length > 0; }
  toString(): string { return JSON.stringify(this.action); }
  async run(m: Model, r: Real): Promise<void> {
    const a = this.action;
    if (a.op === 'change') await change(m, r, a.kind, a.tab, a.api);
    else if (a.op === 'send') {
      r.outcome = a.outcome;
      await transport(() => tabAt(r, a.tab).port().flush());
    } else if (a.op === 'undo') await undo(m, r, a.index, a.tab, a.api);
    else {
      // Addendum 4(6),(7): another tab presses Undo while the locked retry reserves ids.
      r.outcome = 'offline';
      await change(m, r, 'add', a.tab, false);
      let entered!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => { entered = resolve; });
      const gate = new Promise<void>((resolve) => { release = resolve; });
      r.reserveGate = async () => { entered(); await gate; };
      r.outcome = 'landed';
      const send = transport(() => tabAt(r, a.tab).port().flush());
      await reached;
      const takingBack = undo(m, r, m.changes.length - 1, 1 - a.tab, false);
      release();
      await Promise.all([send, takingBack]);
      delete r.reserveGate;
    }
    await observe(r);
    await invariants(r);
  }
}

async function setup(): Promise<Real> {
  localStorage.clear();
  vi.stubGlobal('navigator', { locks: webLocks() });
  let now = Date.parse('2026-10-09T10:00:00Z');
  vi.spyOn(Date, 'now').mockImplementation(() => ++now);
  const drive = new FakeDrive({ clock: () => ++now });
  const root = await seedFakeDrive(drive, 'default', now);
  if (!root) throw new Error('Missing fake root');
  const tabs: [Tab, Tab] = [0, 1].map((tab) => new Tab({ drive, rootId: async () => root,
    device: `tab-${tab}`, runningPiles: () => new Set() })) as [Tab, Tab];
  const baselineRules = new Set((await tabs[0].rules()).map((rule) => rule.text));
  const r: Real = { drive, root, tabs, baselineRules, baselineThings: new Map(), outcome: 'landed',
    observed: new Map(), arrivals: [], attempts: [], dropped: new Set(), refused: new Set(),
    confirmed: new Set(), fifoViolations: [], decisions: [] };
  const create = drive.createText.bind(drive);
  const reserve = drive.generateIds.bind(drive);
  const get = drive.get.bind(drive);
  const blind = new Set<string>();
  const recordOfFile = new Map<string, string>();
  vi.spyOn(drive, 'generateIds').mockImplementation(async (count) => {
    await r.reserveGate?.();
    if (r.outcome === 'offline') throw driveError('offline');
    return reserve(count);
  });
  vi.spyOn(drive, 'get').mockImplementation(async (...args) => {
    if (blind.has(args[0])) throw driveError('offline');
    const file = await get(...args);
    const id = recordOfFile.get(file.id);
    if (id) r.confirmed.add(id);
    return file;
  });
  vi.spyOn(drive, 'createText').mockImplementation(async (...args) => {
    if (!args[1].endsWith('.json') || !isJournalRecord(JSON.parse(args[2]))) return create(...args);
    const line = JSON.parse(args[2]) as JournalRecord;
    // TL-P4-27 addendum 4(5): even a refused later line must not be attempted past a blocked head.
    // A physically landed unknown is still unresolved until the reserved-id read acknowledges it.
    const blockers = [...r.observed.values()].filter((earlier) => earlier.at < line.at &&
      !r.confirmed.has(earlier.id) && !r.dropped.has(earlier.id) && !r.refused.has(earlier.id));
    if (blockers.length) r.fifoViolations.push(`${line.id} passed ${blockers.map((earlier) => earlier.id).join(',')}`);
    r.attempts.push(line);
    // The fake Drive owns duplicate-id conflicts. A previously landed line cannot later be refused as a new create.
    if (r.arrivals.some((x) => x.id === line.id) && !['offline', 'signin', 'permission'].includes(r.outcome)) {
      blind.delete(args[4] ?? '');
      return create(...args);
    }
    if (r.outcome === 'refused') { r.refused.add(line.id); throw driveFailure('unknown', 'permanent'); }
    if (r.outcome === 'offline') throw driveError('offline');
    if (r.outcome === 'signin' || r.outcome === 'permission') throw driveFailure('auth', 'wait');
    blind.delete(args[4] ?? '');
    const file = await create(...args);
    recordOfFile.set(file.id, line.id);
    if (!r.arrivals.some((x) => x.id === line.id)) r.arrivals.push(line);
    if (r.outcome === 'unknown') { blind.add(file.id); throw driveError('offline'); }
    r.confirmed.add(line.id);
    return file;
  });
  for (const tab of tabs) {
    const journal = tab.port();
    // Deliberately no fallback to remove(): this API is the expected red on the old implementation.
    const retract: (id: string) => Promise<'dropped' | 'sent'> = journal.retract.bind(journal);
    vi.spyOn(journal, 'retract').mockImplementation(async (id: string): Promise<'dropped' | 'sent'> => {
      const waiting = JSON.parse(localStorage.getItem(outboxKey(root)) ?? '[]') as
        Array<{ line: JournalRecord; reserved?: string }>;
      const wasReserved = waiting.some((w) => w.line.id === id && w.reserved !== undefined);
      const result = await retract(id);
      r.decisions.push({ id, result });
      if (result === 'dropped') {
        // TL-P4-27 addendum 4(3): a previously reserved line can drop only after a permanent refusal.
        expect(wasReserved && !r.refused.has(id)).toBe(false);
        r.dropped.add(id);
      }
      return result;
    });
  }
  return r;
}

it('TL-P4-28(2): compensating Undo preserves FIFO and the Drive-only person-state oracle', async () => {
  const command = fc.oneof(
    fc.record({ op: fc.constant('change' as const), kind: fc.constantFrom<Kind>('bin', 'move', 'add', 'remove'),
      tab: fc.integer({ min: 0, max: 1 }), api: fc.boolean() }),
    fc.record({ op: fc.constantFrom('undo' as const, 'race' as const), index: fc.nat(30),
      tab: fc.integer({ min: 0, max: 1 }), api: fc.boolean() }),
    fc.record({ op: fc.constant('send' as const), outcome: fc.constantFrom<Outcome>('landed', 'refused', 'unknown',
      'offline', 'signin', 'permission'), tab: fc.integer({ min: 0, max: 1 }) }),
  ).map((action) => new Command(action));
  await fc.assert(fc.asyncProperty(fc.commands([command], { maxCommands: 24 }), fc.boolean(), async (commands, undoAll) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let r: Real | undefined;
    try {
      r = await setup();
      const real = r;
      const state = { model: { changes: [] } as Model, real };
      // A mandatory coverage spine makes every run exercise each kind, outcome and production Undo site.
      for (const kind of ['bin', 'move', 'add', 'remove'] as const) {
        await new Command({ op: 'change', kind, tab: 0, api: true }).run(state.model, r);
        await new Command({ op: 'undo', index: state.model.changes.length - 1, tab: 1, api: true }).run(state.model, r);
      }
      for (const outcome of ['offline', 'unknown', 'signin', 'permission', 'refused', 'landed'] as const) {
        r.outcome = 'offline';
        await new Command({ op: 'change', kind: 'add', tab: 0, api: false }).run(state.model, r);
        const head = state.model.changes.length - 1;
        await new Command({ op: 'send', outcome, tab: 1 }).run(state.model, r);
        await new Command({ op: 'change', kind: 'add', tab: 1, api: false }).run(state.model, r);
        r.outcome = 'landed';
        await new Command({ op: 'undo', index: head, tab: 1, api: false }).run(state.model, r);
      }
      await new Command({ op: 'race', index: 0, tab: 0, api: false }).run(state.model, r);
      // Addendum 4(2),(7): two tabs undo one sent original; both inverses must hide with it.
      await new Command({ op: 'undo', index: 0, tab: 1, api: false }).run(state.model, r);
      await fc.asyncModelRun(() => state, commands);
      r.outcome = 'landed';
      await transport(() => real.tabs[0].port().flush());
      for (let index = 0; index < state.model.changes.length; index++) {
        const c = state.model.changes[index];
        if (c && !c.undone && (undoAll || r.refused.has(c.line.id))) await undo(state.model, r, index, index % 2, false);
      }
      await r.tabs[1].port().flush();
      await observe(r);
      await invariants(r);
      await oracle(state.model, r);
      expect(localStorage.getItem(outboxKey(r.root))).toBeNull();
    } finally {
      r?.tabs.forEach((tab) => tab.dispose());
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  }), { seed: 427285, numRuns: 30, endOnFailure: true });
});
