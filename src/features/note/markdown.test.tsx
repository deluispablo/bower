import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Markdown, outlineOf } from './markdown';

describe('the note reader', () => {
  it('turns wikilinks into links and never runs HTML', () => {
    render(<Markdown text={'See [[Flat 7]] and <img src=x onerror=alert(1)>'} link={(t, l, k) => <a key={k} href={`#${t}`}>{l}</a>} />);
    expect(screen.getByRole('link', { name: 'Flat 7' })).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
  it('reads lists, tables and headings', () => {
    const { container } = render(<Markdown text={'## A\n\n- one\n- two\n\n| x | y |\n| --- | --- |\n| 1 | 2 |'} link={(t) => t} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('td')?.textContent).toBe('1');
    expect(outlineOf('## A\n### B c')).toEqual([{ level: 2, text: 'A', id: 'h-a' }, { level: 3, text: 'B c', id: 'h-b-c' }]);
  });
});

import { noteOutline } from './markdown';

describe('the note outline', () => {
  it("lists Bower's sections where they are on the page", () => {
    const o = noteOutline({ currentState: ['a'], body: '## What matters\n\ntext\n### Detail', bowerNote: { text: 'x', source: 'notes' }, timeline: [{ date: '1 Oct', text: 'y' }] });
    expect(o.map((h) => [h.text, h.id])).toEqual([
      ['Current state', 'cs'],
      ['What matters', 'h-what-matters'],
      ['Detail', 'h-detail'],
      ["Bower's note", 'bn'],
      ['Timeline', 'tl'],
    ]);
  });
});

it('NSPL no Bower region', () => {
  const onToggle = vi.fn();
  const { container } = render(<Markdown text={[
    '## Next steps', '- A normal bullet.', '- [ ] Plant mint.', '- [x] Choose seeds.',
    '', '## Notes', '- [ ] Buy a pot.',
  ].join('\n')} link={(target) => target} onToggle={onToggle} />);
  // Positive control: ordinary Markdown is still a real unordered list.
  const ordinary = screen.getByText('A normal bullet.');
  expect(ordinary.tagName).toBe('LI');
  expect(ordinary.parentElement?.tagName).toBe('UL');
  expect(ordinary).not.toHaveClass('md-task');
  expect(within(ordinary).queryByRole('checkbox')).not.toBeInTheDocument();
  // A heading alone grants no Bower ownership: all three tasks remain personal.
  expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  const open = screen.getByRole('checkbox', { name: 'Plant mint.' });
  const done = screen.getByRole('checkbox', { name: 'Choose seeds.' });
  const next = screen.getByRole('checkbox', { name: 'Buy a pot.' });
  expect(open).toBeEnabled();
  expect(open).not.toBeChecked();
  expect(done).toBeEnabled();
  expect(done).toBeChecked();
  expect(done.closest('label')).toHaveClass('md-done');
  expect(container.querySelectorAll('li')).toHaveLength(4);
  fireEvent.click(open);
  fireEvent.click(done);
  fireEvent.click(next);
  expect(onToggle.mock.calls).toEqual([[0], [1], [2]]);
  cleanup();
});

it('NSPL supplied task regions keep each personal checkbox body index', () => {
  const onToggle = vi.fn();
  const props = {
    text: [
      '## Notes', '- A normal bullet.', '- [ ] Buy a pot.', '- [ ] Plant mint.',
      '- [x] Water mint.', '- [x] Choose seeds.', '- [ ] Label the pot.',
    ].join('\n'),
    link: (target: string) => target,
    onToggle,
    taskRegions: ['personal', 'bower', 'personal', 'bower', 'personal'] as Array<'personal' | 'bower'>,
  };
  render(<Markdown {...props} />);
  // Ownership comes only from the supplied projection, even under Notes.
  for (const label of ['Buy a pot.', 'Water mint.', 'Label the pot.']) {
    const checkbox = screen.getByRole('checkbox', { name: label });
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
  }
  expect(onToggle.mock.calls).toEqual([[0], [2], [4]]);
  expect.soft(screen.getAllByRole('checkbox')).toHaveLength(3);
  for (const label of ['Plant mint.', 'Choose seeds.']) {
    const row = screen.getByText(label, { exact: true }).closest('li');
    expect(row).not.toBeNull();
    if (!row) throw new Error('Expected a task list item');
    expect.soft(within(row).queryByRole('checkbox')).not.toBeInTheDocument();
    expect.soft(row).not.toHaveClass('md-task');
  }
  cleanup();
});
