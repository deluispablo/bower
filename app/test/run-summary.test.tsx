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

  const names = (el: HTMLElement): string[] =>
    [...el.querySelectorAll('.run-summary-tile')].map(
      (t) => t.getAttribute('aria-label') ?? '',
    );

  it('stats: a labelled list, one "{n} {label}" item per tile', () => {
    const el = mount(<RunSummary outcome={done} size="stats" />);
    const list = el.querySelector('ul');
    expect(list?.getAttribute('aria-label')).toBe('What this tidy-up did');
    expect(names(el)).toEqual([
      '2 filed',
      '1 new note',
      '1 updated',
      '1 needs you',
    ]);
    expect(el.querySelector('.run-summary-answered')).toBeNull();
  });

  it('stats: a run that answered a question says so under the tiles (#920)', () => {
    const answered = outcomeFromRun(
      buildRun('done', {
        items: [],
        created: ['Answers/2026-09-30 Which flat first.md'],
        updated: [],
      }),
    );
    const el = mount(<RunSummary outcome={answered} size="stats" />);
    expect(el.querySelector('.run-summary-answered')?.textContent).toBe(
      'Also: 1 answered.',
    );
  });

  it('stats: zeros greyed (no opacity), needs you amber', () => {
    const noFiling = { ...done, filed: 0 };
    const el = mount(<RunSummary outcome={noFiling} size="stats" />);
    const tiles = el.querySelectorAll('.run-summary-tile');
    expect(tiles).toHaveLength(4);
    expect(tiles[0]?.classList.contains('run-summary-zero')).toBe(true);
    expect(tiles[3]?.classList.contains('run-summary-warn')).toBe(true);
  });

  it('stats: a partly done run counts the inbox left, tiles equal the inline line', () => {
    const partial = outcomeFromRun(buildRun('partial'));
    const stats = mount(<RunSummary outcome={partial} size="stats" />);
    const tiles = names(stats).filter((t) => !t.startsWith('0 '));
    const inline = mount(<RunSummary outcome={partial} size="inline" />);
    expect(tiles.join(' · ')).toBe(inline.textContent);
    const last = stats.querySelectorAll('.run-summary-tile')[3];
    expect(last?.getAttribute('aria-label')).toMatch(
      /^\d+ still in your inbox$/,
    );
    expect(last?.querySelector('.stat-tile-label')?.textContent).toBe(
      'Still in your inbox',
    );
    expect(last?.classList.contains('run-summary-warn')).toBe(true);
  });

  it('stats: things set aside on a partly done run get their own tile', () => {
    const base = outcomeFromRun(buildRun('partial'));
    const partial = { ...base, left: 5, needsYou: 6 };
    const el = mount(<RunSummary outcome={partial} size="stats" />);
    const all = names(el);
    expect(all).toHaveLength(5);
    expect(all.slice(3)).toEqual(['5 still in your inbox', '1 needs you']);
  });
});
