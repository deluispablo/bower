import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError } from '@/data/types';
import type { Note, TreeNode } from '@/data/types';
import { shortDay } from '@/app/words';
import { loadingSources } from '@/testing/loading-sources';
import { NoteScreen } from '@/features/note/NoteScreen';
import { BowerScreen } from './BowerScreen';

/** ux-ask-and-empty-states (rulings R1): Ask's heading, its empty rules sentence and rule provenance, the About me line. */
const EMPTY = "No rules yet. A rule is something Bower does in every tidy-up, like 'Receipts go to Money, by month'.";
const ABOUT_LINE = 'Bower reads this note to understand you.';
const since = Date.UTC(2026, 9, 3, 12);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Rule = { id: string; text: string; since: number; yourWords?: string; pending?: true };
type Read<T> = T | 'pending' | BowerError;
const answer = <T,>(r: Read<T>) => async (): Promise<T> => {
  if (r === 'pending') return new Promise<T>(() => undefined);
  if (r instanceof BowerError) throw r;
  return r;
};
const settle = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const setup = (prose: Read<string>, rules: Read<Rule[]>) => {
  const sources = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'rules') return answer(rules);
      if (k === 'rulesProse') return answer(prose);
      if (k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
      return () => new Promise(() => undefined);
    },
  });
  return render(
    <MemoryRouter>
      <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
        <BowerScreen />
      </DataProvider>
    </MemoryRouter>,
  );
};
const rulesRegion = (): HTMLElement => screen.getByRole('region', { name: 'Your rules' });

describe('ux-ask-and-empty-states: Ask', () => {
  it('AC1 ask_heading', async () => {
    setup('', []);
    await settle();
    expect(screen.getByRole('heading', { level: 1, name: 'Ask Bower' })).toBeInTheDocument();
  });

  it('AC2 empty_rules_sentence_when_both_known_empty', async () => {
    setup('', []);
    await settle();
    expect(screen.getAllByText(EMPTY, { exact: true })).toHaveLength(1);
  });

  it('AC2 no_empty_claim_with_prose (guard)', async () => {
    setup('Alex keeps paper letters for a year.', []);
    await settle();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(within(screen.getByRole('region', { name: 'Written in your rules note' })).getByText('Alex keeps paper letters for a year.')).toBeInTheDocument();
  });

  it('AC5 unresolved_rules_reads_never_look_settled (guard)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cases: Array<[Read<string>, Read<Rule[]>]> = [
      ['', 'pending'],
      ['pending', []],
      ['', new BowerError('unknown', 'Your rules did not load.')],
    ];
    for (const [prose, rules] of cases) {
      const view = setup(prose, rules);
      await settle();
      expect(screen.queryByText(EMPTY)).toBeNull();
      expect(within(rulesRegion()).queryAllByRole('listitem')).toEqual([]);
      if (rules instanceof BowerError) {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Your rules did not load.');
        expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      }
      view.unmount();
    }
    // R12: rules answered, the note pending: the rule and its Remove stay, and no empty sentence.
    setup('pending', [{ id: 'r1', text: 'Keep receipts.', since }]);
    await settle();
    expect(within(rulesRegion()).getByText('Keep receipts.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove the rule: Keep receipts.' })).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it('AC4 settled_rule_shows_provenance', async () => {
    setup('', [{ id: 'r1', text: 'Receipts go to Money, by month.', yourWords: 'receipts to money', since }]);
    await settle();
    const item = within(rulesRegion()).getByRole('listitem');
    expect(within(item).getAllByText(`From what you wrote on ${shortDay(since)}: 'receipts to money'`, { exact: true })).toHaveLength(1);
    expect(screen.queryByText(/You wrote:/)).toBeNull();
    expect(item).not.toHaveTextContent(`Added ${shortDay(since)}`);
  });

  it('AC4 pending_rule_keeps_note_and_remove (guard)', async () => {
    setup('', [{ id: 'r1', text: 'receipts to money', yourWords: 'receipts to money', since, pending: true }]);
    await settle();
    const item = within(rulesRegion()).getByRole('listitem');
    expect(within(item).getByText('Waiting for the next tidy-up, where Bower words it clearly.')).toBeInTheDocument();
    expect(within(item).getByText(`Added ${shortDay(since)}`)).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Remove the rule: receipts to money' })).toBeInTheDocument();
    expect(item).not.toHaveTextContent('From what you wrote');
  });
});

describe('ux-ask-and-empty-states: the About me note', () => {
  const show = (path: string) => {
    const name = path.split('/').pop() ?? path;
    const note: Note = {
      path, title: 'About me', summary: '', properties: [], tags: [],
      currentState: [], body: 'Alex likes walks.', timeline: [], links: [], backlinks: [], byBower: false,
    };
    const file: TreeNode = { path, name, type: 'file', kind: 'note', modified: 0, created: 0 };
    const tree: TreeNode[] = path.includes('/')
      ? [{ path: 'Projects', name: 'Projects', type: 'folder', modified: 0, created: 0, children: [file] }]
      : [file];
    const base = loadingSources();
    const vault = new Proxy(base.vault, {
      get: (target, key, receiver) => {
        if (key === 'tree') return async () => tree;
        if (key === 'note') return async () => note;
        if (key === 'changes') return async () => [];
        if (key === 'markSeen') return async () => undefined;
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const sources: Sources = { ...base, vault };
    render(
      <MemoryRouter initialEntries={[`/note/${path}`]}>
        <DataProvider sources={sources}><NoteScreen /></DataProvider>
      </MemoryRouter>,
    );
  };

  it('AC3 root_about_me_line', async () => {
    show('About me.md');
    const h1 = await screen.findByRole('heading', { name: 'About me', level: 1 });
    const line = screen.getByText(ABOUT_LINE, { exact: true });
    expect(h1.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC3 nested_about_me_no_line (guard)', async () => {
    show('Projects/About me.md');
    await screen.findByRole('heading', { name: 'About me', level: 1 });
    expect(screen.queryByText(ABOUT_LINE)).toBeNull();
  });
});
