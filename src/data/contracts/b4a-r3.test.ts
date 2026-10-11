import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { outsideAdmitted, type Admitted } from '../../../runner/src/spine/admitted';
import { RUNNER_WRITES } from '../vault/layout';
import { applyChanges } from './note-edit';
import { canRebuildAboutSection, parseObservations } from './observations';
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

// Seal expected bytes independently so refused edits can still reach manifest validation.
function manifest(before: string, change: Change, after: string, prior = '', frontier = false): ManifestV2 {
  const ledgerText = prior;
  const about = seen('about-id', 'About me.md', 'fake-root');
  const ledger = seen('ledger-id', 'observations.jsonl', 'bower-system');
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
    beforeContent: verified(before), changes: [change], text: after, content: content(after) }, dependencies);
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

it('b4a-r3 1 tombstone holds across sections, last word wins', () => {
  const first = { ...fact('first'), date: '2026-10-08', text: 'Alex grows beans.' };
  const tombstone = { ...forget(first), date: '2026-10-09' };
  const independent = { ...fact('independent'), text: 'Alex grows mint.' };
  const live = (...events: unknown[]) => parseObservations(utf8(jsonl(...events))).live.map((item) => item.factId);
  expect(live(first)).toEqual([first.factId]);
  expect(live(first, tombstone, independent), 'Forget preserves unrelated evidence').toEqual([independent.factId]);

  const replay = { ...fact('replay'), section: 'about-working-on', category: 'activity',
    text: 'ＡLEX  grows beans.', source: { ...first.source, sha256: 'c'.repeat(64) },
    origin: { ...first.origin, runId: 'run-replay' } };
  const document = { ...replay, eventId: 'event-document', factId: 'fact-document',
    source: { fileId: 'document-source', sha256: 'd'.repeat(64) },
    origin: { kind: 'document', runId: 'run-document', captureId: 'e'.repeat(64), subject: 'Alex' } };
  const remembered = { ...fact('remembered'), text: first.text, date: '2026-10-10', remembers: first.factId,
    origin: { ...fact('remembered').origin, runId: 'run-remembered' } };
  expect(live(first, tombstone, remembered), 'new own words after Forget can remember the fact')
    .toEqual([remembered.factId]);
  expect(live(replay)).toEqual([replay.factId]);
  expect(live(document), 'the document is valid biography/activity evidence before Forget').toEqual([document.factId]);

  expect({
    crossSectionReplay: live(first, tombstone, replay),
    documentReplay: live(first, tombstone, document),
    olderWords: live(first, tombstone, { ...remembered, date: '2026-10-08' }),
    sameDayWords: live(first, tombstone, { ...remembered, date: tombstone.date }),
  }, 'only own words dated after the tombstone supersede it, across every About me section')
    .toEqual({ crossSectionReplay: [], documentReplay: [], olderWords: [], sameDayWords: [] });
});

it('b4a-r3 2 exactly the three ruled regions', async () => {
  const before = '---\nbower_format: ownership/2\n---\n'
    + frame('current', '') + frame('personal', personal) + frame('timeline', '') + frame('bower-note', '');
  for (const ledger of ['', jsonl(fact('live'))]) {
    const learned = regions(ledger ? heading + preference + '\n' : heading);
    const change: Change = { kind: 'about-append', recordIds: [], text: learned };
    const control = manifest(before, change, before + learned, ledger);
    expect(applyChanges(utf8(before), [change])).toMatchObject({ ok: true, text: before + learned });
    expect(await parse(control), 'exactly three evidence-bound regions validate').toMatchObject({ ok: true });
    expect(outsideAdmitted(control, took, 'bower-system')).toBeNull();
    for (const extra of ['profile', 'unknown-region']) {
      const text = learned + frame(extra, 'Alex prefers invented work.\n');
      const invalid: Change = { ...change, text };
      const plan = manifest(before, invalid, before + text, ledger);
      const label = `${extra}, ${ledger ? 'live' : 'empty'} ledger`;
      expect.soft(applyChanges(utf8(before), [invalid]).ok, `${label}: author refuses the extra region`).toBe(false);
      expect.soft((await parse(plan)).ok, `${label}: manifest refuses the extra region`).toBe(false);
      expect.soft(outsideAdmitted(plan, took, 'bower-system'), `${label}: admission refuses the extra region`).not.toBeNull();
    }
  }
});

it('b4a-r3 3 below budget a write is a plain append', async () => {
  const facts = Array.from({ length: 5 }, (_, i) => fact(`consolidate-${i}`));
  const ledger = jsonl(...facts);
  const overBudget = heading + Array.from({ length: 201 }, () => 'peas').join(' ') + '\n';
  const text = heading + preference + '\n';
  const rewrite: Change = { kind: 'about-rewrite', region: 'about-preferences', recordIds: [],
    previous: overBudget, text, factIds: facts.map((item) => item.factId), archive: archivePath };
  const control = manifest(personal + regions(overBudget), rewrite, personal + regions(text), ledger, true);
  expect(await parse(control), '201 authored words and five new observations consolidate').toMatchObject({ ok: true });
  expect(outsideAdmitted(control, took, 'bower-system')).toBeNull();
  expect(control.operations.find((op) => op.effect.kind === 'create-text')?.effect)
    .toMatchObject({ purpose: 'about-archive', text: overBudget });
  expect(canRebuildAboutSection({ ledger: parseObservations(utf8(ledger)), section: 'about-preferences',
    text: overBudget, reason: 'consolidate' })).toBe(true);
  const { archive: omittedArchive, ...noArchive } = rewrite;
  expect(omittedArchive).toBe(archivePath);
  expect((await parse(manifest(personal + regions(overBudget), noArchive, personal + regions(text), ledger, true))).ok,
    'consolidation still requires an archive').toBe(false);
  expect((await parse(manifest(personal + regions(overBudget), rewrite, personal + regions(text), ledger))).ok,
    'consolidation still requires a successful frontier').toBe(false);
  const fourFacts = facts.slice(0, 4);
  expect((await parse(manifest(personal + regions(overBudget), { ...rewrite, factIds: fourFacts.map((item) => item.factId) },
    personal + regions(text), jsonl(...fourFacts), true))).ok, 'four new observations cannot consolidate').toBe(false);
  const atBudget = heading + Array.from({ length: 200 }, () => 'peas').join(' ') + '\n';
  expect((await parse(manifest(personal + regions(atBudget), { ...rewrite, previous: atBudget },
    personal + regions(text), ledger, true))).ok, 'the budget must be exceeded before consolidation').toBe(false);

  const first = fact('append');
  const append: Change = { kind: 'about-rewrite', region: 'about-preferences', recordIds: [],
    previous: heading, text, factIds: [first.factId] };
  const before = personal + regions();
  const after = personal + regions(text);
  expect(applyChanges(utf8(before), [append]), 'the public author preserves the initialized sections')
    .toMatchObject({ ok: true, text: after });
  const plan = manifest(before, append, after, jsonl(first));
  expect(outsideAdmitted(plan, took, 'bower-system')).toBeNull();
  expect(plan.operations.map((op) => op.effect.kind)).toEqual(['write-runner-json', 'edit-text', 'maintain']);
  expect(parseObservations(utf8(jsonl(first))).events.map((event) => event.kind)).toEqual(['observation']);
  expect(await parse(plan), 'one preference below budget writes through with no archive or frontier')
    .toMatchObject({ ok: true });
});

it('b4a-r3 4 remember, Forget, remember, Forget, remember: the third remember is live', () => {
  const first = { ...fact('first'), date: '2026-10-06' };
  const forgetFirst = { ...forget(first), date: '2026-10-07', runId: 'run-forget-first' };
  const second = { ...fact('second'), date: '2026-10-08', remembers: first.factId,
    origin: { ...fact('second').origin, runId: 'run-second' } };
  const forgetSecond = { ...forget(second), date: '2026-10-09', runId: 'run-forget-second' };
  const third = { ...fact('third'), date: '2026-10-10', remembers: second.factId,
    origin: { ...fact('third').origin, runId: 'run-third' } };
  expect(parseObservations(utf8(jsonl(first))).live.map((item) => item.factId)).toEqual([first.factId]);
  expect(parseObservations(utf8(jsonl(first, forgetFirst))).live).toEqual([]);
  expect(parseObservations(utf8(jsonl(first, forgetFirst, second))).live.map((item) => item.factId),
    'the first explicit remembering succeeds').toEqual([second.factId]);
  expect(parseObservations(utf8(jsonl(first, forgetFirst, second, forgetSecond))).live).toEqual([]);
  const result = parseObservations(utf8(jsonl(first, forgetFirst, second, forgetSecond, third)));
  expect(result.tombstones).toEqual([forgetFirst, forgetSecond]);
  expect(result.live.map((item) => item.factId), 'retained older tombstones cannot defeat the latest own words')
    .toEqual([third.factId]);
});
