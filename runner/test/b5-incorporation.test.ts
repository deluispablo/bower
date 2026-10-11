import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyChanges } from '../../src/data/contracts/note-edit';
import type { Change } from '../../src/data/contracts/run-manifest';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { note, run, select, setup } from './b1-planning-support';
import { AT } from './corpus-run';

const PROFILE = 'Areas/Career/Career profile.md';
const SOURCE = 'Alex CV.txt';
const PREVIOUS = 'Alex uses JavaScript. [[Earlier CV]]\n';
const NEXT = 'Alex uses TypeScript. [[Alex CV.txt]]\n';
const PERSONAL = '## My notes\nAlex keeps these words: café.\n';
const HISTORY = '## Timeline\n- 2026-10-01 · Read the earlier CV · [[Earlier CV]]\n';
const REGION = `<!-- bower:ownership/2 begin profile -->\n${PREVIOUS}<!-- bower:ownership/2 end profile -->\n`;
const bytes = (text: string) => new TextEncoder().encode(text);
const change: Change = { kind: 'profile-rewrite', recordIds: [], previous: PREVIOUS, text: NEXT };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

// The provider has no profile intent yet. Exercise its real filing path, then the existing note-edit guard;
// this is guard evidence only, not a claim that main already plans profile updates.
async function filedProfile(owned: boolean) {
  const framed = (key: string, text: string) => `<!-- bower:ownership/2 begin ${key} -->\n${text}<!-- bower:ownership/2 end ${key} -->\n`;
  const before = note('Alex uses TypeScript.',
    framed('current', '## Current state\n- Alex uses JavaScript.\n')
    + framed('personal', PERSONAL) + framed('timeline', HISTORY)
    + framed('bower-note', "## Bower's note\nEarlier CV saved.\n") + REGION, owned)
    .replace('summary:', 'bower_format: ownership/2\nsummary:');
  const b = await setup({ folder: {
    [PROFILE]: before,
    'Areas/Career/Career.md': note('Career documents.', '## Timeline\n', true),
    'Projects/Job hunt/Job hunt.md': note('Job hunt.', 'Alex keeps the shortlist.\n', true),
  }, inbox: [{ line: '', files: [SOURCE] }], inboxFiles: { [SOURCE]: 'Alex uses TypeScript.\n' } });
  const id = b.sources.find((source) => source.name === SOURCE)?.itemId;
  expect(id).toBeDefined();
  const result = await run(b, [select(b, [b.id(PROFILE)], 'Areas/Career'), {
    kind: 'tidy-intent', v: 1,
    things: [{ fileId: id, to: 'Areas/Career', name: SOURCE,
      note: { name: 'Alex CV.md', summary: 'Alex uses TypeScript.', body: 'Alex uses TypeScript.' } }],
  }]);
  expect(result.code, result.errors).toBe(0);
  expect(result.frames).toHaveLength(2);
  expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(result.after[`Areas/Career/${SOURCE}`]).toBe('Alex uses TypeScript.\n');
  expect(result.after[PROFILE]).toBe(before);
  expect(result.after['Projects/Job hunt/Job hunt.md']).toBe(b.c.folder['Projects/Job hunt/Job hunt.md']);
  expect(result.frames[1]?.value.allowedTargets).toMatchObject({ [id ?? '']: expect.arrayContaining([b.id(PROFILE)]) });
  expect(parseOwnership(bytes(before)).status).toBe('v2');
  return before;
}

async function ownedControl() {
  const before = await filedProfile(true);
  const input = bytes(before);
  const copy = input.slice();
  const result = applyChanges(input, [change]);
  expect(result).toMatchObject({ ok: true, text: before.replace(PREVIOUS, NEXT) });
  expect(input).toEqual(copy);
  if (result.ok) {
    expect(result.text).toContain(PERSONAL);
    expect(result.text).toContain(HISTORY);
  }
}

it('b5-person-profile-not-adopted control: resolved Bower-owned region updates without changing personal/history bytes',
  ownedControl);

it('b5-person-profile-not-adopted', async () => {
  await ownedControl();
  const before = await filedProfile(false);
  const input = bytes(before);
  const copy = input.slice();
  expect(applyChanges(input, [change]), 'a profile-shaped mark never grants ownership of a personal note')
    .toEqual({ ok: false, reason: 'not-bower' });
  expect(input).toEqual(copy);
});
