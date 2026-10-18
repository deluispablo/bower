/**
 * ux-first-home-polish: a plain greeting, a Recent that lists only filed things with ordinary icons, Suggestions that
 * wait until the first tidy-up has been reviewed, and no empty rules count (rulings R1-R6). Made-up words only.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type FileKind, type TreeNode } from '@/data/types';
import { BowerPanel } from '@/features/bower/BowerPanel';
import { Home } from '@/features/home/Home';
import { loadingSources } from '@/testing/loading-sources';

afterEach(() => { cleanup(); useUi.setState({ tidyOpen: false, replayRunId: null }); });

const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
const never = (): Promise<never> => new Promise(() => undefined);

const file = (path: string, kind: FileKind, modified: number, byBower = false): TreeNode => ({
  path, name: path.split('/').pop() ?? path, type: 'file', kind, modified, created: modified, ...(byBower ? { byBower } : {}),
});
const folder = (path: string, children: TreeNode[]): TreeNode => ({
  path, name: path.split('/').pop() ?? path, type: 'folder', modified: 1, created: 1, children,
});
const rootNotes = [file('Rules.md', 'note', 5000), file('About me.md', 'note', 6000)];
const car = (...files: TreeNode[]) => folder('Areas', [folder('Areas/Car', files)]);

async function home(doors: Record<string, unknown>, user: { name: string } | null = null): Promise<void> {
  const base = loadingSources();
  const all: Record<string, unknown> = { piles: async () => [], pilesListed: async () => null, tree: async () => [],
    changes: async () => [], questions: async () => [], suggestions: async () => [], uploadNotice: async () => null,
    firstTidy: async () => null, ...doors };
  const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in all ? all[key] : Reflect.get(target, key) }) as Sources['vault'];
  const session = user ? { ...base.session, current: async () => ({ email: 'you@example.com', ...user }) } : base.session;
  const sources = { ...base, session, vault, runs: { ...base.runs, current: async () => null } } as Sources;
  await act(async () => { render(<MemoryRouter><DataProvider sources={sources}><main id="main" tabIndex={-1}><Home /></main></DataProvider></MemoryRouter>); });
  await settle();
}
const recent = () => screen.queryByRole('region', { name: /^(Recent|Just filed)$/ });
const suggests = () => screen.queryByRole('region', { name: 'Bower suggests' });
const oneSuggestion = async () => [{ id: 's1', title: 'Keep car papers together', why: 'Three car papers landed in two places.' }];

describe('ux-first-home-polish: AC1 greeting', () => {
  it('AC1 greeting_with_name', async () => {
    await home({}, { name: 'Sam' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hello, Sam');
  });

  it('AC1 greeting_without_name', async () => {
    await home({}, { name: '  ' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hello');
  });
});

describe('ux-first-home-polish: AC2 recent', () => {
  it('AC2 root_only_tree_has_no_recent', async () => {
    await home({ tree: async () => rootNotes });
    expect(recent()).toBeNull();
  });

  it('AC2 inbox_and_bower_files_are_not_recent', async () => {
    await home({ tree: async () => [folder('.bower', [file('.bower/log.md', 'note', 9000)])] });
    expect(recent()).toBeNull();
    cleanup();
    // guard: the Inbox already has its own card
    await home({ tree: async () => [folder('Inbox', [folder('Inbox/Pile 1', [file('Inbox/Pile 1/scan.pdf', 'pdf', 9000)])])] });
    expect(recent()).toBeNull();
  });

  it('AC2 filed_file_shows_and_root_notes_never', async () => {
    await home({ tree: async () => [...rootNotes, car(file('Areas/Car/Policy.md', 'note', 1000))] });
    const r = recent();
    expect(r).not.toBeNull();
    const links = within(r as HTMLElement).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toMatch(/^Policy/);
    expect(within(r as HTMLElement).queryAllByRole('link', { name: /^(Rules|About me)/ })).toHaveLength(0);
  });

  const four = () => car(file('Areas/Car/Policy.md', 'note', 4000, true), file('Areas/Car/Scan.pdf', 'pdf', 3000),
    file('Areas/Car/Dash.jpg', 'image', 2000), file('Areas/Car/Site.url', 'link', 1000));

  it('AC2 ordinary_icons', async () => {
    await home({ tree: async () => [four()] });
    const r = recent() as HTMLElement;
    const d = (name: RegExp) => within(r).getByRole('link', { name }).querySelector('svg path')?.getAttribute('d');
    expect(d(/^Policy/)).toBe('M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4');
    expect(d(/^Dash/)).toBe('M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4M15 9h.01');
    expect(d(/^Scan/)).toBe('M6 3h8l4 4v14H6zM14 3v4h4');
    expect(d(/^Site/)).toBe('M6 3h8l4 4v14H6zM14 3v4h4');
    expect(r.querySelector('svg[viewBox="34 8 62 62"]')).toBeNull();
  });

  it('AC2 names_keep_prefix (guard)', async () => {
    await home({ tree: async () => [four()] });
    const links = within(recent() as HTMLElement).getAllByRole('link');
    expect(links).toHaveLength(4);
    for (const l of links) {
      expect(l.textContent).toMatch(/^(Policy|Scan|Dash|Site)/);
      expect(l.hasAttribute('aria-label')).toBe(false);
      expect(l.hasAttribute('aria-labelledby')).toBe(false);
    }
  });
});

describe('ux-first-home-polish: AC3 quiet first Home', () => {
  it('AC3 suggestions_wait_for_progress', async () => {
    await home({ suggestions: oneSuggestion, firstTidy: never });
    await screen.findByRole('region', { name: 'Inbox' });
    await settle();
    expect(suggests()).toBeNull();
  });

  it('AC3 suggestions_hidden_while_checklist_shows', async () => {
    await home({ suggestions: oneSuggestion, firstTidy: async () => ({ added: true, started: false, reviewed: false }) });
    expect(await screen.findByRole('region', { name: 'Your first tidy-up' })).toBeVisible();
    expect(suggests()).toBeNull();
  });

  it('AC3 suggestions_shown_when_done_unknown_or_failed (guard)', async () => {
    const cases: unknown[] = [
      async () => ({ added: true, started: true, reviewed: true }),
      undefined,
      async () => { throw new BowerError('unknown', 'x'); },
    ];
    for (const firstTidy of cases) {
      await home({ suggestions: oneSuggestion, firstTidy });
      expect(await screen.findByRole('region', { name: 'Bower suggests' })).toBeVisible();
      cleanup();
    }
  });

  it('AC3 one_progress_read (guard)', async () => {
    const firstTidy = vi.fn(async () => ({ added: true, started: false, reviewed: false }));
    await home({ suggestions: oneSuggestion, firstTidy });
    await settle();
    expect(firstTidy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'Your first tidy-up' })).toBeVisible();
  });

  it('AC3 no_rules_shows_plain_heading', async () => {
    const sources = loadingSources();
    const vault = new Proxy({}, {
      get: (_t, k) => {
        if (k === 'driveLinks') return false;
        if (k === 'subscribe') return () => () => undefined;
        if (k === 'rules') return async () => [];
        if (k === 'rulesProse') return async () => '';
        if (k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
        return never;
      },
    });
    await act(async () => {
      render(<MemoryRouter><DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}><BowerPanel /></DataProvider></MemoryRouter>);
    });
    await settle();
    // A string name in ByRole already matches the whole name exactly (ByRole has no `exact` option).
    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.queryByText(/^0 rules$/)).toBeNull();
  });
});
