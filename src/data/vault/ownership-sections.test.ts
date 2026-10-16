/**
 * One parser, every section's position (TL-P4-14 stage 3, `c3-note-sections`). `parseOwnership` frames a note's
 * frontmatter, Current state, Timeline and Bower's note for v2, legacy and plain notes alike, so no other file
 * finds a section on its own. Headings are ATX headings (CommonMark 0.31 "ATX headings"), the frontmatter is the
 * YAML front matter block between `---` fences (Jekyll / Obsidian convention).
 */
import { describe, expect, it } from 'vitest';
import { parseOwnership, type ByteSpan } from './ownership-format';

interface Layout {
  front: ByteSpan | null; frontEnd: number;
  current: ByteSpan | null; timeline: ByteSpan | null; bowerNote: ByteSpan | null;
}
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const slice = (bytes: Uint8Array, span: ByteSpan | null | undefined): string | null =>
  span ? new TextDecoder().decode(bytes.subarray(span.start, span.end)) : null;

/** The text each section covers, as `parseOwnership` positions it (null: no such section). */
function sectionsOf(text: string) {
  const bytes = encode(text);
  const parsed = parseOwnership(bytes);
  const layout = (parsed as { layout?: Layout }).layout;
  if (!layout) return { status: parsed.status, layout: 'missing' };
  return {
    status: parsed.status,
    front: slice(bytes, layout.front),
    frontEnd: layout.frontEnd,
    current: slice(bytes, layout.current),
    timeline: slice(bytes, layout.timeline),
    bowerNote: slice(bytes, layout.bowerNote),
  };
}

const MARK = (kind: 'begin' | 'end', owner: string): string => `<!-- bower:ownership/2 ${kind} ${owner} -->\n`;
const V2 = `---\nsummary: S\nbower_format: ownership/2\n---\n${MARK('begin', 'current')}## Current state\n- a\n${MARK('end', 'current')}`
  + `${MARK('begin', 'personal')}mine\n${MARK('end', 'personal')}${MARK('begin', 'timeline')}## Timeline\n- 1 Oct · x\n${MARK('end', 'timeline')}`
  + `${MARK('begin', 'bower-note')}## Bower's note\nhi\n${MARK('end', 'bower-note')}`;
const LEGACY = "---\nsummary: S\nby: bower\n---\n\n## Current state\n- a\n- b\n\nmy words\n\n## Timeline\n- 1 Oct · x\n\n## Bower's note\nhi\n";

describe('the note sections', () => {
  it('one parser gives every section position, old notes included', () => {
    // v2: the payloads, heading inside.
    expect(sectionsOf(V2)).toEqual({
      status: 'v2', front: 'summary: S\nbower_format: ownership/2\n', frontEnd: 4 + 'summary: S\nbower_format: ownership/2\n'.length + 4,
      current: '## Current state\n- a\n', timeline: '## Timeline\n- 1 Oct · x\n', bowerNote: "## Bower's note\nhi\n",
    });
    // Legacy: each section runs from its heading to the next one.
    expect(sectionsOf(LEGACY)).toEqual({
      status: 'legacy', front: 'summary: S\nby: bower\n', frontEnd: '---\nsummary: S\nby: bower\n---\n'.length,
      current: '## Current state\n- a\n- b\n', timeline: '## Timeline\n- 1 Oct · x\n\n', bowerNote: "## Bower's note\nhi\n",
    });
    // CRLF positions are bytes of the file as read.
    const crlf = sectionsOf(LEGACY.replace(/\n/g, '\r\n'));
    expect(crlf).toMatchObject({ status: 'legacy', front: 'summary: S\r\nby: bower\r\n', current: '## Current state\r\n- a\r\n- b\r\n', bowerNote: "## Bower's note\r\nhi\r\n" });
    // A plain note, an unterminated frontmatter and a lone fence have no section at all.
    for (const text of ['just words\n', '---\nsummary: S\nwords\n', '---\n', '---\nnot closed']) {
      expect(sectionsOf(text)).toEqual({ status: 'plain', front: null, frontEnd: 0, current: null, timeline: null, bowerNote: null });
    }
    // A closed frontmatter with no format key is legacy; missing sections are null, not guessed.
    expect(sectionsOf("---\nsummary: S\n---\nwords\n\n## Bower's note\nhi\n")).toEqual({
      status: 'legacy', front: 'summary: S\n', frontEnd: '---\nsummary: S\n---\n'.length, current: null, timeline: null, bowerNote: "## Bower's note\nhi\n",
    });
    // Duplicate headings: the last one wins, as every reader has read them.
    const twice = sectionsOf('---\nsummary: S\n---\n## Timeline\n- 1 Oct · old\n\n## Timeline\n- 2 Oct · new\n');
    expect(twice).toMatchObject({ status: 'legacy', timeline: '## Timeline\n- 2 Oct · new\n' });
    // A byte-order mark in front of the fence is not text: the legacy reading frames the same sections, three bytes
    // later, as it frames a v2 note (bom-front-matter; was plain).
    expect(sectionsOf(`\ufeff${LEGACY}`)).toEqual({ ...sectionsOf(LEGACY), frontEnd: 3 + '---\nsummary: S\nby: bower\n---\n'.length });
    expect(sectionsOf(`\ufeff${V2}`)).toMatchObject({ status: 'v2', front: 'summary: S\nbower_format: ownership/2\n', timeline: '## Timeline\n- 1 Oct · x\n' });
  });
});
