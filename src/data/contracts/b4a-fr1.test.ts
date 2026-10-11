import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { parseRunManifestV2, type Change, type Content, type SeenFile, type VerifiedContent } from './run-manifest';
import { parseOwnership } from './ownership-format';
import { applyChanges } from './note-edit';
import { parseObservations, rebuildObservations, canRebuildAboutSection } from './observations';
import { RUNNER_WRITES } from '../vault/layout';
import { outsideAdmitted, type Admitted } from '../../../runner/src/spine/admitted';
import type { RunManifest } from '../spine/records';

const utf8 = (text: string): Uint8Array => Uint8Array.from(new TextEncoder().encode(text));
const bytes = (value: unknown): Uint8Array => utf8(JSON.stringify(value));
const jsonl = (...events: unknown[]): Uint8Array => utf8(events.map((event) => JSON.stringify(event)).join('\n') + '\n');
const C = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(C).join(',')}]`;
  const node = value as Record<string, unknown>;
  return `{${Object.keys(node).sort().map((key) => `${JSON.stringify(key)}:${C(node[key])}`).join(',')}}`;
};
const H = (value: unknown): string => createHash('sha256').update(C(value), 'utf8').digest('hex');
const raw = (text: string): Content => ({ encoding: 'utf8', size: Buffer.byteLength(text),
  sha256: createHash('sha256').update(text, 'utf8').digest('hex') });
const time = '2026-10-11T10:00:00.000Z';
const seen = (fileId: string, name: string, parent: string, folder = false): SeenFile =>
  ({ fileId, name, parents: [parent], folder, modifiedTime: time });
const verifiedText = (text: string): VerifiedContent => ({ ...raw(text), provenance: 'fake-stored', observedModifiedTime: time });

// Same made-up frozen consolidation shape as the original B4a contract, sealed independently.
const b4Frame = (region: string, text: string): string => `<!-- bower:ownership/2 begin ${region} -->\n${text}<!-- bower:ownership/2 end ${region} -->\n`;
const b4Previous = '### How you like things\n- 2026-10-11 · ' + Array.from({ length: 201 }, () => 'remote').join(' ') + ' · [[Alex words]]\n';
const b4Before = '---\nsummary: Alex keeps personal notes.\n---\nAlex keeps this exact prefix.\n## What Bower has learned\n'
  + b4Frame('about-you', '### About you\n') + b4Frame('about-working-on', "### What you're working on\n")
  + b4Frame('about-preferences', b4Previous);
const b4Observation = { v: 1, kind: 'observation', eventId: 'event-remote', factId: 'fact-remote',
  section: 'about-preferences', date: '2026-10-11', text: 'Alex prefers remote roles except when local mentoring is offered.', category: 'preference',
  source: { fileId: 'words-id', sha256: 'a'.repeat(64) },
  origin: { kind: 'words', runId: 'run-memory', captureId: 'b'.repeat(64), pileId: 'pile-words' } };

// The ledger stores full frozen bytes, and the existing dependsOn edges order confirmation.
// The production parser validates all wire fields; no fixture supplies validation behavior.
function b4Manifest() {
  const file = seen('about-id', 'About me.md', 'fake-root');
  const ledger = seen('ledger-id', 'observations.jsonl', 'bower-system');
  const previousLedger = '';
  const ledgerText = Array.from({ length: 5 }, (_, i) => JSON.stringify({ ...b4Observation, eventId: `event-${i}`,
    factId: `fact-${i}`, source: { ...b4Observation.source, fileId: `words-${i}` },
    origin: { ...b4Observation.origin, pileId: `pile-${i}` } })).join('\n') + '\n';
  const next = '### How you like things\nAlex prefers remote roles except when local mentoring is offered.\n';
  const after = b4Before.replace(b4Previous, next);
  const archiveName = '2026-10-11-consolidate-one.md';
  const operations: Array<{ operationId: string; ordinal: number; dependsOn: string[]; effect: Record<string, unknown> }> = [
    { operationId: 'ledger', ordinal: 0, dependsOn: [], effect: { kind: 'write-runner-json', path: '.bower/observations.jsonl',
      before: ledger, beforeContent: verifiedText(previousLedger), text: ledgerText, content: raw(ledgerText) } },
    { operationId: 'archive', ordinal: 1, dependsOn: ['ledger'], effect: { kind: 'create-text',
      parent: { fileId: 'section-dir' }, name: archiveName, createKey: 'consolidate-one',
      purpose: 'about-archive', text: b4Previous, content: raw(b4Previous) } },
    { operationId: 'edit', ordinal: 2, dependsOn: ['ledger', 'archive'], effect: { kind: 'edit-text',
      before: file, path: 'About me.md', beforeText: b4Before, beforeContent: verifiedText(b4Before),
      changes: [{ kind: 'about-rewrite', region: 'about-preferences', recordIds: [], previous: b4Previous, text: next,
        factIds: ['fact-0', 'fact-1', 'fact-2', 'fact-3', 'fact-4'], archive: '.bower/archive/about-me/about-preferences/' + archiveName }],
      text: after, content: raw(after) } },
    { operationId: 'frontier', ordinal: 3, dependsOn: ['edit'], effect: { kind: 'write-runner-json',
      before: ledger, beforeContent: verifiedText(ledgerText), path: '.bower/observations.jsonl',
      text: '', content: raw('') } },
    { operationId: 'maintain', ordinal: 4, dependsOn: ['frontier'], effect: { kind: 'maintain', inputs: {
      folderId: 'fake-root', account: 'ACCOUNT_ID', cursor: 'cursor-one', changes: [], operationIds: [] } } },
  ];
  const value = { kind: 'run-manifest', requestId: 'request-one', allowWeb: false, scope: { rootId: 'fake-root' }, runScope: 'all', captureId: '', v: 2, runId: 'run-memory', requestedAt: Date.UTC(2026, 9, 11),
    capture: { piles: Array.from({ length: 5 }, (_, i) => ({ pileId: `pile-${i}`, source: { kind: 'observed' },
      anchor: seen(`pile-anchor-${i}`, `Alex words ${i}`, 'inbox-id', true), memberKeys: [], childFileIds: [`words-${i}`],
      context: { kind: 'text', memberKey: null, file: seen(`words-${i}`, 'Pile note.md', `pile-anchor-${i}`),
        text: b4Observation.text, content: verifiedText(b4Observation.text) } })), members: [], journal: [], places: [
      { file, path: 'About me.md' }, { file: ledger, path: '.bower/observations.jsonl' },
      { file: seen('bower-system', '.bower', 'fake-root', true), path: '.bower' },
      { file: seen('section-dir', 'about-preferences', 'about-archive-dir', true), path: '.bower/archive/about-me/about-preferences' },
    ] }, operations, reportPlan: [] };
  return value;
}
type B4Manifest = ReturnType<typeof b4Manifest>;
// Renumber every dependency/createdBy reference after mutations; hashes cannot cause the reds.
function seal(value: B4Manifest): B4Manifest {
  value.captureId = H({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  const renamed = new Map<string, string>();
  let ledgerText = '';
  let editId = '';
  for (const [ordinal, operation] of value.operations.entries()) {
    operation.ordinal = ordinal;
    operation.dependsOn = operation.dependsOn.map((id) => renamed.get(id) ?? id);
    const e = operation.effect;
    const parent = e.parent as { createdBy?: string } | undefined;
    if (parent?.createdBy) parent.createdBy = renamed.get(parent.createdBy) ?? parent.createdBy;
    if (e.path === '.bower/observations.jsonl' && operation.operationId === 'ledger') {
      const events = String(e.text).trimEnd().split('\n').filter(Boolean)
        .map((line) => JSON.parse(line) as typeof b4Observation);
      ledgerText = events.map((event) => JSON.stringify({ ...event,
        source: { ...event.source, sha256: raw(b4Observation.text).sha256 },
        origin: { ...event.origin, captureId: value.captureId } })).join('\n') + (events.length ? '\n' : '');
      e.text = ledgerText;
      e.content = raw(ledgerText);
    }
    if (operation.operationId === 'frontier') {
      e.beforeContent = verifiedText(ledgerText);
      e.text = ledgerText + JSON.stringify({ v: 1, kind: 'consolidation', eventId: 'frontier-one',
        section: 'about-preferences', date: '2026-10-11', factIds: ['fact-0', 'fact-1', 'fact-2', 'fact-3', 'fact-4'],
        runId: 'run-memory', operationId: editId, successful: true }) + '\n';
      e.content = raw(String(e.text));
    }
    if (e.kind === 'maintain') (e.inputs as { operationIds: string[] }).operationIds = value.operations.slice(0, ordinal).map((o) => o.operationId);
    const id = H({ runId: value.runId, captureId: value.captureId, ordinal, effect: e });
    if (e.kind === 'edit-text') editId = id;
    renamed.set(operation.operationId, id);
    operation.operationId = id;
  }
  return value;
}
const parse = (value: B4Manifest) => parseRunManifestV2(bytes(seal(value)), 'fake-root', RUNNER_WRITES);
function effect(value: B4Manifest, id: string): Record<string, unknown> {
  const operation = value.operations.find((op) => op.operationId === id);
  if (!operation) throw new Error(`Missing fixture operation ${id}`);
  return operation.effect;
}
const took: Admitted = { deferred: [], taken: { v: 1, id: 'admission-one', rootId: 'fake-root',
  scope: 'all', at: Date.UTC(2026, 9, 11), piles: [], journal: [] } };
// Admission receives the same wire manifest tested by the production parser, including refused candidates.
const admit = (value: B4Manifest) => outsideAdmitted(value as unknown as RunManifest, took, 'bower-system');
const learned = '## What Bower has learned\n' + b4Frame('about-you', '### About you\n')
  + b4Frame('about-working-on', "### What you're working on\n")
  + b4Frame('about-preferences', '### How you like things\n');
const append: Change = { kind: 'about-append', text: learned, recordIds: [] };
const rewrite: Change = { kind: 'about-rewrite', region: 'about-you', previous: '### About you\n',
  text: '### About you\nAlex grows beans.\n', recordIds: [] };
const observation = (id: string) => ({ ...b4Observation, eventId: `event-${id}`, factId: `fact-${id}`,
  source: { fileId: `source-${id}`, sha256: 'a'.repeat(64) },
  origin: { ...b4Observation.origin, runId: `run-${id}`, pileId: `pile-${id}` } });
const forget = (fact: ReturnType<typeof observation>) => ({ v: 1, kind: 'tombstone', eventId: `forget-${fact.factId}`,
  date: '2026-10-11', factId: fact.factId, sourceId: fact.source.fileId, reason: 'forget', runId: 'run-forget' });

it('b4a-fr1 1 ledger target identity', async () => {
  const control = b4Manifest();
  expect((await parse(control)).ok, 'valid ledger append and consolidation').toBe(true);
  expect(admit(control)).toBeNull();
  const stored = observation('stored');
  const prior = new TextDecoder().decode(jsonl(stored, forget(stored)));
  const questions = '{"v":1,"questions":[]}';
  const plan = b4Manifest();
  plan.operations = [{ operationId: 'questions', ordinal: 0, dependsOn: [], effect: {
    kind: 'write-runner-json', before: seen('questions-id', 'questions.json', 'bower-system'),
    beforeContent: verifiedText(questions), path: '.bower/questions.json', text: questions, content: raw(questions),
  } }];
  plan.operations.push({ operationId: 'maintain', ordinal: 1, dependsOn: ['questions'], effect: effect(b4Manifest(), 'maintain') });
  plan.capture.places.push({ file: seen('questions-id', 'questions.json', 'bower-system'), path: '.bower/questions.json' });
  expect(await parse(plan), 'ordinary questions write remains legal').toMatchObject({ ok: true });
  expect(admit(plan)).toBeNull();
  const bad = b4Manifest();
  bad.operations = [{ operationId: 'disguised-write', ordinal: 0, dependsOn: [], effect: {
    ...plan.operations[0]?.effect, before: seen('ledger-id', 'observations.jsonl', 'bower-system'),
    beforeContent: verifiedText(prior),
  } }];
  bad.operations.push({ operationId: 'maintain', ordinal: 1, dependsOn: ['disguised-write'], effect: effect(b4Manifest(), 'maintain') });
  expect.soft((await parse(bad)).ok, 'declared questions path cannot overwrite ledger evidence/tombstones').toBe(false);
  expect.soft(admit(bad), 'admission checks declared path against captured target identity').not.toBeNull();
});

it('b4a-fr1 2 fenced markers stay personal', () => {
  const base = '---\nby: bower\nbower_format: ownership/2\n---\n'
    + ['current', 'personal', 'timeline', 'bower-note'].map((region) => b4Frame(region, '')).join('');
  expect(parseOwnership(utf8(base)).status).toBe('v2');
  expect(applyChanges(utf8(base + learned), [rewrite]).ok, 'real unfenced About me regions remain writable').toBe(true);
  for (const fence of ['```', '~~~~']) {
    const before = base + fence + 'markdown\n' + learned + fence + '\n';
    const parsed = parseOwnership(utf8(before));
    expect.soft(parsed.status, 'valid ownership note with an opaque outside code example').toBe('v2');
    if (parsed.status !== 'invalid') expect.soft(parsed.payloads?.['about-you'], fence).toBeUndefined();
    expect.soft(applyChanges(utf8(before), [rewrite]).ok, 'code example grants no write authority').toBe(false);
  }
});

it('b4a-fr1 3 forget only named facts', () => {
  const beans = { ...observation('beans'), text: 'Alex grows beans.' };
  const mint = { ...observation('mint'), text: 'Alex grows mint.', source: beans.source, origin: beans.origin };
  const original = [beans, mint];
  expect(parseObservations(jsonl(...original)).live.map((o) => o.factId)).toEqual([beans.factId, mint.factId]);
  const binned = { ...forget(beans), reason: 'bin' };
  expect(parseObservations(jsonl(...original, binned)).live, 'settled Bin still invalidates the whole source').toEqual([]);
  const forgotten = parseObservations(jsonl(...original, forget(beans)));
  expect(forgotten.tombstones).toHaveLength(1);
  expect(forgotten.live.map((o) => o.factId), 'Forget of beans preserves mint from the same pile').toEqual([mint.factId]);
});

it('b4a-fr1 4 undo cannot resurrect replay', () => {
  const first = observation('first');
  const replay = { ...first, eventId: 'event-replay', factId: 'fact-replay', origin: { ...first.origin, runId: 'run-replay' } };
  const independent = { ...observation('independent'), text: 'Alex grows mint.' };
  const log = jsonl(first, first, replay, independent);
  const parsed = parseObservations(log);
  expect(parsed.events).toHaveLength(3);
  expect(parsed.live.map((o) => o.factId)).toEqual([first.factId, independent.factId]);
  expect(rebuildObservations({ source: 'observations', bytes: log, undoneRunIds: ['run-replay'] }).live
    .map((o) => o.factId), 'Undo of duplicate does not remove the original').toEqual([first.factId, independent.factId]);
  expect(rebuildObservations({ source: 'observations', bytes: log, undoneRunIds: [first.origin.runId] }).live
    .map((o) => o.factId), 'Undo of original cannot promote a replay without new words').toEqual([independent.factId]);
});

it('b4a-fr1 5 consolidation requires archive and fact ids', async () => {
  expect((await parse(b4Manifest())).ok, 'five facts, exact confirmed archive, edit and frontier').toBe(true);
  for (const count of [4, 0]) {
    const bad = b4Manifest();
    const ledger = effect(bad, 'ledger');
    ledger.text = String(ledger.text).trimEnd().split('\n').slice(0, count).join('\n') + (count ? '\n' : '');
    const edit = effect(bad, 'edit');
    const changes = edit.changes as Array<Record<string, unknown>>;
    for (const change of changes) {
      delete change.archive;
      if (count) change.factIds = Array.from({ length: count }, (_, i) => `fact-${i}`);
      else delete change.factIds;
    }
    bad.operations = bad.operations.filter((op) => op.operationId !== 'archive' && op.operationId !== 'frontier');
    for (const op of bad.operations) op.dependsOn = op.operationId === 'edit' ? ['ledger'] : op.operationId === 'maintain' ? ['edit'] : [];
    expect.soft((await parse(bad)).ok, count ? 'four facts and omitted archive cannot shorten 201 words'
      : 'empty ledger and omitted factIds cannot authorize an unbound rewrite').toBe(false);
  }
});

it('b4a-fr1 6 damaged boundary refuses initialization', () => {
  const personal = 'Alex grows beans.\n';
  expect(applyChanges(utf8(personal), [append]).ok, 'ordinary personal note initializes').toBe(true);
  const damaged = personal + '## What Bower has learned\n<!-- bower:ownership/2 begin abo\n';
  expect.soft(parseOwnership(utf8(damaged)).status, 'truncated region name is a damaged boundary').toBe('invalid');
  expect.soft(applyChanges(utf8(damaged), [append]).ok, 'damaged boundary never permits another learned section').toBe(false);
});

it('b4a-fr1 7 rereads do not supply five observations', () => {
  const gate = (events: unknown[]) => canRebuildAboutSection({ ledger: parseObservations(jsonl(...events)),
    section: 'about-preferences', text: b4Previous, reason: 'consolidate' });
  const independent = Array.from({ length: 5 }, (_, i) => observation(`independent-${i}`));
  expect(gate(independent), 'five independent observations and 201 words qualify').toBe(true);
  expect(gate(independent.slice(0, 4)), 'four independent observations do not qualify').toBe(false);
  const first = observation('first');
  const replay = Array.from({ length: 5 }, (_, i) => ({ ...first, eventId: `event-replay-${i}`, factId: `fact-replay-${i}`,
    origin: { ...first.origin, runId: `run-replay-${i}` } }));
  expect(gate(replay), 'same source hash rereads are not new observations').toBe(false);
  const rereads = replay.map((event, i) => ({ ...event, origin: { ...event.origin, captureId: String(i + 1).repeat(64) } }));
  expect(gate(rereads), 'rereading the same source, hash and text under new capture and issued ids adds no new fact').toBe(false);
});

it('b4a-fr1 8 first archive accepts created parent', async () => {
  const existing = b4Manifest();
  expect((await parse(existing)).ok).toBe(true);
  expect(admit(existing), 'existing section folder control').toBeNull();
  const first = b4Manifest();
  first.capture.places = first.capture.places.filter((place) => place.file.fileId !== 'section-dir');
  first.capture.places.push({ path: '.bower/archive/about-me', file: seen('about-archive-dir', 'about-me', 'archive-dir', true) });
  first.operations.splice(1, 0, { operationId: 'section-folder', ordinal: 1, dependsOn: ['ledger'], effect: {
    kind: 'create-folder', parent: { fileId: 'about-archive-dir' }, name: 'about-preferences', createKey: 'first-section',
  } });
  effect(first, 'archive').parent = { createdBy: 'section-folder' };
  const archive = first.operations.find((op) => op.operationId === 'archive');
  if (!archive) throw new Error('Missing archive fixture');
  archive.dependsOn.push('section-folder');
  const parsed = await parse(first);
  expect(parsed.ok, 'createdBy is earlier, ordered, and resolves the ruled archive path').toBe(true);
  expect(admit(first), 'first consolidation may create its missing section folder').toBeNull();
});

it('b4a-fr1 9 initialization adds missing final newline', () => {
  const personal = 'Alex grows beans.';
  const terminated = applyChanges(utf8(personal + '\n'), [append]);
  expect(terminated.ok, 'already terminated input appends exactly once').toBe(true);
  if (terminated.ok) expect(terminated.text).toBe(personal + '\n' + learned);
  for (const prefix of [personal, '\ufeff---\r\ncustom: café\r\n---\r\nAlex keeps e\u0301 and 😀.']) {
    const before = new TextEncoder().encode(prefix);
    const result = applyChanges(before, [append]);
    expect.soft(result.ok, 'missing final newline is added without changing existing bytes').toBe(true);
    if (result.ok) {
      expect(result.bytes.subarray(0, before.length)).toEqual(before);
      expect(result.text).toBe(prefix + '\n' + learned);
      expect(result.text.match(/^## What Bower has learned$/gm)).toHaveLength(1);
      expect(applyChanges(result.bytes, [append]).ok, 'never initialize twice').toBe(false);
    }
  }
});
