/**
 * qa-prod-5-F2: a note's own body words are its version's lint evidence (v2 `terms`), bounded so a 2,000-note folder's
 * progress manifest still fits. v1 evidence stays valid (Ruling 3, R2-4). Made-up notes only.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RUNNER_WRITES } from '../vault/layout';
import { lintFacts } from './note-format';
import { lintEvidenceOk, MANIFEST_V2_LIMIT, parseRunManifestV2, type EffectV2, type ManifestV2, type OperationV2, type SeenFile } from './run-manifest';

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const C = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(C).join(',')}]`;
  const node = value as Record<string, unknown>;
  return `{${Object.keys(node).sort().map((key) => `${JSON.stringify(key)}:${C(node[key])}`).join(',')}}`;
};
const H = (value: unknown): string => createHash('sha256').update(C(value), 'utf8').digest('hex');
const content = (text: string) => ({ encoding: 'utf8' as const, size: enc(text).byteLength, sha256: createHash('sha256').update(text, 'utf8').digest('hex') });
const time = '2026-10-06T09:00:00.000Z';
const seen = (fileId: string, name: string, parent: string, folder = false): SeenFile => ({ fileId, name, parents: [parent], folder, modifiedTime: time });

const STOPS = ['the', 'and', 'with', 'will', 'of', 'alex'];
const V1 = { v: 1, links: [], tags: 0, summary: true, status: null, template: null, active: [], tagList: [], original: null, refused: null };
const v2 = (terms: unknown) => ({ ...V1, v: 2, terms });

/**
 * The note-edit test builder's shape (`note-edit.test.ts` `base`, `seal`) for `withMaintenance(keepProgress(manifest))`:
 * retrieval's write, then the one maintain, last, naming the operations before it.
 */
function progress(snapshot: Record<string, unknown>, withRetrieval: boolean): ManifestV2 {
  const retrieval = seen('retrieval-id', 'retrieval.json', 'bower-system');
  const old = '{"v":1}';
  const text = JSON.stringify({ v: 1, folderId: 'fake-root', account: 'ACCOUNT_ID', cursor: 'cursor', files: snapshot });
  const inputs = { folderId: 'fake-root', account: 'ACCOUNT_ID', cursor: 'cursor', changes: [], operationIds: [] as string[], snapshot };
  const effects: EffectV2[] = [
    ...(withRetrieval ? [{ kind: 'write-runner-json', before: retrieval, path: '.bower/retrieval.json', text, content: content(text),
      beforeContent: { ...content(old), provenance: 'fake-stored', observedModifiedTime: time } } as EffectV2] : []),
    { kind: 'maintain', inputs } as unknown as EffectV2,
  ];
  const value: ManifestV2 = { v: 2, kind: 'run-manifest', scope: { rootId: 'fake-root' }, runId: 'run-progress', requestId: 'request-progress',
    runScope: 'all', allowWeb: false, requestedAt: Date.UTC(2026, 9, 6, 9), captureId: '',
    capture: { piles: [], members: [], journal: [], places: [{ file: retrieval, path: '.bower/retrieval.json' }] },
    operations: effects.map((effect): OperationV2 => ({ operationId: '', ordinal: 0, dependsOn: [], effect })), reportPlan: [] };
  value.captureId = H({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  value.operations.forEach((item, ordinal) => {
    if (ordinal === value.operations.length - 1) inputs.operationIds = value.operations.slice(0, ordinal).map((o) => o.operationId);
    item.ordinal = ordinal; item.operationId = H({ runId: value.runId, captureId: value.captureId, ordinal, effect: item.effect });
  });
  return value;
}
const entry = (i: number, lint: unknown) => ({ path: `Areas/Notes/${String(i).padStart(4, '0')} ${'n'.repeat(120 - 'Areas/Notes/0000 .md'.length)}.md`,
  version: time, summary: `${'s'.repeat(199)}.`, coverage: { kind: 'prefix', bytes: 4096 }, owner: 'person', type: null, lint });

describe('a note\'s body words are its lint evidence (qa-prod-5-F2)', () => {
  it('AC5 evidence_versions_and_term_bounds: v2 keeps 32 short non-stop terms in order; the check takes v1 and v2 only', async () => {
    const long = 'q'.repeat(30);
    const said = Array.from({ length: 40 }, (_, i) => (i % 7 === 3 ? STOPS[(i - 3) / 7] ?? 'the' : `term${i}`));
    expect(new Set(said).size, 'precondition: 40 distinct words').toBe(40);
    const lint = lintFacts('Areas/Notes/Words.md', `---\nsummary: Alex keeps words.\n---\n\n${long} ${said.join(' ')}\n`);
    expect(lint?.v).toBe(2);
    const terms = (lint as { terms?: string[] } | null)?.terms;
    expect(terms, 'the first 32 non-stop words, in order, the long token left out').toEqual(said.filter((w) => !STOPS.includes(w)).slice(0, 32));
    expect(terms?.every((t) => t.length <= 24)).toBe(true);
    expect(lintEvidenceOk(lint)).toBe(true);

    expect(lintEvidenceOk({ links: [], tags: 0, summary: true }), 'the unversioned shape').toBe(true);
    expect(lintEvidenceOk(V1), 'v1 with today\'s keys').toBe(true);
    expect(lintEvidenceOk(v2(['due', 'november'])), 'v2 with terms').toBe(true);
    expect(lintEvidenceOk({ ...V1, v: 2 }), 'v2 without terms').toBe(false);
    expect(lintEvidenceOk(v2(['x'.repeat(25)])), 'a 25-character term').toBe(false);
    expect(lintEvidenceOk(v2(['due', 'due'])), 'a duplicate term').toBe(false);
    expect(lintEvidenceOk(v2(Array.from({ length: 33 }, (_, i) => `t${i}`))), '33 terms').toBe(false);
    expect(lintEvidenceOk({ ...v2(['due']), v: 3 }), 'v: 3').toBe(false);

    const parsed = await parseRunManifestV2(enc(JSON.stringify(progress({ 'note-1': entry(1, V1) }, false))), 'fake-root', RUNNER_WRITES, false);
    expect(parsed.ok, `a manifest holding v1 lint still parses: ${JSON.stringify(parsed)}`).toBe(true);
  });

  // guard (R2-4)
  it('AC7 progress_manifest_budget_holds_2000_notes: snapshot and retrieval text of 2,000 worst-case notes fit and parse', async () => {
    const terms = (i: number): string[] => Array.from({ length: 32 }, (_, k) => `t${String(i).padStart(4, '0')}${String(k).padStart(2, '0')}`.padEnd(24, 'w'));
    const snapshot = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`note-${i}`, entry(i, v2(terms(i)))]));
    const bytes = enc(JSON.stringify(progress(snapshot, true)));
    expect(bytes.byteLength, 'under the manifest limit').toBeLessThan(MANIFEST_V2_LIMIT);
    const parsed = await parseRunManifestV2(bytes, 'fake-root', RUNNER_WRITES, false);
    expect(parsed.ok, JSON.stringify(parsed).slice(0, 300)).toBe(true);
  });
});
