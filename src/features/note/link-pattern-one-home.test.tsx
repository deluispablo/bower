/** link-pattern-one-home red (AC4, R13): the note screen reads links with the one pattern from links.ts. */
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Markdown } from './markdown';

it('shows [[]] and [[|b]] as written, [[a|]] as a link shown "a", [[a|b]] as a link shown "b"', () => {
  const { container } = render(<Markdown text={'x [[]] y [[|b]] z [[a|]] w [[a|b]]'} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
  expect(container.textContent).toBe('x [[]] y [[|b]] z a w b');
  expect(screen.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['a', '#a'], ['b', '#a']]);
});

import { boundedWikilinks, FAMILIES, SIZES } from '../../../testing/wikilink-worker';
for (const unit of FAMILIES) for (const size of SIZES) {
  it(`sec-wikilinks-reader-responsive ${JSON.stringify(unit)} ${size}`, async () => {
    await boundedWikilinks('reader', unit, size);
  }, 30000);
}

it('preserves earliest-token precedence and consumes each token whole', () => {
  const calls: Array<[string, string]> = [];
  const { container } = render(<Markdown text={'**[[a]]** *[[a]]* [[a|**b**]]'} link={(target, label, key) => {
    calls.push([target, label]);
    return <a key={key} href={`#${target}`}>{label}</a>;
  }} />);
  expect(container.querySelector('strong')?.textContent).toBe('[[a]]');
  expect(container.querySelector('em')?.textContent).toBe('[[a]]');
  expect(container.querySelector('a')?.textContent).toBe('**b**');
  expect(container.querySelector('a strong')).toBeNull();
  expect(calls).toEqual([['a', '**b**']]);
});

it('recovers a nested opener after an earlier emphasis token ends', () => {
  const { container } = render(<Markdown text={'**[[a** [[b]]'} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
  expect(container.querySelector('strong')?.textContent).toBe('[[a');
  expect(container.querySelector('a')?.getAttribute('href')).toBe('#b');
  expect(container.textContent).toBe('[[a b');
});
