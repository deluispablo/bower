import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { AUTHORED_LINE_MAX, STATE_KEY, applyChanges, currentStateOf, recheckEdit, stateMark, stateNewsLine, undoChanges } from './note-edit';
import { md5Hex } from './hashes';
import type { Change, EditText } from './run-manifest';

// Expected texts are written out by hand; the mark's vectors are FNV-1a 64's published ones
// (http://www.isthe.com/chongo/tech/comp/fnv/): "" cbf29ce484222325, "a" af63dc4c8601ec8c, "foobar" 85944171f73967e8.

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
// The fixtures below are unmarked, so these changes carry the grant a rule gives (`adopted`); `plain` carries none.
const plain = (previous: string[], lines: string[]): Change => ({ kind: 'state-rewrite', recordIds: [], previous, lines });
const rewrite = (previous: string[], lines: string[]): Change => ({ ...plain(previous, lines), adopted: true } as Change);
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
    expect(currentStateOf(enc('---\nby: bower\n---\nNo state here.\n'))).toEqual({ owner: 'missing', lines: [] });
    expect(currentStateOf(enc('---\nsummary: x\n---\nNo state here.\n'))).toBeNull();
    // TL-P4-10: no mark is not Bower's by default; the planner adopts it only by a rule.
    expect(currentStateOf(enc(HUB))).toEqual({ owner: 'unmarked', lines: ['One application open.'] });
  });

  it('is undone from what the manifest kept, to the very bytes Bower last wrote', () => {
    const marked = HUB.replace('by: bower\n', `by: bower\n${STATE_KEY}: ${stateMark(['One application open.'])}\n`);
    const changes = [plain(['One application open.'], ['Two applications open.'])];
    const after = applyChanges(enc(marked), changes);
    const back = applyChanges(after.ok ? after.bytes : enc(''), undoChanges(changes));
    expect(text(back)).toBe(marked);
  });

  it('is checked again before the write, as any note edit', async () => {
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
  });
});

describe('TL-P4-10: MD5, a missing section, an empty one, the news line', () => {
  it('computes MD5 as RFC 1321 and Drive do', () => {
    // RFC 1321 appendix A.5 test suite.
    expect(md5Hex(enc(''))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex(enc('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex(enc('message digest'))).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(md5Hex(enc('12345678901234567890123456789012345678901234567890123456789012345678901234567890'))).toBe('57edf4a22be3c955ac49da2e2107b67a');
    for (const t of ['x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'é · ✓'.repeat(300), HUB]) {
      expect(md5Hex(enc(t))).toBe(createHash('md5').update(Buffer.from(t, 'utf8')).digest('hex'));
    }
  });

  it('adds a missing section, with its mark, only in a Bower note', () => {
    const none = '---\nsummary: Applications and offers.\nby: bower\n---\n\nYour own words.\n\n## Timeline\n- 2026-09-28 · Started the job hunt.\n';
    const result = applyChanges(enc(none), [plain([], ['Two applications open.'])]);
    expect(text(result)).toBe(`---\nsummary: Applications and offers.\nby: bower\n${STATE_KEY}: ${stateMark(['Two applications open.'])}\n---\n\n## Current state\n- Two applications open.\n\nYour own words.\n\n## Timeline\n- 2026-09-28 · Started the job hunt.\n`);
    expect(text(applyChanges(enc('---\nby: bower\n---'), [plain([], ['New.'])]))).toBe(`---\nby: bower\n${STATE_KEY}: ${stateMark(['New.'])}\n---\n## Current state\n- New.\n`);
    expect(applyChanges(enc(none.replace('by: bower\n', '')), [rewrite([], ['New.'])])).toEqual({ ok: false, reason: 'not-bower' });
    // Taken back, the section stays, empty.
    const back = applyChanges(result.ok ? result.bytes : enc(''), undoChanges([plain([], ['Two applications open.'])]));
    expect(currentStateOf(back.ok ? back.bytes : enc(''))).toEqual({ owner: 'bower', lines: [] });
  });

  it('takes back a rewrite of an empty section to the very bytes, legacy and ownership/2', () => {
    const empty = HUB.replace('by: bower\n', `by: bower\n${STATE_KEY}: ${stateMark([])}\n`).replace('- One application open.\n', '');
    const changes = [plain([], ['Two applications open.'])];
    const after = applyChanges(enc(empty), changes);
    expect(text(applyChanges(after.ok ? after.bytes : enc(''), undoChanges(changes)))).toBe(empty);
    const v2 = ['---', 'bower_format: ownership/2', 'by: bower', '---', '<!-- bower:ownership/2 begin current -->', '<!-- bower:ownership/2 end current -->',
      '<!-- bower:ownership/2 begin personal -->', '<!-- bower:ownership/2 end personal -->', '<!-- bower:ownership/2 begin timeline -->',
      '<!-- bower:ownership/2 end timeline -->', '<!-- bower:ownership/2 begin bower-note -->', '<!-- bower:ownership/2 end bower-note -->', ''].join('\n');
    // The v2 note is unmarked, so a rule adopted it; taken back, it is the person's again, with no mark.
    const adopted = [rewrite([], ['Two applications open.'])];
    const v2After = applyChanges(enc(v2), adopted);
    const v2Back = applyChanges(v2After.ok ? v2After.bytes : enc(''), undoChanges(adopted));
    expect(text(v2Back)).toBe(v2);
  });

  it('keeps the fallback line within an authored line\'s limits', () => {
    const long = Array.from({ length: 8 }, () => 'A long line about the flats on the shortlist and the walk to the station every morning.');
    expect(stateNewsLine(long, [])?.length).toBeLessThanOrEqual(AUTHORED_LINE_MAX);
    const one = stateNewsLine(['word '.repeat(80).trim()], []);
    expect(one?.length).toBeLessThanOrEqual(AUTHORED_LINE_MAX);
    expect(one?.endsWith('word…')).toBe(true);
  });
});

describe('state-no-adoption guards', () => {
  it('rewriteState refuses an unmarked section unless the change says a rule granted it', () => {
    expect(applyChanges(enc(HUB), [plain(['One application open.'], ['Two applications open.'])])).toEqual({ ok: false, reason: 'person-edited' });
    expect(applyChanges(enc(HUB), [rewrite(['One application open.'], ['Two applications open.'])]).ok).toBe(true);
    // A Bower-marked section needs no grant.
    const marked = HUB.replace('by: bower\n', `by: bower\n${STATE_KEY}: ${stateMark(['One application open.'])}\n`);
    expect(applyChanges(enc(marked), [plain(['One application open.'], ['Two applications open.'])]).ok).toBe(true);
  });

  it('undo of an adopted rewrite gives the person their lines back without a mark', () => {
    const changes = [rewrite(['One application open.'], ['Two applications open.'])];
    const after = applyChanges(enc(HUB), changes);
    const back = applyChanges(after.ok ? after.bytes : enc(''), undoChanges(changes));
    expect(text(back)).toBe(HUB);
    expect(text(back)).not.toContain(STATE_KEY);
  });

  it('a release is never taken on a section Bower did not mark', () => {
    const release = { ...plain(['One application open.'], ['Two applications open.']), release: true } as Change;
    expect(applyChanges(enc(HUB), [release])).toEqual({ ok: false, reason: 'person-edited' });
  });

  it('the fallback line keeps the capitals of the first new line', () => {
    expect(stateNewsLine(['Alex called back.'], ['One application open.'])).toBe('New: Alex called back.');
    expect(stateNewsLine(['An offer to answer.'], ['One application open.'])).toBe('New: an offer to answer.');
  });

  it('the fallback line names only what the section lacks', () => {
    expect(stateNewsLine(['One application open.', 'An offer from Ferrowick to answer.'], ['One application open.'])).toBe('New: an offer from Ferrowick to answer.');
    expect(stateNewsLine(['One application open.'], ['One application open.'])).toBeNull();
    expect(stateNewsLine(['One open.', 'Two flats.'], [])).toBe('New: One open, two flats.');
  });
});
