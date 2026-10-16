/**
 * qa5-welcome-progress (qa-5 Claude F1 = Codex F1; WAI-ARIA 1.2 "naming prohibited" on generic, axe
 * `aria-prohibited-attr`, WCAG 4.1.2): the tour's step progress is text a screen reader reads ("Step 1 of 3"), the dots
 * are decoration, and no role-less element carries a name.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { Welcome } from './Welcome';

afterEach(cleanup);

function show(step: number) {
  render(
    <MemoryRouter initialEntries={[`/welcome?step=${step}`]}>
      <DataProvider sources={loadingSources()}>
        <Welcome />
      </DataProvider>
    </MemoryRouter>,
  );
  return screen.getByRole('main');
}

/** Whether an element, or one around it, is hidden from assistive technology. */
const hidden = (el: Element): boolean => el.closest('[aria-hidden="true"]') !== null;

describe('qa5-welcome-progress: the step progress is read, not named on a div', () => {
  it.each([
    [0, 'Throw it in', 'Step 1 of 3'],
    [2, 'Find it later', 'Step 3 of 3'],
  ])('AC1 welcome-progress-text: on step %i the page says "%s" is %s', (step, heading, progress) => {
    const main = show(step);
    // Positive control: the step itself rendered.
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    const text = screen.getByText(progress, { exact: true });
    expect(main.contains(text), 'inside the main landmark').toBe(true);
    expect(hidden(text), 'not hidden from screen readers').toBe(false);
  });

  it('AC1 welcome-progress-next: pressing Next says the next step', () => {
    show(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Press Tidy up' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3', { exact: true })).toBeInTheDocument();
  });

  it('AC2 welcome-progress-no-generic-name: no role-less element carries aria-label; the dots are hidden', () => {
    const main = show(0);
    const named = [...main.querySelectorAll('[aria-label]:not([role])')].filter((el) => ['DIV', 'SPAN', 'P'].includes(el.tagName));
    expect(named.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
    // The dots: three marks, one current; decoration only, the text above says it.
    // Vitest's CSS modules are not scoped (vite.config.ts), so the class is its own name.
    const dots = main.querySelectorAll('.dots span');
    expect(dots.length, 'positive control: the three dots are drawn').toBe(3);
    for (const dot of dots) expect(hidden(dot), 'a dot is hidden from screen readers').toBe(true);
  });
});
