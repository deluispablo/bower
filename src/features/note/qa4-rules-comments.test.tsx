/**
 * qa4-rules-comments (qa-4 Claude F3): a Markdown comment (`<!-- … -->`) is never shown on a note page, as CommonMark
 * renderers that do not render HTML leave it out. The Rules note's `<!-- since … -->` dates and Bower's region marks
 * stay in the note's text and leave the page.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Markdown, type LinkFn } from './markdown';

afterEach(cleanup);

const link: LinkFn = (target, label, key) => <a key={key} href={`#${target}`}>{label}</a>;

const RULES = [
  '## Rules',
  '',
  '- Receipts go to Areas / Money / Receipts, in a folder per month. <!-- since 2026-10-15 -->',
  '  *You wrote: "receipts to money by month"*',
  '- Passports go to Areas / Documents. <!-- since 2026-10-11 -->',
  '',
  '## Rules added in Bower',
  '<!-- bower:ownership/2 begin rules-added -->',
  '- Bills from Alex go in Money. <!-- since 2026-10-16 -->',
  '<!-- bower:ownership/2 end rules-added -->',
].join('\n');

describe('qa4-rules-comments: comments stay out of the page', () => {
  it('AC1 comments-hidden: the Rules note shows its rules and none of its comments', () => {
    const { container } = render(<Markdown text={RULES} link={link} />);
    // Positive control: the rules and the words you wrote are on the page.
    expect(screen.getByText(/Receipts go to Areas \/ Money \/ Receipts, in a folder per month\./)).toBeVisible();
    expect(screen.getByText(/Bills from Alex go in Money\./)).toBeVisible();
    expect(screen.getByText('You wrote: "receipts to money by month"')).toBeVisible();
    expect(container.textContent).not.toContain('<!--');
    expect(container.textContent).not.toContain('since 2026');
    expect(container.textContent).not.toContain('bower:ownership');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.trim())).toEqual([
      'Receipts go to Areas / Money / Receipts, in a folder per month.',
      'Passports go to Areas / Documents.',
      'Bills from Alex go in Money.',
    ]);
  });

  it('AC2 comment-in-paragraph: a comment inside a paragraph goes, the words around it stay', () => {
    const { container } = render(<Markdown text={'Alex keeps letters <!-- a note to self --> for a year.'} link={link} />);
    expect(container.querySelector('p')?.textContent?.replace(/\s+/g, ' ')).toBe('Alex keeps letters for a year.');
  });

  it('R5 lone-comment-line: a line that is only a comment leaves no empty block', () => {
    const { container } = render(<Markdown text={'First paragraph.\n\n<!-- hidden -->\n\nSecond paragraph.'} link={link} />);
    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['First paragraph.', 'Second paragraph.']);
  });
});
