import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import type { NewPile, Pile } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerScreen } from '@/features/bower/BowerScreen';
import { Add } from './Add';
import { forget, keep } from './draft-files';

vi.mock('@/ui/toast', () => ({ toast: vi.fn() }));

const DESCRIPTION = 'What is this? (optional)';
const EMPTY_ADD = 'Add a file, a photo or a link first.';
const EMPTY_ASK = 'Write what you want first.';
const MISSING = 'Add the missing files again, or take them out.';
const KEYS = ['UX-ready', 'UX-missing'];

beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); sessionStorage.clear(); KEYS.forEach(forget); vi.restoreAllMocks(); });

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);
function renderAdd(opts: { items?: unknown[]; addPile?: (p: NewPile) => Promise<Pile>; twice?: boolean } = {}) {
  if (opts.items) sessionStorage.setItem('bower:add-items', JSON.stringify(opts.items));
  const base = loadingSources();
  const vault = { ...base.vault, addPile: opts.addPile ?? never, duplicates: async () => [] };
  return render(
    <MemoryRouter initialEntries={['/add']}>
      <DataProvider sources={{ ...base, vault }}>
        <Routes><Route path="/add" element={opts.twice ? <><Add /><Add /></> : <Add />} /><Route path="/" element={<p>Inbox</p>} /></Routes>
      </DataProvider>
    </MemoryRouter>,
  );
}
const addButton = (): HTMLElement => screen.getByRole('button', { name: /^(Add .*to the inbox|Saving…)$/ });
const reasonOf = (button: HTMLElement): string | null => {
  const id = button.getAttribute('aria-describedby');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
};

describe('ux-capture-form AC1: Add order and enablement', () => {
  it('AC1 the file, photo and link controls come before the optional description in DOM order', () => {
    renderAdd();
    const description = screen.getByRole('textbox', { name: DESCRIPTION });
    for (const control of [screen.getByRole('button', { name: 'Choose files' }), screen.getByRole('button', { name: 'Add a photo' }), screen.getByRole('textbox', { name: 'Paste a link' })]) {
      expect(control.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('AC1 one valid file with an empty description enables the counted button', () => {
    keep('UX-ready', new Blob(['SYNTHETIC']));
    renderAdd({ items: [{ key: 'UX-ready', name: 'outline.txt', kind: 'other', origin: 'From this device' }] });
    expect(screen.getByRole('textbox', { name: DESCRIPTION })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Add 1 thing to the inbox' })).toBeEnabled();
  });

  it('AC1 a text-only pile enables "Add to the inbox"', () => {
    renderAdd();
    fireEvent.change(screen.getByRole('textbox', { name: DESCRIPTION }), { target: { value: 'Ask the landlord about the heating' } });
    expect(screen.getByRole('button', { name: 'Add to the inbox' })).toBeEnabled();
  });
});

describe('ux-capture-form AC2: Add explains a disabled action', () => {
  it('AC2 empty Add shows its reason below the action, connected by aria-describedby', () => {
    renderAdd();
    const button = addButton();
    expect(button).toBeDisabled();
    const reason = screen.getByText(EMPTY_ADD);
    expect(reasonOf(button)).toBe(EMPTY_ADD);
    expect(button.compareDocumentPosition(reason) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('AC2 a description of only spaces counts as empty', () => {
    renderAdd();
    fireEvent.change(screen.getByRole('textbox', { name: DESCRIPTION }), { target: { value: '   ' } });
    expect(addButton()).toBeDisabled();
    expect(reasonOf(addButton())).toBe(EMPTY_ADD);
  });

  it('AC2 once enabled, the reason and aria-describedby are gone', () => {
    renderAdd();
    fireEvent.change(screen.getByRole('textbox', { name: DESCRIPTION }), { target: { value: 'A note' } });
    expect(addButton()).toBeEnabled();
    expect(addButton()).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(EMPTY_ADD)).toBeNull();
  });

  it('AC2 two Add forms on screen have distinct reason ids', () => {
    renderAdd({ twice: true });
    const ids = screen.getAllByRole('button', { name: 'Add to the inbox' }).map((b) => b.getAttribute('aria-describedby'));
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('AC2 missing draft bytes show the recovery reason instead of the empty reason', () => {
    keep('UX-ready', new Blob(['SYNTHETIC']));
    renderAdd({ items: [{ key: 'UX-ready', name: 'outline.txt', kind: 'other', origin: 'From this device' }, { key: 'UX-missing', name: 'scan.pdf', kind: 'pdf', origin: 'From this device' }] });
    const button = addButton();
    expect(button).toBeDisabled();
    expect(reasonOf(button)).toBe(MISSING);
    expect(screen.queryByText(EMPTY_ADD)).toBeNull();
  });

  it('AC2 guard: busy Add says "Saving…" and shows no reason line', async () => {
    renderAdd();
    // A guard: it finds the box by either name, so it passes before and after the rename.
    fireEvent.change(screen.getByRole('textbox', { name: /^What is this\?/ }), { target: { value: 'A note' } });
    await act(async () => { fireEvent.click(addButton()); });
    expect(addButton()).toHaveAccessibleName('Saving…');
    expect(addButton()).toBeDisabled();
    expect(addButton()).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(EMPTY_ADD)).toBeNull();
    expect(screen.queryByText(MISSING)).toBeNull();
  });
});

function renderAsk(addRequest: () => Promise<unknown> = never) {
  const sources = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'rules' || k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
      if (k === 'addRequest' || k === 'addRule') return addRequest;
      return never;
    },
  });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
        <BowerScreen />
      </DataProvider>
    </MemoryRouter>,
  );
}

describe('ux-capture-form AC2: Ask explains a disabled action', () => {
  it.each([
    { mode: 'request', box: 'Your request', action: 'Send' },
    { mode: 'rule', box: 'The rule', action: 'Keep this rule' },
  ])('AC2 empty Ask ($mode) shows its reason, spaces count as empty, and it goes once enabled', ({ mode, box, action }) => {
    renderAsk();
    if (mode === 'rule') fireEvent.click(screen.getByRole('radio', { name: 'A rule' }));
    const button = screen.getByRole('button', { name: action });
    expect(button).toBeDisabled();
    expect(reasonOf(button)).toBe(EMPTY_ASK);
    expect(button.compareDocumentPosition(screen.getByText(EMPTY_ASK)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: box }), { target: { value: '   ' } });
    expect(reasonOf(button)).toBe(EMPTY_ASK);
    fireEvent.change(screen.getByRole('textbox', { name: box }), { target: { value: 'Keep receipts' } });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(EMPTY_ASK)).toBeNull();
  });

  it('AC2 guard: busy Ask says "Sending…" and shows no reason line', async () => {
    renderAsk();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your request' }), { target: { value: 'Put my id papers together' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const busy = await screen.findByRole('button', { name: 'Sending…' });
    await waitFor(() => expect(busy).toBeDisabled());
    expect(busy).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(EMPTY_ASK)).toBeNull();
  });
});
