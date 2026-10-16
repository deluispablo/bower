/**
 * qa-3-F1 (WCAG 1.3.1, APG landmarks; axe `region` and `landmark-one-main`): the screens outside the shell (privacy,
 * terms, the welcome, sign-in) each have one main landmark holding the page's heading, and nothing a screen reader
 * reads sits outside a landmark: the brand mark on sign-in and on the legal pages included.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { Privacy, Terms } from '@/features/legal/Legal';
import { Welcome } from '@/features/onboarding/Welcome';
import { SignIn } from '@/features/auth/SignIn';

afterEach(cleanup);

function show(view: ReactNode, path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider sources={loadingSources()}>{view}</DataProvider>
    </MemoryRouter>,
  );
}

/** The landmark an element sits in (main, banner, navigation, complementary, contentinfo), if any. */
const landmarkOf = (el: Element): Element | null => el.closest('main, header, nav, aside, footer, [role="main"], [role="banner"], [role="navigation"]');

describe.each([
  ['AC1 privacy-main', '/privacy', <Privacy key="p" />, 'Privacy'],
  ['AC1 terms-main', '/terms', <Terms key="t" />, 'Terms'],
  ['AC2 welcome-main', '/welcome', <Welcome key="w" />, 'Making your Bower folder'],
  ['AC2 welcome-step-main', '/welcome?step=0', <Welcome key="s" />, 'Throw it in'],
] as const)('%s', (_name, path, view, heading) => {
  it(`has one main landmark holding the heading on ${path}`, () => {
    show(view, path);
    const mains = screen.queryAllByRole('main');
    expect(mains, 'one main landmark').toHaveLength(1);
    expect(within(mains[0] as HTMLElement).getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });
});

it('AC1 legal-brand-in-landmark: the brand link on the legal pages sits inside a landmark', () => {
  show(<Privacy />, '/privacy');
  expect(landmarkOf(screen.getByRole('link', { name: 'Bower' }))).not.toBeNull();
});

it('AC3 signin-brand-in-landmark: the sign-in brand mark sits inside a landmark, beside one main', () => {
  show(<SignIn />, '/sign-in');
  expect(screen.getAllByRole('main')).toHaveLength(1);
  const brand = screen.getByText('Bower', { exact: true });
  expect(landmarkOf(brand), 'the brand name is read inside a landmark').not.toBeNull();
});
