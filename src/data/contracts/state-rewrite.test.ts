import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { STATE_KEY, applyChanges, currentStateOf, readBackEdit, recheckEdit, stateMark, undoChanges } from './note-edit';
import type { Change, EditText } from './run-manifest';

// Expected texts are written out by hand; the mark's vectors are FNV-1a 64's published ones
// (http://www.isthe.com/chongo/tech/comp/fnv/): "" cbf29ce484222325, "a" af63dc4c8601ec8c, "foobar" 85944171f73967e8.

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const rewrite = (previous: string[], lines: string[]): Change => ({ kind: 'state-rewrite', recordIds: [], previous, lines });
const text = (result: ReturnType<typeof applyChanges>): string => (result.ok ? result.text : `refused: ${result.reason}`);

const HUB = '---\nsummary: Applications and offers.\nby: bower\n---\n\n## Current state\n- One application open.\n\nYour own words.\n\n## Timeline\n- 2026-09-28 · Started the job hunt.\n';

describe('the state-rewrite change (C05)', () => {
  it('marks a Current state with FNV-1a 64 of its lines', () => {
    expect(stateMark([])).toBe('cbf29ce484222325');
    expect(stateMark(['a'])).toBe('af63dc4c8601ec8c');
    expect(stateMark(['foobar'])).toBe('85944171f73967e8');
  });

  it('rewrites only the lines of a Bower note and marks them, byte for byte', () => {
    const result = applyChanges(enc(HUB), [rewrite(['One application open.'], ['Two applications open.', 'An offer to answer.'])]);
    expect(text(result)).toBe(`---\nsummary: Applications and offers.\nby: bower\n${STATE_KEY}: ${stateMark(['Two applications open.', 'An offer to answer.'])}\n---\n\n## Current state\n- Two applications open.\n- An offer to answer.\n\nYour own words.\n\n## Timeline\n- 2026-09-28 · Started the job hunt.\n`);
  });

  it('keeps CRLF and a file that ends at the last line', () => {
    const crlf = HUB.replace(/\n/g, '\r\n');
    expect(text(applyChanges(enc(crlf), [rewrite(['One application open.'], ['None open.'])])))
      .toBe(`---\r\nsummary: Applications and offers.\r\nby: bower\r\n${STATE_KEY}: ${stateMark(['None open.'])}\r\n---\r\n\r\n## Current state\r\n- None open.\r\n\r\nYour own words.\r\n\r\n## Timeline\r\n- 2026-09-28 · Started the job hunt.\r\n`);
    const tail = '---\nby: bower\n---\n## Current state\n- Old';
    expect(text(applyChanges(enc(tail), [rewrite(['Old'], ['New', 'Newer'])]))).toBe(`---\nby: bower\n${STATE_KEY}: ${stateMark(['New', 'Newer'])}\n---\n## Current state\n- New\n- Newer`);
  });

  it('rewrites an ownership/2 current payload and nothing else', () => {
    const v2 = [
      '---', 'bower_format: ownership/2', 'by: bower', '---',
      '<!-- bower:ownership/2 begin current -->', '- Old state', '<!-- bower:ownership/2 end current -->',
      '<!-- bower:ownership/2 begin personal -->', '- [ ] a task of yours', '<!-- bower:ownership/2 end personal -->',
      '<!-- bower:ownership/2 begin timeline -->', '<!-- bower:ownership/2 end timeline -->',
      '<!-- bower:ownership/2 begin bower-note -->', '<!-- bower:ownership/2 end bower-note -->', '',
    ].join('\n');
    const result = applyChanges(enc(v2), [rewrite(['Old state'], ['New state'])]);
    expect(text(result)).toBe(v2.replace('by: bower\n', `by: bower\n${STATE_KEY}: ${stateMark(['New state'])}\n`).replace('- Old state', '- New state'));
  });

  it('never rewrites a Current state the person edited, a note that is not Bower\'s, or one that reads otherwise', () => {
    const marked = HUB.replace('by: bower\n', `by: bower\n${STATE_KEY}: ${stateMark(['One application open.'])}\n`);
    const edited = marked.replace('- One application open.', '- Two, one interview.');
    expect(currentStateOf(enc(marked))).toEqual({ owner: 'bower', lines: ['One application open.'] });
    expect(currentStateOf(enc(edited))).toEqual({ owner: 'person', lines: ['Two, one interview.'] });
    expect(applyChanges(enc(edited), [rewrite(['Two, one interview.'], ['New.'])])).toEqual({ ok: false, reason: 'person-edited' });
    expect(applyChanges(enc(HUB.replace('by: bower\n', '')), [rewrite(['One application open.'], ['New.'])])).toEqual({ ok: false, reason: 'not-bower' });
    expect(applyChanges(enc(HUB), [rewrite(['Something else.'], ['New.'])])).toEqual({ ok: false, reason: 'state-changed' });
    expect(applyChanges(enc(HUB), [rewrite(['One application open.'], ['One application open.'])])).toEqual({ ok: false, reason: 'unchanged' });
    expect(applyChanges(enc(HUB), [rewrite(['One application open.'], ['two\nlines'])])).toEqual({ ok: false, reason: 'field' });
    expect(currentStateOf(enc('---\nby: bower\n---\nNo state here.\n'))).toBeNull();
  });

  it('is undone from what the manifest kept, to the very bytes Bower last wrote', () => {
    const marked = HUB.replace('by: bower\n', `by: bower\n${STATE_KEY}: ${stateMark(['One application open.'])}\n`);
    const changes = [rewrite(['One application open.'], ['Two applications open.'])];
    const after = applyChanges(enc(marked), changes);
    const back = applyChanges(after.ok ? after.bytes : enc(''), undoChanges(changes));
    expect(text(back)).toBe(marked);
  });

  it('is checked again before the write and read back after a lost reply, as any note edit', async () => {
    const digest = (t: string): string => createHash('sha256').update(Buffer.from(t, 'utf8')).digest('hex');
    const changes = [rewrite(['One application open.'], ['Two applications open.'])];
    const after = text(applyChanges(enc(HUB), changes));
    const before = { fileId: 'f-hub', name: 'Job hunt.md', parents: ['f-job'], folder: false, modifiedTime: '2026-10-07T09:00:00Z' };
    const effect: EditText = {
      kind: 'edit-text', before, path: 'Projects/Job hunt/Job hunt.md', changes, text: after,
      beforeContent: { encoding: 'utf8', size: enc(HUB).byteLength, sha256: digest(HUB), provenance: 'fake-stored', observedModifiedTime: before.modifiedTime },
      content: { encoding: 'utf8', size: enc(after).byteLength, sha256: digest(after) },
    };
    expect(await recheckEdit(effect, enc(HUB))).toBe('ok');
    expect(await recheckEdit(effect, enc(HUB.replace('One application', 'One open application')))).toBe('conflict');
    const seen = { fileId: 'f-hub', name: 'Job hunt.md', parents: ['f-job'], trashed: false };
    expect(await readBackEdit(effect, { ...seen, bytes: enc(after) })).toBe('applied');
    expect(await readBackEdit(effect, { ...seen, bytes: enc(HUB) })).toBe('possible-effect');
  });
});
