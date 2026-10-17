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
