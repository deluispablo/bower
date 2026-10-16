/**
 * qa6-a11y (qa-6 Claude F3, F6; designer 5): each tour step puts the keyboard on its heading (WCAG 2.4.3; W3C WAI
 * Forms Tutorial "Multi-page Forms"), Back goes to the previous step (each step is a history entry), and the inactive
 * dots reach 3:1 on the page (WCAG 1.4.11).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { loadingSources } from '@/testing/loading-sources';
import tokens from '@/styles/tokens.json';
import { Welcome } from './Welcome';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

/** The tour with a ready folder, from `path`, with a stand-in Home and Add. */
function tour(path: string) {
  const base = loadingSources();
  const sources = { ...base, session: { ...base.session, folderState: async () => 'ready' } } as unknown as Sources;
  const router = createMemoryRouter(
    [
      { path: '/welcome', element: <Welcome /> },
      { path: '/', element: <p>Home stand-in</p> },
      { path: '/add', element: <p>Add stand-in</p> },
    ],
    { initialEntries: ['/', path], initialIndex: 1 },
  );
  render(
    <DataProvider sources={sources}>
      <RouterProvider router={router} />
    </DataProvider>,
  );
  return router;
}

const h1 = (name: string): HTMLElement => screen.getByRole('heading', { level: 1, name });

describe('qa6-a11y: the tour moves the keyboard and history step by step', () => {
  it('AC2 qa6-a11y-tour-focus: Show me around and each Next put focus on the new step heading', async () => {
    tour('/welcome');
    const start = await screen.findByRole('button', { name: 'Show me around' });
    await waitFor(() => expect(start).toBeEnabled());
    start.focus();
    fireEvent.click(start);
    expect(h1('Throw it in'), 'step 1 heading has focus after Show me around').toHaveFocus();
    const next = screen.getByRole('button', { name: 'Next' });
    next.focus();
    fireEvent.click(next);
    expect(h1('Press Tidy up'), 'step 2 heading has focus after Next').toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(h1('Find it later'), 'step 3 heading has focus after Next').toHaveFocus();
  });

  it('AC3 qa6-a11y-tour-back: Back from a step shows the previous step', async () => {
    const router = tour('/welcome?step=0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(h1('Find it later')).toBeInTheDocument();
    await act(async () => { await router.navigate(-1); });
    expect(h1('Press Tidy up'), 'Back from step 3 shows step 2').toBeInTheDocument();
    await act(async () => { await router.navigate(-1); });
    expect(h1('Throw it in'), 'Back from step 2 shows step 1').toBeInTheDocument();
  });

  it('R1 qa6-a11y-tour-finished: Back after finishing the tour does not show it again', async () => {
    const router = tour('/welcome?step=0');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add your first pile' }));
    expect(await screen.findByText('Add stand-in')).toBeInTheDocument();
    await act(async () => { await router.navigate(-1); });
    expect(screen.queryByRole('heading', { level: 1 }), 'no tour step after Back').toBeNull();
    expect(router.state.location.pathname).not.toBe('/welcome');
  });
});

type Rgb = [number, number, number];
const color = (name: string, theme: 'dark' | 'light'): string => {
  const t = tokens.color.tokens.find((x) => x.name === name);
  const v = t && typeof t.value !== 'string' ? t.value[theme] : undefined;
  if (!v) throw new Error(`no ${theme} ${name} token`);
  return v;
};
function parse(css: string): { rgb: Rgb; a: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(css);
  if (hex) {
    const n = parseInt(hex[1] ?? '', 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(css);
  if (!m) throw new Error(`Cannot read colour ${css}`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: m[4] === undefined ? 1 : Number(m[4]) };
}
const luminance = (rgb: Rgb): number => {
  const [r, g, b] = rgb.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
function ratio(fill: string, ground: string): number {
  const f = parse(fill);
  const g = parse(ground);
  const over = f.rgb.map((v, i) => v * f.a + (g.rgb[i] ?? 0) * (1 - f.a)) as Rgb;
  const [hi, lo] = [luminance(over), luminance(g.rgb)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('qa6-a11y: the tour dots are visible', () => {
  it('AC5 qa6-a11y-dot-contrast: an inactive dot is at least 3:1 on the page ground, light and dark', () => {
    const css = readFileSync(join(process.cwd(), 'src/features/onboarding/welcome.module.css'), 'utf8');
    const rule = /\.dots span\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const token = /background:\s*var\(--([a-z-]+)\)/.exec(rule)?.[1];
    expect(token, 'the inactive dot is filled with a colour token').toBeDefined();
    for (const theme of ['dark', 'light'] as const) {
      expect(ratio(color(token ?? '', theme), color('bg', theme)), `--${token ?? ''} on bg, ${theme}`).toBeGreaterThanOrEqual(3);
    }
  });
});
