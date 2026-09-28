// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { h, render } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';

import {
  KeyFacts,
  clipLabel,
  inlineFactsText,
} from '../src/components/key-facts.js';

const FACTS = [
  { key: 'rent', value: '£2,150', label: 'a month' },
  { key: 'rooms', value: '2 bed', label: '1 bath' },
  { key: 'available', value: '1 Nov', label: 'available' },
  { key: 'bike_to_office', value: '14 min', label: 'bike to work' },
];

let host: HTMLElement | undefined;

function mount(count: number, inline = false): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  render(h(KeyFacts, { facts: FACTS.slice(0, count), inline }), host);
  return host;
}

afterEach(() => {
  if (host !== undefined) render(null, host);
  host?.remove();
  host = undefined;
});

describe('KeyFacts (issue #603)', () => {
  it.each([1, 2, 3, 4])(
    'renders %i fact(s) in the matching layout',
    (count) => {
      const root = mount(count);
      expect(root.querySelector('dl')?.className).toBe(
        `key-facts key-facts-${count}`,
      );
      expect(root.querySelectorAll('.key-fact')).toHaveLength(count);
      expect(root.querySelector('.key-fact-value')?.textContent).toBe('£2,150');
      expect(root.querySelector('.key-fact-label')?.textContent).toBe(
        'a month',
      );
    },
  );

  it('matches the markup snapshot at 390 px (four quarters)', () => {
    expect(mount(4).innerHTML).toMatchSnapshot();
  });

  it('matches the markup snapshot at 330 px (same markup; the CSS folds it)', () => {
    expect(mount(3).innerHTML).toMatchSnapshot();
  });

  it('folds three and four into two columns under 340 px in the CSS', () => {
    const css = readFileSync('src/styles/key-facts.css', 'utf8');
    expect(css).toMatch(/@container \(max-width: 339px\)/);
    expect(css).toMatch(
      /\.key-facts-3,\s*\.key-facts-4[^}]*--key-facts-columns: 2/,
    );
  });

  it('renders nothing without facts', () => {
    host = document.createElement('div');
    render(h(KeyFacts, { facts: [] }), host);
    expect(host.innerHTML).toBe('');
  });

  it('shows at most four facts and skips empty values', () => {
    host = document.createElement('div');
    render(
      h(KeyFacts, {
        facts: [
          { value: '', label: 'x' },
          ...FACTS,
          { value: 'z', label: 'z' },
        ],
      }),
      host,
    );
    expect(host.querySelectorAll('.key-fact')).toHaveLength(4);
  });

  it('cuts a label longer than 14 characters', () => {
    expect(clipLabel('a month')).toBe('a month');
    const clipped = clipLabel('a very long label indeed');
    expect(clipped).toHaveLength(14);
    expect(clipped.endsWith('…')).toBe(true);
  });

  it('joins the values with " · " in the inline variant', () => {
    expect(inlineFactsText(FACTS)).toBe('£2,150 · 2 bed · 1 Nov · 14 min');
    const root = mount(4, true);
    expect(root.textContent).toBe('£2,150 · 2 bed · 1 Nov · 14 min');
    expect(root.querySelector('dl')).toBeNull();
  });
});
