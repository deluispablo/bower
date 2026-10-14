import { describe, expect, it } from 'vitest';
import { applyChanges, entryOk } from './note-edit';
import { parseNote, serializeNote } from './note-format';
import * as line from './timeline-line';

// B9 (TL-P4-50 B9 Q1-Q3): one helper in the one Timeline home turns a marker into plain text; the stored triple is unchanged.
type Marker = 'contradiction' | 'uncertain' | 'inferred';
const markerText = (line as unknown as { markerText?: (marker: Marker, text: string, alsoFrom?: string | null) => string }).markerText;
const { parseTimelineLine, timelineLine } = line;

const date = '2026-10-07';
const BOWER = '---\nby: bower\n---\n\n## Timeline\n';
const CANONICAL = 'Contradiction: Earlier terms give 1,450; later terms give 1,580 from 2026-11-01, per month. Neither is confirmed. (also from [[Earlier listing.txt]])';
const append = (before: string, entries: Array<{ date: string; text: string; source: string | null }>) =>
  applyChanges(new TextEncoder().encode(before), [{ kind: 'timeline-append', recordIds: [], entries }]);

describe('B9a format', () => {
  it('AC1 b9-marker-text: one helper writes the three closed labels and the one canonical citation', () => {
    expect(markerText, 'timeline-line.ts exports the one marker helper').toBeTypeOf('function');
    if (!markerText) return;
    expect(markerText('contradiction', 'A says 1; B says 2.', 'Earlier listing.txt')).toBe('Contradiction: A says 1; B says 2. (also from [[Earlier listing.txt]])');
    expect(markerText('uncertain', 'The garden may close.')).toBe('Uncertain: The garden may close.');
    expect(markerText('uncertain', 'The garden may close.', 'Notice.txt')).toBe('Uncertain: The garden may close. (also from [[Notice.txt]])');
    expect(markerText('inferred', 'The visit may be affected.')).toBe('The visit may be affected. (inferred)');
    expect(markerText('inferred', 'The visit may be affected.', 'Visit booking.txt')).toBe('The visit may be affected. (inferred) (also from [[Visit booking.txt]])');
    expect(markerText('uncertain', '  Spaced.  ')).toBe('Uncertain: Spaced.');
    // A note's citation drops `.md`, as a Timeline source does (scripted citeName).
    expect(markerText('uncertain', 'Pending.', 'Visit plan.md')).toBe('Uncertain: Pending. (also from [[Visit plan]])');
    for (const bad of ['confirmed', 'Contradiction', '']) expect(() => markerText(bad as Marker, 'x')).toThrow();
    expect(() => markerText('contradiction', 'One source only.')).toThrow();
    for (const name of ['', '.md', ' ', 'bad[name', 'bad]name', 'bad|alias', 'bad#heading', 'bad^block', 'Two\nlines.txt', 'Two\r lines.txt', 'Two\u2028lines.txt', 'Two\u2029lines.txt']) {
      expect(() => markerText('uncertain', 'x', name), JSON.stringify(name)).toThrow();
    }
  });

  it('AC2 b9-entry-citation: the write rule takes exactly one canonical citation at the end', () => {
    expect(entryOk({ date, text: CANONICAL, source: 'Later listing.txt' }), 'the canonical citation is a valid authored field').toBe(true);
    expect(entryOk({ date, text: CANONICAL, source: 'Later listing.txt' }, 'read')).toBe(true);
    expect(entryOk({ date, text: 'From 2026-10-02: The visit may be affected. (inferred) (also from [[Visit booking.txt]])', source: 'Later notice.txt' })).toBe(true);
    for (const text of [
      'Raw [[Notice]] link.',
      'Contradiction: A. (also from [[One.txt]]) (also from [[Two.txt]])',
      'Contradiction: A. (also from [[One.txt]]) and more.',
      'Contradiction: A. (also from [[One.txt|alias]])',
      'Contradiction: A. (also from [[One.txt#Heading]])',
      'Contradiction: A. (also from [[One.txt^block]])',
      'Contradiction: A. (also from [[]])',
      'Contradiction: A. (also from [[[One.txt]]])',
      'Contradiction: A. (also from [[One · Two.txt]])',
      'Contradiction: A. (also from [[One.txt]]',
      'Contradiction: A · B. (also from [[One.txt]])',
      'Contradiction: A.\n(also from [[One.txt]])',
    ]) for (const mode of ['write', 'read'] as const) expect(entryOk({ date, text, source: 'Later listing.txt' }, mode), `${mode}: ${text}`).toBe(false);
  });

  it('AC2 b9-one-physical-line: a line or paragraph separator refuses on write, marked or not', () => {
    for (const text of ['Uncertain: Two\u2028physical lines.', 'Uncertain: Two\u2029paragraphs.', 'Two\u2028lines without a marker.']) {
      expect(entryOk({ date, text, source: 'Notice.txt' }), JSON.stringify(text)).toBe(false);
      // A stored manifest is read leniently, as before (TL-P4-19 addendum 22).
      expect(entryOk({ date, text, source: 'Notice.txt' }, 'read')).toBe(true);
    }
  });

  it('AC2 b9-one-physical-line-sources: the terminal source and the citation name refuse a separator on write too (R19)', () => {
    for (const source of ['Notice\u2028two.txt', 'Notice\u2029two.txt']) {
      expect(entryOk({ date, text: 'Undecided.', source }), JSON.stringify(source)).toBe(false);
      expect(entryOk({ date, text: 'Undecided.', source }, 'read')).toBe(true);
    }
    expect(entryOk({ date, text: 'Uncertain: A. (also from [[Two\u2028lines.txt]])', source: 'Notice.txt' })).toBe(false);
    expect(entryOk({ date, text: 'Uncertain: A. (also from [[Two\u2028lines.txt]])', source: 'Notice.txt' }, 'read')).toBe(true);
  });

  it('AC3 b9-append-dedup: a canonical line appends once, round-trips and dedups on replay', () => {
    const entry = { date, text: CANONICAL, source: 'Later listing.txt' };
    expect(parseTimelineLine(timelineLine(entry))).toEqual(entry);
    const first = append(BOWER, [entry]);
    expect(first.ok, 'the existing author accepts the canonical citation').toBe(true);
    if (!first.ok) return;
    expect(first.text).toContain(timelineLine(entry));
    expect(parseNote('Terms.md', first.text).timeline).toEqual([entry]);
    expect(append(first.text, [entry])).toEqual({ ok: false, reason: 'unchanged' });
    // Same text, other day: still present (text and source decide, R3-3).
    expect(append(first.text, [{ ...entry, date: '2026-10-08' }])).toEqual({ ok: false, reason: 'unchanged' });
    // Two marked lines for one note are one edit.
    const two = append(BOWER, [{ date, text: 'Uncertain: The garden may close.', source: 'Garden notice.txt' },
      { date, text: 'The visit may be affected. (inferred) (also from [[Visit booking.txt]])', source: 'Garden notice.txt' }]);
    expect(two.ok).toBe(true);
    if (two.ok) expect(parseNote('Visit.md', two.text).timeline.map((e) => e.text)).toEqual(['Uncertain: The garden may close.', 'The visit may be affected. (inferred) (also from [[Visit booking.txt]])']);
  });

  it('AC3 b9-rename-keeps-citation: renaming the cited older source rewrites the citation and the line stays valid', () => {
    const stored = new TextEncoder().encode(BOWER + timelineLine({ date, text: CANONICAL, source: 'Later listing.txt' }) + '\n');
    const renamed = applyChanges(stored, [{ kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Earlier listing.txt', to: 'First listing.txt' }] }]);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    const after = parseNote('Terms.md', renamed.text).timeline[0];
    expect(after?.text).toBe(CANONICAL.replace('Earlier listing.txt', 'First listing.txt'));
    expect(after && entryOk({ date: after.date, text: after.text, source: after.source ?? null }), 'the renamed citation is still a valid field').toBe(true);
  });

  it('AC3 b9-rename-unwritable-citation: Old to One · Two falls back to words (round 2)', () => {
    const text = 'Uncertain: The visit may be affected. (also from [[Old]])';
    const stored = BOWER + timelineLine({ date, text, source: 'Later listing.txt' }) + '\n';
    const renamed = applyChanges(new TextEncoder().encode(stored), [{ kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Old', to: 'One · Two' }] }]);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    const words = 'Uncertain: The visit may be affected. (also from One, Two)';
    expect(renamed.text).toBe(BOWER + timelineLine({ date, text: words, source: 'Later listing.txt' }) + '\n');
    const after = parseNote('Terms.md', renamed.text).timeline[0];
    expect(after && entryOk({ date: after.date, text: after.text, source: after.source ?? null })).toBe(true);
  });

  it('AC4 b9-v2-literal: a framed ownership/2 note keeps old marker text literal and takes a canonical line in its Timeline', () => {
    const old = '[!contradiction] Opening hours are undecided ^[inferred]';
    const raw = serializeNote({ template: 'concept', byBower: true, summary: 'Alex records garden visits.', status: 'active', tags: ['gardening'],
      properties: [{ key: 'type', label: 'Type', value: 'concept' }, { key: 'created', label: 'Created', value: '2026-10-02' },
        { key: 'updated', label: 'Updated', value: '2026-10-02' }, { key: 'source', label: 'Source', value: 'Garden bulletin' },
        { key: 'related', label: 'Related', value: 'Gardening', link: 'Gardening' }],
      currentState: ['Alex visits in spring.'], body: 'Alex copied [!future-marker] literally.',
      timeline: [{ date: '2026-10-02', text: old, source: 'Garden bulletin' }] });
    expect(raw).toContain('bower_format: ownership/2');
    expect(raw).toContain('<!-- bower:ownership/2 begin timeline -->');
    expect(parseNote('Visits.md', raw).timeline).toEqual([{ date: '2026-10-02', text: old, source: 'Garden bulletin' }]);
    const entry = { date, text: CANONICAL, source: 'Later listing.txt' };
    const first = append(raw, [entry]);
    expect(first.ok, 'the v2 Timeline region takes the canonical line').toBe(true);
    if (!first.ok) return;
    expect(parseNote('Visits.md', first.text).timeline).toEqual([{ date: '2026-10-02', text: old, source: 'Garden bulletin' }, entry]);
    expect(first.text).toContain('Alex copied [!future-marker] literally.');
  });

  it('AC4 b9-stored-separator-reads: a stored line holding U+2028 or U+2029 still reads as one Timeline entry, bytes kept (R16)', () => {
    for (const sep of ['\u2028', '\u2029']) {
      const text = `The visit${sep}may be affected.`;
      expect(parseNote('Visits.md', `${BOWER}${timelineLine({ date, text, source: 'Notice.txt' })}\n`).timeline, JSON.stringify(sep))
        .toEqual([{ date, text, source: 'Notice.txt' }]);
    }
  });

  it('AC4 guard b9-legacy-literal: old, plugin-like and unknown marker text stays literal on read', () => {
    const old = '[!future-marker] Opening hours are undecided ^[inferred]';
    const owned = serializeNote({ byBower: true, summary: 'Alex records visits.', properties: [], tags: [],
      currentState: [], body: '> [!contradiction] Alex copied this literally.', timeline: [{ date, text: old }] });
    for (const raw of [owned, BOWER + timelineLine({ date, text: old }), BOWER + timelineLine({ date, text: old, marker: '* ' })]) {
      for (const value of [raw, raw.replaceAll('\n', '\r\n')]) {
        const entry = parseNote('Visits.md', value).timeline[0];
        expect(entry).toMatchObject({ date, text: old });
        expect(entry?.source ?? null).toBeNull();
      }
    }
    const plain = '## Timeline\r\n* ' + date + ' · ' + old + '\r\n';
    expect(parseNote('Plain.md', plain).body).toContain(old);
    expect(parseNote('Plain.md', plain).timeline).toEqual([]);
    expect(entryOk({ date, text: 'New: Old uncited history.', source: null }, 'read')).toBe(true);
    expect(entryOk({ date, text: 'New: Old uncited history.', source: null })).toBe(false);
  });

  it.each([
    { date: '2026-02-30', text: 'Undecided.', source: 'Notice.txt' },
    { date, text: 'Two\nphysical lines.', source: 'Notice.txt' },
    { date, text: 'A · separator', source: 'Notice.txt' },
    { date, text: 'Raw [[Notice]]', source: 'Notice.txt' },
    { date, text: 'Undecided.', source: 'Notice|alias' },
  ])('AC4 guard b9-unsafe-fields: still refused %j', (entry) => {
    expect(entryOk(entry)).toBe(false);
  });
});
