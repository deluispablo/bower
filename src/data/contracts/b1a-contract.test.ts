import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { RUNNER_WRITES, isRunnerFile } from '../vault/layout';
import { findNode } from '../tree';
import { VaultIndex } from '../vault/vault-index';
import { applyChanges, recheckEdit, stateMark } from './note-edit';
import { createOwnershipContext, parseOwnership } from './ownership-format';
import { parseRunCheckpoint, verifyCheckpointChain, type Checkpoint } from './run-checkpoint';
import { parseRunManifest, parseRunManifestV2, type Change, type EditText, type Manifest, type ManifestV2 } from './run-manifest';
import { timelineLine } from './timeline-line';

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const bytes = (value: unknown): Uint8Array => enc(JSON.stringify(value));
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
};
const hash = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
const raw = (text: string) => ({ encoding: 'utf8' as const, size: enc(text).length, sha256: createHash('sha256').update(enc(text)).digest('hex') });
const time = '2026-10-10T09:00:00.000Z';
const regions = ['moc-overview', 'moc-figures', 'moc-members'] as const;
const frame = (owner: string, text: string): string => `<!-- bower:ownership/2 begin ${owner} -->\n${text}\n<!-- bower:ownership/2 end ${owner} -->\n`;
const oldNote = '---\nbower_format: ownership/2\nby: bower\n---\n'
  + frame('current', '## Current state\n- Growing') + frame('personal', 'Alex wrote this.\n- [ ] Read')
  + frame('timeline', '## Timeline') + frame('bower-note', "## Bower's note");
const moc = (bower = true): string => `---\nbower_format: ownership/2\ntype: moc\n${bower ? 'by: bower\n' : ''}---\n`
  + frame('current', '## Current state\n- Growing') + frame('personal', 'Alex wrote this.\n- [ ] Read')
  + frame('timeline', '## Timeline') + frame('bower-note', "## Bower's note")
  + regions.map((owner) => frame(owner, `${owner}\n[[Old]]`)).join('');
// These are proposed wire spellings, not a new editor. The existing public API judges them.
const change = (region: string): Change => ({ kind: 'moc-rewrite', region, recordIds: [], previous: `${region}\n[[Old]]\n`, text: `${region}\n[[New]]\n` } as unknown as Change);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(time)); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('B1a contract: 1: MOC marks own three regions and person maps permit only link rewrites', () => {
  expect(parseOwnership(enc(oldNote)).status).toBe('v2');
  expect(parseOwnership(enc('---\nby: bower\n---\nOld note.\n')).status).toBe('legacy');
  const personal = '---\ntype: moc\n---\n## Overview\nAlex links [[Old]].\n';
  expect(applyChanges(enc(personal), [{ kind: 'link-rewrite', recordIds: ['rename-1'], renames: [{ from: 'Old', to: 'New' }] }]))
    .toMatchObject({ ok: true, text: personal.replace('[[Old]]', '[[New]]') });
  for (const region of regions) {
    expect.soft(applyChanges(enc(personal), [change(region)]), `person ${region}`).toMatchObject({ ok: false });
  }
  for (const type of ['moc', 'hub']) {
    const person = personal.replace('type: moc', `type: ${type}`);
    for (const denied of [
      { kind: 'state-rewrite', recordIds: [], previous: [], lines: ['New state'] },
      { kind: 'timeline-append', recordIds: [], entries: [{ date: '2026-10-10', text: 'New fact', source: 'Clipping' }] },
      { kind: 'rules-wording', add: [], remove: [] },
    ]) expect.soft(applyChanges(enc(person), [denied as Change])).toMatchObject({ ok: false });
    const state = person.replace('## Overview', '## Current state\n- Original\n\n## Overview');
    expect.soft(applyChanges(enc(state), [{ kind: 'state-rewrite', recordIds: ['answer-1'], previous: ['Original'], lines: ['Replacement'], granted: { answer: 'answer-1', mark: null } }]), `person ${type}: no new one-write grant`)
      .toMatchObject({ ok: false });
    const timeline = `${person}\n## Timeline\n`;
    const consent = { requestId: 'request-1', targetFileId: 'map-1', sourceFileId: 'source-1' };
    const append: Change = { kind: 'timeline-append', recordIds: ['request-1'], entries: [{ date: '2026-10-10', text: 'Beans bloom', source: 'Clipping' }], consent };
    const fetched = { fileId: 'map-1', context: createOwnershipContext(), consents: [consent] };
    // C05's existing append permission still applies to an ordinary personal note.
    expect(applyChanges(enc(timeline.replace(`type: ${type}\n`, '')), [append], fetched)).toMatchObject({ ok: true });
    expect.soft(applyChanges(enc(timeline), [append], fetched), `person ${type}: only link rewrite`).toMatchObject({ ok: false });
  }
  const owned = parseOwnership(enc(moc()));
  expect.soft(owned.status, 'three independently framed MOC regions parse').toBe('v2');
  if (owned.status === 'v2') {
    for (const region of regions) expect.soft(Reflect.get(owned.payloads, region), region).toMatchObject({ start: expect.any(Number), end: expect.any(Number) });
  }
  for (const region of regions) {
    expect(parseOwnership(enc(moc().replace(`end ${region}`, 'end moc-wrong'))).status, `${region}: its own end mark`).toBe('invalid');
    const edited = applyChanges(enc(moc()), [change(region)]);
    expect.soft(edited.ok, `${region} is writable without personal-edit handling`).toBe(true);
    if (edited.ok) {
      expect(edited.text).toContain(frame(region, `${region}\n[[New]]`));
      for (const other of regions.filter((r) => r !== region)) expect(edited.text).toContain(frame(other, `${other}\n[[Old]]`));
      expect(edited.text).toContain(frame('personal', 'Alex wrote this.\n- [ ] Read'));
      expect(edited.text).toContain(frame('current', '## Current state\n- Growing'));
    }
  }
  // Current state keeps its old protection even on a MOC.
  const marked = `---\nby: bower\nbower_state: ${stateMark(['Original'])}\n---\n## Current state\n- Alex changed this\n`;
  expect(applyChanges(enc(marked), [{ kind: 'state-rewrite', recordIds: [], previous: ['Alex changed this'], lines: ['Replacement'] }]))
    .toEqual({ ok: false, reason: 'person-edited' });
});

it('B1a contract: 3: runner paths are explicit and the app refuses their content writes', async () => {
  const parseState = isRunnerFile as unknown as (path: string, value: unknown) => boolean;
  expect(parseState('.bower/questions.json', { v: 1, questions: [] })).toBe(true);
  const state = { v: 1, folderId: 'FOLDER_ID', account: 'ACCOUNT_ID', cursor: 'cursor-1', files: { 'note-1': { path: 'Resources/Plot.md', version: time, summary: 'Alex grows beans.', coverage: { kind: 'prefix', bytes: 4096 } } } };
  expect.soft(parseState('.bower/retrieval.json', state), 'versioned retrieval state uses the existing runner-file parser').toBe(true);
  for (const patch of [{ v: 2 }, { cursor: undefined }, { cursor: 7 }, { folderId: undefined }, { account: undefined }, { files: [] }]) {
    expect(parseState('.bower/retrieval.json', { ...state, ...patch })).toBe(false);
  }
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const sys = (await drive.createFolder(root, '.bower')).id;
  const plain = await drive.createText(root, 'Plan.md', '- [ ] Read\n');
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  await vault.toggleTask('Plan.md', 0);
  expect(await drive.readText(plain.id)).toBe('- [x] Read\n');
  for (const path of ['.bower/retrieval.json', '.bower/index.md', '.bower/hot.md', '.bower/log.md']) {
    const file = await drive.createText(sys, path.split('/').at(-1) ?? '', '- [ ] Keep\n');
    await vault.refresh();
    const write = vi.spyOn(drive, 'writeText');
    const outcome = await vault.toggleTask(path, 0).then(() => 'written', () => 'refused');
    expect.soft(outcome, `${path}: public toggleTask refuses`).toBe('refused');
    expect.soft(write.mock.calls.filter(([id]) => id === file.id), `${path}: zero content writes`).toEqual([]);
    expect.soft(await drive.readText(file.id)).toBe('- [ ] Keep\n');
    write.mockRestore();
    expect.soft(RUNNER_WRITES as readonly string[], `${path}: explicit runner allowlist`).toContain(path);
  }
});

it('B1a contract: 5: a MOC edit uses the read version and duplicate edits are refused', async () => {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const note = await drive.createText(root, 'Plan.md', '- [ ] Read\n');
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  const written = vi.spyOn(drive, 'writeText');
  await vault.toggleTask('Plan.md', 0);
  expect(written.mock.calls[0]?.[2]).toBe(note.modifiedTime);
  expect(await drive.readText(note.id)).toBe('- [x] Read\n');
  await vault.note('Plan.md');
  drive.touch(note.id);
  written.mockClear();
  await expect(vault.toggleTask('Plan.md', 0)).rejects.toMatchObject({ code: 'conflict' });
  expect(await drive.readText(note.id)).toBe('- [x] Read\n');
  written.mockRestore();
  const from = '---\nby: bower\n---\n[[Old]]\n';
  const to = from.replace('Old', 'New');
  const before = { fileId: 'map-1', name: 'Garden.md', parents: ['resources'], folder: false, modifiedTime: time };
  const effect: EditText = { kind: 'edit-text', before, path: 'Resources/Garden.md', beforeContent: { ...raw(from), provenance: 'fake-stored', observedModifiedTime: time }, changes: [{ kind: 'link-rewrite', recordIds: ['rename-1'], renames: [{ from: 'Old', to: 'New' }] }], text: to, content: raw(to) };
  expect(await recheckEdit(effect, enc(from))).toBe('ok');
  expect(await recheckEdit(effect, enc(`${from}Alex wrote more.\n`))).toBe('conflict');
  const control = { ...effect, changes: [{ kind: 'link-rewrite' as const, recordIds: [], renames: [{ from: 'Old', to: 'New' }] }] };
  expect(await parseRunManifestV2(bytes(seal([control])), 'FOLDER_ID', RUNNER_WRITES)).toMatchObject({ ok: true });
  expect(await parseRunManifestV2(bytes(seal([control, control])), 'FOLDER_ID', RUNNER_WRITES)).toMatchObject({ ok: false, reason: 'edit', rule: 'one-per-file' });
  const newEffect = { ...effect, beforeContent: { ...raw(moc()), provenance: 'fake-stored', observedModifiedTime: time }, changes: [change('moc-members')], text: moc().replace('moc-members\n[[Old]]', 'moc-members\n[[New]]'), content: raw(moc().replace('moc-members\n[[Old]]', 'moc-members\n[[New]]')) } as EditText;
  expect.soft(await recheckEdit(newEffect, enc(moc())), 'same fetched MOC passes recheck').toBe('ok');
  expect(await recheckEdit(newEffect, enc(`${moc()}Alex wrote more.\n`))).toBe('conflict');
  const value = seal([newEffect]);
  expect.soft(await parseRunManifestV2(bytes(value), 'FOLDER_ID', RUNNER_WRITES), 'one MOC edit is admitted').toMatchObject({ ok: true });
  const twice = seal([newEffect, newEffect]);
  expect.soft(await parseRunManifestV2(bytes(twice), 'FOLDER_ID', RUNNER_WRITES), 'second edit refused by one-per-file home').toMatchObject({ ok: false, reason: 'edit', rule: 'one-per-file' });
});

it('B1a contract: TL-P4-45 addendum: the app lists edits and permits the person root names', async () => {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const folder = (await drive.createFolder(root, 'Resources')).id;
  const note = await drive.createText(root, 'Plan.md', '- [ ] Read\n');
  const index = await drive.createText(root, 'index.md', '- [ ] Read\n');
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  expect(findNode(await vault.tree(), 'Plan.md')).not.toBeNull();
  expect.soft(findNode(await vault.tree(), 'index.md'), 'own root index is listed').not.toBeNull();
  await vault.toggleTask('index.md', 0);
  expect(await drive.readText(index.id)).toBe('- [x] Read\n');
  expect(await drive.readText(note.id)).toBe('- [ ] Read\n');
  const made = await vault.create('', 'note', 'log.md').then((path) => ({ ok: true, path }), () => ({ ok: false }));
  expect.soft(made, 'own root log can be created').toMatchObject({ ok: true, path: 'log.md' });
  const moved = await drive.createText(folder, 'hot.md', '- [ ] Keep\n');
  await vault.refresh();
  const outcome = await vault.move('Resources/hot.md', '').then((path) => ({ ok: true, path }), () => ({ ok: false }));
  expect.soft(outcome, 'own hot name can move to root').toMatchObject({ ok: true, path: 'hot.md' });
  if (outcome.ok) expect(await drive.get(moved.id)).toMatchObject({ parents: [root] });
});

function seal(effects: unknown[]): ManifestV2 {
  const places = effects.flatMap((value) => {
    const effect = value as { kind: string; before?: EditText['before']; path?: string };
    return effect.kind === 'edit-text' && effect.before && effect.path ? [{ file: effect.before, path: effect.path }] : [];
  });
  const capture = { piles: [], members: [], journal: [], places: [...new Map(places.map((p) => [p.file.fileId, p])).values()] };
  const scope = { rootId: 'FOLDER_ID' };
  const captureId = hash({ scope, runScope: 'instructions', capture });
  const operations = effects.map((effect, ordinal) => ({ ordinal, effect, dependsOn: [], operationId: hash({ runId: 'run-contract', captureId, ordinal, effect }) }));
  return { v: 2, kind: 'run-manifest', scope, runId: 'run-contract', requestId: 'request-contract', runScope: 'instructions', allowWeb: false, requestedAt: Date.parse(time), captureId, capture, operations, reportPlan: [] } as unknown as ManifestV2;
}

it('B1a contract: 6: old notes manifests and checkpoint chains retain meaning beside maintain', async () => {
  // TL-P4-41 addendum 1: new fake feed metadata counts UTF-8 bytes on create and update.
  const drive = new FakeDrive({ clock: () => 0 });
  const cursor = await drive.getStartPageToken();
  const unicode = await drive.createText('root', 'Unicode.md', 'é🙂');
  expect((await drive.listChanges(cursor)).changes.find((c) => c.fileId === unicode.id)?.file?.size).toBe(6);
  const updateCursor = await drive.getStartPageToken();
  await drive.writeText(unicode.id, 'é🙂é🙂', unicode.modifiedTime);
  expect((await drive.listChanges(updateCursor)).changes.find((c) => c.fileId === unicode.id)?.file?.size).toBe(12);
  // Restore repairs legacy character-count sizes from the original media.
  const snapshot = JSON.parse(await drive.snapshot()) as { files: Array<{ meta: { id: string; size: number } }> };
  const old = snapshot.files.find((f) => f.meta.id === unicode.id);
  expect(old).toBeDefined();
  if (old) old.meta.size = 6; // Historical UTF-16 character count, not today's byte size.
  const restored = FakeDrive.restore(JSON.stringify(snapshot), { clock: () => 0 });
  expect(await restored.readText(unicode.id)).toBe('é🙂é🙂');
  expect((await restored.get(unicode.id)).size).toBe(12);
  const manifests = JSON.parse(readFileSync('src/data/contracts/fixtures/p2/run-manifest.json', 'utf8')) as { files: Array<{ content: Manifest }> };
  const checkpoints = JSON.parse(readFileSync('src/data/contracts/fixtures/p2/run-checkpoint.json', 'utf8')) as { files: Array<{ content: Checkpoint }> };
  for (const { content } of manifests.files) {
    const parsed = await parseRunManifestV2(bytes(content), content.scope.rootId, RUNNER_WRITES);
    expect(parsed).toMatchObject({ ok: true, value: content });
    const chain = checkpoints.files.map((f) => f.content).filter((c) => c.runId === content.runId).sort((a, b) => a.revision - b.revision);
    for (const checkpoint of chain) expect(await parseRunCheckpoint(bytes(checkpoint), { rootId: content.scope.rootId, runId: content.runId, captureId: content.captureId, manifestHash: hash(content), operationIds: content.operations.map((o) => o.operationId) })).toMatchObject({ ok: true, value: checkpoint });
    expect(await verifyCheckpointChain(chain)).toMatchObject({ ok: true });
  }
  expect(parseOwnership(enc(oldNote)).status).toBe('v2');
  expect(parseOwnership(enc('Alex wrote a plain note.\n')).status).toBe('plain');
  const directory = 'testing/fixtures/ownership-fixtures-final/';
  for (const [file, status] of [
    ['legacy-canonical.md', 'legacy'], ['legacy-rich-ambiguous.md', 'legacy'],
    ['v2-crlf.md', 'v2'], ['v2-empty-personal.md', 'v2'], ['v2-fence-escape.md', 'v2'],
    ['plain-marker-looking.md', 'plain'], ['invalid-unknown-block.md', 'invalid'],
  ] as const) expect(parseOwnership(readFileSync(`${directory}${file}`)).status, file).toBe(status);
  // No large-request splitting, hierarchy creation, or report kind is introduced by B1a (Q9/Q11).
  const maintained = seal([{ kind: 'maintain', inputs: { folderId: 'FOLDER_ID', account: 'ACCOUNT_ID', cursor: 'cursor-1', changes: [], operationIds: [] } }]);
  expect(await parseRunManifestV2(bytes(maintained), 'FOLDER_ID', RUNNER_WRITES)).toMatchObject({ ok: true, value: maintained });
});

it('B1a contract: pass 1 2: a personal path-recognized hub permits only link rewrites', async () => {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await drive.createFolder('root', 'Bower')).id;
  const resources = (await drive.createFolder(root, 'Resources')).id;
  const folder = (await drive.createFolder(resources, 'Gardening')).id;
  const from = 'Alex links [[Old]].\n\n## Timeline\n';
  const hub = await drive.createText(folder, 'Gardening.md', from);
  const ordinary = await drive.createText(folder, 'Plot.md', from);
  const index = VaultIndex.build(root, await drive.listAll(root));
  expect(index.entries().get('Resources/Gardening/Gardening.md')?.hub).toBe(true);
  expect(index.entries().get('Resources/Gardening/Plot.md')?.hub).not.toBe(true);
  const consent = { requestId: 'request-1', targetFileId: hub.id, sourceFileId: 'source-1' };
  const append: Change = { kind: 'timeline-append', recordIds: ['request-1'],
    entries: [{ date: '2026-10-10', text: 'Beans bloom', source: 'Clipping' }], consent };
  const fetched = { fileId: hub.id, context: createOwnershipContext(), consents: [consent] };
  const rewrite: Change = { kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Old', to: 'New' }] };
  expect(applyChanges(enc(from), [rewrite], fetched)).toMatchObject({ ok: true, text: from.replace('[[Old]]', '[[New]]') });
  const to = `${from}${timelineLine(append.entries[0] ?? { date: '', text: '', source: null })}\n`;
  const effect: EditText = { kind: 'edit-text', path: 'Resources/Gardening/Gardening.md',
    before: { fileId: hub.id, name: hub.name, parents: hub.parents, folder: false, modifiedTime: hub.modifiedTime },
    beforeContent: { ...raw(from), provenance: 'fake-stored', observedModifiedTime: hub.modifiedTime },
    changes: [append], text: to, content: raw(to) };
  const ordinaryConsent = { ...consent, targetFileId: ordinary.id };
  const ordinaryEdit: EditText = { ...effect, path: 'Resources/Gardening/Plot.md',
    before: { ...effect.before, fileId: ordinary.id, name: ordinary.name, modifiedTime: ordinary.modifiedTime },
    beforeContent: { ...effect.beforeContent, observedModifiedTime: ordinary.modifiedTime },
    changes: [{ ...append, consent: ordinaryConsent }] };
  const ordinaryFetched = {
    fileId: ordinary.id, context: createOwnershipContext(), consents: [ordinaryConsent],
  };
  expect(await recheckEdit(ordinaryEdit, enc(from), ordinaryFetched)).toBe('ok');
  expect(await recheckEdit({ ...effect, changes: [rewrite], text: from.replace('[[Old]]', '[[New]]'),
    content: raw(from.replace('[[Old]]', '[[New]]')) }, enc(from), fetched)).toBe('ok');
  // The production recheck receives the real path, including the hub's folder and stem.
  expect(await recheckEdit(effect, enc(from), fetched), 'an unmarked hub refuses even a consented append').toBe('conflict');
});

it('B1a contract: pass 1 3: stored personal MOC satisfied appends retain their read meaning', async () => {
  const stored = JSON.parse(readFileSync('src/data/contracts/fixtures/p2/b1a-personal-moc-satisfied.json', 'utf8')) as Manifest;
  const control = structuredClone(stored);
  const row = control.satisfiedAppends?.[0];
  expect(row).toBeDefined();
  if (!row) throw new Error('Expected the historical satisfied append fixture');
  row.text = row.text.replace('---\ntype: moc\n---\n', '');
  row.content = { ...row.content, ...raw(row.text) };
  // Satisfaction uses stored text, not a fresh write; the ordinary-note control already contains its line.
  expect(applyChanges(enc(row.text), [{ kind: 'timeline-append', recordIds: [row.consent.requestId],
    entries: [row.entry], consent: row.consent }], {
    fileId: row.consent.targetFileId, context: createOwnershipContext(), consents: [row.consent],
  })).toEqual({ ok: false, reason: 'unchanged' });
  for (const parser of [parseRunManifest, parseRunManifestV2]) {
    expect(await parser(bytes(control), 'FOLDER_ID', RUNNER_WRITES)).toMatchObject({ ok: true, value: control });
    expect.soft(await parser(bytes(stored), 'FOLDER_ID', RUNNER_WRITES), 'historic satisfaction is readable through both manifest readers')
      .toMatchObject({ ok: true, value: stored });
  }
});
