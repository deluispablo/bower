import { describe, expect, it } from 'vitest';
import { applyChanges } from './note-edit';
import { createOwnershipContext } from './ownership-format';
import type { Change } from './run-manifest';

const enc = (text: string) => new TextEncoder().encode(text);
const NOTE = ['---', "summary: Alex's garden.", '---', '', '## Current state', '- Keep the shared water butt.', '',
  '## My plans', 'Paint it amber.  Keep these spaces.', '', '## My words', 'Alex keeps a diary.', '',
  '## Timeline', '- 2026-09-12 · Planted garlic.', ''].join('\r\n');
const entry = { date: '2026-10-07', text: 'The replacement water butt has arrived.', source: 'Water butt update.txt' };
// Additive manifest binding at the author boundary. The runner, never a model reply, supplies this tuple.
const consent = { requestId: 'change-1', targetFileId: 'garden-note', sourceFileId: 'filed-letter' };
const append = (): Extract<Change, { kind: 'timeline-append' }> & { consent: typeof consent } => ({
  kind: 'timeline-append', recordIds: ['change-1'], entries: [entry], consent,
});
const fetched = () => ({ fileId: 'garden-note', context: createOwnershipContext() });
const AFTER = NOTE.replace('- 2026-09-12 · Planted garlic.',
  '- 2026-09-12 · Planted garlic.\r\n- 2026-10-07 · The replacement water butt has arrived. · [[Water butt update.txt]]');

function positiveControl(): void {
  const owned = NOTE.replace("summary: Alex's garden.", "summary: Alex's garden.\r\nby: bower");
  const change = append();
  Reflect.deleteProperty(change, 'consent');
  expect(applyChanges(enc(owned), [change], fetched())).toEqual({ ok: true,
    text: AFTER.replace("summary: Alex's garden.", "summary: Alex's garden.\r\nby: bower"),
    bytes: enc(AFTER.replace("summary: Alex's garden.", "summary: Alex's garden.\r\nby: bower")) });
}

describe('C05 person notes author admission', () => {
  it('C05 person notes: one bound sourced append preserves every other byte and CRLF', () => {
    positiveControl();
    const source = enc(NOTE);
    const original = source.slice();
    expect(applyChanges(source, [append()], fetched())).toEqual({ ok: true, text: AFTER, bytes: enc(AFTER) });
    expect(source).toEqual(original);
  });

  it.each([
    ['no binding', (): Change => ({ kind: 'timeline-append', recordIds: ['change-1'], entries: [entry] })],
    ['wrong target', () => ({ ...append(), consent: { ...consent, targetFileId: 'other-note' } })],
    ['wrong request', () => ({ ...append(), consent: { ...consent, requestId: 'other-request' } })],
    ['two lines', (): Change => ({ ...append(), entries: [entry, { ...entry, text: 'A second line.' }] })],
    ['no source', (): Change => ({ ...append(), entries: [{ ...entry, source: null }] })],
    ['unanswered state', (): Change => ({ kind: 'state-rewrite', recordIds: ['change-1'], previous: ['Keep the shared water butt.'], lines: ['Return it.'] })],
    ['adoption', (): Change => ({ kind: 'state-rewrite', recordIds: ['change-1'], previous: ['Keep the shared water butt.'], lines: ['Return it.'], adopted: true })],
  ] as const)('C05 person notes: %s is refused not-bower beside the admitted append', (_label, change) => {
    positiveControl();
    // Soft admission assertion keeps the refusal assertion running on the unfixed build.
    expect.soft(applyChanges(enc(NOTE), [append()], fetched()).ok).toBe(true);
    const text = NOTE.replace('Alex keeps a diary.', 'Alex keeps a diary. [[Old]]');
    const source = enc(text);
    expect(applyChanges(source, [change()], fetched())).toEqual({ ok: false, reason: 'not-bower' });
    expect(source).toEqual(enc(text));
  });

  it('C05 person notes: link rewrite changes only links beside the admitted append', () => {
    positiveControl();
    expect.soft(applyChanges(enc(NOTE), [append()], fetched()).ok).toBe(true);
    const text = NOTE.replace('Alex keeps a diary.', 'Alex keeps a diary. Old stays in prose. [[Old]]');
    const source = enc(text);
    const after = text.replace('[[Old]]', '[[New]]');
    const change: Change = { kind: 'link-rewrite', recordIds: ['change-1'], renames: [{ from: 'Old', to: 'New' }] };
    expect(applyChanges(source, [change], fetched())).toEqual({ ok: true, text: after, bytes: enc(after) });
    expect(source).toEqual(enc(text));
  });

  it('C05 person notes: fix 1 finding 6: a granted state change preserves untouched mixed-ending bullet bytes', () => {
    positiveControl();
    const before = NOTE.replace('- Keep the shared water butt.\r\n',
      '- Keep the shared water butt.\n- Alex grows garlic.  \n');
    const change: Change = { kind: 'state-rewrite', recordIds: ['answer-1'],
      previous: ['Keep the shared water butt.', 'Alex grows garlic.  '],
      lines: ['Return the shared water butt.', 'Alex grows garlic.'], granted: { answer: 'answer-1', mark: null } };
    const uniform = before.replace(/(?<!\r)\n/g, '\r\n');
    const control = uniform.replace('Keep the shared water butt.', 'Return the shared water butt.');
    expect(applyChanges(enc(uniform), [change], fetched())).toEqual({ ok: true, text: control, bytes: enc(control) });
    const after = before.replace('Keep the shared water butt.', 'Return the shared water butt.');
    expect(applyChanges(enc(before), [change], fetched())).toEqual({ ok: true, text: after, bytes: enc(after) });
  });

  it('C05 person notes: fix 1 finding 7: a valid Timeline in plain Markdown admits the bound append', () => {
    positiveControl();
    expect(applyChanges(enc(NOTE), [append()], fetched())).toEqual({ ok: true, text: AFTER, bytes: enc(AFTER) });
    const before = NOTE.slice(NOTE.indexOf('## Current state'));
    const after = AFTER.slice(AFTER.indexOf('## Current state'));
    expect(applyChanges(enc(before), [append()], fetched())).toEqual({ ok: true, text: after, bytes: enc(after) });
  });
});
