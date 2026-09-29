// @vitest-environment jsdom

import { h, render } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';

import { RunSummary } from '../src/components/run-summary.js';
import { outcomeFromRun } from '../src/run-outcome.js';
import { buildRun } from './fixtures/run-outcome-builders.js';

let host: HTMLElement | undefined;

function mount(vnode: ReturnType<typeof h>): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  render(vnode, host);
  return host;
}

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
});

describe('RunSummary', () => {
  const done = outcomeFromRun(
    buildRun('done', {
      setAside: [{ path: '0-Inbox/Old.pages', reason: 'kept-not-read' }],
    }),
  );

  it('inline: one line, zeros left out', () => {
    const el = mount(<RunSummary outcome={done} size="inline" />);
    expect(el.textContent).toBe(
      '2 filed · 1 new note · 1 updated · 1 needs you',
    );
  });

  it('inline short: says "new"', () => {
    const el = mount(<RunSummary outcome={done} size="inline" short />);
    expect(el.textContent).toBe('2 filed · 1 new · 1 updated · 1 needs you');
  });

  it('inline: renders nothing when every count is zero', () => {
    const empty = outcomeFromRun(
      buildRun('done', { items: [], created: [], updated: [], left: [] }),
    );
    const el = mount(<RunSummary outcome={empty} size="inline" />);
    expect(el.textContent).toBe('');
  });

  it('stats: four tiles, zeros greyed, needs you amber', () => {
    const noFiling = { ...done, filed: 0 };
    const el = mount(<RunSummary outcome={noFiling} size="stats" />);
    const tiles = el.querySelectorAll('.run-summary-tile');
    expect(tiles).toHaveLength(4);
    expect(tiles[0]?.classList.contains('run-summary-zero')).toBe(true);
    expect(tiles[3]?.classList.contains('run-summary-warn')).toBe(true);
    expect(tiles[3]?.textContent).toContain('Needs you');
  });

  it('stats: a partly done run labels the last tile "Still in your inbox"', () => {
    const partial = outcomeFromRun(buildRun('partial'));
    const el = mount(<RunSummary outcome={partial} size="stats" />);
    const last = el.querySelectorAll('.run-summary-tile')[3];
    expect(last?.textContent).toContain('Still in your inbox');
    expect(last?.classList.contains('run-summary-warn')).toBe(true);
  });
});
