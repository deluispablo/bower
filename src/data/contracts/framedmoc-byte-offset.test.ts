import { describe, expect, it } from 'vitest';
import { applyChanges } from './note-edit';
import type { Change } from './run-manifest';

// A legacy Bower map upgrades to ownership/2 on its first moc-rewrite. The expected output is written by hand:
// the format line opens the front matter, empty framing follows the closing fence, and each map region is fenced.
const BOM = String.fromCharCode(0xfeff);
const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const legacyMap = (summary: string): string =>
  ['---', summary, 'by: bower', 'type: moc', '---', '## Overview', 'Alex grows beans.', '', '## Notes', '- [[Plot]]', ''].join('\n');
const mark = (kind: 'begin' | 'end', region: string): string => `<!-- bower:ownership/2 ${kind} ${region} -->\n`;
const upgraded = (summary: string): string => [
  `---\nbower_format: ownership/2\n${summary}\nby: bower\ntype: moc\n---\n`,
  ...['current', 'personal', 'timeline', 'bower-note'].map((owner) => mark('begin', owner) + mark('end', owner)),
  mark('begin', 'moc-overview'), '## Overview\nAlex grows peas.\n\n', mark('end', 'moc-overview'),
  mark('begin', 'moc-figures'), mark('end', 'moc-figures'),
  mark('begin', 'moc-members'), '## Notes\n- [[Plot]]\n', mark('end', 'moc-members'),
].join('');
const rewrite = { kind: 'moc-rewrite', region: 'moc-overview', recordIds: [],
  previous: '## Overview\nAlex grows beans.\n\n', text: '## Overview\nAlex grows peas.\n\n' } as unknown as Change;

describe('framedMoc places the empty framing at the character after the front matter', () => {
  it('positive control: an ASCII map takes moc-rewrite', () => {
    expect(applyChanges(enc(legacyMap('summary: Lease')), [rewrite])).toMatchObject({ ok: true, text: upgraded('summary: Lease') });
  });

  it('a map whose front matter holds non-ASCII text takes moc-rewrite as the ASCII map does', () => {
    expect(applyChanges(enc(legacyMap('summary: Café')), [rewrite])).toMatchObject({ ok: true, text: upgraded('summary: Café') });
  });

  it('a map that starts with a byte-order mark takes moc-rewrite and keeps the mark', () => {
    expect(applyChanges(enc(`${BOM}${legacyMap('summary: Lease')}`), [rewrite]))
      .toMatchObject({ ok: true, text: `${BOM}${upgraded('summary: Lease')}` });
  });
});

// moc-legacy-timeline (rulings R1-R4, R6): an older map's stored Timeline moves unchanged into the timeline frame.
// Every expected output is written by hand: the Timeline span leaves its place and fills the timeline frame.
const LINE = '- 2026-10-02 · Started the bean topic.';
const olderMap = (tail: string, eol = '\n'): string =>
  ['---', 'summary: Lease', 'by: bower', 'type: moc', '---', '## Overview', 'Alex grows beans.', '', '## Notes', '- [[Plot]]', '', ''].join(eol) + tail;
const converted = (timeline: string, after = '', eol = '\n'): string => {
  const m = (kind: 'begin' | 'end', region: string): string => `<!-- bower:ownership/2 ${kind} ${region} -->${eol}`;
  return [
    `---${eol}bower_format: ownership/2${eol}summary: Lease${eol}by: bower${eol}type: moc${eol}---${eol}`,
    m('begin', 'current'), m('end', 'current'), m('begin', 'personal'), m('end', 'personal'),
    m('begin', 'timeline'), timeline, m('end', 'timeline'), m('begin', 'bower-note'), m('end', 'bower-note'),
    m('begin', 'moc-overview'), `## Overview${eol}Alex grows peas.${eol}${eol}`, m('end', 'moc-overview'),
    m('begin', 'moc-figures'), m('end', 'moc-figures'),
    m('begin', 'moc-members'), `## Notes${eol}- [[Plot]]${eol}${eol}`, m('end', 'moc-members'), after,
  ].join('');
};
const crlfRewrite = { kind: 'moc-rewrite', region: 'moc-overview', recordIds: [],
  previous: '## Overview\r\nAlex grows beans.\r\n\r\n', text: '## Overview\r\nAlex grows peas.\r\n\r\n' } as unknown as Change;

describe('framedMoc moves an older map\'s Timeline unchanged into the timeline frame', () => {
  it('AC1: a Timeline after Notes moves into the timeline frame; every other byte keeps its order', () => {
    expect(applyChanges(enc(olderMap(`## Timeline\n${LINE}\n`)), [rewrite]))
      .toMatchObject({ ok: true, text: converted(`## Timeline\n${LINE}\n`) });
  });

  it('AC2a: a section after the Timeline moves with it, every byte kept', () => {
    const span = `## Timeline\n${LINE}\n\n## Ideas\nTry runner beans.\n`;
    expect(applyChanges(enc(olderMap(span)), [rewrite])).toMatchObject({ ok: true, text: converted(span) });
  });

  it('AC2b: a Timeline without a final line break takes exactly one line break before its end marker', () => {
    expect(applyChanges(enc(olderMap(`## Timeline\n${LINE}`)), [rewrite]))
      .toMatchObject({ ok: true, text: converted(`## Timeline\n${LINE}\n`) });
  });

  it('AC2c: a CRLF map converts with CRLF framing and its Timeline unchanged', () => {
    expect(applyChanges(enc(olderMap(`## Timeline\r\n${LINE}\r\n`, '\r\n')), [crlfRewrite]))
      .toMatchObject({ ok: true, text: converted(`## Timeline\r\n${LINE}\r\n`, '', '\r\n') });
  });

  it("AC2d: Bower's note after the Timeline stays in place outside the frames; its frame stays empty", () => {
    expect(applyChanges(enc(olderMap(`## Timeline\n${LINE}\n## Bower's note\nKeep the beans dry.\n`)), [rewrite]))
      .toMatchObject({ ok: true, text: converted(`## Timeline\n${LINE}\n`, "## Bower's note\nKeep the beans dry.\n") });
  });

  it('AC2e (guard): a Timeline before Overview is still refused and the input is unchanged', () => {
    const raw = ['---', 'summary: Lease', 'by: bower', 'type: moc', '---', '## Timeline', LINE, '', '## Overview', 'Alex grows beans.', '',
      '## Notes', '- [[Plot]]', ''].join('\n');
    const bytes = enc(raw);
    expect(applyChanges(bytes, [rewrite])).toEqual({ ok: false, reason: 'not-bower' });
    expect(bytes).toEqual(enc(raw));
  });

  it('AC4: a new Timeline line on the converted map (built from AC1\'s output) is still refused', () => {
    const result = applyChanges(enc(olderMap(`## Timeline\n${LINE}\n`)), [rewrite]);
    expect(result.ok, 'the older map converts first').toBe(true);
    if (!result.ok) return;
    const append = { kind: 'timeline-append', recordIds: ['r1'], entries: [{ date: '2026-10-06', text: 'Alex sowed beans.', source: null }] } as Change;
    expect(applyChanges(result.bytes, [append])).toEqual({ ok: false, reason: 'unsupported' });
  });
});
