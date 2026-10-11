import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { outsideAdmitted, type Admitted } from '../../../runner/src/spine/admitted';
import { RUNNER_WRITES } from '../vault/layout';
import { FOLDER_TEMPLATE } from './folder-template';
import { applyChanges } from './note-edit';
import { parseObservations, rebuildObservations } from './observations';
import { parseOwnership } from './ownership-format';
import { canonicalRecordJson } from './record-json';
import { parseRunManifestV2, type Change, type Content, type ManifestV2, type SeenFile } from './run-manifest';

const utf8 = (text: string): Uint8Array => new Uint8Array(new TextEncoder().encode(text));
const jsonl = (...events: unknown[]): string => events.map((event) => JSON.stringify(event) + '\n').join('');
const time = '2026-10-11T10:00:00.000Z';
const heading = '### How you like things\n';
const sentence = 'Alex grows beans.';
const invented = 'Alex prefers invented work.\n';
const personal = 'Alex grows mint.\n';
const frame = (region: string, text: string): string =>
  `<!-- bower:ownership/2 begin ${region} -->\n${text}<!-- bower:ownership/2 end ${region} -->\n`;
const regions = (preferences = heading, you = '### About you\n'): string => '## What Bower has learned\n'
  + frame('about-you', you) + frame('about-working-on', "### What you're working on\n")
  + frame('about-preferences', preferences);
const ownershipPrefix = '---\nbower_format: ownership/2\n---\n' + frame('current', '')
  + frame('personal', personal) + frame('timeline', '') + frame('bower-note', '');
const fact = (id: string) => ({ v: 1, kind: 'observation', eventId: `event-${id}`, factId: `fact-${id}`,
  section: 'about-preferences', date: '2026-10-11', text: sentence, category: 'preference',
  source: { fileId: `source-${id}`, sha256: 'a'.repeat(64) },
  origin: { kind: 'words', runId: `run-${id}`, captureId: 'b'.repeat(64), pileId: `pile-${id}` } });
const forget = (item: ReturnType<typeof fact>) => ({ v: 1, kind: 'tombstone', eventId: `forget-${item.factId}`,
  date: '2026-10-11', factId: item.factId, sourceId: item.source.fileId, reason: 'forget', runId: 'run-memory' });
const content = (text: string): Content => ({ encoding: 'utf8', size: Buffer.byteLength(text),
  sha256: createHash('sha256').update(text).digest('hex') });
const verified = (text: string) => ({ ...content(text), provenance: 'fake-stored' as const, observedModifiedTime: time });
const seen = (fileId: string, name: string, parent: string, folder = false): SeenFile =>
  ({ fileId, name, parents: [parent], folder, modifiedTime: time });
const identity = (value: unknown): string => {
  const canonical = canonicalRecordJson(value);
  if (!canonical.ok) throw new Error('Invalid fixture identity');
  return createHash('sha256').update(canonical.value).digest('hex');
};
const archiveName = '2026-10-11-rebuild-one.md';
const archivePath = `.bower/archive/about-me/about-preferences/${archiveName}`;
const took: Admitted = { deferred: [], taken: { v: 1, id: 'admission-one', rootId: 'fake-root',
  scope: 'all', at: Date.UTC(2026, 9, 11), piles: [], journal: [] } };

type PlanInput = { before?: string; change?: Change; after: string; prior?: string; ledgerText?: string; frontier?: boolean };

// Seal expected bytes independently: a refused author must not stop the manifest/admission assertions.
function manifest({ before, change, after, prior = '', ledgerText = prior, frontier = false }: PlanInput): ManifestV2 {
  const about = seen('about-id', 'About me.md', 'fake-root');
  const ledger = seen('ledger-id', 'observations.jsonl', 'bower-system');
  const value: ManifestV2 = { kind: 'run-manifest', v: 2, runId: 'run-memory', requestId: 'request-one',
    requestedAt: Date.UTC(2026, 9, 11), allowWeb: false, scope: { rootId: 'fake-root' }, runScope: 'all', captureId: '',
    capture: { piles: [], members: [], journal: [], places: [
      ...(before === undefined ? [] : [{ file: about, path: 'About me.md' }]),
      { file: ledger, path: '.bower/observations.jsonl' },
      { file: seen('bower-system', '.bower', 'fake-root', true), path: '.bower' },
      { file: seen('section-dir', 'about-preferences', 'about-archive-dir', true),
        path: '.bower/archive/about-me/about-preferences' },
    ] }, operations: [], reportPlan: [] };
  value.captureId = identity({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  const add = (effect: ManifestV2['operations'][number]['effect'], dependsOn: string[]): string => {
    const ordinal = value.operations.length;
    const operationId = identity({ runId: value.runId, captureId: value.captureId, ordinal, effect });
    value.operations.push({ operationId, ordinal, dependsOn, effect });
    return operationId;
  };
  const ledgerId = add({ kind: 'write-runner-json', before: ledger, path: '.bower/observations.jsonl',
    beforeContent: verified(prior), text: ledgerText, content: content(ledgerText) }, []);
  const dependencies = [ledgerId];
  if (change?.kind === 'about-rewrite' && change.archive) dependencies.push(add({ kind: 'create-text',
    parent: { fileId: 'section-dir' }, name: archiveName, createKey: 'rebuild-one', purpose: 'about-archive',
    text: change.previous, content: content(change.previous) }, [ledgerId]));
  let last: string;
  if (before === undefined) {
    last = add({ kind: 'create-text', parent: { fileId: 'fake-root' }, name: 'About me.md',
      createKey: 'about-one', purpose: 'generated', text: after, content: content(after) }, dependencies);
  } else {
    if (!change) throw new Error('Missing fixture change');
    last = add({ kind: 'edit-text', before: about, path: 'About me.md', beforeText: before,
      beforeContent: verified(before), changes: [change], text: after, content: content(after) }, dependencies);
  }
  if (frontier && change?.kind === 'about-rewrite') {
    const text = ledgerText + jsonl({ v: 1, kind: 'consolidation', eventId: 'frontier-one', section: change.region,
      date: '2026-10-11', factIds: change.factIds, runId: value.runId, operationId: last, successful: true });
    last = add({ kind: 'write-runner-json', before: ledger, path: '.bower/observations.jsonl',
      beforeContent: verified(ledgerText), text, content: content(text) }, [last]);
  }
  add({ kind: 'maintain', inputs: { folderId: 'fake-root', account: 'ACCOUNT_ID', cursor: 'cursor-one',
    changes: [], operationIds: value.operations.map((op) => op.operationId) } }, [...new Set([ledgerId, last])]);
  return value;
}
const parse = (value: ManifestV2) => parseRunManifestV2(utf8(JSON.stringify(value)), 'fake-root', RUNNER_WRITES);
const template = FOLDER_TEMPLATE.find((item) => item.path === 'About me.md');
if (!template) throw new Error('Missing About me template');

async function accepted(input: PlanInput): Promise<void> {
  if (input.before !== undefined && input.change) {
    expect(applyChanges(utf8(input.before), [input.change]), 'valid author control')
      .toMatchObject({ ok: true, text: input.after });
  }
  const plan = manifest(input);
  expect(await parse(plan), 'valid manifest control').toMatchObject({ ok: true });
  expect(outsideAdmitted(plan, took, 'bower-system'), 'valid admission control').toBeNull();
}

async function refused(input: PlanInput, label: string, author = false): Promise<void> {
  if (author && input.before !== undefined && input.change) {
    expect.soft(applyChanges(utf8(input.before), [input.change]).ok, `${label}: author refuses`).toBe(false);
  }
  const plan = manifest(input);
  expect.soft((await parse(plan)).ok, `${label}: manifest refuses`).toBe(false);
  expect.soft(outsideAdmitted(plan, took, 'bower-system'), `${label}: admission refuses`).not.toBeNull();
}

it('b4a-r4 1 replay dedupes and falls with Undo', () => {
  const first = fact('first');
  const sameSection = { ...first, eventId: 'event-same', factId: 'fact-same',
    origin: { ...first.origin, runId: 'run-same' } };
  expect(parseObservations(utf8(jsonl(first, sameSection))).live.map((item) => item.factId),
    'same-section evidence replay dedupes').toEqual([first.factId]);
  const otherSource = { ...fact('other-source'), source: { fileId: 'other-source', sha256: first.source.sha256 } };
  expect(parseObservations(utf8(jsonl(first, otherSource))).live.map((item) => item.factId),
    'the same text and hash from a different source is independent evidence').toEqual([first.factId, otherSource.factId]);
  expect(parseObservations(utf8(jsonl(first, sameSection)), [sameSection.origin.runId]).live.map((item) => item.factId),
    'Undo of a duplicate run preserves the first observation').toEqual([first.factId]);
  expect(rebuildObservations({ source: 'observations', bytes: utf8(jsonl(first, sameSection)),
    undoneRunIds: [first.origin.runId] }).live, 'Undo removes the first observation and its same-section replay').toEqual([]);
  const replay = { ...sameSection, eventId: 'event-replay', factId: 'fact-replay',
    section: 'about-you', category: 'biography', text: 'ＡLEX  grows beans.  ' };
  expect(parseObservations(utf8(jsonl(replay))).live.map((item) => item.factId),
    'the normalized cross-section observation is valid by itself').toEqual([replay.factId]);
  const bytes = utf8(jsonl(first, replay));
  expect.soft(parseObservations(bytes).live.map((item) => item.factId),
    'source, hash and normalized text identify the first observation across sections').toEqual([first.factId]);
  expect.soft(parseObservations(bytes, [first.origin.runId]).live, 'public reducer Undo leaves nothing live').toEqual([]);
  expect.soft(rebuildObservations({ source: 'observations', bytes, undoneRunIds: [first.origin.runId] }).live,
    'public rebuild cannot resurrect cross-section replay').toEqual([]);
  const newHash = { ...sameSection, eventId: 'event-new-hash', factId: 'fact-new-hash',
    source: { ...first.source, sha256: 'c'.repeat(64) } };
  expect.soft(parseObservations(utf8(jsonl(first, newHash))).live.map((item) => item.factId),
    'a different source hash is distinct evidence').toEqual([first.factId, newHash.factId]);
});

it('b4a-r4 2 Forget removes every copy', async () => {
  const first = fact('first');
  const previous = heading + sentence + '\n';
  const change: Change = { kind: 'about-rewrite', region: 'about-preferences', recordIds: [],
    previous, text: heading, factIds: [], archive: archivePath };
  await accepted({ before: personal + regions(previous), change, after: personal + regions(),
    prior: jsonl(first), ledgerText: jsonl(first, forget(first)) });
  const copy = { ...fact('copy'), section: 'about-you', category: 'biography' };
  const prior = jsonl(first, copy);
  const ledgerText = prior + jsonl(forget(first));
  const ledger = parseObservations(utf8(ledgerText));
  expect(ledger.live, 'Forget tombstones every copy of the sentence').toEqual([]);
  expect(ledger.tombstones).toEqual([forget(first)]);
  const you = '### About you\n' + sentence + '\n';
  const input = { before: personal + regions(previous, you), change, after: personal + regions(heading, you),
    prior, ledgerText };
  expect(applyChanges(utf8(input.before), [change]), 'the mechanical splice removes only preferences')
    .toMatchObject({ ok: true, text: input.after });
  await refused(input, 'tombstoned text left in about-you');
});

it('b4a-r4 3 creation runs the same validator', async () => {
  await accepted({ after: template.content + regions() });
  const input = { after: template.content + regions(heading + invented) };
  const plan = manifest(input);
  expect(plan.capture.places.some((place) => place.path === 'About me.md'), 'About me is missing').toBe(false);
  expect(plan.capture.piles).toEqual([]);
  expect(parseObservations(utf8('')).live).toEqual([]);
  expect(plan.operations.find((op) => op.effect.kind === 'create-text')?.effect)
    .toMatchObject({ kind: 'create-text', parent: { fileId: 'fake-root' }, name: 'About me.md', purpose: 'generated' });
  await refused(input, 'missing-note creation cannot invent a preference');
});

it('b4a-r4 4 no unmarked prose after the regions', async () => {
  const before = ownershipPrefix;
  expect(parseOwnership(utf8(before)).status).not.toBe('invalid');
  const change: Change = { kind: 'about-append', recordIds: [], text: regions() };
  await accepted({ before, change, after: before + change.text });
  const invalid: Change = { ...change, text: change.text + invented };
  await refused({ before, change: invalid, after: before + invalid.text }, 'unmarked trailing invented prose', true);
});

describe('b4a-r4 rule validLearnedBlock validates every write path', () => {
  const paths = ['create', 'init', 'write-through', 'consolidation', 'Forget', 'Undo', 'rebuild'] as const;
  it.each(paths)('%s refuses an invalid whole block', async (path) => {
    let input: PlanInput;
    if (path === 'create') {
      input = { after: template.content + regions() };
    } else if (path === 'init') {
      const change: Change = { kind: 'about-append', recordIds: [], text: regions() };
      input = { before: ownershipPrefix, change, after: ownershipPrefix + change.text };
    } else {
      const first = fact('first');
      const text = heading + sentence + '\n';
      const rewrite: Extract<Change, { kind: 'about-rewrite' }> = { kind: 'about-rewrite',
        region: 'about-preferences', recordIds: [], previous: heading, text, factIds: [first.factId] };
      if (path === 'write-through') {
        input = { before: ownershipPrefix + regions(), change: rewrite,
          after: ownershipPrefix + regions(text), prior: jsonl(first) };
      } else if (path === 'consolidation') {
        const facts = Array.from({ length: 5 }, (_, i) => fact(`control-${i}`));
        const previous = heading + Array.from({ length: 201 }, () => 'beans').join(' ') + '\n';
        input = { before: ownershipPrefix + regions(previous), change: { ...rewrite, previous, archive: archivePath,
          factIds: facts.map((item) => item.factId) }, after: ownershipPrefix + regions(text), prior: jsonl(...facts), frontier: true };
      } else {
        const prior = jsonl(first);
        const ledgerText = path === 'Forget' ? prior + jsonl(forget(first)) : prior;
        const undoneRunIds = path === 'Forget' ? [] : [first.origin.runId];
        const live = path === 'rebuild'
          ? rebuildObservations({ source: 'observations', bytes: utf8(ledgerText), undoneRunIds }).live
          : parseObservations(utf8(ledgerText), undoneRunIds).live;
        expect(live, `${path} rebuilds from an empty live evidence set`).toEqual([]);
        input = { before: ownershipPrefix + regions(text), change: { ...rewrite, previous: text, text: heading,
          factIds: live.map((item) => item.factId), archive: archivePath,
          ...(undoneRunIds.length ? { undoneRunIds } : {}) }, after: ownershipPrefix + regions(), prior, ledgerText };
      }
    }
    await accepted(input);
    // Every route sees the same structural defect; no new effect kind is invented for a rebuild.
    const invalid: PlanInput = { ...input, after: input.after + invented };
    if (input.change?.kind === 'about-append') invalid.change = { ...input.change, text: input.change.text + invented };
    else if (input.before !== undefined) invalid.before = input.before + invented;
    await refused(invalid, `${path} must validate the complete learned block`, path === 'init');
  });
});
