/**
 * design8-layout (designer, post-qa-7, P3-12): the palette lists both "Use the dark theme" and "Use the light theme"
 * while one of them is the theme on screen. It offers only the one not in use, and "Follow the system theme" when a
 * theme was chosen. The theme on screen follows the system when none was chosen (`prefers-color-scheme`).
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrefs, type Theme } from '@/app/prefs';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { Palette } from './Palette';

const initialPrefs = usePrefs.getState();
const realMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  useUi.setState({ paletteOpen: false });
  usePrefs.setState(initialPrefs, true);
  window.matchMedia = realMatchMedia;
  vi.restoreAllMocks();
});

async function themes(theme: Theme, systemLight: boolean): Promise<string[]> {
  window.matchMedia = (query: string): MediaQueryList =>
    ({ matches: query.includes('prefers-color-scheme: light') ? systemLight : false, media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }) as MediaQueryList;
  usePrefs.setState({ theme });
  useUi.setState({ paletteOpen: true });
  await act(async () => {
    render(<MemoryRouter><DataProvider sources={loadingSources()}><Palette /></DataProvider></MemoryRouter>);
  });
  await screen.findByRole('combobox');
  return screen.queryAllByRole('option').map((o) => o.textContent ?? '').filter((t) => /theme/.test(t));
}

describe('AC4 the palette offers only the theme not in use', () => {
  it('AC4 design8-layout-theme-chosen: with the light theme chosen it offers dark and the system (positive control)', async () => {
    expect(await themes('light', false)).toEqual(['Use the dark theme', 'Follow the system theme']);
  });

  it('AC4 design8-layout-theme-chosen-dark: with the dark theme chosen on a dark system it offers light and the system (positive control)', async () => {
    expect(await themes('dark', false)).toEqual(['Use the light theme', 'Follow the system theme']);
  });

  it('AC4 design8-layout-theme-system-dark: following a dark system it offers only the light theme', async () => {
    expect(await themes('system', false)).toEqual(['Use the light theme']);
  });

  it('AC4 design8-layout-theme-system-light: following a light system it offers only the dark theme', async () => {
    expect(await themes('system', true)).toEqual(['Use the dark theme']);
  });
});
