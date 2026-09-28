// @vitest-environment jsdom

/**
 * "Run your own Bower" (#366, board Demo-RunYourOwn): the dancing bird,
 * the three rows, "Read the runbook on GitHub" (the repo's
 * `docs/runbook.md`, in a new tab) and "What is Bower, in nine screens",
 * the intro opened with Close back here.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { RunYourOwn } from '../src/routes/run-your-own.js';

let root: HTMLDivElement;

function mount(): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(RunYourOwn, null), root);
  });
}

function link(text: string): HTMLAnchorElement {
  const found = Array.from(root.querySelectorAll('a')).find(
    (a) => a.textContent === text,
  );
  if (found === undefined) throw new Error(`link ${text} missing`);
  return found;
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
});

describe('RunYourOwn', () => {
  it('shows the dancing bird and the heading', () => {
    mount();
    expect(root.querySelector('h1')?.textContent).toBe('Run your own Bower');
    expect(root.querySelector('svg.p-dance')).not.toBeNull();
  });

  it('lists the three rows in order', () => {
    mount();
    const titles = Array.from(root.querySelectorAll('.run-your-own-row b')).map(
      (b) => b.textContent,
    );
    expect(titles).toEqual([
      'One folder in your Drive',
      'Your own keys',
      'About an hour',
    ]);
  });

  it("links to the repo's runbook in a new tab", () => {
    mount();
    const runbook = link('Read the runbook on GitHub');
    expect(runbook.href).toBe(
      'https://github.com/deluispablo/bower/blob/main/docs/runbook.md',
    );
    expect(runbook.target).toBe('_blank');
    expect(runbook.rel).toContain('noopener');
  });

  it('opens the nine intro pages with Close, back here', () => {
    mount();
    expect(link('What is Bower, in nine screens').getAttribute('href')).toBe(
      '/welcome?from=run-your-own',
    );
  });

  it('has no Explore the demo button: the tabs are the way back', () => {
    mount();
    expect(root.querySelector('button')).toBeNull();
  });
});
