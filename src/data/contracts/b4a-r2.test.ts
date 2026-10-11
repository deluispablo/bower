import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { outsideAdmitted, type Admitted } from '../../../runner/src/spine/admitted';
import { RUNNER_WRITES } from '../vault/layout';
import { applyChanges } from './note-edit';
import { parseNote } from './note-format';
import { canRebuildAboutSection, parseObservations } from './observations';
import { parseOwnership } from './ownership-format';
import { canonicalRecordJson } from './record-json';
import { parseRunManifestV2, type Change, type Content, type ManifestV2, type SeenFile } from './run-manifest';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const jsonl = (...events: unknown[]): string => events.map((event) => JSON.stringify(event) + '\n').join('');
const time = '2026-10-11T10:00:00.000Z';
const heading = '### How you like things\n';
const personal = 'Alex grows beans.\n';
const preference = 'Alex likes peas.';
const frame = (region: string, text: string): string =>
  `<!-- bower:ownership/2 begin ${region} -->\n${text}<!-- bower:ownership/2 end ${region} -->\n`;
const regions = (text = heading): string => '## What Bower has learned\n'
  + frame('about-you', '### About you\n') + frame('about-working-on', "### What you're working on\n")
  + frame('about-preferences', text);
const fact = (id: string) => ({ v: 1, kind: 'observation', eventId: `event-${id}`, factId: `fact-${id}`,
  section: 'about-preferences', date: '2026-10-11', text: preference, category: 'preference',
  source: { fileId: `source-${id}`, sha256: 'a'.repeat(64) },
  origin: { kind: 'words', runId: 'run-before', captureId: 'b'.repeat(64), pileId: `pile-${id}` } });
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

// Frozen bytes and dependency identities are sealed before the public validator sees them.
function manifest(before: string, change: Change, prior = '', ledgerText = prior, frontier = false): ManifestV2 {
  const about = seen('about-id', 'About me.md', 'fake-root');
  const ledger = seen('ledger-id', 'observations.jsonl', 'bower-system');
  const authored = applyChanges(utf8(before), [change]);
  expect(authored.ok, 'the existing author accepts the exact region edit').toBe(true);
  if (!authored.ok) throw new Error('Invalid fixture edit');
  const value: ManifestV2 = { kind: 'run-manifest', v: 2, runId: 'run-memory', requestId: 'request-one',
    requestedAt: Date.UTC(2026, 9, 11), allowWeb: false, scope: { rootId: 'fake-root' }, runScope: 'all', captureId: '',
    capture: { piles: [], members: [], journal: [], places: [
      { file: about, path: 'About me.md' }, { file: ledger, path: '.bower/observations.jsonl' },
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
  if (change.kind === 'about-rewrite' && change.archive) dependencies.push(add({ kind: 'create-text',
    parent: { fileId: 'section-dir' }, name: archiveName, createKey: 'rebuild-one', purpose: 'about-archive',
    text: change.previous, content: content(change.previous) }, [ledgerId]));
  let last = add({ kind: 'edit-text', before: about, path: 'About me.md', beforeText: before,
    beforeContent: verified(before), changes: [change], text: authored.text, content: content(authored.text) }, dependencies);
  if (frontier && change.kind === 'about-rewrite') {
    const text = ledgerText + jsonl({ v: 1, kind: 'consolidation', eventId: 'frontier-one', section: change.region,
      date: '2026-10-11', factIds: change.factIds, runId: value.runId, operationId: last, successful: true });
    last = add({ kind: 'write-runner-json', before: ledger, path: '.bower/observations.jsonl',
      beforeContent: verified(ledgerText), text, content: content(text) }, [last]);
  }
  add({ kind: 'maintain', inputs: { folderId: 'fake-root', account: 'ACCOUNT_ID', cursor: 'cursor-one',
    changes: [], operationIds: value.operations.map((op) => op.operationId) } }, [last]);
  return value;
}
const parse = (value: ManifestV2) => parseRunManifestV2(utf8(JSON.stringify(value)), 'fake-root', RUNNER_WRITES);

it('b4a-r2 1 forgotten fact stays forgotten on replay', () => {
  const first = { ...fact('first'), section: 'about-working-on', category: 'biography', text: 'Alex grows beans.' };
  const tombstone = forget(first);
  const independent = { ...fact('independent'), section: first.section, category: 'activity', text: 'Alex grows mint.' };
  expect(parseObservations(utf8(jsonl(first))).live.map((item) => item.factId)).toEqual([first.factId]);
  const control = parseObservations(utf8(jsonl(first, tombstone, independent)));
  expect(control.live.map((item) => item.factId), 'Forget preserves a different fact').toEqual([independent.factId]);
  expect(control.tombstones).toEqual([tombstone]);
  const replay = { ...first, eventId: 'event-replay', factId: 'fact-replay', category: 'activity',
    source: { ...first.source, sha256: 'c'.repeat(64) } };
  const result = parseObservations(utf8(jsonl(first, tombstone, independent, replay)));
  expect(result.tombstones).toEqual([tombstone]);
  expect(result.live.map((item) => item.factId), 'new ids, hash and classification cannot revive forgotten words')
    .toEqual([independent.factId]);
});

it('b4a-r2 2 init passes the evidence check', async () => {
  const control = manifest(personal, { kind: 'about-append', recordIds: [], text: regions() });
  expect(await parse(control), 'empty regions need no learned evidence').toMatchObject({ ok: true });
  expect(outsideAdmitted(control, took, 'bower-system')).toBeNull();
  const invented = manifest(personal, { kind: 'about-append', recordIds: [], text: regions(heading + preference + '\n') });
  expect(invented.capture.piles).toEqual([]);
  expect(parseObservations(utf8('')).live).toEqual([]);
  expect((await parse(invented)).ok, 'an empty ledger cannot authorize an invented learned preference').toBe(false);
});

it('b4a-r2 3 forget to the bare heading succeeds', async () => {
  const facts = Array.from({ length: 5 }, (_, i) => fact(`control-${i}`));
  const overBudget = heading + Array.from({ length: 201 }, () => 'peas').join(' ') + '\n';
  const rewrite: Change = { kind: 'about-rewrite', region: 'about-preferences', recordIds: [], previous: overBudget,
    text: heading + preference + '\n', factIds: facts.map((item) => item.factId), archive: archivePath };
  const control = manifest(personal + regions(overBudget), rewrite, jsonl(...facts), jsonl(...facts), true);
  expect(await parse(control), 'ordinary consolidation retains archive, budget and frontier checks').toMatchObject({ ok: true });
  expect(outsideAdmitted(control, took, 'bower-system')).toBeNull();

  const first = fact('first');
  const previous = heading + preference + '\n';
  const ledgerText = jsonl(first, forget(first));
  const ledger = parseObservations(utf8(ledgerText));
  expect(ledger.live).toEqual([]);
  expect(canRebuildAboutSection({ ledger, section: 'about-preferences', text: previous, reason: 'consolidate' })).toBe(false);
  expect(canRebuildAboutSection({ ledger, section: 'about-preferences', text: previous, reason: 'forget' })).toBe(true);
  const plan = manifest(personal + regions(previous), { ...rewrite, previous, text: heading, factIds: [] },
    jsonl(first), ledgerText);
  expect(outsideAdmitted(plan, took, 'bower-system'), 'the scoped archive and edit remain admitted').toBeNull();
  expect(plan.operations.find((op) => op.effect.kind === 'create-text')?.effect)
    .toMatchObject({ purpose: 'about-archive', text: previous });
  expect(plan.operations.find((op) => op.effect.kind === 'edit-text')?.effect)
    .toMatchObject({ text: personal + regions(heading) });
  expect(plan.operations.filter((op) => op.effect.kind === 'write-runner-json')).toHaveLength(1);
  expect(await parse(plan), 'Forget keeps its archive and removes the final fact without budget or frontier')
    .toMatchObject({ ok: true });
});

it('b4a-r2 4 regions without front matter', () => {
  const learned = regions(heading + preference + '\n');
  const change: Change = { kind: 'about-append', recordIds: [], text: learned };
  const front = '---\nsummary: Alex keeps personal notes.\n---\n';
  const control = applyChanges(utf8(front + personal), [change]);
  expect(control.ok).toBe(true);
  if (!control.ok) throw new Error('Invalid front matter control');
  const displayed = parseNote('About me.md', control.text);
  expect(displayed.bowerNote?.text).toContain(preference);
  const plain = applyChanges(utf8(personal), [change]);
  expect(plain.ok, 'initialization supports personal notes without front matter').toBe(true);
  if (!plain.ok) throw new Error('Invalid plain note fixture');
  expect(plain.text).toBe(personal + learned);
  const ownership = parseOwnership(plain.bytes);
  expect(ownership.status).not.toBe('invalid');
  if (ownership.status === 'invalid') throw new Error('Invalid learned regions');
  expect(ownership.payloads?.['about-preferences']).toBeDefined();
  const note = parseNote('About me.md', plain.text);
  expect(note.body).toBe(displayed.body);
  expect(note.bowerNote, 'front matter does not decide whether learned regions are displayed').toEqual(displayed.bowerNote);
});
