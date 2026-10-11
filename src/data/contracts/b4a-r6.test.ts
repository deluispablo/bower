import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { outsideAdmitted, type Admitted } from '../../../runner/src/spine/admitted';
import { RUNNER_WRITES } from '../vault/layout';
import { FOLDER_TEMPLATE } from './folder-template';
import { canonicalRecordJson } from './record-json';
import { parseRunManifestV2, targetPath, type Content, type Maintain, type ManifestV2, type SeenFile } from './run-manifest';

const time = '2026-10-11T10:00:00.000Z';
const seen = (fileId: string, name: string, parent: string, folder = false): SeenFile =>
  ({ fileId, name, parents: [parent], folder, modifiedTime: time });
const about = seen('about-id', 'About me.md', 'fake-root');
const ledger = seen('ledger-id', 'observations.jsonl', 'bower-system');
const questions = seen('questions-id', 'questions.json', 'bower-system');
const archivePath = '.bower/archive/about-me/about-preferences/2026-10-11-previous-op.md';
const archive = seen('archive-id', '2026-10-11-previous-op.md', 'section-dir');
const took: Admitted = { deferred: [], taken: { v: 1, id: 'admission-one', rootId: 'fake-root',
  scope: 'all', at: Date.UTC(2026, 9, 11), piles: [], journal: [] } };
const content = (text: string): Content => ({ encoding: 'utf8', size: Buffer.byteLength(text),
  sha256: createHash('sha256').update(text).digest('hex') });
const verified = (text: string) => ({ ...content(text), provenance: 'fake-stored' as const, observedModifiedTime: time });
const identity = (value: unknown): string => {
  const canonical = canonicalRecordJson(value);
  if (!canonical.ok) throw new Error('Invalid fixture identity');
  return createHash('sha256').update(canonical.value).digest('hex');
};
type MaintenanceTarget = NonNullable<Maintain['inputs']['targets']>[number];

function manifest(target: MaintenanceTarget): ManifestV2 {
  const template = FOLDER_TEMPLATE.find((item) => item.path === 'About me.md');
  if (!template) throw new Error('Missing About me template');
  const frame = (region: string, heading: string): string =>
    `<!-- bower:ownership/2 begin ${region} -->\n### ${heading}\n<!-- bower:ownership/2 end ${region} -->\n`;
  const learned = '## What Bower has learned\n' + frame('about-you', 'About you')
    + frame('about-working-on', "What you're working on") + frame('about-preferences', 'How you like things');
  const after = template.content + learned;
  const value: ManifestV2 = { kind: 'run-manifest', v: 2, runId: 'run-memory', requestId: 'request-one',
    requestedAt: Date.UTC(2026, 9, 11), allowWeb: false, scope: { rootId: 'fake-root' }, runScope: 'all', captureId: '',
    capture: { piles: [], members: [], journal: [], places: [
      { file: about, path: 'About me.md' }, { file: ledger, path: '.bower/observations.jsonl' },
      { file: questions, path: '.bower/questions.json' }, { file: archive, path: archivePath },
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
    beforeContent: verified(''), text: '', content: content('') }, []);
  const editId = add({ kind: 'edit-text', before: about, path: 'About me.md', beforeText: template.content,
    beforeContent: verified(template.content), changes: [{ kind: 'about-append', recordIds: [], text: learned }],
    text: after, content: content(after) }, [ledgerId]);
  add({ kind: 'maintain', inputs: { folderId: 'fake-root', account: 'ACCOUNT_ID', cursor: 'cursor-one',
    changes: [], operationIds: value.operations.map((op) => op.operationId), targets: [target] } }, [ledgerId, editId]);
  return value;
}
const parse = (plan: ManifestV2) =>
  parseRunManifestV2(new TextEncoder().encode(JSON.stringify(plan)), 'fake-root', RUNNER_WRITES);

it.each([
  { name: 'b4a-r6 1 About me', file: about, path: 'About me.md' },
  { name: 'b4a-r6 2 ledger', file: ledger, path: '.bower/observations.jsonl' },
  { name: 'b4a-r6 3 archive', file: archive, path: archivePath },
])('$name', async ({ file, path }) => {
  const parentId = file.parents[0];
  if (!parentId) throw new Error('Missing fixture parent');
  const control = manifest({ fileId: questions.fileId, parentId: 'bower-system', path: '.bower/questions.json' });
  expect(targetPath(control, { fileId: questions.fileId })).toBe('.bower/questions.json');
  expect(await parse(control), 'questions by its own id and path: manifest accepts').toMatchObject({ ok: true });
  expect(outsideAdmitted(control, took, 'bower-system'), 'questions by its own id and path: admission accepts').toBeNull();

  const protectedPath = manifest({ fileId: file.fileId, parentId, path });
  expect(targetPath(protectedPath, { fileId: file.fileId })).toBe(path);
  expect((await parse(protectedPath)).ok, 'actual memory path: manifest refuses').toBe(false);
  expect(outsideAdmitted(protectedPath, took, 'bower-system'), 'actual memory path: admission refuses').not.toBeNull();

  const alias = manifest({ fileId: file.fileId, parentId, path: '.bower/questions.json' });
  expect(targetPath(alias, { fileId: file.fileId }), 'aliased id still resolves to memory').toBe(path);
  expect.soft((await parse(alias)).ok, 'memory id under allowed questions path: manifest refuses').toBe(false);
  expect.soft(outsideAdmitted(alias, took, 'bower-system'), 'memory id under allowed questions path: admission refuses')
    .not.toBeNull();

  const mismatch = manifest({ fileId: questions.fileId, parentId: 'bower-system', path: '.bower/requests.json' });
  expect(targetPath(mismatch, { fileId: questions.fileId }), 'allowed id resolves to questions, not requests')
    .toBe('.bower/questions.json');
  expect.soft((await parse(mismatch)).ok, 'declared path differs from resolved id: manifest refuses').toBe(false);
  expect.soft(outsideAdmitted(mismatch, took, 'bower-system'), 'declared path differs from resolved id: admission refuses')
    .not.toBeNull();
});
