/** B8b red: one link grammar that skips fenced code (CommonMark 0.31.2 §4.5), ported from b8-log a397198f. */
import { expect, it } from 'vitest';
import { parseNote } from './note-format';
import { linkTarget } from './links';

const LINKS = '[[Linked reference#Overview|reference]] [[Gardening^block|garden]] [[Missing plan#Next|plan]]\n';

it('AC10 b8-links-fence-one-grammar', () => {
  const text = LINKS + '```md\n[[Fence ghost]]\n```\n~~~md\n[[Tilde ghost]]\n~~~\n````\n```\n[[Long fence ghost]]\n````\n';
  expect(parseNote('Plot diary.md', text).links).toEqual(['Linked reference#Overview', 'Gardening^block', 'Missing plan#Next']);
  // An unclosed fence runs to the end of the note, so nothing after it is a link either (CommonMark).
  expect(parseNote('Plot diary.md', 'Before [[Kept]]\n```\n[[Open fence ghost]]\n').links).toEqual(['Kept']);
});
it('AC10 control: aliases, headings and blocks resolve through the shared target helper', () => {
  const links = parseNote('Plot diary.md', LINKS).links;
  expect(links.map(linkTarget)).toEqual(['linked reference', 'gardening', 'missing plan']);
});
