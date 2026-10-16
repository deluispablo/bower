/**
 * bom-front-matter: a UTF-8 byte-order mark (U+FEFF) before a note's front matter is not part of the note's text, so
 * the one note parser (`parseOwnership`, read by `parseNote` and every note edit) frames the front matter exactly as
 * without the mark; the mark itself stays in the file. Made-up data only.
 */
import { describe, expect, it } from 'vitest';
import { applyChanges, type EditResult } from './note-edit';
import { parseNote } from './note-format';
import { createOwnershipContext, parseOwnership, togglePersonalTask, type ByteSpan } from './ownership-format';
import type { Change, EditEntry } from './run-manifest';

const BOM = '\ufeff';
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
const person = (eol: string): string =>
  ['---', "summary: Alex's garden plot.", 'status: active', 'tags: [home, garden]', 'planted: 2026-03-14', '---', 'Alex keeps a planting diary.', '', 'See [[Water butt]].', ''].join(eol);
const bower = (eol: string): string => ['---', 'summary: Lease', 'by: bower', '---', 'Notes.', ''].join(eol);
const append: Change = { kind: 'timeline-append', recordIds: ['2026-10-06T08-00-00.000Z-merge01'], entries: [{ date: '2026-10-06', text: 'Merged Lease draft', source: 'Lease draft' } satisfies EditEntry] };
const garden = (eol: string, by?: string): string => ['---', "summary: Alex's garden.", ...(by ? [`by: ${by}`] : []), '---', '', '## Current state', '- Keep the shared water butt.', '', '## My plans', 'Paint it amber.  Keep these spaces.', 'See [[Water butt]].', '', '## Timeline', '- 2026-09-12 · Planted garlic.', ''].join(eol);
const relink: Change = { kind: 'link-rewrite', recordIds: ['2026-10-06T08-00-01.000Z-rename1'], renames: [{ from: 'Water butt', to: 'Rain barrel' }] };
const cited: Change = { kind: 'timeline-append', recordIds: ['change-1'], entries: [{ date: '2026-10-07', text: 'The replacement water butt has arrived.', source: 'Water butt update.txt' }], consent: { requestId: 'change-1', targetFileId: 'garden-note', sourceFileId: 'filed-letter' } };
const granted: Change = { kind: 'state-rewrite', recordIds: ['answer-1'], previous: ['Keep the shared water butt.'], lines: ['Return the shared water butt.'], granted: { answer: 'answer-1', mark: null } };
const adopted: Change = { kind: 'state-rewrite', recordIds: [], previous: ['Keep the shared water butt.'], lines: ['Return it.'], adopted: true };
const wording: Change = { kind: 'rules-wording', add: [{ recordId: 'rule-1', text: 'Name scans by date.', yourWords: 'scans by date', since: Date.UTC(2026, 9, 6) }], remove: [] };
const computed: Change = { kind: 'computed-set', recordIds: [], values: [{ key: 'stage', value: 'seed' }] };
const learnedText = ['## What Bower has learned', ...[['about-you', 'About you'], ['about-working-on', "What you're working on"], ['about-preferences', 'How you like things']]
  .flatMap(([region, label]) => [`<!-- bower:ownership/2 begin ${region} -->`, `### ${label}`, `<!-- bower:ownership/2 end ${region} -->`]), ''].join('\n');
const learned: Change = { kind: 'about-append', recordIds: [], text: learnedText };
/** What the same edit gives a note with the mark: the same result with the mark first, or the same refusal. */
const withMark = (result: EditResult): EditResult => (result.ok ? { ok: true, text: `${BOM}${result.text}`, bytes: enc(`${BOM}${result.text}`) } : result);
/** Each edit of a row gives the note with the mark what it gives without it (the control states which), for LF and CRLF. */
function sameWithMark(rows: ReadonlyArray<readonly [label: string, note: (eol: string) => string, change: Change, outcome: string]>): void {
  for (const [label, note, change, outcome] of rows) {
    for (const eol of ['\n', '\r\n']) {
      const fetched = () => ({ fileId: 'garden-note', context: createOwnershipContext() });
      const plain = applyChanges(enc(note(eol)), [change], fetched());
      expect(plain.ok ? 'ok' : plain.reason, `the control: ${label}`).toBe(outcome);
      expect.soft(applyChanges(enc(`${BOM}${note(eol)}`), [change], fetched()), `${label}, eol=${JSON.stringify(eol)}`).toEqual(withMark(plain));
    }
  }
}

describe('bom-front-matter: front matter after a byte-order mark', () => {
  it('AC1 bom-front-matter-note: the note page reads the same summary, details, tags, status and body as without the mark', () => {
    for (const eol of ['\n', '\r\n']) {
      const plain = parseNote('Areas/Home/Garden plot.md', person(eol));
      const marked = parseNote('Areas/Home/Garden plot.md', `${BOM}${person(eol)}`);
      expect.soft(marked, `eol=${JSON.stringify(eol)}`).toEqual(plain);
      // The control: without the mark the front matter is read (summary and body), so the comparison is meaningful.
      expect(plain.summary).toBe("Alex's garden plot.");
      expect(plain.body).toBe('Alex keeps a planting diary.\n\nSee [[Water butt]].');
    }
  });

  it('AC1 bom-front-matter-bower: a note whose front matter says by: bower is Bower\'s with or without the mark', () => {
    for (const eol of ['\n', '\r\n']) {
      expect.soft(parseNote('Lease.md', `${BOM}${bower(eol)}`).byBower, `eol=${JSON.stringify(eol)}`).toBe(true);
    }
  });

  it('AC2 bom-front-matter-spans: the parser frames the front matter and the body three bytes later, the mark outside both', () => {
    for (const eol of ['\n', '\r\n']) {
      const text = `${BOM}${person(eol)}`;
      const bytes = enc(text);
      const plain = parseOwnership(enc(person(eol)));
      const marked = parseOwnership(bytes);
      expect.soft(marked.status, `eol=${JSON.stringify(eol)}`).toBe(plain.status);
      if (marked.status === 'invalid' || plain.status === 'invalid' || !plain.layout.front) continue;
      expect.soft(marked.layout.front).toEqual({ start: plain.layout.front.start + 3, end: plain.layout.front.end + 3 });
      expect.soft(marked.layout.frontEnd).toBe(plain.layout.frontEnd + 3);
      if ('personal' in marked && 'personal' in plain && marked.personal && plain.personal) {
        expect.soft(dec(bytes.subarray(marked.personal.start, marked.personal.end))).toBe(dec(enc(person(eol)).subarray(plain.personal.start, plain.personal.end)));
      }
    }
  });

  it('AC3 bom-front-matter-region: a rules note with front matter, its own text and Bower\'s region shows only its own text', () => {
    const region = ['## Rules added in Bower', '<!-- bower:ownership/2 begin rules-added -->', '## Rules', '', '- Keep receipts together. <!-- since 2026-10-13 -->', '<!-- bower:ownership/2 end rules-added -->', ''];
    for (const eol of ['\n', '\r\n']) {
      const text = [`${BOM}---`, 'summary: mine', '---', 'Alex keeps paper letters for a year.', '', ...region].join(eol);
      const note = parseNote('Rules.md', text);
      expect.soft(note.body, `eol=${JSON.stringify(eol)}`).toBe('Alex keeps paper letters for a year.');
      expect.soft(note.summary).toBe('mine');
    }
  });

  it('AC4 bom-front-matter-write: Bower\'s edit of its own note keeps the mark and makes the same change as without it', () => {
    for (const eol of ['\n', '\r\n']) {
      const plain = applyChanges(enc(bower(eol)), [append]);
      expect(plain.ok, 'the control: the note without the mark takes the line').toBe(true);
      const marked = applyChanges(enc(`${BOM}${bower(eol)}`), [append]);
      expect.soft(marked, `eol=${JSON.stringify(eol)}`).toEqual(plain.ok ? { ok: true, text: `${BOM}${plain.text}`, bytes: enc(`${BOM}${plain.text}`) } : plain);
    }
  });

  it('R3 bom-front-matter-person-write: a person\'s marked note stays refused for Bower\'s edits, as without the mark', () => {
    expect(applyChanges(enc(`${BOM}${person('\n')}`), [append])).toEqual(applyChanges(enc(person('\n')), [append]));
  });

  it('R4 bom-front-matter-unchanged: a mark before plain text, an unterminated fence or a later rule keeps today\'s reading', () => {
    for (const text of ['Alex keeps a planting diary.\n', '---\nsummary: open\nwords\n', 'Intro.\n---\nmore\n']) {
      const plain = parseNote('Notes.md', text);
      const marked = parseNote('Notes.md', `${BOM}${text}`);
      expect.soft({ ...marked, body: marked.body.replace(/^\ufeff/, '') }, JSON.stringify(text)).toEqual(plain);
      expect.soft(parseOwnership(enc(`${BOM}${text}`)).status).toBe(parseOwnership(enc(text)).status);
    }
  });

  it('AC2 bom-front-matter-shift: what the parser frames in a note it frames in the marked note three bytes later, in every kind of note', () => {
    const notes = [
      person('\n'), garden('\n'), `${garden('\n', 'bower')}\n## Bower's note\nKept.\n`, '---\n---\n', '---\nsummary: open\nwords\n',
      'Alex keeps notes.\n- [ ] Water the beans\n', '## Timeline\n- 2026-09-12 · Planted garlic.\n', `${person('\n')}\n${learnedText}`,
      ['---', 'summary: mine', '---', 'Alex keeps paper letters for a year.', '', '## Rules added in Bower', '<!-- bower:ownership/2 begin rules-added -->', '## Rules', '- Keep receipts together.', '<!-- bower:ownership/2 end rules-added -->', ''].join('\n'),
      ['---', 'summary: Lease', 'by: bower', 'type: moc', '---', '## Overview', 'Alex grows beans.', '', '## Notes', '- [[Plot]]', ''].join('\n'),
    ];
    const shift = (span: ByteSpan | null | undefined): ByteSpan | null | undefined => span && { start: span.start + 3, end: span.end + 3 };
    const shiftAll = (spans: Readonly<Record<string, ByteSpan | undefined>> | undefined): unknown => spans && Object.fromEntries(Object.entries(spans).map(([key, span]) => [key, shift(span)]));
    for (const eol of ['\n', '\r\n']) {
      for (const note of notes) {
        const text = note.replace(/\n/g, eol);
        const plain = parseOwnership(enc(text));
        const marked = parseOwnership(enc(`${BOM}${text}`));
        if (plain.status === 'invalid' || marked.status === 'invalid') {
          expect.soft(marked.status, JSON.stringify(text)).toBe(plain.status);
          continue;
        }
        const { layout } = plain;
        // A plain note is wholly the person's, the mark with it: its one span still starts at the first byte.
        expect.soft({ status: marked.status, personal: marked.personal, layout: marked.layout, payloads: marked.payloads, tasks: marked.tasks }, `${JSON.stringify(text)}, eol=${JSON.stringify(eol)}`).toEqual({
          status: plain.status,
          personal: plain.status === 'plain' ? { start: 0, end: plain.personal.end + 3 } : shift(plain.personal),
          layout: { front: shift(layout.front), frontEnd: layout.front ? layout.frontEnd + 3 : 0, current: shift(layout.current), timeline: shift(layout.timeline), bowerNote: shift(layout.bowerNote), moc: shiftAll(layout.moc) },
          payloads: shiftAll(plain.payloads),
          tasks: plain.tasks.map((task) => ({ ...task, checkboxByte: task.checkboxByte + 3 })),
        });
      }
    }
  });

  it('R4 bom-front-matter-one-mark: only the first mark is skipped, a second one is text', () => {
    for (const eol of ['\n', '\r\n']) {
      expect.soft(parseOwnership(enc(`${BOM}${BOM}${person(eol)}`)).status, `eol=${JSON.stringify(eol)}`).toBe('plain');
      expect.soft(parseNote('Garden plot.md', `${BOM}${BOM}${person(eol)}`).summary).toBe('');
    }
  });

  it('AC2 bom-front-matter-tasks: tasks under Current state, Timeline and Bower\'s note are as out of reach with the mark as without it', () => {
    const tasked = (eol: string): string => ['---', "summary: Alex's garden.", '---', '## Current state', '- [ ] Order seeds', '- Beds are dug', '', 'Alex keeps a planting diary.', '- [ ] Water the beans', '', '## Timeline', '- [ ] Sow peas', '- 2026-10-01 · Sowed the first row', '', "## Bower's note", '- [ ] Bower keeps this line', ''].join(eol);
    const tasksOf = (bytes: Uint8Array): unknown[] => {
      const own = parseOwnership(bytes);
      return own.status === 'invalid' ? [] : own.tasks.map((task) => [task.index, task.label, task.done]);
    };
    for (const eol of ['\n', '\r\n']) {
      const plain = enc(tasked(eol));
      const marked = enc(`${BOM}${tasked(eol)}`);
      // The control: without the mark only the task in Alex's own words is a task; the three others sit in Bower's sections.
      expect(tasksOf(plain)).toEqual([[0, 'Water the beans', false]]);
      expect.soft(tasksOf(marked), `eol=${JSON.stringify(eol)}`).toEqual(tasksOf(plain));
      for (const [index, label] of [[0, 'Water the beans'], [0, 'Order seeds'], [1, 'Sow peas'], [2, 'Bower keeps this line']] as const) {
        const request = { index, label, previousDone: false, done: true };
        const was = togglePersonalTask(plain, request);
        const now = togglePersonalTask(marked, request);
        expect.soft(now.kind === 'changed' ? { ...now, bytes: dec(now.bytes) } : now, `${label}, eol=${JSON.stringify(eol)}`)
          .toEqual(was.kind === 'changed' ? { ...was, bytes: `${BOM}${dec(was.bytes)}` } : was);
      }
    }
  });

  it('R3 bom-front-matter-person-link-rewrite: a person\'s marked note takes a link rewrite as without the mark, a front matter key left alone', () => {
    const linked = (eol: string): string => ['---', 'by: alex', 'related: [[Water butt]]', '[[Water butt]]: key', '---', 'Mine: [[Water butt]].', ''].join(eol);
    for (const eol of ['\n', '\r\n']) {
      const plain = applyChanges(enc(linked(eol)), [relink]);
      // The control: the value and the body are rewritten, the key is not (a legacy note's reading).
      expect(plain.ok && plain.text).toBe(linked(eol).replace('related: [[Water butt]]', 'related: [[Rain barrel]]').replace('Mine: [[Water butt]]', 'Mine: [[Rain barrel]]'));
      expect.soft(applyChanges(enc(`${BOM}${linked(eol)}`), [relink]), `eol=${JSON.stringify(eol)}`).toEqual(withMark(plain));
    }
  });

  it('R3 bom-front-matter-person-edits: a person\'s marked note takes what it takes without the mark, and is refused what it is refused', () => {
    const rulesNote = (eol: string): string => ['---', 'summary: mine', '---', 'Alex keeps paper letters for a year.', '', '## Rules added in Bower', '<!-- bower:ownership/2 begin rules-added -->', '## Rules', '', '- Keep receipts together. <!-- since 2026-10-13 -->', '<!-- bower:ownership/2 end rules-added -->', ''].join(eol);
    const timelineFirst = (eol: string): string => ['## Timeline', '- 2026-09-12 · Planted garlic.', ''].join(eol);
    sameWithMark([
      ['a link rewrite', garden, relink, 'ok'],
      ["a request's one cited line", garden, cited, 'ok'],
      ['the Current state change its owner said yes to', garden, granted, 'ok'],
      ["a rule in Bower's own region, added", garden, wording, 'ok'],
      ["a rule in Bower's own region, there already", rulesNote, wording, 'ok'],
      ['what Bower has learned, added', garden, learned, 'ok'],
      ["a request's one cited line, on a plain note that starts with its Timeline", timelineFirst, cited, 'ok'],
      ['a Timeline line with no request', garden, append, 'not-bower'],
      ['a Current state it was not granted', garden, adopted, 'not-bower'],
      ['a computed property', garden, computed, 'not-bower'],
    ]);
  });

  it('AC4 bom-front-matter-edits: Bower\'s marked note takes every kind of its edit as without the mark, the mark kept first', () => {
    const owned = (eol: string): string => garden(eol, 'bower');
    const rulesNote = (eol: string): string => ['---', 'summary: 1 rule Bower follows in every tidy-up.', 'by: bower', 'kind: Rules', '---', '', '## Rules', '', '- Keep receipts together. <!-- since 2026-10-13 -->', '', '## Notes from you', 'Leave [[Old]] alone.', ''].join(eol);
    sameWithMark([
      ['a Timeline line', owned, append, 'ok'],
      ['a link rewrite', owned, relink, 'ok'],
      ['a Current state rewrite', owned, adopted, 'ok'],
      ['a computed property', owned, computed, 'ok'],
      ['a rule', rulesNote, wording, 'ok'],
    ]);
  });
});
