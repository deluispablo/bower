import { RUNNER_WRITES } from '../vault/layout';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ChangeEntry } from './types';
import { parseNote } from '../vault/note-format';
import { parseOwnership, type Owner } from '../vault/ownership-format';
import { parseRules } from '../vault/rules-format';
import { applyChanges, applyChangesUsing, EDIT_FILE_LIMIT, recheckEdit, renamesFor, savedLinkKey, timelineDate } from './note-edit';
import {
  MANIFEST_V2_LIMIT, parseRunManifest, parseRunManifestV2,
  type Change, type Content, type EditEntry, type EditGuardRule, type EditText, type EffectV2, type Manifest, type ManifestV2, type ManifestV2Refusal,
  type OperationV2, type RuleAdd, type RuleRemove, type SeenFile, type VerifiedContent,
} from './run-manifest';

// Every expected output below is written out by hand from TL-P2-20 (base text, revisions 3 and 4,
// ratification); none is produced by the code under test. Digests come from an independent node:crypto oracle.

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
const C = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(C).join(',')}]`;
  const node = value as Record<string, unknown>;
  return `{${Object.keys(node).sort().map((key) => `${JSON.stringify(key)}:${C(node[key])}`).join(',')}}`;
};
const H = (value: unknown): string => createHash('sha256').update(C(value), 'utf8').digest('hex');
const raw = (text: string): Content => {
  const bytes = Buffer.from(text, 'utf8');
  return { encoding: 'utf8', size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
};

// ---------------------------------------------------------------------------------------------
// Changes and notes
// ---------------------------------------------------------------------------------------------

const MERGE = '2026-10-06T08-00-00.000Z-merge01';
const RENAME = '2026-10-06T08-00-01.000Z-rename1';
const RULE = '2026-10-06T08-00-02.000Z-rule001';
const UNRULE = '2026-10-06T08-00-03.000Z-unrule1';
const entry = (text: string, source: string | null = null, date = '2026-10-06'): EditEntry => ({ date, text, source });
type Append = Extract<Change, { kind: 'timeline-append' }>;
type Relink = Extract<Change, { kind: 'link-rewrite' }>;
const append = (...entries: EditEntry[]): Append => ({ kind: 'timeline-append', recordIds: [MERGE], entries });
const relink = (...renames: [string, string][]): Relink => ({ kind: 'link-rewrite', recordIds: [RENAME], renames: renames.map(([from, to]) => ({ from, to })) });
const word = (add: RuleAdd[], remove: RuleRemove[] = []): Change => ({ kind: 'rules-wording', add, remove });
const rule = (text: string, yourWords: string, since = Date.UTC(2026, 9, 6, 15, 30)): RuleAdd => ({ recordId: RULE, text, yourWords, since });
const unrule = (text: string): RuleRemove => ({ recordId: UNRULE, text });

const B = (owner: Owner): string => `<!-- bower:ownership/2 begin ${owner} -->`;
const E = (owner: Owner): string => `<!-- bower:ownership/2 end ${owner} -->`;

// The additive template change goes through the existing author, not a test-only serializer.
// Change's future union member is isolated here so HEAD still typechecks and fails on assertions.
const b6Rewrite = (region: 'goal' | 'next-steps', previous: string, text: string): Change => ({
  kind: 'template-rewrite', region, recordIds: [MERGE], previous, text,
} as unknown as Change);
const b6Legacy = (type: string): string => `---\nsummary: Alex keeps gardening facts.\nby: bower\ntype: ${type}\n---\n\nAlex keeps café notes.\n\n## Timeline\n- 2026-10-01 · Saved the bulletin. · [[Garden bulletin]]\n`;
const b6EditControl = (): void => {
  const raw = b6Legacy('concept');
  const line = entry('Alex received a newer bulletin.', 'Garden bulletin');
  const result = applyChanges(enc(raw), [append(line)]);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.text).toContain('- 2026-10-06 · Alex received a newer bulletin. · [[Garden bulletin]]');
};
it('B6a templates: b6-source-body-immutable refuses new history on a stored Source', () => {
  b6EditControl();
  const raw = b6Legacy('source');
  const bytes = enc(raw);
  expect(parseNote('Source.md', raw).timeline).toHaveLength(1);
  const result = applyChanges(bytes, [append(entry('Alex received a newer bulletin.', 'Garden bulletin'))]);
  expect(result.ok, 'Source body and its legacy Timeline are immutable after creation').toBe(false);
  expect(bytes).toEqual(enc(raw));
});
it('B6a templates: b6-source-body-immutable refuses a rewrite of Source prose links', () => {
  const control = applyChanges(enc(b6Legacy('concept')), [relink(['Garden bulletin', 'New bulletin'])]);
  expect(control.ok).toBe(true);
  if (control.ok) expect(control.text).toContain('[[New bulletin]]');
  const raw = b6Legacy('source');
  const bytes = enc(raw);
  expect(applyChanges(bytes, [relink(['Garden bulletin', 'New bulletin'])]).ok,
    'A Source is never rewritten after creation').toBe(false);
  expect(bytes).toEqual(enc(raw));
});
it('B6a templates: legacy MOC Timeline stays unrewritten by ordinary history updates', () => {
  b6EditControl();
  const raw = b6Legacy('moc');
  const bytes = enc(raw);
  expect(parseNote('Gardening.md', raw).timeline).toHaveLength(1);
  expect(applyChanges(bytes, [append(entry('Alex received a newer bulletin.', 'Garden bulletin'))]).ok,
    'A legacy MOC Timeline stays unrewritten').toBe(false);
  expect(bytes).toEqual(enc(raw));
});
const b6Project = (byBower = true): string => [
  '---', 'bower_format: ownership/2', 'summary: Repair the greenhouse.', 'type: project',
  ...(byBower ? ['by: bower'] : []), '---',
  B('current'), '## Current state', '- The pane is cracked.', E('current'),
  B('personal'), '## Notes', 'Alex keeps café notes.  ', '- [ ] Personal task', E('personal'),
  B('timeline'), '## Timeline', '- 2026-10-01 · Alex recorded the cracked pane. · [[Inspection]]', E('timeline'),
  B('bower-note'), E('bower-note'),
  '<!-- bower:ownership/2 begin goal -->', '## Goal', 'Repair the greenhouse.', '<!-- bower:ownership/2 end goal -->',
  '<!-- bower:ownership/2 begin next-steps -->', '## Next steps', '- [ ] Measure the cracked pane.', '<!-- bower:ownership/2 end next-steps -->', '',
].join('\n');
it.each([
  { region: 'goal' as const, previous: '## Goal\nRepair the greenhouse.\n', text: '## Goal\nReplace the stated cracked pane.\n' },
  { region: 'next-steps' as const, previous: '## Next steps\n- [ ] Measure the cracked pane.\n', text: '## Next steps\n- [ ] Fit the stated replacement pane.\n' },
])('B6a templates: b6-project-next-steps-owned rewrites only the $region payload through note-edit', ({ region, previous, text }) => {
  b6EditControl();
  for (const eol of ['\n', '\r\n']) {
    const raw = b6Project().replace(/\n/g, eol);
    const was = previous.replace(/\n/g, eol), next = text.replace(/\n/g, eol);
    const bytes = enc(raw);
    const result = applyChanges(bytes, [b6Rewrite(region, was, next)]);
    expect(result.ok, 'The ordinary note author must support grounded template region changes').toBe(true);
    if (!result.ok) continue;
    expect(result.text).toBe(raw.replace(was, next));
    expect(bytes).toEqual(enc(raw));
    expect(parseNote('Greenhouse.md', result.text).timeline).toEqual(parseNote('Greenhouse.md', raw).timeline);
    expect(applyChanges(enc(raw), [b6Rewrite(region, 'Different previous content.\n', next)]).ok).toBe(false);
  }
});
it('B6a templates: b6-person-note-no-metadata refuses template adoption and retains every personal byte', () => {
  b6EditControl();
  const raw = '---\r\nsummary: "Alex: personal notes"\r\n---\r\n\r\n## Goal\r\nAlex decides this.\r\n\r\n## Next steps\r\n- [ ] Alex chooses the next step.\r\n';
  const bytes = enc(raw);
  const result = applyChanges(bytes, [b6Rewrite('next-steps', '## Next steps\r\n- [ ] Alex chooses the next step.\r\n',
    '## Next steps\r\n- [ ] Fit the stated replacement pane.\r\n')]);
  expect(bytes).toEqual(enc(raw));
  expect(parseNote('Alex.md', raw)).toMatchObject({ byBower: false, properties: [], summary: 'Alex: personal notes' });
  expect(result, 'A person note cannot acquire template ownership or metadata').toEqual({ ok: false, reason: 'not-bower' });
});
/** An ownership/2 note; only the Timeline payload lines and the link name vary. */
function v2(eol: string, timeline: string[], name = 'Old'): string {
  return [
    '---', 'bower_format: ownership/2', 'summary: Lease', `related: [[${name}]]`, '---',
    B('current'), '## Current state', `- Signed with [[${name}]]`, E('current'), '',
    B('personal'), `Notes on [[${name}]].`, '- [ ] Call Alex', E('personal'), '',
    B('timeline'), ...timeline, E('timeline'), '',
    B('bower-note'), "## Bower's note", `See [[${name}#Terms]].`, E('bower-note'), '',
  ].join(eol);
}
/** A legacy note of Bower's: frontmatter with `by: bower`, then the given lines. */
const legacy = (eol: string, ...body: string[]): string => ['---', 'summary: Lease', 'by: bower', '---', ...body].join(eol);

const profileWords = (count: number): string => ['Alex', ...Array.from({ length: count - 2 }, () => 'TypeScript'), '[[CV]]'].join(' ') + '\n';
const profileChange = (previous: string, text: string): Change => ({
  kind: 'profile-rewrite', recordIds: [], previous, text,
} as unknown as Change);
const profileNote = (): { old: string; before: string; previous: string } => {
  const old = v2('\n', ['## Timeline', '- 6 Oct · Read the CV · [[CV]]']);
  const previous = 'Alex uses TypeScript. [[CV]]\n';
  return { old, previous, before: old + '<!-- bower:ownership/2 begin profile -->\n' + previous
    + '<!-- bower:ownership/2 end profile -->\n' };
};
const profileControl = (): void => {
  const old = profileNote().old;
  const result = applyChanges(enc(old), [relink(['Old', 'New'])]);
  expect(result.ok).toBe(true);
  expect(parseOwnership(enc(old)).status).toBe('v2');
};

it('B5a contracts: b5-profile-region-bound', () => {
  profileControl();
  const { before, previous } = profileNote();
  const bytes = enc(before); const copy = bytes.slice();
  const text = profileWords(400);
  expect(text.trim().split(/\s+/)).toHaveLength(400);
  const result = applyChanges(bytes, [profileChange(previous, text)]);
  expect(result.ok, 'a marked profile permits 400 sourced words through note-edit').toBe(true);
  if (!result.ok) return;
  expect(result.text).toBe(before.replace(previous, text));
  expect(parseNote('Areas/Career/Career profile.md', result.text).currentState).toEqual(['Signed with [[Old]]']);
  expect(parseNote('Areas/Career/Career profile.md', result.text).body).toContain('Notes on [[Old]].');
  expect(bytes).toEqual(copy);
  expect(applyChanges(bytes, [profileChange(previous, profileWords(401))])).toEqual({ ok: false, reason: 'field' });
});

it('B5a contracts: profile refuses 401 words while its 400-word positive control succeeds', () => {
  profileControl();
  const { before, previous } = profileNote();
  expect(applyChanges(enc(before), [profileChange(previous, profileWords(400))]).ok).toBe(true);
  expect(applyChanges(enc(before), [profileChange(previous, profileWords(401))])).toEqual({ ok: false, reason: 'field' });
});

it('B5a contracts: profile never adopts person prose and never enlarges Current state', () => {
  profileControl();
  const { before, previous } = profileNote();
  expect(applyChanges(enc(before), [profileChange(previous, profileWords(4))]).ok).toBe(true);
  const personal = '## Profile\nAlex keeps these personal words.\n';
  const unchanged = enc(personal);
  expect(applyChanges(unchanged, [profileChange(personal, profileWords(4))])).toEqual({ ok: false, reason: 'not-bower' });
  expect(dec(unchanged)).toBe(personal);
  // Current state stays on its independent existing write contract; a profile does not supply adoption authority.
  expect(applyChanges(enc(before), [{ kind: 'state-rewrite', recordIds: [], previous: ['Signed with [[Old]]'],
    lines: Array.from({ length: 21 }, () => 'TypeScript') }])).toEqual({ ok: false, reason: 'field' });
});

it('B5a contracts: old note fixtures keep legacy and ownership/2 meanings', () => {
  profileControl();
  const legacyText = legacy('\n', '## Current state', '- Alex uses TypeScript.', '', 'Alex keeps personal prose.', '',
    '## Timeline', '- 6 Oct · Read the CV · [[CV]]', '');
  expect(parseOwnership(enc(legacyText)).status).toBe('legacy');
  expect(parseNote('Areas/Career/Career.md', legacyText).currentState).toEqual(['Alex uses TypeScript.']);
  expect(parseNote('Areas/Career/Career.md', legacyText).body).toBe('Alex keeps personal prose.');
  const old = profileNote().old;
  expect(parseOwnership(enc(old)).status).toBe('v2');
  expect(parseNote('Areas/Career/Career.md', old).currentState).toEqual(['Signed with [[Old]]']);
  expect(parseNote('Areas/Career/Career.md', old).timeline).toHaveLength(1);
});

function expectEdit(before: string, changes: Change[], after: string): void {
  const source = enc(before);
  const copy = source.slice();
  expect(applyChanges(source, changes)).toEqual({ ok: true, text: after, bytes: enc(after) });
  expect(source).toEqual(copy);
}
function expectRefusal(before: string | Uint8Array, changes: Change[], reason: string): void {
  expect(applyChanges(typeof before === 'string' ? enc(before) : before, changes)).toEqual({ ok: false, reason });
}
const span = (text: string, at: { start: number; end: number }): string => dec(enc(text).subarray(at.start, at.end));
/** R3-1 by re-parsing: status, personal bytes and tasks, and every payload but the changed one stay identical. */
function keeps(before: string, after: string, changed: Owner | null): void {
  const a = parseOwnership(enc(before));
  const b = parseOwnership(enc(after));
  expect(b.status).toBe(a.status);
  if (a.status === 'invalid' || b.status === 'invalid') throw new Error('Fixture notes must parse');
  expect(span(after, b.personal)).toBe(span(before, a.personal));
  expect(b.tasks.map(({ index, label, done }) => ({ index, label, done }))).toEqual(a.tasks.map(({ index, label, done }) => ({ index, label, done })));
  if (a.status === 'v2' && b.status === 'v2') {
    for (const owner of ['current', 'personal', 'timeline', 'bower-note'] as const) {
      if (owner !== changed) expect(span(after, b.payloads[owner]), owner).toBe(span(before, a.payloads[owner]));
    }
  }
}
/** R4-3 m-b: every original byte kept in order. */
function insertionOnly(before: string, after: string): boolean {
  const a = enc(before);
  const b = enc(after);
  let i = 0;
  for (let j = 0; j < b.length && i < a.length; j++) if (a[i] === b[j]) i++;
  return i === a.length;
}

// ---------------------------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------------------------

const time = '2026-10-06T09:00:00.000Z';
const requestedAt = Date.UTC(2026, 9, 6, 9, 0, 0);
const digest = (char: string): string => char.repeat(64);
const seen = (fileId: string, name: string, parent: string, folder = false): SeenFile => ({ fileId, name, parents: [parent], folder, modifiedTime: time });
const verifiedText = (text: string): VerifiedContent => ({ ...raw(text), provenance: 'fake-stored', observedModifiedTime: time });
const noteSeen = (): SeenFile => seen('note-lease', 'Lease.md', 'areas-home');
const NOTE_BEFORE = legacy('\n', 'Notes on [[Old]].', '', '## Timeline', '- 2026-10-01 · Filed lease.pdf', '');
const NOTE_AFTER = legacy('\n', 'Notes on [[New]].', '', '## Timeline', '- 2026-10-01 · Filed lease.pdf', '- 2026-10-06 · Merged Lease draft · [[Lease draft]]', '');
const NOTE_CHANGES = (): Change[] => [relink(['Old', 'New']), append(entry('Merged Lease draft', 'Lease draft'))];

const op = (effect: EffectV2, dependsOn: string[] = []): OperationV2 => ({ operationId: '', ordinal: 0, dependsOn, effect });
const editOf = (path: string, before: SeenFile, from: string, to: string, changes: Change[]): EditText => ({
  kind: 'edit-text', before, path, beforeContent: verifiedText(from), changes, text: to, content: raw(to),
});
/** An archive move of a journal record file into `.bower/archive`. */
const archive = (fileId: string, name: string): EffectV2 => ({ kind: 'move', before: seen(fileId, name, 'journal'), parent: { fileId: 'archive' }, name, properties: {} });
const report = (requires: string[]): ManifestV2['reportPlan'][number] => ({
  requires, when: 'applied', value: { filed: [], created: [], updated: [{ path: 'Areas/Home/Lease.md', what: 'A line on its timeline' }], setAside: [], questions: [] },
});

/** A merge's Timeline line plus a rename's link fix on one legacy note, with its mark move and both archives. */
function base(): ManifestV2 {
  return {
    v: 2, kind: 'run-manifest', scope: { rootId: 'fake-root' }, runId: 'run-edit', requestId: 'request-edit',
    runScope: 'all', allowWeb: false, requestedAt, captureId: '',
    capture: {
      piles: [], members: [],
      journal: [
        { recordId: MERGE, sha256: digest('a'), fileIds: ['journal-merge'] },
        { recordId: RENAME, sha256: digest('b'), fileIds: ['journal-rename'] },
      ],
      places: [
        { file: noteSeen(), path: 'Areas/Home/Lease.md' },
        { file: seen('archive', 'archive', 'bower-system', true), path: '.bower/archive' },
      ],
    },
    operations: [
      op(editOf('Areas/Home/Lease.md', noteSeen(), NOTE_BEFORE, NOTE_AFTER, NOTE_CHANGES())),
      op({ kind: 'move', before: noteSeen(), parent: { fileId: 'areas-home' }, name: 'Lease.md', properties: { bowerNew: '1' } }, ['#0']),
      op(archive('journal-merge', 'merge.json'), ['#0']),
      op(archive('journal-rename', 'rename.json'), ['#0']),
    ],
    reportPlan: [report(['#0'])],
  };
}
const RULES_BEFORE = '---\nsummary: 0 rules Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n';
const RULES_AFTER = '---\nsummary: 1 rule Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n'
  + '- Name scans by date. <!-- since 2026-10-06 -->\n  *You wrote: "scans by date"*\n';
/** A rule worded into the root Rules.md, with its record's archive. */
function rulesManifest(): ManifestV2 {
  const value = base();
  const rulesSeen = seen('rules-file', 'Rules.md', 'fake-root');
  value.capture.journal = [{ recordId: RULE, sha256: digest('c'), fileIds: ['journal-rule'] }];
  value.capture.places = [{ file: rulesSeen, path: 'Rules.md' }];
  value.operations = [
    op(editOf('Rules.md', rulesSeen, RULES_BEFORE, RULES_AFTER, [word([rule('Name scans by date.', 'scans by date')])])),
    op(archive('journal-rule', 'rule.json'), ['#0']),
  ];
  value.reportPlan = [{ requires: ['#0'], when: 'applied', value: { filed: [], created: [], updated: [], setAside: [], questions: [], rulesWorded: 1 } }];
  return value;
}
/** Fix ordinals, captureId and operation IDs with the oracle; `#n` names the n-th operation. */
function seal<T extends { runId: string; scope: unknown; runScope: unknown; capture: unknown; captureId: string; operations: OperationV2[]; reportPlan: { requires: string[] }[] }>(value: T): T {
  value.captureId = H({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  const ids = value.operations.map((item, ordinal) => {
    item.ordinal = ordinal;
    item.operationId = H({ runId: value.runId, captureId: value.captureId, ordinal, effect: item.effect });
    return item.operationId;
  });
  const ref = (id: string): string => (id.startsWith('#') ? ids[Number(id.slice(1))] ?? id : id);
  for (const item of value.operations) item.dependsOn = item.dependsOn.map(ref);
  for (const item of value.reportPlan) item.requires = item.requires.map(ref);
  return value;
}
const variant = (change: (value: ManifestV2) => void, from: () => ManifestV2 = base): ManifestV2 => { const value = from(); change(value); return seal(value); };
const bytes = (value: unknown): Uint8Array => enc(JSON.stringify(value));
function editAt(value: ManifestV2, index = 0): EditText {
  const effect = value.operations[index]?.effect;
  if (effect?.kind !== 'edit-text') throw new Error('The fixture must hold an edit here');
  return effect;
}
function opAt(value: ManifestV2, index: number): OperationV2 {
  const found = value.operations[index];
  if (!found) throw new Error('The fixture must hold this operation');
  return found;
}
async function admits(value: ManifestV2): Promise<void> {
  const source = bytes(value);
  expect(await parseRunManifestV2(source, 'fake-root', RUNNER_WRITES)).toEqual({ ok: true, value, sha256: H(value) });
}
/** An `edit` refusal names the TL-P2-20 rule that failed (review M3); no other refusal carries one. */
async function refuses(value: unknown, reason: ManifestV2Refusal | 'number', rule?: EditGuardRule): Promise<void> {
  expect(await parseRunManifestV2(bytes(value), 'fake-root', RUNNER_WRITES)).toEqual(rule === undefined ? { ok: false, reason } : { ok: false, reason, rule });
}

// Literal digests of the ratified v1 fixtures, copied from run-manifest.test.ts; never computed by the code under test.
const evidence = 'docs/harness/evidence/2026-10-05-local-prerequisites/run-recovery-contract/';
const fixture = (file: string): Record<string, unknown> => (JSON.parse(readFileSync(evidence + file, 'utf8')) as { input: Record<string, unknown> }).input;
const manifest01Hash = '9badff317145d753071b77cb70bd17c13ac745047180d0e0b6e341c1a1eef088';
const operation01Id = 'ffc686d1c2d38997ab8d92f0fd566b21a1989fd900b8ba38c5b9f5a1cd1ac1da';
const manifest04Hash = '109ccdb48872207b5125ac2f4db2844af31c0ec55328de644ab7957f407e4d86';
const operation04First = '5ca60524fdf569e4c4c5ee985058989f9679107b5289720503f1dd0d2b099331';

describe('note edits change only what the contract allows', () => {
  describe('manifest v1 and v2 compatibility', () => {
    it('keeps v1 parsing, hashes and operation identities byte-identical through the v2 reader', async () => {
      for (const [file, hash, first] of [['01-admission-reopen.json', manifest01Hash, operation01Id], ['04-report-publication-retry.json', manifest04Hash, operation04First]] as const) {
        const manifest = fixture(file).manifest as Manifest;
        const source = bytes(manifest);
        const v1 = await parseRunManifest(source, manifest.scope.rootId, RUNNER_WRITES);
        const v2 = await parseRunManifestV2(source, manifest.scope.rootId, RUNNER_WRITES);
        expect(v2).toEqual(v1);
        expect(v2).toEqual({ ok: true, value: manifest, sha256: hash });
        expect(v2.ok && v2.value.operations[0]?.operationId).toBe(first);
      }
    });

    it('accepts a v2 manifest with an edit, computing identities as v1 does over the canonical effect', async () => {
      const value = seal(base());
      await admits(value);
      expect(opAt(value, 0).operationId).toBe(H({ runId: 'run-edit', captureId: value.captureId, ordinal: 0, effect: editAt(value) }));
      await admits(seal(rulesManifest()));
    });

    it('is refused by the v1 parser, and edit-text is refused in a v1 manifest', async () => {
      expect(await parseRunManifest(bytes(seal(base())), 'fake-root', RUNNER_WRITES)).toEqual({ ok: false, reason: 'shape' });
      const v1 = variant((value) => { (value as unknown as { v: number }).v = 1; });
      expect(await parseRunManifest(bytes(v1), 'fake-root', RUNNER_WRITES)).toEqual({ ok: false, reason: 'shape' });
      await refuses(v1, 'shape');
    });

    it('a stored v2 manifest over the write bound still parses', async () => {
      // Strict on write, lenient on read (TL-P4-14 addendum 22): a Current state Bower read (`previous`), or one an undo
      // writes back, holds up to 20 lines of 400 characters; a manifest stored with one still parses, so undo and
      // history keep working. Past that read bound it is refused.
      const lines = (n: number, size: number): string[] => Array.from({ length: n }, (_, k) => `${'Two applications open, '.repeat(20)}${k}`.slice(0, size - 1) + 'x');
      const stated = (previous: string[], next: string[]): ManifestV2 => variant((value) => {
        editAt(value).changes.unshift({ kind: 'state-rewrite', recordIds: [], previous, lines: next });
      });
      await admits(stated(lines(20, 400), lines(1, 200)));
      await admits(stated(lines(1, 200), lines(20, 400)));
      await admits(stated(lines(9, 201), lines(9, 201)));
      await refuses(stated(lines(21, 400), lines(1, 200)), 'shape');
      await refuses(stated(lines(1, 401), lines(1, 200)), 'shape');
      await refuses(stated(lines(1, 200), lines(21, 400)), 'shape');
    });

    it('an old manifest with a sourceless news line still reads', async () => {
      // TL-P4-19 addendum 22: the uncited refusal is for writes and plans only. A manifest stored before it, with a news
      // line that cites nothing, still parses (strict on write, lenient on read), so undo and history keep working.
      const stored = variant((value) => {
        const at = editAt(value).changes.find((c) => c.kind === 'timeline-append');
        const first = at?.kind === 'timeline-append' ? at.entries[0] : undefined;
        if (at?.kind !== 'timeline-append' || !first) throw new Error('The fixture must hold a Timeline line');
        at.entries.push({ date: first.date, text: 'New: Alex called back.', source: null });
      });
      await admits(stored);
      // Its other field rules still hold on read.
      await refuses(variant((value) => {
        const at = editAt(value).changes.find((c) => c.kind === 'timeline-append');
        const first = at?.kind === 'timeline-append' ? at.entries[0] : undefined;
        if (at?.kind !== 'timeline-append' || !first) throw new Error('The fixture must hold a Timeline line');
        at.entries.push({ date: first.date, text: 'New: Alex [[called]] back.', source: null });
      }), 'shape');
    });

    it('refuses a v2 manifest without edit-text, and names a later version apart', async () => {
      await refuses(variant((value) => {
        value.operations = [op(archive('journal-merge', 'merge.json'))];
        value.reportPlan = [];
      }), 'shape');
      await refuses(variant((value) => { (value as unknown as { v: number }).v = 3; }), 'version');
      for (const v of ['2', 0, null, true]) await refuses(variant((value) => { (value as unknown as { v: unknown }).v = v; }), 'shape');
    });
  });

  describe('the v2 guard', () => {
    it('refuses each scope exclusion of the target', async () => {
      const moved = (path: string) => (value: ManifestV2): void => {
        const place = value.capture.places[0];
        if (place) place.path = path;
        editAt(value).path = path;
      };
      await refuses(variant(moved('.bower/Lease.md')), 'edit', 'target');
      await refuses(variant(moved('Inbox/Lease.md')), 'edit', 'target');
      await refuses(variant(moved('Areas/Home/Lease.txt')), 'edit', 'target');
      await refuses(variant((value) => {
        value.capture.piles.push({ pileId: 'pile-one', source: { kind: 'observed' }, anchor: null, memberKeys: [null], childFileIds: [], context: { kind: 'absent' } });
        value.capture.members.push({ pileId: 'pile-one', memberKey: null, file: noteSeen(), content: verifiedText(NOTE_BEFORE) });
      }), 'edit', 'target');
      await refuses(variant((value) => {
        value.capture.piles.push({ pileId: 'pile-one', source: { kind: 'observed' }, anchor: null, memberKeys: [], childFileIds: ['note-lease'], context: { kind: 'absent' } });
      }), 'edit', 'target');
      await refuses(variant((value) => { opAt(value, 1).effect = { kind: 'move', before: noteSeen(), parent: { fileId: 'areas-work' }, name: 'Lease.md', properties: { bowerNew: '1' } }; }), 'edit', 'target');
      await refuses(variant((value) => { value.operations.push(op({ kind: 'bin', before: noteSeen(), capturedChildIds: [] }, ['#0'])); }), 'edit', 'target');
      await refuses(variant((value) => {
        const folder = { ...noteSeen(), folder: true };
        const place = value.capture.places[0];
        if (place) place.file = folder;
        editAt(value).before = folder;
        const mark = opAt(value, 1).effect;
        if (mark.kind === 'move') mark.before = folder;
      }), 'edit', 'target');
    });

    it('refuses a target not recorded in capture.places with its SeenFile and path', async () => {
      await refuses(variant((value) => { value.capture.places.shift(); }), 'edit', 'target');
      await refuses(variant((value) => { const place = value.capture.places[0]; if (place) place.file = { ...noteSeen(), modifiedTime: '2026-10-06T09:30:00.000Z' }; }), 'edit', 'target');
      await refuses(variant((value) => { const place = value.capture.places[0]; if (place) place.path = 'Areas/Work/Lease.md'; }), 'edit', 'target');
    });

    it('allows rules-wording only on the root Rules.md', async () => {
      await refuses(variant((value) => { editAt(value).changes.push(word([rule('Name scans by date.', 'scans by date')])); }), 'edit', 'rules-path');
      await refuses(variant((value) => {
        const place = value.capture.places[0];
        if (place) place.path = 'Areas/Rules.md';
        editAt(value).path = 'Areas/Rules.md';
      }, rulesManifest), 'edit', 'rules-path');
    });

    it('refuses two edits to one file', async () => {
      await refuses(variant((value) => {
        value.operations.splice(1, 0, op(editOf('Areas/Home/Lease.md', noteSeen(), NOTE_BEFORE, NOTE_AFTER, [append(entry('Filed scan.pdf'))])));
        for (const item of value.operations.slice(2)) item.dependsOn = ['#0', '#1'];
      }), 'edit', 'one-per-file');
    });

    it('refuses text that its content does not describe, and content equal to beforeContent', async () => {
      await refuses(variant((value) => { editAt(value).content = raw(`${NOTE_AFTER}x`); }), 'content');
      await refuses(variant((value) => { editAt(value).content = { ...raw(NOTE_AFTER), encoding: 'blob' }; }), 'content');
      await refuses(variant((value) => { editAt(value).text = NOTE_BEFORE; editAt(value).content = raw(NOTE_BEFORE); }), 'edit', 'unchanged');
    });

    it('refuses a record id that is not in capture.journal', async () => {
      await refuses(variant((value) => { editAt(value).changes = [relink(['Old', 'New']), { ...append(entry('Merged Lease draft', 'Lease draft')), recordIds: ['2026-10-06T08-00-09.000Z-missing'] }]; }), 'edit', 'record');
      await refuses(variant((value) => { editAt(value).changes = [word([{ ...rule('Name scans by date.', 'scans by date'), recordId: 'missing' }])]; }, rulesManifest), 'edit', 'record');
      await refuses(variant((value) => { editAt(value).changes = [{ ...relink(['Old', 'New']), recordIds: [RENAME, RENAME] }, append(entry('Merged Lease draft', 'Lease draft'))]; }), 'shape');
    });

    it('holds the 1 MiB file limit and the 8 MiB manifest limit', async () => {
      expect(EDIT_FILE_LIMIT).toBe(1048576);
      expect(MANIFEST_V2_LIMIT).toBe(8388608);
      await admits(variant((value) => { editAt(value).beforeContent.size = 1048576; }));
      await refuses(variant((value) => { editAt(value).beforeContent.size = 1048577; }), 'edit', 'size');
      await refuses(variant((value) => { editAt(value).beforeContent.encoding = 'blob'; }), 'edit', 'encoding');
      const big = (size: number): ManifestV2 => variant((value) => {
        const text = 'x'.repeat(size);
        value.operations.push(op({ kind: 'create-text', parent: { fileId: 'areas-home' }, name: 'Big.md', createKey: 'big-note', text, content: raw(text), purpose: 'generated' }));
      });
      const size = 8388608 - 4000;
      const exact = size + (8388608 - bytes(big(size)).byteLength);
      expect(bytes(big(exact)).byteLength).toBe(8388608);
      await admits(big(exact));
      await refuses(big(exact + 1), 'edit', 'size');
    }, 60000);

    it('refuses Timeline fields that break the line format, and a date other than requestedAt\'s', async () => {
      const withEntry = (value: EditEntry) => variant((manifest) => { editAt(manifest).changes = [relink(['Old', 'New']), append(value)]; });
      for (const text of ['Merged · twice', 'Merged [[Lease', 'Merged Lease]]', 'Merged\nLease', 'Merged\rLease', 'Merged\u0007']) {
        await refuses(withEntry(entry(text, 'Lease draft')), 'shape');
      }
      for (const source of ['Lease]', 'Lease|draft', 'Lease#h', 'Lease^b', 'Lease\ndraft', '']) {
        await refuses(withEntry(entry('Merged Lease draft', source)), 'shape');
      }
      for (const date of ['2026-10-6', '2026-02-30', '6 Oct', '2026-10-06 · x']) {
        await refuses(withEntry(entry('Merged Lease draft', 'Lease draft', date)), 'shape');
      }
      await refuses(withEntry(entry('Merged Lease draft', 'Lease draft', '2026-10-05')), 'edit', 'date');
      await refuses(variant((value) => { editAt(value).changes = [relink(['Old', 'New']), { kind: 'timeline-append', recordIds: [MERGE], entries: [] }]; }), 'shape');
    });

    it('takes the Timeline date from requestedAt in UTC', () => {
      expect(timelineDate(Date.UTC(2026, 9, 5, 23, 59, 59, 999))).toBe('2026-10-05');
      expect(timelineDate(Date.UTC(2026, 9, 6))).toBe('2026-10-06');
      expect(timelineDate(requestedAt)).toBe('2026-10-06');
      expect(timelineDate(Date.UTC(10000, 0, 1))).toBeNull();
      expect(timelineDate(Number.MAX_SAFE_INTEGER)).toBeNull();
      expect(timelineDate(-1)).toBeNull();
    });

    it('refuses changes out of the canonical order link-rewrite, timeline-append, rules-wording', async () => {
      await refuses(variant((value) => { editAt(value).changes = [append(entry('Merged Lease draft', 'Lease draft')), relink(['Old', 'New'])]; }), 'shape');
      await refuses(variant((value) => { editAt(value).changes = [relink(['Old', 'New']), relink(['Other', 'Else']), append(entry('Merged Lease draft', 'Lease draft'))]; }), 'shape');
      await refuses(variant((value) => { editAt(value).changes = []; }), 'shape');
    });

    it('refuses link renames that are not display names', async () => {
      for (const renames of [[['Areas/Old', 'New']], [['Old.md', 'New']], [['Old', 'Ne|w']], [['Old', 'New]']], [['Old', 'Areas/New']], [['Old', 'New'], ['OLD', 'Else']], [['', 'New']]] as [string, string][][]) {
        await refuses(variant((value) => { editAt(value).changes = [relink(...renames), append(entry('Merged Lease draft', 'Lease draft'))]; }), 'shape');
      }
    });

    it('requires since > 0 and line-free rule words', async () => {
      await refuses(variant((value) => { editAt(value).changes = [word([rule('Name scans by date.', 'scans by date', 0)])]; }, rulesManifest), 'shape');
      // Negative and fractional numbers never pass record JSON.
      for (const since of [-1, 1.5]) await refuses(variant((value) => { editAt(value).changes = [word([rule('Name scans by date.', 'scans by date', since)])]; }, rulesManifest), 'number');
      await refuses(variant((value) => { editAt(value).changes = [word([rule('Name scans\nby date.', 'scans by date')])]; }, rulesManifest), 'shape');
      await refuses(variant((value) => { editAt(value).changes = [word([rule('Name scans by date.', 'scans\nby date')])]; }, rulesManifest), 'shape');
      await refuses(variant((value) => { editAt(value).changes = [word([], [])]; }, rulesManifest), 'shape');
    });

    it('applies B\'s full path rule to the edit path', async () => {
      for (const path of ['', '/Lease.md', 'Areas//Lease.md', 'Areas/../Lease.md', 'Areas/./Lease.md', 'Areas\\Home/Lease.md', 'Areas/Ho\u0001me/Lease.md']) {
        await refuses(variant((value) => { editAt(value).path = path; }), 'shape');
      }
    });

    it('refuses an edit-text, change or entry that is not closed', async () => {
      await refuses(variant((value) => { (editAt(value) as unknown as Record<string, unknown>).extra = 1; }), 'shape');
      await refuses(variant((value) => { delete (editAt(value) as unknown as Record<string, unknown>).beforeContent; }), 'shape');
      await refuses(variant((value) => { (editAt(value).changes[0] as unknown as Record<string, unknown>).extra = 1; }), 'shape');
      await refuses(variant((value) => { editAt(value).changes = [relink(['Old', 'New']), append({ ...entry('Merged Lease draft', 'Lease draft'), extra: 1 } as EditEntry)]; }), 'shape');
    });

    it('holds each record\'s archive until every edit naming it (a rejected edit keeps its journal record)', async () => {
      await refuses(variant((value) => { opAt(value, 2).dependsOn = []; }), 'edit', 'archive');
      await refuses(variant((value) => { opAt(value, 3).dependsOn = ['#1']; }), 'edit', 'archive');
      await refuses(variant((value) => { opAt(value, 1).dependsOn = []; }, rulesManifest), 'edit', 'archive');
      await admits(variant((value) => { value.operations.splice(2, 1); }));
    });

    it('marks a note new only for a Timeline line, with an in-place move after the edit', async () => {
      await refuses(variant((value) => { value.operations.splice(1, 1); value.operations.forEach((item) => { item.dependsOn = ['#0']; }); opAt(value, 0).dependsOn = []; }), 'edit', 'mark');
      await refuses(variant((value) => { const mark = opAt(value, 1).effect; if (mark.kind === 'move') mark.properties = { bowerNew: null }; }), 'edit', 'mark');
      await refuses(variant((value) => { const mark = opAt(value, 1).effect; if (mark.kind === 'move') mark.properties = { bowerNew: '1', by: 'bower' }; }), 'edit', 'mark');
      await refuses(variant((value) => { opAt(value, 1).dependsOn = []; }), 'edit', 'mark');
      await refuses(variant((value) => { editAt(value).changes = [relink(['Old', 'New'])]; }), 'edit', 'mark');
      await admits(variant((value) => { editAt(value).changes = [relink(['Old', 'New'])]; value.operations.splice(1, 1); }));
      await refuses(variant((value) => { value.operations.push(op({ kind: 'move', before: seen('rules-file', 'Rules.md', 'fake-root'), parent: { fileId: 'fake-root' }, name: 'Rules.md', properties: { bowerNew: '1' } }, ['#0'])); }, rulesManifest), 'edit', 'mark');
    });
  });

  describe('timeline-append', () => {
    const merged = entry('Merged Lease draft', 'Lease draft');
    const line = '- 2026-10-06 · Merged Lease draft · [[Lease draft]]';

    it('inserts just before the ownership/2 end marker, with LF, CRLF and an empty payload', () => {
      for (const eol of ['\n', '\r\n']) {
        const before = v2(eol, ['## Timeline', '- 2026-10-01 · Filed lease.pdf']);
        const after = v2(eol, ['## Timeline', '- 2026-10-01 · Filed lease.pdf', line]);
        expectEdit(before, [append(merged)], after);
        keeps(before, after, 'timeline');
      }
      expectEdit(v2('\n', []), [append(merged)], v2('\n', [line]));
      expectEdit(v2('\n', ['## Timeline']), [append(merged, entry('Filed scan.pdf'))], v2('\n', ['## Timeline', line, '- 2026-10-06 · Filed scan.pdf']));
    });

    it('takes CRLF for ownership/2 when the file has any CRLF, and keeps a fence in the payload', () => {
      const mixed = v2('\n', ['## Timeline']).replace('summary: Lease\n', 'summary: Lease\r\n');
      expectEdit(mixed, [append(merged)], mixed.replace(E('timeline'), `${line}\r\n${E('timeline')}`));
      const fenced = ['## Timeline', '```', '- 2026-01-01 · In code', '<!-- bower:ownership/2 end timeline -->', '```'];
      const before = v2('\n', fenced);
      const after = v2('\n', [...fenced, line]);
      expectEdit(before, [append(merged)], after);
      keeps(before, after, 'timeline');
    });

    it('a timeline news line with no source is refused', () => {
      // TL-P4-19 addendum 20: every Timeline line cites its source. A news line (what Bower would have written in a
      // Current state the person owns) with no source is refused by the one field rule, for every writer.
      const before = enc(v2('\n', ['## Timeline']));
      expect(applyChanges(before, [append(entry('New: Alex called back.'))])).toEqual({ ok: false, reason: 'field' });
      expect(applyChanges(before, [append(entry('New: Alex called back.', 'Call notes'))]).ok).toBe(true);
      // Any other line keeps its rule: a hub line with nothing to cite is still written.
      expect(applyChanges(before, [append(entry('Filed scan.pdf'))]).ok).toBe(true);
    });

    it('keeps a BOM as a prefix', () => {
      expectEdit(`\ufeff${v2('\n', [])}`, [append(merged)], `\ufeff${v2('\n', [line])}`);
      expectEdit(`\ufeff${v2('\r\n', [])}`, [append(merged)], `\ufeff${v2('\r\n', [line])}`);
    });

    it('appends after the last non-blank line of a legacy Timeline section, keeping the blank lines', () => {
      for (const eol of ['\n', '\r\n']) {
        const before = legacy(eol, '## Current state', '- Signed', '', 'Notes on [[Old]].', '- [ ] Call Alex', '', '## Timeline', '- 2026-10-01 · Filed lease.pdf', '', "## Bower's note", 'Kept.', '');
        const after = legacy(eol, '## Current state', '- Signed', '', 'Notes on [[Old]].', '- [ ] Call Alex', '', '## Timeline', '- 2026-10-01 · Filed lease.pdf', line, '', "## Bower's note", 'Kept.', '');
        expectEdit(before, [append(merged)], after);
        keeps(before, after, null);
      }
    });

    it('inserts a missing legacy section at the line ending before Bower\'s note (R3-2)', () => {
      expectEdit(
        '---\nsummary: Lease\nby: bower\n---\nNotes on [[Old]].\n\n## Bower\'s note\nKept.\n', [append(merged)],
        `---\nsummary: Lease\nby: bower\n---\nNotes on [[Old]].\n\n## Timeline\n${line}\n## Bower's note\nKept.\n`,
      );
      const before = '---\r\nsummary: Lease\r\nby: bower\r\n---\r\nNotes on [[Old]].\r\n\r\n## Bower\'s note\r\nKept.\r\n';
      const after = `---\r\nsummary: Lease\r\nby: bower\r\n---\r\nNotes on [[Old]].\r\n\r\n## Timeline\r\n${line}\r\n## Bower's note\r\nKept.\r\n`;
      expectEdit(before, [append(merged)], after);
      keeps(before, after, null);
      expectEdit(
        '---\nby: bower\n---\nNotes.\n## Bower\'s note\nKept.\n', [append(merged, entry('Filed scan.pdf'))],
        `---\nby: bower\n---\nNotes.\n## Timeline\n${line}\n- 2026-10-06 · Filed scan.pdf\n## Bower's note\nKept.\n`,
      );
    });

    it('appends a missing legacy section at the end, with or without a final line ending (R3-2)', () => {
      expectEdit('---\nby: bower\n---\nNotes.\n', [append(merged)], `---\nby: bower\n---\nNotes.\n\n## Timeline\n${line}\n`);
      expectEdit('---\r\nby: bower\r\n---\r\nNotes.\r\n', [append(merged)], `---\r\nby: bower\r\n---\r\nNotes.\r\n\r\n## Timeline\r\n${line}\r\n`);
      expectEdit('---\nby: bower\n---\nNotes.', [append(merged)], `---\nby: bower\n---\nNotes.\n## Timeline\n${line}`);
      expectEdit('---\r\nby: bower\r\n---\r\nNotes.', [append(merged)], `---\r\nby: bower\r\n---\r\nNotes.\r\n## Timeline\r\n${line}`);
      const before = '---\nby: bower\n---\nNotes.';
      keeps(before, `---\nby: bower\n---\nNotes.\n## Timeline\n${line}`, null);
    });

    it('takes CRLF when a legacy file has any CRLF, even mixed, and no final line ending in the section', () => {
      expectEdit('---\nby: bower\r\n---\n## Timeline\n- 2026-10-01 · A\n', [append(merged)], `---\nby: bower\r\n---\n## Timeline\n- 2026-10-01 · A\r\n${line}\n`);
      expectEdit('---\nby: bower\n---\n## Timeline\n- 2026-10-01 · A', [append(merged)], `---\nby: bower\n---\n## Timeline\n- 2026-10-01 · A\n${line}`);
    });

    it('puts lines right after the heading of an empty section (m-a)', () => {
      expectEdit(
        '---\nby: bower\n---\nNotes.\n\n## Timeline\n\n## Bower\'s note\nKept.\n', [append(merged)],
        `---\nby: bower\n---\nNotes.\n\n## Timeline\n${line}\n\n## Bower's note\nKept.\n`,
      );
      expectEdit('---\r\nby: bower\r\n---\r\n## Timeline\r\n\r\n\r\n', [append(merged)], `---\r\nby: bower\r\n---\r\n## Timeline\r\n${line}\r\n\r\n\r\n`);
    });

    it('uses the last of two Timeline headings, and runs the section over a ## heading inside it', () => {
      expectEdit(
        '---\nby: bower\n---\n## Timeline\nMy own words.\n\n## Timeline\n- 2026-10-01 · A\n', [append(merged)],
        `---\nby: bower\n---\n## Timeline\nMy own words.\n\n## Timeline\n- 2026-10-01 · A\n${line}\n`,
      );
      const before = '---\nby: bower\n---\nNotes.\n\n## Timeline\n- 2026-10-01 · A\n\n## Links\nSee [[B]].\n\n';
      const after = `---\nby: bower\n---\nNotes.\n\n## Timeline\n- 2026-10-01 · A\n\n## Links\nSee [[B]].\n${line}\n\n`;
      expectEdit(before, [append(merged)], after);
      keeps(before, after, null);
    });

    it('re-parses to the previous entries followed by the new ones, by insertion only (m-b)', () => {
      const cases: [string, string][] = [
        [v2('\r\n', ['## Timeline', '- 2026-10-01 · Filed lease.pdf']), v2('\r\n', ['## Timeline', '- 2026-10-01 · Filed lease.pdf', line, '- 2026-10-06 · Filed scan.pdf'])],
        [legacy('\n', 'Notes.', '', '## Timeline', '- 2 Oct · Old style · [[Lease]]', ''), legacy('\n', 'Notes.', '', '## Timeline', '- 2 Oct · Old style · [[Lease]]', line, '- 2026-10-06 · Filed scan.pdf', '')],
        [legacy('\n', 'Notes.'), legacy('\n', 'Notes.', '## Timeline', line, '- 2026-10-06 · Filed scan.pdf')],
      ];
      for (const [before, after] of cases) {
        expectEdit(before, [append(merged, entry('Filed scan.pdf'))], after);
        expect(insertionOnly(before, after)).toBe(true);
        expect(parseNote('Lease.md', after).timeline).toEqual([
          ...parseNote('Lease.md', before).timeline,
          { date: '2026-10-06', text: 'Merged Lease draft', source: 'Lease draft' },
          { date: '2026-10-06', text: 'Filed scan.pdf' },
        ]);
      }
    });

    it('skips an entry already present by text and source, whatever its date (R3-3, m-d)', () => {
      const before = legacy('\n', 'Notes.', '', '## Timeline', '- 2026-10-01 · Merged Lease draft · [[Lease draft]]', '');
      expectRefusal(before, [append(merged)], 'unchanged');
      expectRefusal(before, [append(entry('Merged Lease draft', 'Lease draft', '2026-11-30'))], 'unchanged');
      expectEdit(before, [append(merged, entry('Merged Lease draft', 'Other'), entry('Merged Lease draft'))],
        legacy('\n', 'Notes.', '', '## Timeline', '- 2026-10-01 · Merged Lease draft · [[Lease draft]]', '- 2026-10-06 · Merged Lease draft · [[Other]]', '- 2026-10-06 · Merged Lease draft', ''));
      expectEdit(v2('\n', []), [append(merged, entry('Merged Lease draft', 'Lease draft', '2026-10-07'))], v2('\n', [line]));
      expectRefusal(v2('\n', ['- 2026-09-01 · Merged Lease draft · [[Lease draft]]']), [append(merged)], 'unchanged');
    });

    it('refuses a person\'s note, a plain note, every OwnershipFailure and invalid UTF-8', () => {
      expectRefusal('---\nsummary: Mine\n---\nNotes.\n', [append(merged)], 'not-bower');
      expectRefusal('---\nby: alex\n---\nNotes.\n', [append(merged)], 'not-bower');
      expectRefusal('Just my notes.\n', [append(merged)], 'not-bower');
      expectRefusal(`\ufeff${legacy('\n', 'Notes.', '')}`, [append(merged)], 'not-bower');
      expectRefusal(v2('\n', []).replace('ownership/2\n', 'ownership/3\n'), [append(merged)], 'unsupported-version');
      expectRefusal(v2('\n', []).replace(`${E('timeline')}\n`, ''), [append(merged)], 'damaged-boundary');
      expectRefusal(v2('\n', []).replace('summary: Lease\n', 'summary: Lease\r'), [append(merged)], 'damaged-boundary');
      expectRefusal(new Uint8Array([...enc(legacy('\n', 'Notes ')), 0xff, 0x0a]), [append(merged)], 'invalid-encoding');
      expectRefusal(new Uint8Array([...enc(legacy('\n', 'Notes ')), 0xed, 0xa0, 0x80]), [append(merged)], 'invalid-encoding');
    });

    it('refuses entries that break the line format, and files over 1 MiB', () => {
      const note = legacy('\n', 'Notes.', '');
      for (const bad of [entry('A · B'), entry('A [[B'), entry('A ]]'), entry('A\nB'), entry('A', 'B]'), entry('A', 'B|C'), entry('A', 'B#C'), entry('A', 'B^C'), entry('A', ''), entry('A', null, '6 Oct')]) {
        expectRefusal(note, [append(bad)], 'field');
      }
      const fits = `${legacy('\n', 'Notes.', '')}${'x'.repeat(1048576 - enc(legacy('\n', 'Notes.', '')).byteLength)}`;
      expect(enc(fits).byteLength).toBe(1048576);
      expect(applyChanges(enc(fits), [append(merged)]).ok).toBe(true);
      expectRefusal(`${fits}x`, [append(merged)], 'too-large');
    });

    it('refuses a faulty splice through the re-parse invariant (m-g)', () => {
      const drop = { splice: (text: string, at: number, insert: string): string => text.slice(0, at) + insert + text.slice(at + 1) };
      const front = { splice: (text: string, _at: number, insert: string): string => insert + text };
      const late = { splice: (text: string, _at: number, insert: string): string => text + insert };
      const cases: [string, (typeof drop)[]][] = [
        [v2('\n', ['## Timeline', '- 2026-10-01 · A']), [drop, front, late]],
        [legacy('\n', 'Notes.', '', '## Timeline', '- 2026-10-01 · A', '', "## Bower's note", 'Kept.', ''), [front, late]],
        [legacy('\n', 'Notes.', "## Bower's note", 'Kept.', ''), [drop, front, late]],
      ];
      for (const [before, faulty] of cases) {
        for (const authors of faulty) {
          expect(applyChangesUsing(enc(before), [append(merged)], authors)).toEqual({ ok: false, reason: 'invariant' });
        }
      }
    });
  });

  describe('link-rewrite', () => {
    it('rewrites ownership/2 payloads and frontmatter values, never markers or bower_format', () => {
      for (const eol of ['\n', '\r\n']) {
        const before = v2(eol, ['## Timeline', '- 2026-10-01 · Filed · [[Old]]']);
        const after = v2(eol, ['## Timeline', '- 2026-10-01 · Filed · [[New]]'], 'New');
        expectEdit(before, [relink(['Old', 'New'])], after);
        expectEdit(`\ufeff${before}`, [relink(['Old', 'New'])], `\ufeff${after}`);
        const a = parseOwnership(enc(before));
        const b = parseOwnership(enc(after));
        expect([a.status, b.status]).toEqual(['v2', 'v2']);
        if (a.status === 'v2' && b.status === 'v2') expect(b.tasks.map((t) => [t.index, t.label, t.done])).toEqual(a.tasks.map((t) => [t.index, t.label, t.done]));
      }
    });

    it('rewrites a legacy note everywhere but the frontmatter delimiters and keys, list values included (m2)', () => {
      const before = '---\nsummary: About [[Old]]\nby: bower\noriginal: [[Old]]\ntags: [a, [[Old]]]\nsee:\n  - [[Old]]\n[[Old]]: key\n---\n'
        + '## Current state\n- With [[Old]]\n\nNotes on [[Old]].\n\n## Timeline\n- 2026-10-01 · Filed · [[Old]]\n\n## Bower\'s note\nSee [[Old]].\n';
      const after = '---\nsummary: About [[New]]\nby: bower\noriginal: [[New]]\ntags: [a, [[New]]]\nsee:\n  - [[New]]\n[[Old]]: key\n---\n'
        + '## Current state\n- With [[New]]\n\nNotes on [[New]].\n\n## Timeline\n- 2026-10-01 · Filed · [[New]]\n\n## Bower\'s note\nSee [[New]].\n';
      expectEdit(before, [relink(['Old', 'New'])], after);
      const person = '---\nby: alex\nrelated: [[Old]]\n---\nMine: [[Old]].\n';
      expectEdit(person, [relink(['Old', 'New'])], '---\nby: alex\nrelated: [[New]]\n---\nMine: [[New]].\n');
    });

    it('rewrites a plain note whole, and refuses invalid notes', () => {
      expectEdit('Mine: [[Old]].\r\nAlso [[old|this]].\r\n', [relink(['Old', 'New'])], 'Mine: [[New]].\r\nAlso [[New|this]].\r\n');
      expectEdit('\ufeff[[Old]]\n', [relink(['Old', 'New'])], '\ufeff[[New]]\n');
      expectRefusal(v2('\n', []).replace('ownership/2\n', 'ownership/3\n'), [relink(['Old', 'New'])], 'unsupported-version');
      expectRefusal(v2('\n', []).replace(`${B('timeline')}\n`, ''), [relink(['Old', 'New'])], 'damaged-boundary');
      expectRefusal(new Uint8Array([...enc('[[Old]] '), 0xc3]), [relink(['Old', 'New'])], 'invalid-encoding');
      expectRefusal('No links here.\n', [relink(['Old', 'New'])], 'unchanged');
    });

    it('keeps embeds, #heading, ^block, |alias and every other byte, and replaces only the trimmed name', () => {
      expectEdit(
        '[[Old]] ![[Old]] [[Old#Heading]] [[Old^block]] [[Old|label]] [[OLD#h|l]] [[ Old #h]] [[Old ]]\n',
        [relink(['Old', 'New'])],
        '[[New]] ![[New]] [[New#Heading]] [[New^block]] [[New|label]] [[New#h|l]] [[ New #h]] [[New ]]\n',
      );
    });

    it('leaves code, path and .md forms, Markdown links and tokens across a line break alone', () => {
      const before = [
        '`[[Old]]` ``a [[Old]] ` b`` [[Old]] `x',
        '```', '[[Old]]', '```', '~~~', '[[Old]]', '~~~',
        '[Old](Old.md) [[Areas/Old]] [[Old.md]] [[Old', ']] [[Old]][[Other]][[Old]]', '',
      ].join('\n');
      const after = [
        '`[[Old]]` ``a [[Old]] ` b`` [[New]] `x',
        '```', '[[Old]]', '```', '~~~', '[[Old]]', '~~~',
        '[Old](Old.md) [[Areas/Old]] [[Old.md]] [[Old', ']] [[New]][[Else]][[New]]', '',
      ].join('\n');
      expectEdit(before, [relink(['Old', 'New'], ['Other', 'Else'])], after);
      expectEdit('[[Old]]\n```\n[[Old]]\n', [relink(['Old', 'New'])], '[[New]]\n```\n[[Old]]\n');
      expectEdit('[[Old]] ```js\n[[Old]]\n', [relink(['Old', 'New'])], '[[New]] ```js\n[[New]]\n');
    });

    it('applies every rename in one pass: a chain, taken names and case', () => {
      const changes: ChangeEntry[] = [
        { id: 'c1', at: 1, kind: 'rename', what: 'Renamed', from: 'Areas/A.md', path: 'Areas/B.md' },
        { id: 'c2', at: 2, kind: 'move', what: 'Moved', from: 'Areas/B.md', path: 'Projects/C.md' },
      ];
      expect(renamesFor(changes)).toEqual([{ from: 'a', to: 'C' }, { from: 'b', to: 'C' }]);
      expect(renamesFor(changes, new Set(['b']))).toEqual([{ from: 'a', to: 'C' }]);
      expectEdit('[[A]] [[B]] [[C]]\n', [{ kind: 'link-rewrite', recordIds: [], renames: renamesFor(changes) }], '[[C]] [[C]] [[C]]\n');
      expectEdit('[[A]] [[B]] [[C]]\n', [{ kind: 'link-rewrite', recordIds: [], renames: renamesFor(changes, new Set(['b'])) }], '[[C]] [[B]] [[C]]\n');
      expectEdit('[[A]] [[B]]\n', [relink(['A', 'B'], ['B', 'C'])], '[[B]] [[C]]\n');
      expectEdit('[[old]] [[OLD]] [[Old]]\n', [relink(['oLd', 'New Name'])], '[[New Name]] [[New Name]] [[New Name]]\n');
    });

    it('refuses renames that are not display names', () => {
      for (const renames of [[['Areas/Old', 'New']], [['Old.md', 'New']], [['Old', 'N|ew']], [['Old', 'New'], ['old', 'Else']]] as [string, string][][]) {
        expectRefusal('[[Old]]\n', [relink(...renames)], 'field');
      }
    });
  });

  // c4-undo-compensate (TL-P4-27 addendum 4 (2)): a move and the move back in one run rename no link.
  it('a move under a free name and the move back rename no link to the name it has again', () => {
    const at = Date.UTC(2026, 9, 9, 10);
    const there: ChangeEntry = { id: 'M1', at, kind: 'move', what: 'Moved', path: 'Areas/Lease (2).md', from: 'Projects/Lease.md' };
    const back: ChangeEntry = { id: 'M2', at: at + 1, kind: 'move', what: 'Moved', path: 'Projects/Lease.md', from: 'Areas/Lease (2).md' };
    expect(renamesFor([there, back]).filter((r) => r.from === r.to.toLowerCase())).toEqual([]);
  });

  describe('rules-wording', () => {
    const R1 = ['- File receipts under Areas/Home. <!-- since 2026-10-01 -->', '  *You wrote: "receipts go to home"*'];
    const R2 = ['- Keep PDFs whole. <!-- since 2026-09-30 -->', '  *You wrote: "dont split pdfs"*'];
    const NEW = ['- Name scans by date. <!-- since 2026-10-06 -->', '  *You wrote: "scans by date"*'];
    const count = (n: number): string => `summary: ${n} ${n === 1 ? 'rule' : 'rules'} Bower follows in every tidy-up.`;
    const rules = (eol: string, summary: string, ...lines: string[]): string =>
      ['---', summary, 'by: bower', 'kind: Rules', '---', '', '## Rules', '', ...lines, '', '## Notes from you', 'Leave [[Old]] alone.', ''].join(eol);
    const scans = rule('Name scans by date.', 'scans by date');

    it('adds a rule at the top with its words and date, and updates the summary line, with LF and CRLF', () => {
      for (const eol of ['\n', '\r\n']) {
        const before = rules(eol, count(2), ...R1, ...R2);
        const after = rules(eol, count(3), ...NEW, ...R1, ...R2);
        expectEdit(before, [word([scans])], after);
        expect(parseRules(after).map((r) => [r.text, r.yourWords, r.since])).toEqual([
          ['Name scans by date.', 'scans by date', Date.UTC(2026, 9, 6)],
          ['File receipts under Areas/Home.', 'receipts go to home', Date.UTC(2026, 9, 1)],
          ['Keep PDFs whole.', 'dont split pdfs', Date.UTC(2026, 8, 30)],
        ]);
      }
    });

    // c4-undo-compensate (TL-P4-27 addendum 4 (1)): adds and removals apply as one sequence by since, so an Undo's
    // inverse removal after its add, in one run, leaves no rule; a manifest without since keeps removals first.
    it('applies an add and its later removal in line order: no rule is written', () => {
      const before = rules('\n', count(1), ...R1);
      // Nothing to write: Rules.md stays byte for byte as it was (the author's own "unchanged").
      expectRefusal(before, [word([rule('Name scans by date.', 'scans by date', Date.UTC(2026, 9, 6, 10))], [{ recordId: 'REMOVE_ID', text: 'scans by date', since: Date.UTC(2026, 9, 6, 11) }])], 'unchanged');
    });

    it('applies a removal and its later add again in line order: the rule is there once', () => {
      const before = rules('\n', count(2), ...R1, ...R2);
      const out = applyChanges(enc(before), [word([rule('Keep PDFs whole.', 'dont split pdfs', Date.UTC(2026, 9, 6, 11))], [{ recordId: 'REMOVE_ID', text: 'Keep PDFs whole.', since: Date.UTC(2026, 9, 6, 10) }])]);
      expect(out.ok).toBe(true);
      if (out.ok) expect(parseRules(out.text).map((r) => r.text)).toEqual(['Keep PDFs whole.', 'File receipts under Areas/Home.']);
    });

    it('an old manifest whose removals carry no since keeps removals first (fixture)', () => {
      const before = rules('\n', count(1), ...R1);
      const out = applyChanges(enc(before), [word([rule('Name scans by date.', 'scans by date', Date.UTC(2026, 9, 6, 10))], [{ recordId: 'REMOVE_ID', text: 'Name scans by date.' }])]);
      expect(out.ok).toBe(true);
      if (out.ok) expect(parseRules(out.text).map((r) => r.text)).toEqual(['Name scans by date.', 'File receipts under Areas/Home.']);
    });

    it('puts later adds above earlier ones, newest first', () => {
      const later = rule('Keep invoices by year.', 'invoices by year', Date.UTC(2026, 9, 6, 16));
      expectEdit(rules('\n', count(1), ...R1), [word([scans, later])],
        rules('\n', count(3), '- Keep invoices by year. <!-- since 2026-10-06 -->', '  *You wrote: "invoices by year"*', ...NEW, ...R1));
    });

    it('omits the You wrote line when your words are empty, as serializeRules does (review M2)', () => {
      const before = rules('\n', count(1), ...R1);
      const after = rules('\n', count(2), '- Name scans by date. <!-- since 2026-10-06 -->', ...R1);
      expectEdit(before, [word([rule('Name scans by date.', '')])], after);
      expect(parseRules(after)[0]).toEqual({ id: 'rule-1', text: 'Name scans by date.', since: Date.UTC(2026, 9, 6) });
      expectEdit(RULES_BEFORE, [word([rule('Name scans by date.', '')])],
        RULES_AFTER.replace('  *You wrote: "scans by date"*\n', ''));
    });

    it('puts the newest add first by since, whatever order the adds arrive in (TL-P2-26)', () => {
      const later = rule('Keep invoices by year.', 'invoices by year', Date.UTC(2026, 9, 6, 16));
      const earliest = rule('Sort letters by sender.', 'letters by sender', Date.UTC(2026, 9, 5, 9));
      expectEdit(rules('\n', count(1), ...R1), [word([later, earliest, scans])], rules('\n', count(4),
        '- Keep invoices by year. <!-- since 2026-10-06 -->', '  *You wrote: "invoices by year"*', ...NEW,
        '- Sort letters by sender. <!-- since 2026-10-05 -->', '  *You wrote: "letters by sender"*', ...R1));
    });

    it('skips a duplicate by ruleLike, by wording or by your words', () => {
      const before = rules('\n', count(2), ...R1, ...R2);
      expectRefusal(before, [word([rule('keep pdfs whole', 'something else')])], 'unchanged');
      expectRefusal(before, [word([rule('Never split a PDF.', 'Dont  split PDFs!')])], 'unchanged');
      expectEdit(before, [word([rule('KEEP PDFS WHOLE.', 'x'), scans, rule('Name scans by date', 'again')])], rules('\n', count(3), ...NEW, ...R1, ...R2));
    });

    it('removes a rule with its You wrote line, every copy of it, and nothing when it is gone', () => {
      expectEdit(rules('\n', count(2), ...R1, ...R2), [word([], [unrule('Keep PDFs whole.')])], rules('\n', count(1), ...R1));
      expectEdit(rules('\r\n', count(3), ...R2, ...R1, ...R2), [word([], [unrule('Keep PDFs whole.')])], rules('\r\n', count(1), ...R1));
      expectRefusal(rules('\n', count(1), ...R1), [word([], [unrule('Keep PDFs whole.')])], 'unchanged');
      expectEdit(rules('\n', count(1), ...R1), [word([scans], [unrule('Keep PDFs whole.')])], rules('\n', count(2), ...NEW, ...R1));
    });

    it('adds a missing section at the end and leaves the person\'s text after the next heading intact', () => {
      expectEdit(RULES_BEFORE, [word([scans])], RULES_AFTER);
      expectEdit(RULES_BEFORE.replace(/\n/g, '\r\n'), [word([scans])], RULES_AFTER.replace(/\n/g, '\r\n'));
      const custom = '---\nsummary: My own rules.\nby: bower\n---\n\n## Rules\n\n## Mine\n- Not a rule of Bower\'s [[Old]]\n';
      expectEdit(custom, [word([scans])], `---\nsummary: My own rules.\nby: bower\n---\n\n## Rules\n\n${NEW.join('\n')}\n## Mine\n- Not a rule of Bower's [[Old]]\n`);
    });

    it('refuses a Rules.md without by: bower', () => {
      expectRefusal('---\nsummary: 1 rule Bower follows in every tidy-up.\nkind: Rules\n---\n\n## Rules\n\n', [word([scans])], 'not-bower');
      expectRefusal('## Rules\n\n- Keep PDFs whole.\n', [word([scans])], 'not-bower');
      expectRefusal(v2('\n', []), [word([scans])], 'unsupported');
    });

    it('refuses a faulty splice through the narrow Rules invariant', () => {
      const drop = { splice: (text: string, at: number, insert: string): string => text.slice(0, at) + insert + text.slice(at + 1) };
      const late = { splice: (text: string, _at: number, insert: string): string => text + insert };
      for (const authors of [drop, late]) {
        expect(applyChangesUsing(enc(rules('\n', count(1), ...R1)), [word([scans])], authors)).toEqual({ ok: false, reason: 'invariant' });
      }
    });
  });

  describe('several changes, recovery and keys', () => {
    it('applies link-rewrite then timeline-append into one text, and refuses any other order', () => {
      expectEdit(NOTE_BEFORE, NOTE_CHANGES(), NOTE_AFTER);
      expectRefusal(NOTE_BEFORE, [...NOTE_CHANGES()].reverse(), 'order');
      expectRefusal(NOTE_BEFORE, [relink(['Old', 'New']), relink(['Old', 'New'])], 'order');
      expectRefusal(NOTE_BEFORE, [], 'order');
    });

    it('rechecks an edit before writing: same bytes, same recomputed text, matching content', async () => {
      const effect = editOf('Areas/Home/Lease.md', noteSeen(), NOTE_BEFORE, NOTE_AFTER, NOTE_CHANGES());
      expect(await recheckEdit(effect, enc(NOTE_BEFORE))).toBe('ok');
      expect(await recheckEdit(effect, enc(`${NOTE_BEFORE}A new line.\n`))).toBe('conflict');
      expect(await recheckEdit({ ...effect, text: `${NOTE_AFTER} `, content: raw(`${NOTE_AFTER} `) }, enc(NOTE_BEFORE))).toBe('conflict');
      expect(await recheckEdit({ ...effect, content: raw(NOTE_BEFORE) }, enc(NOTE_BEFORE))).toBe('conflict');
      expect(await recheckEdit({ ...effect, beforeContent: { ...effect.beforeContent, sha256: digest('0') } }, enc(NOTE_BEFORE))).toBe('conflict');
    });

    it('derives the saved link note key as SHA-256 of <fileId>:saved-link-note (m-f)', async () => {
      expect(await savedLinkKey('link-file-7')).toBe('d2a8f760d41e36cdd4963024577827792c6df37889c7ceeb290ab2b4434150e6');
    });
  });
});

it('an old manifest with no removals keeps its equal-time add order', () => {
  // Literal bytes from c5e8093a's applyChanges, executed in /tmp/compensate-a11-baseline.
  // Equal times preserve the manifest array order, even when record ids sort in the opposite order.
  const before = '---\nsummary: 0 rules Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n## Notes from you\nLeave [[Old]] alone.\n';
  const expected = '---\nsummary: 2 rules Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n- Name scans by date. <!-- since 2026-10-06 -->\n  *You wrote: "scans by date"*\n- Keep PDFs whole. <!-- since 2026-10-06 -->\n  *You wrote: "dont split pdfs"*\n## Notes from you\nLeave [[Old]] alone.\n';
  const add: RuleAdd[] = [
    { recordId: 'Z_ADD', text: 'Keep PDFs whole.', yourWords: 'dont split pdfs', since: 1791244800000 },
    { recordId: 'A_ADD', text: 'Name scans by date.', yourWords: 'scans by date', since: 1791244800000 },
  ];
  for (const eol of ['\n', '\r\n']) {
    const out = applyChanges(enc(before.replace(/\n/g, eol)), [word(add, [])]);
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error(out.reason);
    expect(out.bytes).toEqual(enc(expected.replace(/\n/g, eol)));
  }
});

// TL-P4-27 addendum 9(4): literal bytes from pre-entry c5e8093a (1d70a38f^).
// git show into /tmp/compensate-a9-baseline; execute its applyChanges/wordRules, never HEAD.
it.each([
  {
    "label": "your words are not an exact removal",
    "before": "---\nsummary: 1 rule Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n- Keep PDFs whole. <!-- since 2026-09-30 -->\n  *You wrote: \"dont split pdfs\"*\n\n## Notes from you\nLeave [[Old]] alone.\n",
    "add": [],
    "remove": [
      {
        "recordId": "REMOVE_ID",
        "text": "dont split pdfs"
      }
    ],
    "expected": "---\nsummary: 1 rule Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n- Keep PDFs whole. <!-- since 2026-09-30 -->\n  *You wrote: \"dont split pdfs\"*\n\n## Notes from you\nLeave [[Old]] alone.\n"
  },
  {
    "label": "exact removal then add, newest first",
    "before": "---\nsummary: 1 rule Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n- Keep PDFs whole. <!-- since 2026-09-30 -->\n  *You wrote: \"dont split pdfs\"*\n\n## Notes from you\nLeave [[Old]] alone.\n",
    "add": [
      {
        "recordId": "ADD_ID",
        "text": "Keep PDFs whole.",
        "yourWords": "dont split pdfs",
        "since": 1791244800000
      },
      {
        "recordId": "ADD_2",
        "text": "Name scans by date.",
        "yourWords": "scans by date",
        "since": 1791331200000
      }
    ],
    "remove": [
      {
        "recordId": "REMOVE_ID",
        "text": "Keep PDFs whole."
      }
    ],
    "expected": "---\nsummary: 2 rules Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n- Name scans by date. <!-- since 2026-10-07 -->\n  *You wrote: \"scans by date\"*\n- Keep PDFs whole. <!-- since 2026-10-06 -->\n  *You wrote: \"dont split pdfs\"*\n\n## Notes from you\nLeave [[Old]] alone.\n"
  },
  {
    "label": "normalised wording is not an exact removal",
    "before": "---\nsummary: 1 rule Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n- Keep PDFs whole. <!-- since 2026-09-30 -->\n  *You wrote: \"dont split pdfs\"*\n\n## Notes from you\nLeave [[Old]] alone.\n",
    "add": [],
    "remove": [
      {
        "recordId": "REMOVE_ID",
        "text": "keep pdfs whole"
      }
    ],
    "expected": "---\nsummary: 1 rule Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n- Keep PDFs whole. <!-- since 2026-09-30 -->\n  *You wrote: \"dont split pdfs\"*\n\n## Notes from you\nLeave [[Old]] alone.\n"
  }
])('an old manifest without since words rules byte for byte as before ($label)', ({ before, add, remove, expected }) => {
  for (const eol of ['\n', '\r\n']) {
    const bytes = enc(before.replace(/\n/g, eol));
    const out = applyChanges(bytes, [word(add, remove)]);
    if (!out.ok) expect(out.reason).toBe('unchanged');
    expect(out.ok ? out.bytes : bytes).toEqual(enc(expected.replace(/\n/g, eol)));
  }
});
