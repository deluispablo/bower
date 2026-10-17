import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import type { Note } from '@/data/types';
import { noteRoute } from '@/app/paths';
import { LinkedList } from './RightPanel';

// C06 c06-links-panel (specs/c06-connections/spec.md AC21-AC22, R17-R18, R22; TL-P4-34 addendum 1): a body line
// `See also [[X]]: <why>.` (a list item too) gives the "Links to" row X names its muted second line, in the
// breadcrumb's place (the run result's row style). Nothing else is a reason.
const HUB = 'Projects/Garden shelter/Garden shelter.md';
const PLAN = 'Projects/Garden shelter/Plan.md';
const RENT = 'Projects/Garden shelter/Rent review.md';
const HERE = 'Projects/Garden shelter/Cedar.md';
const THERE = 'Archive/Old shelter/Cedar.md';
const ABOUT = 'About me.md';
const AT_HUB = 'Projects / Garden shelter';

const noteOf = (body: string, links: string[], backlinks: string[] = [], timeline: Note['timeline'] = []): Note => ({
  path: HUB, title: 'Garden shelter', summary: '', properties: [], tags: [], currentState: [], body, timeline, links, backlinks, byBower: true,
});
afterEach(cleanup);
/** The list under a panel heading. */
function panel(note: Note): (heading: string) => HTMLElement {
  render(<MemoryRouter><LinkedList note={note} /></MemoryRouter>);
  return (heading) => {
    const list = screen.getByRole('heading', { name: heading }).nextElementSibling;
    if (!(list instanceof HTMLElement) || list.tagName !== 'UL') throw new Error(`no list under ${heading}`);
    return list;
  };
}
/** The row that opens `path` (found by where it goes, so a reason inside the link does not change the lookup). */
function row(list: HTMLElement, path: string): HTMLElement {
  const link = within(list).getAllByRole('link').find((a) => a.getAttribute('href') === noteRoute(path));
  const li = link?.closest('li');
  if (!li) throw new Error(`no row for ${path}`);
  return li;
}
const reasonOf = (li: HTMLElement): string | null => li.querySelector('.muted')?.textContent ?? null;

it('AC21 c06-links-panel-reason: a "See also" line gives its row the reason as a muted second line, in the breadcrumb\'s place', () => {
  const list = panel(noteOf('Alex builds a shelter.\n\nSee also [[Plan]]: the roof plan.', [PLAN, RENT]));
  const plan = row(list('Links to'), PLAN);
  expect(plan.textContent, 'control: the title stays').toMatch(/^Plan/);
  expect(reasonOf(plan)).toBe('the roof plan.');
  expect(plan.textContent, 'the reason takes the breadcrumb\'s place').not.toContain(AT_HUB);
  expect(row(list('Links to'), RENT).textContent, 'a row without a reason reads as today').toBe(`Rent review${AT_HUB}`);
});

it('AC21 c06-links-panel-reason: a "See also" list item gives its row\'s reason', () => {
  const list = panel(noteOf('Alex builds a shelter.\n\n- See also [[Rent review]]: same landlord.\n* See also [[Plan]]: the roof plan.', [PLAN, RENT]));
  expect(reasonOf(row(list('Links to'), RENT))).toBe('same landlord.');
  expect(reasonOf(row(list('Links to'), PLAN))).toBe('the roof plan.');
});

it('AC21 c06-links-panel-path: a path-named "See also" gives the reason to that row, not to its namesake', () => {
  const list = panel(noteOf('See also [[Archive/Old shelter/Cedar]]: the boards from the old shelter.', [HERE, THERE]));
  const there = row(list('Links to'), THERE);
  expect(there.textContent, 'control: the title stays').toMatch(/^Cedar/);
  expect(reasonOf(there)).toBe('the boards from the old shelter.');
  expect(row(list('Links to'), HERE).textContent, 'the other Cedar has no reason: title and breadcrumb').toBe(`Cedar${AT_HUB}`);
});

it('AC21 c06-links-panel-first: two "See also" lines for one note: the first reason wins, the row shows once', () => {
  const list = panel(noteOf('See also [[Plan]]: the roof plan.\nSee also [[Plan]]: the second word on it.', [PLAN]));
  expect(within(list('Links to')).getAllByRole('link')).toHaveLength(1);
  expect(reasonOf(row(list('Links to'), PLAN))).toBe('the roof plan.');
  expect(screen.queryByText(/the second word on it/)).toBeNull();
});

it('AC21 c06-links-panel-forms: a heading link, an alias and another case still name their row (linkTarget)', () => {
  const list = panel(noteOf(
    'See also [[Plan#Roof]]: the roof section.\nSee also [[rent review|the review]]: same landlord.\nSee also [[archive/old shelter/cedar]]: the old boards.',
    [PLAN, RENT, THERE],
  ));
  expect(reasonOf(row(list('Links to'), PLAN))).toBe('the roof section.');
  expect(reasonOf(row(list('Links to'), RENT))).toBe('same landlord.');
  expect(reasonOf(row(list('Links to'), THERE))).toBe('the old boards.');
});

it('AC21 c06-links-panel-whole: a long reason or one with markdown is kept whole, to the end of its line only', () => {
  const long = 'the boards Alex saved when the old shelter came down in the spring, which fit the new roof once cut to length.';
  const list = panel(noteOf(`See also [[Plan]]: ${long}\nAlex reuses them.\nSee also [[Cedar]]: the **cedar** boards, as in [[Rent review]].`, [PLAN, HERE, RENT]));
  expect(reasonOf(row(list('Links to'), PLAN))).toBe(long);
  const cedar = reasonOf(row(list('Links to'), HERE));
  expect(cedar).toMatch(/cedar/);
  expect(cedar).toMatch(/Rent review/);
  expect(row(list('Links to'), RENT).textContent, 'a link inside a reason gives no reason of its own').toBe(`Rent review${AT_HUB}`);
});

it('AC21 c06-links-panel-both-ways: a row that links both ways shows its reason and keeps its mark', () => {
  const list = panel(noteOf('See also [[Plan]]: the roof plan.', [PLAN], [PLAN]));
  const plan = row(list('Links to'), PLAN);
  expect(plan.textContent, 'control: the mark is there today').toContain('Links both ways');
  expect(reasonOf(plan)).toBe('the roof plan.');
});

it('AC22 c06-links-panel-no-reason: only a "See also" line is a reason; other links and every backlink keep title and breadcrumb', () => {
  const list = panel(noteOf(
    [
      'Alex reuses [[Plan]] boards.',
      'Related: [[Rent review]]',
      'See also [[Archive/Old shelter/Cedar]]',
      'See also [[Nowhere at all]]: a note this one does not link.',
      'See also [[About me]]: who builds it.',
    ].join('\n'),
    [PLAN, RENT, THERE],
    [ABOUT],
    [{ date: '2026-10-07', text: 'Linked to [[Plan]]: same roof.', source: 'Plan' }],
  ));
  expect(row(list('Links to'), PLAN).textContent).toBe(`Plan${AT_HUB}`);
  expect(row(list('Links to'), RENT).textContent).toBe(`Rent review${AT_HUB}`);
  expect(row(list('Links to'), THERE).textContent).toBe('CedarArchive / Old shelter');
  expect(row(list('Linked from'), ABOUT).textContent, 'the open note gives no reason for a backlink').toBe('About me');
  expect(within(list('Links to')).getAllByRole('link'), 'a reason for no row adds no row').toHaveLength(3);
  expect(document.querySelector('.muted')).toBeNull();
  expect(screen.queryByText(/does not link|who builds it|same roof/)).toBeNull();
});
