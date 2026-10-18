/**
 * qa5-welcome-progress (qa-5 Claude F1 = Codex F1; WAI-ARIA 1.2 "naming prohibited" on generic, axe
 * `aria-prohibited-attr`, WCAG 4.1.2): the setup screen has no tour progress to read, so nothing role-less carries a
 * name, and the scene is hidden from assistive technology.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { Welcome } from './Welcome';

afterEach(cleanup);

function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <DataProvider sources={loadingSources()}>
        <Welcome />
      </DataProvider>
    </MemoryRouter>,
  );
  return screen.getByRole('main');
}

/** Whether an element, or one around it, is hidden from assistive technology. */
const hidden = (el: Element): boolean => el.closest('[aria-hidden="true"]') !== null;

describe('qa5-welcome-progress: the setup screen is read, not named on a div', () => {
  it.each(['/welcome', '/welcome?step=0'])('AC1 welcome-heading-in-main: %s has the page heading inside main and no tour', (path) => {
    const main = show(path);
    expect(main.querySelector('h1'), 'the heading is inside the main landmark').not.toBeNull();
    expect(screen.queryByText(/Step \d of \d/), 'no tour progress').toBeNull();
    expect(screen.queryByRole('button', { name: /Next|Skip|Show me around/ }), 'no tour buttons').toBeNull();
  });

  it('AC2 welcome-progress-no-generic-name: no role-less element carries aria-label; the scene is hidden', () => {
    const main = show('/welcome');
    const named = [...main.querySelectorAll('[aria-label]:not([role])')].filter((el) => ['DIV', 'SPAN', 'P'].includes(el.tagName));
    expect(named.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
    // Vitest's CSS modules are not scoped (vite.config.ts), so the class is its own name.
    const stage = main.querySelector('.stage');
    expect(stage, 'positive control: the scene is drawn').not.toBeNull();
    expect(stage ? hidden(stage) : false, 'the scene is hidden from screen readers').toBe(true);
    expect(main.querySelector('.dots'), 'the tour dots are gone').toBeNull();
  });
});
