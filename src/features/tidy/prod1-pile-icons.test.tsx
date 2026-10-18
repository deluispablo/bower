/**
 * prod1-pile-icons (qa-prod-1): the confirmation sheet draws each inbox pile with the same PileStack as Home, so a
 * pile's kind looks the same wherever it is listed, whatever its context text. The stack's strokes use the theme-aware
 * line tokens, never the fills.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import type { Pile, PileItem } from '@/data/types';
import { Home } from '@/features/home/Home';
import { PileStack } from '@/features/piles/PileStack';
import { loadingSources } from '@/testing/loading-sources';
import { Icon, type IconName } from '@/ui/Icon';
import { TidySheet } from './TidySheet';

const AT = 1_800_000_000_000;
const thing = (id: string, kind: PileItem['kind']): PileItem => ({ id, name: `${id}.${kind === 'link' ? 'url' : kind === 'image' ? 'jpg' : 'pdf'}`, kind, origin: 'From this device' });
const pile = (id: string, text: string, items: PileItem[]): Pile => ({ id, text, createdAt: AT, items });

const KINDS: Array<[string, PileItem[]]> = [
  ['photo', [thing('ph', 'image')]],
  ['pdf', [thing('pd', 'pdf')]],
  ['link', [thing('lk', 'link')]],
  ['mixed', [thing('m1', 'pdf'), thing('m2', 'image'), thing('m3', 'link')]],
];
// Every kind with and without context, plus a words-only pile; an itemless, textless pile is empty, not words-only.
const PILES: Pile[] = [
  ...KINDS.flatMap(([k, items], i) => [pile(`${k}-bare`, '', items.map((x) => ({ ...x, id: `${x.id}a` }))), pile(`${k}-ctx`, `About ${k} ${i}`, items.map((x) => ({ ...x, id: `${x.id}b` })))]),
  pile('words', 'Call the plumber on Monday', []),
  pile('empty', '', []),
];

function sourcesFor(piles: Pile[]): Sources {
  const base = loadingSources();
  const vault = new Proxy({}, { get: (_t, k) => (k === 'piles' ? async () => piles : Reflect.get(base.vault, k)) }) as Sources['vault'];
  return { ...base, vault, runs: { ...base.runs, current: async () => null } };
}
const tree = (ui: React.ReactElement, piles: Pile[]) => <MemoryRouter><DataProvider sources={sourcesFor(piles)}>{ui}</DataProvider></MemoryRouter>;

/** The stack of each pile row on Home, in order. */
async function homeStacks(piles: Pile[]): Promise<string[]> {
  render(tree(<Home />, piles));
  await waitFor(() => expect(document.querySelectorAll('li a').length).toBeGreaterThanOrEqual(piles.length));
  const out = [...document.querySelectorAll('li a')].map((a) => a.firstElementChild?.outerHTML ?? '');
  cleanup();
  return out;
}
/** The stack of each pile row in the confirmation sheet, in order. */
async function sheetStacks(piles: Pile[]): Promise<string[]> {
  useUi.setState({ tidyOpen: true, tidyReportRunId: null });
  render(tree(<TidySheet />, piles));
  const list = await screen.findByRole('list', { name: 'In the inbox' });
  const out = within(list).getAllByRole('listitem').map((li) => li.querySelector(':scope > span[aria-hidden="true"]')?.outerHTML ?? '');
  cleanup();
  return out;
}

beforeEach(() => useUi.setState({ tidyOpen: false }));
afterEach(() => {
  cleanup();
  useUi.setState({ tidyOpen: false });
});

describe('confirmation_matches_home_for_each_pile_kind', () => {
  it('draws every pile as Home does, with and without context text', async () => {
    const home = await homeStacks(PILES);
    const sheet = await sheetStacks(PILES);
    expect(home).toHaveLength(PILES.length);
    expect(sheet).toHaveLength(PILES.length);
    expect(sheet.every((h) => h.includes('<svg'))).toBe(true);
    // Both list the piles in the same order, so each row must match its twin.
    expect(sheet).toEqual(home);
  });

  it('keeps an itemless, textless pile as the note-shaped fallback next to a nonempty pile', async () => {
    const sheet = await sheetStacks([pile('words', 'Call the plumber', []), pile('empty', '', [])]);
    expect(sheet).toHaveLength(2);
    expect(sheet[0]).toBe(sheet[1]);
    expect(sheet[0]).toContain('rotate(-4deg)');
  });

  it('context never changes the stack or raises its badge', async () => {
    const items = [thing('a', 'pdf'), thing('b', 'image')];
    const [bare, ctx] = await sheetStacks([pile('p1', '', items), pile('p2', 'Some context here', items)]);
    expect(ctx).toBe(bare);
    expect(ctx).toContain('>2<');
  });
});

describe('the stack itself', () => {
  const glyphOf = (name: IconName) => {
    const { container } = render(<Icon name={name} size={15} />);
    const glyph = container.querySelector('svg')?.outerHTML;
    cleanup();
    return glyph;
  };
  const cardsOf = (items: PileItem[]) => {
    const { container } = render(<PileStack items={items} />);
    const found = [...container.querySelectorAll(':scope > span > span')];
    const result = { glyphs: found.filter((c) => c.querySelector('svg')).map((c) => c.querySelector('svg')?.outerHTML ?? ''), badge: found.find((c) => !c.querySelector('svg'))?.textContent };
    cleanup();
    return result;
  };

  it('maps kinds to distinct glyphs, keeps input order and caps three cards with the full count', () => {
    const [image, pdf, link] = (['image', 'file', 'link'] as const).map(glyphOf);
    expect(new Set([image, pdf, link]).size).toBe(3);
    const five = cardsOf([thing('1', 'image'), thing('2', 'pdf'), thing('3', 'link'), thing('4', 'pdf'), thing('5', 'image')]);
    expect(five.glyphs).toEqual([image, pdf, link]);
    expect(five.badge).toBe('5');
  });

  it('has no badge for none or one, and the note glyph for none', () => {
    expect(cardsOf([]).badge).toBeUndefined();
    expect(cardsOf([thing('1', 'pdf')]).badge).toBeUndefined();
    expect(cardsOf([]).glyphs).toEqual([glyphOf('note')]);
  });
});

describe('the confirmation label rule', () => {
  it('cannot match the cards nested in a stack', () => {
    const css = readFileSync('src/features/tidy/tidy.module.css', 'utf8');
    expect(css).toContain('.piles li > span:nth-child(2)');
    expect(css).not.toMatch(/\.piles li span:nth-child\(2\)/);
  });
});

describe('pile_strokes_use_line_tokens_in_light_theme', () => {
  const tokens = readFileSync('src/styles/tokens.json', 'utf8');
  const light = (name: string): string => {
    const m = new RegExp(`"name":\\s*"${name}",\\s*"value":\\s*\\{\\s*"dark":\\s*"[^"]*",\\s*"light":\\s*"(#[0-9a-f]{6})"`).exec(tokens);
    if (!m?.[1]) throw new Error(`no light token ${name}`);
    return m[1];
  };
  const lum = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
  };

  it('PDF and image cards select the line tokens, which pass 3:1 on the card ground', () => {
    const { container } = render(<PileStack items={[thing('1', 'pdf'), thing('2', 'image')]} />);
    const styles = [...container.querySelectorAll('span[style]')].map((e) => e.getAttribute('style') ?? '').join(';');
    expect(styles).toContain('var(--accent-line)');
    expect(styles).toContain('var(--brand-line)');
    expect(styles).not.toMatch(/var\(--(accent|brand)\)/);
    expect(ratio(light('accent-line'), light('surface-strong'))).toBeGreaterThanOrEqual(3);
    expect(ratio(light('brand-line'), light('surface-strong'))).toBeGreaterThanOrEqual(3);
  });

  it('Home and the confirmation inherit the line tokens', async () => {
    const piles = [pile('a', '', [thing('1', 'pdf')]), pile('b', '', [thing('2', 'image')])];
    for (const stacks of [await homeStacks(piles), await sheetStacks(piles)]) {
      expect(stacks.join('')).toContain('var(--accent-line)');
      expect(stacks.join('')).toContain('var(--brand-line)');
    }
  });
});
