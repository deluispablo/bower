import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { outsideAdmitted, type Admitted } from '../../../runner/src/spine/admitted';
import { RUNNER_WRITES } from '../vault/layout';
import { FOLDER_TEMPLATE } from './folder-template';
import { applyChanges } from './note-edit';
import { parseObservations, validLearnedBlock } from './observations';
import { canonicalRecordJson } from './record-json';
import { parseRunManifestV2, type Change, type Content, type ManifestV2, type SeenFile } from './run-manifest';

const utf8 = (text: string): Uint8Array => new Uint8Array(new TextEncoder().encode(text));
const jsonl = (...events: unknown[]): string => events.map((event) => JSON.stringify(event) + '\n').join('');
const time = '2026-10-11T10:00:00.000Z';
const heading = '### How you like things\n';
const sentence = 'Alex grows beans.';
const frame = (region: string, text: string): string =>
  `<!-- bower:ownership/2 begin ${region} -->\n${text}<!-- bower:ownership/2 end ${region} -->\n`;
const regions = (preferences = heading): string => '## What Bower has learned\n'
  + frame('about-you', '### About you\n') + frame('about-working-on', "### What you're working on\n")
  + frame('about-preferences', preferences);
const prefix = (personal = 'Alex keeps [[Garden]].\n'): string => '---\nbower_format: ownership/2\n---\n'
  + frame('current', '') + frame('personal', personal) + frame('timeline', '') + frame('bower-note', '');
const fact = (id: string, text = sentence) => ({ v: 1, kind: 'observation', eventId: `event-${id}`, factId: `fact-${id}`,
  section: 'about-preferences', date: '2026-10-11', text, category: 'preference',
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
type Input = { before?: string; change?: Change; after: string; prior?: string; finalLedger?: string };

// Seal hostile bytes independently so author refusal cannot hide a validation or admission bypass.
function manifest({ before, change, after, prior = '', finalLedger }: Input): ManifestV2 {
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
    beforeContent: verified(prior), text: prior, content: content(prior) }, []);
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
  if (finalLedger !== undefined) last = add({ kind: 'write-runner-json', before: ledger,
    path: '.bower/observations.jsonl', beforeContent: verified(prior), text: finalLedger, content: content(finalLedger) },
  [ledgerId, last]);
  add({ kind: 'maintain', inputs: { folderId: 'fake-root', account: 'ACCOUNT_ID', cursor: 'cursor-one',
    changes: [], operationIds: value.operations.map((op) => op.operationId) } }, [...new Set([ledgerId, last])]);
  return value;
}
const parse = (plan: ManifestV2) => parseRunManifestV2(utf8(JSON.stringify(plan)), 'fake-root', RUNNER_WRITES);
async function accepted(input: Input, label: string): Promise<void> {
  if (input.before !== undefined && input.change) expect(applyChanges(utf8(input.before), [input.change]), `${label}: author`)
    .toMatchObject({ ok: true, text: input.after });
  const plan = manifest(input);
  expect(await parse(plan), `${label}: manifest`).toMatchObject({ ok: true });
  expect(outsideAdmitted(plan, took, 'bower-system'), `${label}: admission`).toBeNull();
}
async function refused(input: Input, label: string): Promise<void> {
  const plan = manifest(input);
  expect.soft((await parse(plan)).ok, `${label}: manifest refuses`).toBe(false);
  expect.soft(outsideAdmitted(plan, took, 'bower-system'), `${label}: admission refuses`).not.toBeNull();
}

it('b4a-r5 1 final block against final ledger', async () => {
  const first = fact('first');
  const surviving = fact('surviving', 'Alex grows mint.');
  const obsolete = fact('obsolete', 'Alex grows peas.');
  const rename: Change = { kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Garden', to: 'Meadow' }] };
  const cases: Array<{ label: string; invalid: Input }> = [];
  for (const kind of ['about-append', 'about-rewrite', 'link-rewrite', 'rebuild'] as const) {
    const prior = kind === 'rebuild' ? jsonl(first, surviving, obsolete)
      : kind === 'about-rewrite' ? jsonl(first, surviving) : jsonl(first);
    const finalLedger = prior + jsonl(forget(first));
    const input = (keep: boolean): Input & { before: string; change: Change } => {
      const payload = heading + (keep ? sentence + '\n' : '') + (kind === 'rebuild' || kind === 'about-rewrite' ? surviving.text + '\n' : '');
      if (kind === 'about-append') return { before: prefix(), change: { kind, recordIds: [], text: regions(payload) },
        after: prefix() + regions(payload), prior, finalLedger };
      if (kind === 'link-rewrite') return { before: prefix() + regions(payload), change: rename,
        after: prefix('Alex keeps [[Meadow]].\n') + regions(payload), prior, finalLedger };
      const previous = kind === 'rebuild' ? heading + obsolete.text + '\n' : heading;
      return { before: prefix() + regions(previous), change: { kind: 'about-rewrite', region: 'about-preferences',
        recordIds: [], previous, text: payload, factIds: kind === 'rebuild' || keep ? [first.factId, surviving.factId] : [surviving.factId],
        ...(kind === 'rebuild' ? { archive: archivePath, undoneRunIds: [obsolete.origin.runId] } : {}) },
      after: prefix() + regions(payload), prior, finalLedger };
    };
    const control = input(false);
    await accepted(control, `${kind}: forgotten sentence removed`);
    const invalid = input(true);
    expect(applyChanges(utf8(invalid.before), [invalid.change]), `${kind}: mechanical edit`)
      .toMatchObject({ ok: true, text: invalid.after });
    const undone = invalid.change?.kind === 'about-rewrite' ? invalid.change.undoneRunIds ?? [] : [];
    const final = parseObservations(utf8(finalLedger), undone);
    expect(final.live.some((item) => item.factId === first.factId), `${kind}: final ledger forgets the observation`).toBe(false);
    expect(validLearnedBlock(control.after, parseObservations(utf8(control.finalLedger ?? ''), undone)), `${kind}: valid final block`).toBe(true);
    expect(validLearnedBlock(invalid.after, final), `${kind}: invalid final block`).toBe(false);
    const plan = manifest(invalid);
    expect(plan.operations.at(-2)?.effect).toMatchObject({ kind: 'write-runner-json', text: finalLedger });
    expect(plan.operations.at(-1)?.effect.kind).toBe('maintain');
    cases.push({ label: kind, invalid });
  }
  for (const item of cases) await refused(item.invalid, `${item.label}: late Forget`);
});

it('b4a-r5 2 link rewrites never edit the learned section', async () => {
  const first = fact('garden', 'Alex visits [[Garden]].');
  const forgotten = fact('forgotten');
  const refreshed = fact('meadow', 'Alex visits [[Meadow]].');
  const prior = jsonl(first, forgotten, forget(forgotten));
  const learned = heading + first.text + '\n';
  const before = prefix('Alex keeps [[Outside]].\n') + regions(learned);
  const outside: Change = { kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Outside', to: 'Meadow' }] };
  await accepted({ before, change: outside, after: prefix('Alex keeps [[Meadow]].\n') + regions(learned), prior },
    'rewrite outside the learned section works');
  const rebuild: Change = { kind: 'about-rewrite', region: 'about-preferences', recordIds: [], previous: learned,
    text: heading + refreshed.text + '\n', factIds: [refreshed.factId], archive: archivePath,
    undoneRunIds: [first.origin.runId] };
  await accepted({ before, change: rebuild, after: prefix('Alex keeps [[Outside]].\n') + regions(rebuild.text),
    prior: prior + jsonl(refreshed) }, 'ledger rebuild refreshes the learned link');
  for (const to of [sentence, 'Meadow']) {
    const change: Change = { kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Garden', to }] };
    const authored = applyChanges(utf8(before), [change]);
    expect.soft(!authored.ok || authored.text === before, `link rewrite to ${to}: refuses or preserves learned bytes`).toBe(true);
  }
  const change: Change = { kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Garden', to: sentence }] };
  const after = prefix('Alex keeps [[Outside]].\n') + regions(heading + `Alex visits [[${sentence}]].\n`);
  expect(validLearnedBlock(before, parseObservations(utf8(prior))), 'grounded before-text').toBe(true);
  expect(validLearnedBlock(after, parseObservations(utf8(prior))), 'rewrite introduces forgotten text').toBe(false);
  await refused({ before, change, after, prior }, 'link rewrite into learned text');
});

it('b4a-r5 3 creation is exactly the template plus empty regions', async () => {
  const template = FOLDER_TEMPLATE.find((item) => item.path === 'About me.md');
  if (!template) throw new Error('Missing About me template');
  await accepted({ after: template.content + regions() }, 'exact folder template and three empty regions');
  const after = 'Alex prefers invented work.\n' + regions();
  const plan = manifest({ after });
  expect(plan.capture.places.some((place) => place.path === 'About me.md'), 'About me is missing').toBe(false);
  expect(parseObservations(utf8('')).live, 'no evidence for invented personal context').toEqual([]);
  await refused({ after }, 'invented personal prefix during creation');
  await refused({ after: template.content + after }, 'template bytes plus invented personal sentence during creation');
});
