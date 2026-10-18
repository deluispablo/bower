/** link-pattern-one-home red (AC4, R13): the note screen reads links with the one pattern from links.ts. */
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Markdown } from './markdown';

it('shows [[]] and [[|b]] as written, [[a|]] as a link shown "a", [[a|b]] as a link shown "b"', () => {
  const { container } = render(<Markdown text={'x [[]] y [[|b]] z [[a|]] w [[a|b]]'} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
  expect(container.textContent).toBe('x [[]] y [[|b]] z a w b');
  expect(screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['a', '#a'], ['b', '#a']]);
});
