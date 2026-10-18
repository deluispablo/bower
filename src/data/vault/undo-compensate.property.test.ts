import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { driveError, driveFailure } from '../drive/drive-api';
import { seedFakeDrive } from '../fake/seed';
import { isJournalRecord, pairsOf, type JournalRecord } from '../contracts/journal-record';
import { BowerError } from '../types';
import { DriveVault } from './drive-vault';
import { Journal, outboxKey } from './journal';
import { SYSTEM } from './layout';

// TL-P4-28(2): the implementer must not change this adversarial red.
// Standard model runner: https://fast-check.dev/docs/advanced/model-based-testing/
// fakeLocks in upload-queue.test.ts is local, not exported. Reuse its held/waiting/wake
// stub here, adapting request's two-argument form and preserving the callback result.
function webLocks(requested: () => void = () => undefined) {
  const held = new Set<string>();
  const waiting = new Map<string, Array<() => void>>();
  return {
    async request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      requested();
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
  folderGate?: () => Promise<void>;
  protected override async systemFolder(path: string): Promise<string> {
    if (path === SYSTEM.changes) await this.folderGate?.();
    return super.systemFolder(path);
  }
}

type Outcome = 'landed' | 'refused' | 'unknown' | 'offline' | 'signin' | 'permission';
type Kind = 'bin' | 'move' | 'add' | 'remove';
interface Change {
  line: JournalRecord;
  kind: Kind;
  tab: number;
  cancelled: boolean;
  inverses: Array<{ id: string; outcome: 'pending' | 'sent' | 'refused' | 'settled-without-sending' }>;
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
  settledWithoutSending: Set<string>;
  fifoViolations: string[];
  baselineRules: Set<string>;
  baselineThings: Map<string, string>;
  decisions: Array<{ id: string; result: 'dropped' | 'sent' }>;
  reserveGate?: () => Promise<void>;
  reserveWhileOffline?: boolean;
  refuseId?: string;
  ownerGates: Array<(() => Promise<void>) | undefined>;
  lockRequested?: () => void;
}

function tabAt(r: Real, tab: number): Tab { return tab % 2 === 0 ? r.tabs[0] : r.tabs[1]; }

function undone(c: Change): boolean {
  return c.cancelled || c.inverses.some((inverse) => inverse.outcome === 'sent');
}

function observeSettledInverses(r: Real, beforeAt?: number): void {
  const waiting = JSON.parse(localStorage.getItem(outboxKey(r.root)) ?? '[]') as Array<{ line: JournalRecord }>;
  const queued = new Set(waiting.map(({ line }) => line.id));
  const attempted = new Set(r.attempts.map((line) => line.id));
  for (const line of r.observed.values()) {
    // Addendum 9(2): absence alone is not completion, and retirement is never delivery.
    // A later attempt witnesses retirement before batch-end outbox cleanup.
    if (line.undoes && r.refused.has(line.undoes) && !attempted.has(line.id) &&
        (!queued.has(line.id) || (beforeAt !== undefined && line.at < beforeAt))) {
      r.settledWithoutSending.add(line.id);
    }
  }
}

async function inverseOutcomes(m: Model, r: Real): Promise<void> {
  observeSettledInverses(r);
  const failed = await tabAt(r, 0).port().failed();
  for (const c of m.changes) {
    for (const inverse of c.inverses) {
      // Addendum 7: keep each inverse's outcome separate, including repeated/two-tab Undo.
      if (inverse.outcome === 'pending') {
        if (r.confirmed.has(inverse.id)) inverse.outcome = 'sent';
        else if (r.settledWithoutSending.has(inverse.id)) inverse.outcome = 'settled-without-sending';
        else if (r.refused.has(inverse.id)) {
          inverse.outcome = 'refused';
          expect(failed.some((line) => line.id === inverse.id), `refused inverse ${inverse.id} missing from failed list`)
            .toBe(true);
        }
      }
    }
  }
}

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
  observeSettledInverses(r);
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
    if (r.dropped.has(line.id) || r.refused.has(line.id) || r.settledWithoutSending.has(line.id)) continue;
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
  m.changes.push({ line: original, kind, tab, cancelled: false, inverses: [], ...(undo ? { undo } : {}) });
}

async function undo(m: Model, r: Real, index: number, tab: number, api: boolean): Promise<void> {
  const c = m.changes[index % m.changes.length];
  if (!c) return;
  // A dropped change has no second Undo button. Two-tab repeated Undo is exercised for sent changes.
  if (undone(c) && r.dropped.has(c.line.id)) return;
  const before = new Set(r.observed.keys());
  const decisionCount = r.decisions.length;
  let thrown: BowerError | undefined;
  try {
  if (api && c.undo && !undone(c) && !c.inverses.some((inverse) => inverse.outcome === 'pending') &&
      !r.refused.has(c.line.id)) {
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
    if (!(e instanceof BowerError)) throw e;
    expect(['offline', 'auth', 'unknown']).toContain(e.code);
    thrown = e;
  }
  await observe(r);
  const added = [...r.observed.values()].filter((line) => !before.has(line.id));
  for (const line of added) {
    if (line.undoes === c.line.id) c.inverses.push({ id: line.id,
      outcome: r.confirmed.has(line.id) ? 'sent' : r.refused.has(line.id) ? 'refused' : 'pending' });
  }
  await inverseOutcomes(m, r);
  if (thrown) {
    // Addendum 6: a kept inverse is pending until flush; only a refusal leaves Undo unresolved.
    const waiting = JSON.parse(localStorage.getItem(outboxKey(r.root)) ?? '[]') as
      Array<{ line: JournalRecord }>;
    const failed = await tabAt(r, tab).port().failed();
    const kept = added.some((line) => line.undoes === c.line.id &&
      waiting.some((w) => w.line.id === line.id) && !failed.some((f) => f.id === line.id));
    expect(/\blater\b/.test(thrown.message)).toBe(kept);
    if (!kept) return;
  }
  const decision = r.decisions.slice(decisionCount).find((d) => d.id === c.line.id);
  // TL-P4-27 addendum 4(3): every production Undo uses retract, never remove or a separate decision.
  expect(decision, `Undo bypassed retract for ${c.kind}`).toBeDefined();
  // TL-P4-27 addendum 4(3),(5): a resolved Undo drops and records nothing, or records exactly one inverse.
  if (decision?.result === 'dropped') expect(added).toEqual([]);
  else {
    expect(added).toHaveLength(1);
    expect(added[0]?.undoes).toBe(c.line.id);
  }
  if (decision?.result === 'dropped') c.cancelled = true;
}

async function oracle(m: Model, r: Real): Promise<void> {
  const lines = await driveLines(r);
  const things = new Map<string, string | null>(r.baselineThings);
  const rules = new Set(r.baselineRules);
  // TL-P4-27 addendum 4(7): independent Drive-only replay in at order.
  // Addendum 3: for moves and Bin restores pairsOf affects rows/counts only and replay applies both lines; rule lines cancel (addendum 6, qa4-undo-remove-rule).
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
    if (undone(c)) continue;
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
    .toEqual(m.changes.filter((c) => !undone(c)).map((c) => c.line.id).sort());
}

// Addendum 9(5): each command builds the whole adversarial interleaving; shrinking cannot remove its race.
async function refusedDuringInverse(m: Model, r: Real, tab: number): Promise<void> {
  r.outcome = 'landed';
  await transport(() => tabAt(r, tab).port().flush());
  r.outcome = 'offline';
  r.reserveWhileOffline = true;
  await change(m, r, 'add', tab, false);
  delete r.reserveWhileOffline;
  const c = m.changes.at(-1);
  if (!c) throw new Error('Missing reserved original');
  const j = tabAt(r, tab).port();
  const result = await j.retract(c.line.id);
  expect(result).toBe('sent');
  r.refuseId = c.line.id;
  r.outcome = 'landed';
  try {
    await transport(() => j.record('rule', 'Removed the rule',
      { path: 'Rules.md', removes: c.line.text, undoes: c.line.id }));
  } finally { delete r.refuseId; }
  // The original is never in force. The independent replay must therefore keep the baseline rule state.
  c.cancelled = r.refused.has(c.line.id);
}

async function ownerWaitingRace(m: Model, r: Real, tab: number): Promise<void> {
  r.outcome = 'landed';
  await transport(() => tabAt(r, tab).port().flush());
  let ownerEntered!: () => void;
  let ownerRelease!: () => void;
  let folderEntered!: () => void;
  let folderRelease!: () => void;
  const ownerReached = new Promise<void>((done) => { ownerEntered = done; });
  const ownerGate = new Promise<void>((done) => { ownerRelease = done; });
  const folderReached = new Promise<void>((done) => { folderEntered = done; });
  const folderGate = new Promise<void>((done) => { folderRelease = done; });
  const earlierTab = tab;
  const laterTab = 1 - tab;
  r.ownerGates[earlierTab] = async () => { ownerEntered(); await ownerGate; };
  const a = tabAt(r, laterTab);
  a.folderGate = async () => { folderEntered(); await folderGate; };
  const n = r.observed.size;
  const earlierText = `Keep earlier category ${n} together`;
  const laterText = `Keep later category ${n} together`;
  r.outcome = 'offline';
  const earlier = tabAt(r, earlierTab).port().record('rule', earlierText, { path: 'Rules.md', text: earlierText });
  await ownerReached;
  const later = a.port().record('rule', laterText, { path: 'Rules.md', text: laterText });
  await folderReached;
  let lockRequested!: () => void;
  const lockReached = new Promise<void>((done) => { lockRequested = done; });
  r.lockRequested = lockRequested;
  ownerRelease();
  await Promise.race([earlier, lockReached]);
  delete r.lockRequested;
  // Observe the earlier waiting line before the later send, without Journal.list taking the paused lock.
  const waiting = JSON.parse(localStorage.getItem(outboxKey(r.root)) ?? '[]') as Array<{ line: JournalRecord }>;
  for (const w of waiting) r.observed.set(w.line.id, w.line);
  r.outcome = 'landed';
  folderRelease();
  try {
    const lines = await Promise.all([earlier, later]);
    lines.forEach((line, index) => {
      r.observed.set(line.id, line);
      m.changes.push({ line, kind: 'add', tab: index === 0 ? earlierTab : laterTab, cancelled: false, inverses: [] });
    });
  } finally {
    r.ownerGates[earlierTab] = undefined;
    delete a.folderGate;
  }
}

type Action = { op: 'change'; kind: Kind; tab: number; api: boolean } |
  { op: 'undo' | 'race' | 'refused-inverse' | 'owner-waiting'; index: number; tab: number; api: boolean } |
  { op: 'send'; outcome: Outcome; tab: number };
class Command implements fc.AsyncCommand<Model, Real> {
  constructor(readonly action: Action) {}
  check(m: Readonly<Model>): boolean { return this.action.op === 'change' || this.action.op === 'send' || this.action.op === 'refused-inverse' ||
    this.action.op === 'owner-waiting' || m.changes.length > 0; }
  toString(): string { return JSON.stringify(this.action); }
  async run(m: Model, r: Real): Promise<void> {
    const a = this.action;
    if (a.op === 'change') await change(m, r, a.kind, a.tab, a.api);
    else if (a.op === 'send') {
      r.outcome = a.outcome;
      await transport(() => tabAt(r, a.tab).port().flush());
    } else if (a.op === 'refused-inverse') await refusedDuringInverse(m, r, a.tab);
    else if (a.op === 'owner-waiting') await ownerWaitingRace(m, r, a.tab);
    else if (a.op === 'undo') await undo(m, r, a.index, a.tab, a.api);
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
    await inverseOutcomes(m, r);
    await invariants(r);
  }
}

async function setup(): Promise<Real> {
  localStorage.clear();
  const real: { current?: Real } = {};
  vi.stubGlobal('navigator', { locks: webLocks(() => real.current?.lockRequested?.()) });
  let now = Date.parse('2026-10-09T10:00:00Z');
  vi.spyOn(Date, 'now').mockImplementation(() => ++now);
  const drive = new FakeDrive({ clock: () => ++now });
  const root = await seedFakeDrive(drive, 'default', now);
  if (!root) throw new Error('Missing fake root');
  const ownerGates: Real['ownerGates'] = [];
  const tabs: [Tab, Tab] = [0, 1].map((tab) => new Tab({ drive, rootId: async () => root,
    device: `tab-${tab}`, runningPiles: () => new Set() }, () => true,
    async () => { await ownerGates[tab]?.(); return root; })) as [Tab, Tab];
  const baselineRules = new Set((await tabs[0].rules()).map((rule) => rule.text));
  const r: Real = { drive, root, tabs, baselineRules, baselineThings: new Map(), outcome: 'landed',
    observed: new Map(), arrivals: [], attempts: [], dropped: new Set(), refused: new Set(),
    confirmed: new Set(), settledWithoutSending: new Set(), fifoViolations: [], decisions: [], ownerGates };
  real.current = r;
  const create = drive.createText.bind(drive);
  const reserve = drive.generateIds.bind(drive);
  const get = drive.get.bind(drive);
  const blind = new Set<string>();
  const recordOfFile = new Map<string, string>();
  vi.spyOn(drive, 'generateIds').mockImplementation(async (count) => {
    await r.reserveGate?.();
    if (r.outcome === 'offline' && !r.reserveWhileOffline) throw driveError('offline');
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
    observeSettledInverses(r, line.at);
    const blockers = [...r.observed.values()].filter((earlier) => earlier.at < line.at &&
      !r.confirmed.has(earlier.id) && !r.dropped.has(earlier.id) && !r.refused.has(earlier.id) &&
      !r.settledWithoutSending.has(earlier.id));
    if (blockers.length) r.fifoViolations.push(`${line.id} passed ${blockers.map((earlier) => earlier.id).join(',')}`);
    r.attempts.push(line);
    // The fake Drive owns duplicate-id conflicts. A previously landed line cannot later be refused as a new create.
    if (r.arrivals.some((x) => x.id === line.id) && !['offline', 'signin', 'permission'].includes(r.outcome)) {
      blind.delete(args[4] ?? '');
      return create(...args);
    }
    if (r.outcome === 'refused' || r.refuseId === line.id) { r.refused.add(line.id); throw driveFailure('unknown', 'permanent'); }
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

// The unseeded batches are 8 of 25 runs (not 4 of 50), so a slow 2-core runner stays inside the 5 s test limit. Keep the explicit seed; pin the two split batches for replay.
const splitBatches = [
  { label: 'random batch 1', seed: 427286, numRuns: 50 },
  { label: 'random batch 2', seed: 427287, numRuns: 50 },
];
const batches = [
  { label: 'seeded', seed: 427285, numRuns: 30 },
  ...splitBatches,
  ...Array.from({ length: 8 }, (_, index) => ({ label: `random batch ${index + 3}`, numRuns: 25 })),
];

async function checkUndo(commands: Iterable<fc.AsyncCommand<Model, Real>>, undoAll: boolean): Promise<void> {
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
    await inverseOutcomes(state.model, r);
    for (let index = 0; index < state.model.changes.length; index++) {
      const c = state.model.changes[index];
      if (c && !undone(c) && (undoAll || r.refused.has(c.line.id))) await undo(state.model, r, index, index % 2, false);
    }
    await r.tabs[1].port().flush();
    await observe(r);
    await inverseOutcomes(state.model, r);
    await invariants(r);
    await oracle(state.model, r);
    expect(localStorage.getItem(outboxKey(r.root))).toBeNull();
  } finally {
    r?.tabs.forEach((tab) => tab.dispose());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
}

const command = fc.oneof(
  fc.record({ op: fc.constant('change' as const), kind: fc.constantFrom<Kind>('bin', 'move', 'add', 'remove'),
    tab: fc.integer({ min: 0, max: 1 }), api: fc.boolean() }),
  fc.record({ op: fc.constantFrom('undo' as const, 'race' as const, 'refused-inverse' as const, 'owner-waiting' as const), index: fc.nat(30),
    tab: fc.integer({ min: 0, max: 1 }), api: fc.boolean() }),
  fc.record({ op: fc.constant('send' as const), outcome: fc.constantFrom<Outcome>('landed', 'refused', 'unknown',
    'offline', 'signin', 'permission'), tab: fc.integer({ min: 0, max: 1 }) }),
).map((action) => new Command(action));
const property = fc.asyncProperty(fc.commands([command], { maxCommands: 24 }), fc.boolean(), checkUndo);
const name = 'TL-P4-28(2): compensating Undo preserves FIFO and the Drive-only person-state oracle';

it('replays undo-compensate-counterexample', async () => {
  await fc.assert(property, { seed: 752195386, path: '49', numRuns: 1, endOnFailure: true });
});

it('undo-fifo-seed: seed -1937975690 path 40 settles the retired inverse without a FIFO break', async () => {
  await fc.assert(property, { seed: -1937975690, path: '40', numRuns: 1, endOnFailure: true });
});

it('undo-inverse-after-refused: seed -993178573 path 48 keeps the original in force when its inverse is refused', async () => {
  await fc.assert(property, { seed: -993178573, path: '48', numRuns: 1, endOnFailure: true });
});

// Addendum 7: a kept inverse is not an Undo; refused for good, it leaves the original in force and on the failed list.
it.each([{ tab: 0, place: 'same tab' }, { tab: 1, place: 'cross tab' }])(
  'undo-inverse-after-refused: a kept inverse refused at a later flush leaves the original in force ($place)', async ({ tab }) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let r: Real | undefined;
  try {
    r = await setup();
    const m: Model = { changes: [] };
    await change(m, r, 'add', 0, false);
    const c = m.changes[0];
    if (!c) throw new Error('Missing original');
    expect(r.confirmed.has(c.line.id)).toBe(true);
    r.outcome = 'offline';
    await undo(m, r, 0, tab, false);
    const inverse = c.inverses[0];
    if (!inverse) throw new Error('Missing kept inverse');
    expect(c.inverses).toEqual([{ id: inverse.id, outcome: 'pending' }]);
    const waiting = JSON.parse(localStorage.getItem(outboxKey(r.root)) ?? '[]') as Array<{ line: JournalRecord }>;
    expect(waiting.map(({ line }) => line.id)).toEqual([inverse.id]);
    expect(undone(c)).toBe(false);
    await invariants(r);
    await oracle(m, r);
    r.refuseId = inverse.id;
    r.outcome = 'landed';
    try { await tabAt(r, tab).port().flush(); }
    finally { delete r.refuseId; }
    await observe(r);
    await inverseOutcomes(m, r);
    expect(r.refused.has(inverse.id)).toBe(true);
    expect(inverse.outcome).toBe('refused');
    expect(undone(c)).toBe(false);
    expect((await tabAt(r, 1 - tab).port().failed()).map((line) => line.id)).toEqual([inverse.id]);
    expect(r.arrivals.map((line) => line.id)).toEqual([c.line.id]);
    expect(localStorage.getItem(outboxKey(r.root))).toBeNull();
    await invariants(r);
    await oracle(m, r);
  } finally {
    r?.tabs.forEach((client) => client.dispose());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

const refusalClasses = (['inverse admission', 'later flush'] as const).flatMap((when) =>
  [0, 1].map((tab) => ({ when, tab, place: tab === 0 ? 'same tab' : 'cross tab' })));

it.each(refusalClasses)('retires without sending at $when ($place)', async ({ when, tab }) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let r: Real | undefined;
  try {
    r = await setup();
    const m: Model = { changes: [] };
    r.outcome = 'offline';
    r.reserveWhileOffline = true;
    await change(m, r, 'add', 0, false);
    delete r.reserveWhileOffline;
    const c = m.changes[0];
    if (!c) throw new Error('Missing original');
    const journal = tabAt(r, tab).port();
    expect(await journal.retract(c.line.id)).toBe('sent');
    if (when === 'inverse admission') {
      r.refuseId = c.line.id;
      r.outcome = 'landed';
    }
    const inverse = await journal.record('rule', 'Undid the change',
      { path: 'Rules.md', removes: c.line.text, undoes: c.line.id });
    r.observed.set(inverse.id, inverse);
    c.inverses.push({ id: inverse.id, outcome: 'pending' });
    if (when === 'later flush') {
      await inverseOutcomes(m, r);
      expect(c.inverses[0]?.outcome).toBe('pending');
      expect(r.settledWithoutSending.has(inverse.id)).toBe(false);
      const waiting = JSON.parse(localStorage.getItem(outboxKey(r.root)) ?? '[]') as Array<{ line: JournalRecord }>;
      expect(waiting.map(({ line }) => line.id)).toEqual([c.line.id, inverse.id]);
      r.refuseId = c.line.id;
      r.outcome = 'landed';
      await journal.flush();
    }
    delete r.refuseId;
    await inverseOutcomes(m, r);
    expect((await journal.failed()).map((line) => line.id)).toEqual([c.line.id]);
    expect(r.refused.has(c.line.id)).toBe(true);
    expect(localStorage.getItem(outboxKey(r.root))).toBeNull();
    expect(r.attempts.some((line) => line.id === inverse.id)).toBe(false);
    expect(r.arrivals.some((line) => line.id === inverse.id)).toBe(false);
    expect(r.confirmed.has(inverse.id)).toBe(false);
    expect(r.settledWithoutSending).toEqual(new Set([inverse.id]));
    expect(c.inverses[0]?.outcome).toBe('settled-without-sending');
    expect(undone(c)).toBe(false);
    c.cancelled = true;
    await change(m, r, 'add', tab, false);
    const later = m.changes[1];
    expect(later).toBeDefined();
    expect(r.attempts.at(-1)?.id).toBe(later?.line.id);
    expect(r.arrivals.map((line) => line.id)).toEqual([later?.line.id]);
    await invariants(r);
    await oracle(m, r);
  } finally {
    r?.tabs.forEach((client) => client.dispose());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it.each([0, 1])('a genuinely unresolved head blocks later attempts (later tab %s)', async (tab) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let r: Real | undefined;
  try {
    r = await setup();
    const m: Model = { changes: [] };
    r.outcome = 'signin';
    await change(m, r, 'add', 0, false);
    await change(m, r, 'add', tab, false);
    const head = m.changes[0];
    const later = m.changes[1];
    if (!head || !later) throw new Error('Missing waiting changes');
    const journal = tabAt(r, tab).port();
    await transport(() => journal.flush());
    expect(r.attempts.length).toBeGreaterThan(0);
    expect(r.attempts.every((line) => line.id === head.line.id)).toBe(true);
    expect(r.settledWithoutSending.size).toBe(0);
    expect(r.arrivals).toEqual([]);
    const waiting = JSON.parse(localStorage.getItem(outboxKey(r.root)) ?? '[]') as Array<{ line: JournalRecord }>;
    expect(waiting.map(({ line }) => line.id)).toEqual([head.line.id, later.line.id]);
    await invariants(r);
    r.outcome = 'landed';
    await tabAt(r, tab).port().flush();
    expect(r.arrivals.map((line) => line.id)).toEqual([head.line.id, later.line.id]);
    await invariants(r);
    await oracle(m, r);
  } finally {
    r?.tabs.forEach((client) => client.dispose());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it.each([0, 1])('recognises retirement before a later attempt in the same flush (flush tab %s)', async (tab) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let r: Real | undefined;
  try {
    r = await setup();
    const real = r;
    const m: Model = { changes: [] };
    r.outcome = 'offline';
    r.reserveWhileOffline = true;
    await change(m, r, 'add', 0, false);
    delete r.reserveWhileOffline;
    await undo(m, r, 0, 0, false);
    await change(m, r, 'add', 0, false);
    const original = m.changes[0];
    const inverse = original?.inverses[0];
    const later = m.changes[1];
    if (!original || !inverse || !later) throw new Error('Missing queued retirement sequence');
    expect(inverse.outcome).toBe('pending');
    expect(r.settledWithoutSending.size).toBe(0);
    const create = vi.mocked(r.drive.createText).getMockImplementation();
    if (!create) throw new Error('Missing transport observer');
    let during: { queued: string[]; refused: boolean; settled: boolean; confirmed: boolean } | undefined;
    vi.spyOn(r.drive, 'createText').mockImplementation(async (...args) => {
      const file = await create(...args);
      if (args[1] === `${later.line.id}.json`) during = {
        queued: (JSON.parse(localStorage.getItem(outboxKey(real.root)) ?? '[]') as Array<{ line: JournalRecord }>)
          .map(({ line }) => line.id),
        refused: real.refused.has(original.line.id),
        settled: real.settledWithoutSending.has(inverse.id),
        confirmed: real.confirmed.has(inverse.id),
      };
      return file;
    });
    r.refuseId = original.line.id;
    r.outcome = 'landed';
    await tabAt(r, tab).port().flush();
    delete r.refuseId;
    expect(during).toEqual({ queued: [original.line.id, inverse.id, later.line.id],
      refused: true, settled: true, confirmed: false });
    expect(r.attempts.some((line) => line.id === inverse.id)).toBe(false);
    expect(r.arrivals.map((line) => line.id)).toEqual([later.line.id]);
    expect((await tabAt(r, tab).port().failed()).map((line) => line.id)).toEqual([original.line.id]);
    expect(localStorage.getItem(outboxKey(r.root))).toBeNull();
    await inverseOutcomes(m, r);
    expect(inverse.outcome).toBe('settled-without-sending');
    expect(undone(original)).toBe(false);
    original.cancelled = true;
    await invariants(r);
    await oracle(m, r);
  } finally {
    r?.tabs.forEach((client) => client.dispose());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it.each(['unresolved inverse', 'original before inverse', 'refused original', 'Drive-only person-state'] as const)(
  'the strict model rejects a broken %s observation', async (broken) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let r: Real | undefined;
    try {
      r = await setup();
      const m: Model = { changes: [] };
      await change(m, r, 'add', 0, false);
      const c = m.changes[0];
      if (!c) throw new Error('Missing original');
      if (broken === 'unresolved inverse') {
        r.outcome = 'offline';
        await undo(m, r, 0, 1, false);
        const inverse = c.inverses[0];
        if (!inverse) throw new Error('Missing unresolved inverse');
        const later = { ...c.line, id: 'illegal-later', at: c.line.at + 100 };
        r.outcome = 'refused';
        const { drive, root } = r;
        // Force an illegal transport attempt without weakening the Journal's FIFO.
        await transport(() => drive.createText(root, `${later.id}.json`, JSON.stringify(later)));
        expect(r.settledWithoutSending.has(inverse.id)).toBe(false);
        expect(r.fifoViolations).toEqual([`${later.id} passed ${inverse.id}`]);
        await expect(invariants(r)).rejects.toThrow();
      } else if (broken === 'Drive-only person-state') {
        vi.spyOn(r.drive, 'dump').mockReturnValue(new Map());
        await expect(oracle(m, r)).rejects.toThrow();
      } else {
        const inverse: JournalRecord = { v: 1, id: 'illegal-inverse', at: c.line.at + 1,
          kind: 'rule', what: 'Undid the change', device: 'tab-1', removes: c.line.text, undoes: c.line.id };
        if (broken === 'original before inverse') r.arrivals = [inverse];
        else {
          r.refused.add(c.line.id);
          r.arrivals.push(inverse);
        }
        await expect(invariants(r)).rejects.toThrow();
      }
    } finally {
      r?.tabs.forEach((client) => client.dispose());
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  },
);

async function assertPart<Ts>(property: fc.IAsyncProperty<Ts>, seed: number, part: { from: number; to: number }): Promise<void> {
  // A root-only path resumes generation at that run index, including its original bias.
  // Native reporting keeps the seed, absolute replay path and commands' toString().
  await fc.assert(property, { seed, path: String(part.from - 1), numRuns: part.to - part.from + 1, endOnFailure: true });
}

it('a failing property part reports its seed, replay path and command case', async () => {
  let caseText = '';
  const standIn = fc.integer({ min: 0, max: 100 }).map((value) => [{
    check: () => true,
    run: async () => {},
    toString: () => `stand-in(${value})`,
  }]);
  const failing = fc.asyncProperty(standIn, fc.boolean(), async (commands, undoAll) => {
    await fc.asyncModelRun(() => ({ model: {}, real: {} }), commands);
    caseText = fc.stringify([commands, undoAll]);
    throw new Error('Deliberate part failure');
  });
  let failure: unknown;
  try { await assertPart(failing, 427286, { from: 6, to: 10 }); }
  catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  const message = (failure as Error).message;
  expect(message).toContain('seed: 427286');
  expect(message).toContain('path: "5"');
  expect(message).toContain(`Counterexample: ${caseText}`);
  expect(message).toContain('stand-in(');
});

it.each(splitBatches)('seeded property parts keep all 50 cases in order ($label, seed $seed)', async (batch) => {
  const collect = (cases: string[]) => fc.asyncProperty(
    fc.commands([command], { maxCommands: 24 }), fc.boolean(), async (commands, undoAll) => {
      cases.push(fc.stringify([Array.from(commands, (command) => command.toString()), undoAll]));
    },
  );
  const unsplit: string[] = [];
  await fc.assert(collect(unsplit), { seed: batch.seed, numRuns: batch.numRuns, endOnFailure: true });
  expect(unsplit).toHaveLength(50);
  for (let repeat = 0; repeat < 2; repeat++) {
    const sliced: string[] = [];
    for (let from = 1; from <= batch.numRuns; from += 5) {
      await assertPart(collect(sliced), batch.seed, { from, to: from + 4 });
    }
    expect(sliced).toHaveLength(50);
    expect(sliced).toEqual(unsplit);
  }
});

it.each(batches.filter((batch) => batch.label !== 'random batch 1' && batch.label !== 'random batch 2'))(
  `${name} ($label)`, async (batch) => {
    await fc.assert(property, { ...batch, endOnFailure: true });
  },
);

for (const batch of splitBatches) {
  describe(`${name} (${batch.label}, seed ${batch.seed})`, () => {
    // Only partition run numbers at collection; filtered-out tests generate no cases.
    const runNumbers = Array.from({ length: batch.numRuns }, (_, index) => index + 1);
    const parts = Array.from({ length: runNumbers.length / 5 }, (_, index) => ({
      from: index * 5 + 1, to: index * 5 + 5, runs: runNumbers.slice(index * 5, index * 5 + 5),
    }));
    expect(runNumbers).toHaveLength(batch.numRuns);
    expect(parts.flatMap((part) => part.runs)).toHaveLength(batch.numRuns);
    it.each(parts)('runs $from–$to', async (part) => {
      await assertPart(property, batch.seed, part);
    });
  });
}
