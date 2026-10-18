import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { RULE_EXAMPLES } from '@/data/examples';
import type { Rule } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerScreen } from './BowerScreen';

/** qa3-F3: a suggestion chip is not offered when the person already has that rule. */
const rule = (id: string, text: string): Rule => ({ id, text, since: Date.UTC(2026, 9, 3) });
const flush = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let listeners: Array<() => void> = [];
const sources = (get: () => Rule[]) => {
  const base = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return (cb: () => void) => { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb); }; };
      if (k === 'rules') return async () => get();
      if (k === 'rulesProse') return undefined;
      if (k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
      return () => new Promise(() => undefined);
    },
  });
  return { ...base, vault: vault as typeof base.vault, runs: { ...base.runs, subscribe: () => () => undefined } };
};
const show = async (get: () => Rule[]): Promise<void> => {
  render(<MemoryRouter><DataProvider sources={sources(get)}><BowerScreen /></DataProvider></MemoryRouter>);
  await flush();
  fireEvent.click(screen.getByRole('radio', { name: 'A rule' }));
  await flush();
};
const chips = (): string[] => [...screen.getByLabelText('Try one').querySelectorAll('button')].map((b) => b.textContent ?? '');
const tell = async (): Promise<void> => { await act(async () => { listeners.forEach((l) => l()); }); await flush(); };

afterEach(() => { cleanup(); sessionStorage.clear(); listeners = []; });

describe('qa3-F3: rule chips skip rules already kept', () => {
  it('AC1: the dentist chip goes, ignoring case, spaces and a final full stop; the others stay', async () => {
    await show(() => [rule('R1', '  Anything from the DENTIST goes in health.  ')]);
    expect(chips()).toEqual(RULE_EXAMPLES.slice(1));
  });
  it('AC2: no rules, all four chips; removing the rule brings its chip back', async () => {
    let rules: Rule[] = [];
    await show(() => rules);
    expect(chips()).toEqual([...RULE_EXAMPLES]);
    rules = [rule('R1', 'anything from the dentist goes in health')];
    await tell();
    expect(chips()).toEqual(RULE_EXAMPLES.slice(1));
    rules = [];
    await tell();
    expect(chips()).toEqual([...RULE_EXAMPLES]);
  });
});
