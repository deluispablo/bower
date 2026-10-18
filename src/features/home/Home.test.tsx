import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { Sources } from '@/data/sources';
import { BowerError, type Pile, type Question, type RunState } from '@/data/types';
import type { QuestionAnswer } from '@/data/contracts/questions';
import { answeredNow } from './answer-words';
import { useUi } from '@/app/ui-store';
import { TidySheet } from '@/features/tidy/TidySheet';
import { loadingSources } from '@/testing/loading-sources';
import { useToasts } from '@/ui/toast';
import { Home } from './Home';
import { PileScreen } from '@/features/piles/PileScreen';

afterEach(cleanup);
describe('Home identity', () => {
  it('Home greets the person who signed in', async () => {
    const base = loadingSources();
    render(<MemoryRouter><DataProvider sources={{ ...base, session: { ...base.session, current: async () => ({ name: 'Sam', email: 'sam@example.com' }) } }}><Home /></DataProvider></MemoryRouter>);
    await waitFor(() => expect(screen.queryByRole('heading', { name: "Hello, Sam" })).not.toBeNull());
    expect(screen.getByRole('link', { name: 'Your account and settings' })).toHaveTextContent('S');
    expect(screen.queryByText(/Hello, Alex/)).toBeNull();
    cleanup();
    render(<MemoryRouter><DataProvider sources={loadingSources()}><Home /></DataProvider></MemoryRouter>);
    expect(screen.queryByText(/Alex/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Hello");
  });
});

describe('a set-aside pile shows its reason in the inbox', () => {
  const at = Date.now();
  const thing = (id: string, extra: Partial<Pile['items'][number]> = {}): Pile['items'][number] => ({ id, name: `${id}.pdf`, kind: 'pdf', origin: 'From this computer', ...extra });
  const PILES: Pile[] = [
    { id: 'changed', path: 'Inbox/Papers', text: 'Papers from Alex', createdAt: at, setAside: 'changed', items: [thing('a'), thing('b', { changed: true })] },
    { id: 'missing', path: 'Inbox/Receipts', text: 'Receipts', createdAt: at - 1, setAside: 'not-arrived', items: [thing('c', { upload: -1 })] },
    { id: 'lists', path: 'Inbox/Letters', text: 'Letters', createdAt: at - 2, setAside: 'declaration', items: [thing('d')] },
    { id: 'unchecked', path: 'Inbox/Scans', text: 'Scans', createdAt: at - 3, setAside: 'not-checked', items: [thing('e')] },
    { id: 'unreadable', path: 'Inbox/Forms', text: 'Forms', createdAt: at - 3, setAside: 'unreadable', items: [thing('g')] },
    { id: 'newer', path: 'Inbox/Bills', text: '', createdAt: at - 3, setAside: 'note-format', noteLocked: true, items: [thing('bills')] },
    { id: 'damaged', path: 'Inbox/Postcards', text: '', createdAt: at - 3, setAside: 'note-damaged', noteLocked: true, items: [thing('postcards')] },
    { id: 'empty', path: 'Inbox/Old', text: '', createdAt: at - 4, setAside: 'empty', items: [] },
    { id: 'ready', path: 'Inbox/Ready', text: 'Ready to file', createdAt: at - 5, items: [thing('f')] },
    { id: 'note', path: 'Inbox/Bins', text: 'Bins go out on Tuesday', createdAt: at - 6, items: [] },
  ];
  const KEEP_OPEN = "This device couldn't keep a copy. Keep Bower open until everything is sent.";

  function home(notice: string | null) {
    const base = loadingSources();
    let current = [...PILES];
    const listeners = new Set<() => void>();
    const retryPile = vi.fn(async () => undefined);
    const removePile = vi.fn(async (id: string) => {
      current = current.filter((p) => p.id !== id);
      for (const cb of listeners) cb();
    });
    const doors: Record<string, unknown> = {
      piles: async () => current,
      retryPile,
      removePile,
      uploadNotice: async () => notice,
      subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><main id="main" tabIndex={-1}><Home /></main></DataProvider></MemoryRouter>);
    return { retryPile, removePile };
  }
  const rowOf = (name: string): HTMLElement => {
    const row = screen.getByRole('link', { name: new RegExp(name) }).closest('li');
    if (!row) throw new Error(`no row for ${name}`);
    return row;
  };

  it('each set-aside pile says why, with its action; a ready pile says nothing', async () => {
    const { retryPile, removePile } = home(null);
    await screen.findByRole('link', { name: /Papers from Alex/ });
    expect(within(rowOf('Papers from Alex')).getByText('Some of its things changed after they were added. Remove it and add them again.')).toBeVisible();
    expect(within(rowOf('Receipts')).getByText('Some of its things have not arrived yet.')).toBeVisible();
    expect(within(rowOf('Letters')).getByText('Bower found two different lists of what is in this pile. Remove it and add it again.')).toBeVisible();
    expect(within(rowOf('Scans')).getByText('Bower could not check some of its things. Try again.')).toBeVisible();
    expect(within(rowOf('Forms')).getByText('Bower could not read the list of what is in this pile. Try again.')).toBeVisible();
    expect(screen.getByText('Nothing is left in it. Remove it from your inbox.')).toBeVisible();
    expect(rowOf('Ready to file').textContent).not.toMatch(/Remove|Try again/);
    // Could not check is no dead end: Try again checks again now (TL-P2-19).
    expect(within(rowOf('Scans')).queryByRole('button', { name: 'Remove this pile' })).toBeNull();
    fireEvent.click(within(rowOf('Scans')).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retryPile).toHaveBeenCalledWith('unchecked'));
    // A list Bower could not read is no dead end either: its Try again reads it again now (TL-P2-30).
    fireEvent.click(within(rowOf('Forms')).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retryPile).toHaveBeenCalledWith('unreadable'));
    // A note Bower cannot parse: its reason and Remove, never Try again (a retry does not change a format).
    for (const [name, said] of [['bills', "This pile's note needs a newer Bower."], ['postcards', "Bower can't read this pile's note."]] as const) {
      expect(within(rowOf(name)).getByText(said)).toBeVisible();
      expect(within(rowOf(name)).getByRole('button', { name: 'Remove this pile' })).toBeVisible();
      expect(within(rowOf(name)).queryByRole('button', { name: 'Try again' })).toBeNull();
    }
    // Remove is the pile's own Remove, with its question first.
    expect(within(rowOf('Letters')).getByRole('button', { name: 'Remove this pile' })).toBeVisible();
    fireEvent.click(within(rowOf('Papers from Alex')).getByRole('button', { name: 'Remove this pile' }));
    fireEvent.click(within(rowOf('Papers from Alex')).getByRole('button', { name: 'Remove the pile' }));
    await waitFor(() => expect(removePile).toHaveBeenCalledWith('changed'));
    fireEvent.click(within(rowOf('Receipts')).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retryPile).toHaveBeenCalledWith('missing'));
    expect(within(rowOf('Receipts')).queryByRole('button', { name: 'Remove this pile' })).toBeNull();
  });

  it('each action names its pile, and focus follows the question to remove it', async () => {
    const { removePile } = home(null);
    await screen.findByRole('link', { name: /Papers from Alex/ });
    expect(within(rowOf('Receipts')).getByRole('button', { name: 'Try again' })).toHaveAccessibleDescription(/Receipts/);
    const remove = within(rowOf('Letters')).getByRole('button', { name: 'Remove this pile' });
    expect(remove).toHaveAccessibleDescription(/Letters/);
    fireEvent.click(remove);
    const yes = within(rowOf('Letters')).getByRole('button', { name: 'Remove the pile' });
    // The question opens on its least destructive answer, so a repeated key cannot remove the pile.
    await waitFor(() => expect(within(rowOf('Letters')).getByRole('button', { name: 'Keep it' })).toHaveFocus());
    expect(yes).not.toHaveFocus();
    // On a phone the two answers wrap rather than run off the screen.
    expect(yes.parentElement).toHaveStyle({ flexWrap: 'wrap' });
    fireEvent.click(within(rowOf('Letters')).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(within(rowOf('Letters')).getByRole('button', { name: 'Remove this pile' })).toHaveFocus());
    fireEvent.click(within(rowOf('Letters')).getByRole('button', { name: 'Remove this pile' }));
    fireEvent.click(within(rowOf('Letters')).getByRole('button', { name: 'Remove the pile' }));
    await waitFor(() => expect(removePile).toHaveBeenCalledWith('lists'));
    await waitFor(() => expect(screen.queryByRole('link', { name: /Letters/ })).toBeNull());
    await waitFor(() => expect(document.getElementById('main')).toHaveFocus());
  });

  it('an empty pile is not said to have a note to put in the Bin', async () => {
    home(null);
    const sentence = await screen.findByText('Nothing is left in it. Remove it from your inbox.');
    const row = sentence.closest('li');
    if (!row) throw new Error('no row');
    // TL-P2-22 (1): an empty pile says so; "A note" is only for a pile that is a note.
    expect(row.textContent).toContain('Nothing in it');
    expect(row.textContent).not.toContain('A note');
    expect(rowOf('Bins go out on Tuesday').textContent).toContain('A note');
    fireEvent.click(within(row).getByRole('button', { name: 'Remove this pile' }));
    expect(within(row).getByRole('button', { name: 'Remove the pile' })).toBeVisible();
    expect(row.textContent).not.toMatch(/note goes to the Bin|Its files go/);
  });

  it("this device's upload notice shows once, for the whole inbox", async () => {
    home(KEEP_OPEN);
    await screen.findByRole('link', { name: /Papers from Alex/ });
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(await within(inbox).findAllByText(KEEP_OPEN)).toHaveLength(1);
    for (const p of PILES.filter((x) => x.text)) expect(rowOf(p.text).textContent).not.toContain(KEEP_OPEN);
  });

  it('the place the notice is said stays on screen when there is none, so it is heard when it comes', async () => {
    home(null);
    await screen.findByRole('link', { name: /Papers from Alex/ });
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(within(inbox).getByRole('status')).toHaveTextContent('');
  });
});

describe('a reselected file must match its declared member', () => {
  function Opened() {
    const { id } = useParams();
    const state: unknown = useLocation().state;
    const choose = typeof state === 'object' && state !== null && 'choose' in state ? String(state.choose) : 'nothing';
    return <p>{`Pile ${id ?? ''} ready at ${choose}`}</p>;
  }

  it.each([
    ['a file', { id: 'member-c', name: 'c.pdf', kind: 'pdf', origin: 'From this computer', upload: -1, chooseAgain: true }, 'Choose c.pdf again on this device to send it.'],
    ['a link', { id: 'member-l', name: 'source.example/path', kind: 'link', origin: 'A link you pasted', upload: -1, chooseAgain: true }, 'Paste the link again on this device to send it.'],
  ] as const)('Try again in the Inbox for %s to choose again says so and opens its pile, ready at it', async (_label, item, sentence) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = loadingSources();
    const pile: Pile = { id: 'missing', path: 'Inbox/Receipts', text: 'Receipts', createdAt: Date.now(), setAside: 'not-arrived', items: [{ id: 'a', name: 'a.pdf', kind: 'pdf', origin: 'From this computer' }, { ...item }] };
    const retryPile = vi.fn(async () => { throw new BowerError('conflict', sentence); });
    const doors: Record<string, unknown> = { piles: async () => [pile], retryPile, chooseAgain: vi.fn(async () => undefined), uploadNotice: async () => null };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/" element={<Home />} /><Route path="/pile/:id" element={<Opened />} /></Routes></DataProvider></MemoryRouter>);
    const row = (await screen.findByRole('link', { name: /Receipts/ })).closest('li');
    if (!row) throw new Error('no row');
    expect(within(row).getByText('Some of its things have not arrived yet.')).toBeVisible();
    fireEvent.click(within(row).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(`Pile missing ready at ${item.id}`)).toBeVisible();
    expect(retryPile).toHaveBeenCalledWith('missing');
    await waitFor(() => expect(useToasts.getState().list.map((t) => t.text)).toContain(sentence));
  });

  it('Try again in the Inbox, pressed twice while it works, asks and opens the pile once', async () => {
    const base = loadingSources();
    const pile: Pile = { id: 'missing', path: 'Inbox/Receipts', text: 'Receipts', createdAt: Date.now(), setAside: 'not-arrived', items: [{ id: 'member-c', name: 'c.pdf', kind: 'pdf', origin: 'From this computer', upload: -1, chooseAgain: true }] };
    let done!: () => void;
    const retryPile = vi.fn(() => new Promise<void>((r) => { done = r; }));
    const doors: Record<string, unknown> = { piles: async () => [pile], retryPile, chooseAgain: vi.fn(async () => undefined), uploadNotice: async () => null };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Routes><Route path="/" element={<Home />} /><Route path="/pile/:id" element={<Opened />} /></Routes></DataProvider></MemoryRouter>);
    const row = (await screen.findByRole('link', { name: /Receipts/ })).closest('li');
    if (!row) throw new Error('no row');
    const button = within(row).getByRole('button', { name: 'Try again' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(retryPile).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    done();
    expect(await screen.findByText('Pile missing ready at member-c')).toBeVisible();
    expect(retryPile).toHaveBeenCalledOnce();
  });
});

describe('the tidy-up sheet and Home focus', () => {
  const at = Date.now();
  const pile: Pile = { id: 'ready', path: 'Inbox/Ready', text: 'Ready to file', createdAt: at, items: [{ id: 'f', name: 'f.pdf', kind: 'pdf', origin: 'From this computer' }] };
  const finished: RunState = {
    id: 'run-1',
    scope: 'all',
    phase: 'done',
    requestedAt: at - 9000,
    phaseAt: at - 1000,
    finishedAt: at - 1000,
    seen: false,
    report: { filed: [{ name: 'f.pdf', title: 'Budget', kind: 'pdf', to: 'Areas/Money' }], created: [], updated: [], setAside: [], questions: [] } as unknown as RunState['report'],
  };

  it('Home does not reopen a finished run sheet on load', async () => {
    const base = loadingSources();
    const doors: Record<string, unknown> = { piles: async () => [pile], uploadNotice: async () => null, questions: async () => [], changes: async () => [], suggestions: async () => [] };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    useUi.setState({ tidyOpen: false });
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => finished } }}><Home /><TidySheet /></DataProvider></MemoryRouter>);
    const press = await screen.findByRole('button', { name: 'Tidy up 1 thing' });
    await screen.findByText(/Tidy-up finished/);
    expect(screen.queryByRole('dialog')).toBeNull();
    // The first press does what its label says: it asks, it does not show the old result.
    fireEvent.click(press);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).queryByRole('button', { name: 'Done' })).toBeNull();
    expect(within(sheet).queryByRole('button', { name: 'Watch what Bower did' })).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Tidy up 1 thing' })).toBeVisible();
  });

  it("the write it card shows every line of Bower's update", async () => {
    // TL-P4-19 addendum 17: the person reads the update a yes writes, every line of it, under its own label.
    const base = loadingSources();
    const shown = ['Insurance runs until 30 June.', 'MOT booked for 14 January.'];
    const q = { id: 'q-state-f1', text: 'You changed the current state of Car. Should Bower write its update there?', yes: 'Write it', no: 'Keep mine', about: 'Areas/Car/Car.md', shown: { lines: shown, md5: 'd41d8cd98f00b204e9800998ecf8427e' }, askedAt: at };
    const doors: Record<string, unknown> = { piles: async () => [], uploadNotice: async () => null, questions: async () => [q], changes: async () => [], suggestions: async () => [], subscribe: () => () => {} };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><main id="main" tabIndex={-1}><Home /></main></DataProvider></MemoryRouter>);
    const card = (await screen.findByRole('button', { name: 'Write it' })).closest('li');
    if (!card) throw new Error('no card');
    for (const line of shown) expect(card.textContent).toContain(line);
    const update = within(card).getByRole('list', { name: "Bower's update" });
    expect(within(update).getAllByRole('listitem').map((li) => li.textContent)).toEqual(shown);
  });

  it('focus never drops to body after a question is answered', async () => {
    const base = loadingSources();
    let qs = [
      { id: 'q1', text: 'Is this a receipt?', yes: 'Yes', no: 'No', askedAt: at },
      { id: 'q2', text: 'Is this a lease?', yes: 'Yes, a lease', no: 'No', askedAt: at },
    ];
    const listeners = new Set<() => void>();
    const doors: Record<string, unknown> = {
      piles: async () => [],
      uploadNotice: async () => null,
      questions: async () => qs,
      changes: async () => [],
      suggestions: async () => [],
      answer: async (id: string) => {
        qs = qs.filter((q) => q.id !== id);
        setTimeout(() => listeners.forEach((cb) => cb()), 20);
      },
      subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><main id="main" tabIndex={-1}><Home /></main></DataProvider></MemoryRouter>);
    const first = await screen.findByRole('button', { name: 'Yes' });
    first.focus();
    fireEvent.click(first);
    await waitFor(() => expect(screen.queryByText('Is this a receipt?')).toBeNull());
    // focusMain runs on a zero-delay timer queued earlier: one more zero-delay turn runs after it.
    await new Promise((r) => setTimeout(r, 0));
    // On to the next question.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Yes, a lease' }));
    const last = screen.getByRole('button', { name: 'Yes, a lease' });
    fireEvent.click(last);
    await waitFor(() => expect(screen.queryByText('Is this a lease?')).toBeNull());
    // focusMain runs on a zero-delay timer queued earlier: one more zero-delay turn runs after it.
    await new Promise((r) => setTimeout(r, 0));
    // No question left: the Home heading, never the body.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
  });
});

describe('a failed full read of the piles says why on Home', () => {
  const at = Date.now();
  const listedPile: Pile = { id: 'ready', path: 'Inbox/Ready', text: 'Ready to file', createdAt: at, items: [{ id: 'f', name: 'f.pdf', kind: 'pdf', origin: 'From this computer' }] };
  const SAYS = 'Bower could not read your inbox. Try again.';

  function failing() {
    const base = loadingSources();
    let heals = false;
    const piles = vi.fn(async (): Promise<Pile[]> => {
      if (!heals) throw new BowerError('offline', SAYS);
      return [listedPile];
    });
    const doors: Record<string, unknown> = { piles, pilesListed: async () => [listedPile], uploadNotice: async () => null, questions: async () => [], changes: async () => [], suggestions: async () => [] };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    useUi.setState({ tidyOpen: false });
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Home /><TidySheet /></DataProvider></MemoryRouter>);
    return { piles, heal: () => { heals = true; } };
  }

  it('the Inbox says why, offers Try again, and no longer lists what it cannot vouch for', async () => {
    const { heal } = failing();
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(await within(inbox).findByRole('alert')).toHaveTextContent(SAYS);
    expect(within(inbox).queryByRole('link', { name: /Ready to file/ })).toBeNull();
    expect(within(inbox).queryByRole('button', { name: /^Tidy up/ })).toBeNull();
    expect(within(inbox).queryByText('Looking…')).toBeNull();
    heal();
    fireEvent.click(within(inbox).getByRole('button', { name: 'Try again' }));
    await within(inbox).findByRole('link', { name: /Ready to file/ });
    expect(within(inbox).queryByRole('alert')).toBeNull();
    expect(within(inbox).getByRole('button', { name: 'Tidy up 1 thing' })).toBeVisible();
  });

  it('the tidy-up sheet leaves its busy state and says why', async () => {
    failing();
    useUi.getState().setTidy(true);
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText(SAYS)).toBeVisible();
    expect(sheet.querySelector('[aria-busy="true"]')).toBeNull();
    expect(within(sheet).getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

describe('the Tidy up count waits for the full read', () => {
  const at = Date.now();
  const thing = (id: string): Pile['items'][number] => ({ id, name: `${id}.pdf`, kind: 'pdf', origin: 'From this computer' });
  const listed: Pile[] = [
    { id: 'a', path: 'Inbox/A', text: 'Papers', createdAt: at, items: [thing('a1'), thing('a2')] },
    { id: 'b', path: 'Inbox/B', text: 'Receipts', createdAt: at - 1, items: [thing('b1')] },
  ];

  it('the listed Inbox shows with no count and no Tidy up button until readiness is known, then the count follows the rows shown', async () => {
    const base = loadingSources();
    let finish!: (piles: Pile[]) => void;
    const full = new Promise<Pile[]>((r) => { finish = r; });
    const doors: Record<string, unknown> = { piles: () => full, pilesListed: async () => listed, uploadNotice: async () => null, questions: async () => [], changes: async () => [], suggestions: async () => [] };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Home /></DataProvider></MemoryRouter>);
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    await within(inbox).findByRole('link', { name: /Papers/ });
    expect(within(inbox).queryByRole('button', { name: /^Tidy up/ })).toBeNull();
    expect(within(inbox).queryByText(/\d+ things? waiting/)).toBeNull();
    // The full read lacks Receipts, which the listing still shows: the count follows the rows shown.
    finish([listed[0] as Pile]);
    expect(await within(inbox).findByRole('button', { name: 'Tidy up 3 things' })).toBeVisible();
    expect(within(inbox).getByText(/3 things waiting/)).toBeVisible();
    expect(within(inbox).getByRole('link', { name: /Receipts/ })).toBeVisible();
  });
});

describe('c02-upload-count-ui Inbox contract', () => {
  const settle = () => act(async () => { await Promise.resolve(); });
  const singular = "1 pile didn't finish arriving. Add it again if you still need it.";
  const plural = "3 piles didn't finish arriving. Add them again if you still need them.";
  const unknown = "Bower couldn't check that everything you added arrived.";
  const waiting = '1 thing waiting. Tidy up when you have added everything.';
  const pile: Pile = { id: 'C02_PILE', text: 'Papers from Alex', createdAt: 1, items: [{ id: 'C02_MEMBER', name: 'scan.pdf', kind: 'pdf', origin: 'From this computer' }] };

  function show(summary: Promise<{ count: number; complete: boolean }>, piles = [pile], running = false, fullRead = Promise.resolve(piles)) {
    const base = loadingSources();
    const orphanSummary = vi.fn(() => summary);
    const doors: Record<string, unknown> = { orphanSummary, piles: () => fullRead, pilesListed: async () => piles, uploadNotice: async () => null, questions: async () => [], changes: async () => [], suggestions: async () => [] };
    const vault = new Proxy({}, { get: (_t, k) => typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k) }) as Sources['vault'];
    const sources: Sources = { ...base, vault, runs: { ...base.runs, current: async () => running ? { id: 'C02_RUN', scope: 'all', phase: 'reading', requestedAt: 1, phaseAt: 1 } as RunState : null } };
    const view = render(<MemoryRouter><DataProvider sources={sources}><Routes><Route path="/" element={<Home />} /><Route path="/pile/:id" element={<PileScreen />} /></Routes></DataProvider></MemoryRouter>);
    return { ...view, orphanSummary, sources };
  }

  function informational(line: HTMLElement) {
    expect(line.tagName).toBe('P');
    expect(line.closest('a, button, [role="alert"], [role="status"], [aria-live]')).toBeNull();
    expect(line.querySelector('a, button')).toBeNull();
    expect(line.textContent).not.toMatch(/orphan|upload|session|scan\.pdf/i);
  }

  it('c02-upload-count-ui: No pile left unfinished', async () => {
    const { orphanSummary } = show(Promise.resolve({ count: 0, complete: true }));
    await settle();
    expect(screen.getByText(waiting)).toBeVisible();
    expect(orphanSummary).toHaveBeenCalled();
    const inbox = screen.getByRole('region', { name: 'Inbox' });
    expect(within(inbox).queryByText(/finish arriving|couldn't check that/)).toBeNull();
    expect(within(inbox).getByRole('button', { name: 'Add a pile' })).toBeVisible();
    expect(within(inbox).getByRole('button', { name: 'Tidy up 1 thing' })).toBeVisible();
  });

  it.each([[1, singular], [3, plural]] as const)('c02-upload-count-ui: 1 / 3 unfinished, full read (%s)', async (count, sentence) => {
    let finishSummary!: (value: { count: number; complete: boolean }) => void;
    let finishPiles!: (value: Pile[]) => void;
    const fullRead = new Promise<Pile[]>((resolve) => { finishPiles = resolve; });
    show(new Promise((resolve) => { finishSummary = resolve; }), [pile], false, fullRead);
    await settle();
    expect(screen.getByText('Looking…')).toBeVisible();
    expect(screen.queryByText(sentence)).toBeNull();
    await act(async () => { finishSummary({ count, complete: true }); });
    expect(screen.getByText('Looking…')).toBeVisible();
    expect(screen.queryByText(sentence)).toBeNull();
    await act(async () => { finishPiles([pile]); });
    const line = screen.getByText(sentence, { exact: true });
    informational(line);
    expect(screen.getByText(waiting).compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([[1, `At least ${singular}`], [3, `At least ${plural}`]] as const)('c02-upload-count-ui: A read that failed in part (%s)', async (count, sentence) => {
      show(Promise.resolve({ count, complete: false }), [pile], true);
      await settle();
      const line = screen.getByText(sentence, { exact: true });
      informational(line);
  });

  it('c02-upload-count-ui: Nothing could be checked', async () => {
    show(Promise.resolve({ count: 0, complete: false }));
    await settle();
    const line = screen.getByText(unknown, { exact: true });
    informational(line);
    expect(line).toHaveClass('muted');
    expect(line.textContent).not.toContain('0');
  });

  it('c02-upload-count-ui: Reload while files are sending', async () => {
    const pending = { ...pile, items: pile.items.map((item) => ({ ...item, upload: 0.25 })) };
    const first = show(Promise.resolve({ count: 0, complete: true }), [pending]);
    await settle();
    expect(screen.getByRole('link', { name: /Papers from Alex/ })).toBeVisible();
    first.unmount();
    show(Promise.resolve({ count: 0, complete: true }), [pending]);
    await settle();
    fireEvent.click(screen.getByRole('link', { name: /Papers from Alex/ }));
    await settle();
    expect(screen.getByRole('list', { name: 'In this pile' })).toHaveTextContent(/sending|waiting/i);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

// Q1b: source-port fixtures exercise Home's production card and answer loop.
// Native buttons/labelled fields follow the existing Button/Field and WAI-ARIA APG patterns.
describe('Q1b Home questions', () => {
  const at = 1_800_000_000_000;
  const question = (extra: Partial<Question> = {}): Question => ({
    id: 'q-ask-paper', subject: 'paper', text: 'Where should these papers go?',
    yes: 'File them', no: 'Leave them', askedAt: at, ...extra,
  });
  const options: [NonNullable<Question['options']>[number], NonNullable<Question['options']>[number]] = [
    { id: 'folder-home', label: 'Areas / Home' },
    { id: 'folder-garden', label: 'Projects / Garden' },
  ];
  const paper: Pile = { id: 'paper', path: 'Inbox/Papers', text: 'Papers from Alex', createdAt: at,
    items: [{ id: 'letter', name: 'letter.pdf', kind: 'pdf', origin: 'From this computer' }] };
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(at); useUi.setState({ tidyOpen: false }); });
  afterEach(() => {
    cleanup();
    for (const t of useToasts.getState().list) useToasts.getState().dismiss(t.id);
    vi.useRealTimers(); vi.restoreAllMocks();
  });
  async function settle(): Promise<void> {
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  }
  async function home(qs: Question[], piles: Pile[] = [], fails = false) {
    const base = loadingSources();
    let open = [...qs];
    const listeners = new Set<() => void>();
    const answer = vi.fn(async (id: string, _value: QuestionAnswer) => {
      if (fails) throw new BowerError('offline', 'That answer did not save. Try again.');
      open = open.filter((q) => q.id !== id);
      listeners.forEach((cb) => cb());
    });
    const start = vi.fn(async () => ({ id: 'answer-run', scope: 'all' as const, phase: 'queued' as const,
      requestedAt: at, phaseAt: at, seen: false }));
    const methods: Record<string, unknown> = {
      questions: async () => open, piles: async () => piles, pilesListed: async () => null,
      tree: async () => [], changes: async () => [], suggestions: async () => [], uploadNotice: async () => null,
      answer, subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); },
    };
    const vault = new Proxy(base.vault, { get: (target, key) => typeof key === 'string' && key in methods ? methods[key] : Reflect.get(target, key) });
    render(<MemoryRouter><DataProvider sources={{ ...base, vault,
      session: { ...base.session, current: async () => ({ name: 'Alex', email: 'you@example.com' }) },
      runs: { ...base.runs, current: async () => null, start } }}>
      <main id="main" tabIndex={-1}><Home /></main>
    </DataProvider></MemoryRouter>);
    await settle();
    // Every red's positive control: Home loaded through the real data hooks.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("Hello, Alex");
    for (const q of qs) expect(screen.getByText(q.text, { exact: true })).toBeVisible();
    return { answer, start };
  }
  function card(text = 'Where should these papers go?'): HTMLElement {
    const li = screen.getByText(text, { exact: true }).closest('li');
    if (!li) throw new Error('Question card missing');
    return li;
  }
  async function textMode(): Promise<HTMLElement> {
    fireEvent.click(within(card()).getByRole('button', { name: 'Something else…' }));
    await settle();
    return within(card()).getByRole('textbox', { name: 'In your own words' });
  }

  it('Q1b A question with options on Home', async () => {
    await home([question({ options }), question({ id: 'q-state-note', subject: undefined, text: 'Write the update?', yes: 'Write it', no: 'Keep mine', shown: { lines: ['The papers arrived.'], md5: '0'.repeat(32) } }),
      question({ id: 'q-pair-note.other', subject: undefined, text: 'Keep one note for both?' })]);
    const state = card('Write the update?');
    expect(within(state).getByRole('list', { name: "Bower's update" })).toHaveTextContent('The papers arrived.');
    expect(within(state).getByRole('button', { name: 'Write it' })).toHaveClass('primary');
    for (const label of [...options.map((o) => o.label), 'Something else…']) {
      expect(within(card()).getByRole('button', { name: label })).toHaveClass('ghost', 'small');
    }
    expect(within(card()).getAllByRole('button').map((b) => b.textContent)).toEqual([...options.map((o) => o.label), 'Something else…']);
    expect(within(state).queryByRole('button', { name: 'Something else…' })).toBeNull();
    expect(within(card('Keep one note for both?')).queryByRole('button', { name: 'Something else…' })).toBeNull();
  });

  it('Q1b A yes/no question about an inbox thing or pile', async () => {
    await home([question(), question({ id: 'q-ask-letter', subject: 'letter', text: 'Is this a letter?' })]);
    for (const text of ['Where should these papers go?', 'Is this a letter?']) {
      const row = card(text);
      expect(within(row).getByRole('button', { name: 'File them' })).toHaveClass('primary', 'small');
      expect(within(row).getByRole('button', { name: 'Leave them' })).toHaveClass('ghost', 'small');
      const other = within(row).getByRole('button', { name: 'Something else…' });
      expect(other).toHaveClass('ghost', 'small');
      expect(within(row).getAllByRole('button').at(-1)).toBe(other);
    }
  });

  it('Q1b "Something else…" pressed', async () => {
    await home([question({ options })]);
    const field = await textMode();
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveFocus();
    expect(within(card()).getByRole('button', { name: 'Tell Bower' })).toBeDisabled();
    expect(within(card()).getByRole('button', { name: 'Cancel' })).toHaveClass('ghost', 'small');
    expect(within(card()).queryByRole('button', { name: options[0].label })).toBeNull();
    fireEvent.change(field, { target: { value: '   \n ' } });
    expect(within(card()).getByRole('button', { name: 'Tell Bower' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'Garden papers' } });
    expect(within(card()).getByRole('button', { name: 'Tell Bower' })).toBeEnabled();
  });

  it('Q1b Cancel', async () => {
    await home([question({ options })]);
    await textMode();
    fireEvent.click(within(card()).getByRole('button', { name: 'Cancel' }));
    await settle();
    expect(within(card()).queryByRole('textbox')).toBeNull();
    expect(within(card()).getByRole('button', { name: options[0].label })).toBeVisible();
    expect(within(card()).getByRole('button', { name: 'Something else…' })).toHaveFocus();
  });

  it('Q1b An answer on Home, no run live', async () => {
    const f = await home([question({ options })]);
    const choice = within(card()).getByRole('button', { name: options[1].label });
    choice.focus(); fireEvent.click(choice); await settle();
    expect(f.answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', { option: options[1].id });
    expect(f.start).toHaveBeenCalledOnce();
    expect(screen.queryByText('Where should these papers go?')).toBeNull();
    expect(useToasts.getState().list.map((t) => t.text)).toContain(answeredNow(options[1].label));
  });

  it('Q1b Over 1,000 characters typed', async () => {
    await home([question({ options })]);
    const field = await textMode();
    fireEvent.change(field, { target: { value: `  ${'x'.repeat(1000)}  ` } });
    expect(within(card()).getByRole('button', { name: 'Tell Bower' })).toBeEnabled();
    expect(field).not.toHaveAttribute('maxlength');
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
    fireEvent.change(field, { target: { value: 'x'.repeat(1001) } });
    expect(field).toHaveValue('x'.repeat(1001));
    expect(within(card()).getByRole('button', { name: 'Tell Bower' })).toBeDisabled();
    const error = within(card()).getByText('Use 1,000 characters at most.', { exact: true });
    expect(error.id).not.toBe('');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    fireEvent.change(field, { target: { value: 'Short enough' } });
    expect(within(card()).queryByText('Use 1,000 characters at most.')).toBeNull();
    expect(field).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('Q1b Home text answer is trimmed and focus moves to the next question then the heading', async () => {
    const second = question({ id: 'q-ask-second', subject: 'second', text: 'Is this for the garden?', yes: 'Yes, garden' });
    const f = await home([question({ options }), second]);
    const field = await textMode();
    fireEvent.change(field, { target: { value: '  Papers for the garden\nKeep together.  ' } });
    const send = within(card()).getByRole('button', { name: 'Tell Bower' });
    send.focus(); fireEvent.click(send); await settle();
    expect(f.answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', { text: 'Papers for the garden\nKeep together.' });
    expect(useToasts.getState().list.map((t) => t.text)).toContain(answeredNow('your words'));
    const next = screen.getByRole('button', { name: 'Yes, garden' });
    expect(next).toHaveFocus(); fireEvent.click(next); await settle();
    expect(screen.queryByText(second.text)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('Q1b Home save failure retains the card and draft', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await home([question({ options })], [], true);
    const field = await textMode();
    fireEvent.change(field, { target: { value: 'My garden draft' } });
    fireEvent.click(within(card()).getByRole('button', { name: 'Tell Bower' })); await settle();
    expect(f.answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', { text: 'My garden draft' });
    expect(f.start).not.toHaveBeenCalled();
    expect(screen.getByText('Where should these papers go?')).toBeVisible();
    expect(field).toHaveValue('My garden draft');
    expect(screen.getByRole('button', { name: 'Tell Bower' })).toBeEnabled();
    expect(useToasts.getState().list.map((t) => t.text)).toContain('That answer did not save. Try again.');
  });

  it('Q1b The pile row while a question waits', async () => {
    await home([], [{ ...paper, question: 'waiting' }, { ...paper, id: 'ready-control', text: 'Ready papers' }]);
    const ready = screen.getByRole('link', { name: /Ready papers/ });
    expect(ready).toHaveTextContent('1 thing');
    const row = screen.getByRole('link', { name: /Papers from Alex/ });
    expect(within(row).getByText('Waiting for your answer', { exact: true })).toBeVisible();
    expect(row).not.toHaveTextContent('1 thing');
    expect(within(ready).queryByText('Waiting for your answer')).toBeNull();
  });

  it('Q1b After 2 rounds', async () => {
    await home([], [{ ...paper, question: 'exhausted' }, { ...paper, id: 'ready-control', text: 'Ready papers' }]);
    const ready = screen.getByRole('link', { name: /Ready papers/ });
    expect(ready).toHaveTextContent('1 thing');
    const row = screen.getByRole('link', { name: /Papers from Alex/ });
    expect(within(row).getByText("Bower couldn't place this", { exact: true })).toBeVisible();
    expect(row).not.toHaveTextContent('1 thing');
    expect(within(ready).queryByText("Bower couldn't place this")).toBeNull();
  });

  it('Q1b Upload error and readiness lines take priority over question projections', async () => {
    await home([], [{ ...paper, question: 'waiting', setAside: 'not-arrived', items: [{ ...paper.items[0], id: 'letter', name: 'letter.pdf', kind: 'pdf', origin: 'From this computer', upload: -1 }] },
      { ...paper, id: 'damaged', text: 'Unread papers', question: 'exhausted', setAside: 'note-damaged', noteLocked: true }]);
    expect(screen.getByText('Some of its things have not arrived yet.')).toBeVisible();
    expect(screen.getByText("Bower can't read this pile's note.")).toBeVisible();
    expect(screen.queryByText('Waiting for your answer')).toBeNull();
    expect(screen.queryByText("Bower couldn't place this")).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('Q1b Duplicate option labels answer by id', async () => {
    const choices = options.map((o) => ({ ...o, label: 'Garden' }));
    const f = await home([question({ options: choices })]);
    const buttons = within(card()).getAllByRole('button', { name: 'Garden' });
    expect(buttons).toHaveLength(2);
    const chosen = buttons[1];
    if (!chosen) throw new Error('Second option missing');
    fireEvent.click(chosen); await settle();
    expect(f.answer).toHaveBeenCalledExactlyOnceWith('q-ask-paper', { option: 'folder-garden' });
  });
});

describe('design-polish: pile titles on Home', () => {
  it('AC2 pile-titles-one-font: a loose thing named by its file and a pile named by its words use the same title style', async () => {
    const base = loadingSources();
    const at = Date.now();
    const piles: Pile[] = [
      { id: 'words', path: 'Inbox/Receipts', text: 'Receipts from the weekend', createdAt: at, items: [{ id: 'r', name: 'r.pdf', kind: 'pdf', origin: 'From this computer' }] },
      { id: 'loose', path: 'Inbox/curry-clipping.example.url', text: '', createdAt: at - 1, items: [{ id: 'c', name: 'curry-clipping.example.url', kind: 'link', origin: 'From the browser' }] },
    ];
    const doors: Record<string, unknown> = { piles: async () => piles, pilesListed: async () => piles, uploadNotice: async () => null, subscribe: () => () => undefined };
    const vault = new Proxy({}, { get: (_t, k) => (typeof k === 'string' && k in doors ? doors[k] : Reflect.get(base.vault, k)) }) as Sources['vault'];
    render(<MemoryRouter><DataProvider sources={{ ...base, vault, runs: { ...base.runs, current: async () => null } }}><Home /></DataProvider></MemoryRouter>);
    const loose = await screen.findByText('curry-clipping.example');
    const words = screen.getByText('Receipts from the weekend');
    expect(loose.id).toBe('pile-name-loose');
    expect(loose).not.toHaveClass('mono');
    expect(loose.className).toBe(words.className);
  });
});
