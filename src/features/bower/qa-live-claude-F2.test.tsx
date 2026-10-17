/**
 * qa-live-claude F2: a request takes 5-10 s to save on staging. Words typed in Tell Bower while it saves were cleared
 * when the save ended (`send()` cleared the box after the await), so requests were lost without a word. A save that
 * ends clears only the words it sent: newer words, on this screen or on one opened again after leaving, are kept, as a
 * pile note's older save never clears newer words (qa7-drafts-save-race). While it saves, the button says so.
 * Made-up words only.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { BowerScreen } from './BowerScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

const FIRST = 'Put my id papers together';
const SECOND = 'Compare the flats by commute';

/** Every save waits for `release`, in order; `sent` keeps each request's words and intent. */
function heldVault() {
  const sent: Array<{ text: string; intent?: string }> = [];
  const rules: string[] = [];
  const gates: Array<() => void> = [];
  const gate = (): Promise<void> => new Promise<void>((done) => gates.push(done));
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'rules' || k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
      if (k === 'addRequest') return async (text: string, intent?: string) => {
        sent.push({ text, ...(intent ? { intent } : {}) });
        await gate();
        return { id: `R${sent.length}`, text, at: 0 };
      };
      if (k === 'addRule') return async (text: string) => {
        rules.push(text);
        await gate();
        return { id: `rule-${rules.length}`, text, yourWords: text, since: 0, pending: true };
      };
      return () => new Promise(() => undefined);
    },
  });
  return { vault, sent, rules, release: () => act(async () => gates.shift()?.()) };
}

function show(vault: object): void {
  const sources = loadingSources();
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
        <main id="main" tabIndex={-1} />
        <BowerScreen />
      </DataProvider>
    </MemoryRouter>,
  );
}

const box = (name = 'Your request'): HTMLElement => screen.getByRole('textbox', { name });

describe('qa-live-claude F2: a save never clears newer words', () => {
  it('F2 newer-words-kept: words typed while a request saves stay in the box when the save ends, and after a reload', async () => {
    const v = heldVault();
    show(v.vault);
    fireEvent.change(box(), { target: { value: FIRST } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(v.sent).toHaveLength(1));
    fireEvent.change(box(), { target: { value: SECOND } });
    await v.release();
    // Positive control: the first request was sent once, with its own words.
    expect(v.sent.map((s) => s.text)).toEqual([FIRST]);
    expect(box()).toHaveValue(SECOND);
    cleanup();
    show(v.vault);
    expect(box()).toHaveValue(SECOND);
  });

  it('F2 newer-words-sent-fresh: the words kept after the save send as a new request, with a new intent', async () => {
    const v = heldVault();
    show(v.vault);
    fireEvent.change(box(), { target: { value: FIRST } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(v.sent).toHaveLength(1));
    fireEvent.change(box(), { target: { value: SECOND } });
    await v.release();
    await waitFor(() => expect(screen.getByRole('button', { name: /Send/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(v.sent).toHaveLength(2));
    expect(v.sent[1]?.text).toBe(SECOND);
    expect(v.sent[1]?.intent).toBeTruthy();
    expect(v.sent[1]?.intent).not.toBe(v.sent[0]?.intent);
    await v.release();
    // Positive control: a save whose words are still the box's clears them.
    await waitFor(() => expect(box()).toHaveValue(''));
  });

  it('F2 appended-words-kept: words added to the sent ones while it saves are kept as typed, never cleared', async () => {
    const v = heldVault();
    show(v.vault);
    fireEvent.change(box(), { target: { value: FIRST } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(v.sent).toHaveLength(1));
    // The replay: the caret stayed in the sent words, and the next request was typed into them.
    fireEvent.change(box(), { target: { value: `${FIRST} ${SECOND}` } });
    await v.release();
    expect(box()).toHaveValue(`${FIRST} ${SECOND}`);
  });

  it('F2 screen-left-kept: a save that ends after its screen left never clears words typed on the screen opened again', async () => {
    const v = heldVault();
    show(v.vault);
    fireEvent.change(box(), { target: { value: FIRST } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(v.sent).toHaveLength(1));
    cleanup();
    show(v.vault);
    fireEvent.change(box(), { target: { value: SECOND } });
    await v.release();
    expect(box()).toHaveValue(SECOND);
    cleanup();
    show(v.vault);
    expect(box()).toHaveValue(SECOND);
  });

  it('F2 rule-newer-words-kept: words typed while a rule saves stay too', async () => {
    const v = heldVault();
    show(v.vault);
    fireEvent.click(screen.getByRole('radio', { name: 'A rule' }));
    fireEvent.change(box('The rule'), { target: { value: 'Receipts go to Money, by month' } });
    fireEvent.click(screen.getByRole('button', { name: /Keep this rule/ }));
    await waitFor(() => expect(v.rules).toHaveLength(1));
    fireEvent.change(box('The rule'), { target: { value: 'Photos go to Home, by year' } });
    await v.release();
    expect(box('The rule')).toHaveValue('Photos go to Home, by year');
  });

  it('F2 sending-shown: while a request saves, its button says it is sending, and Send comes back after', async () => {
    const v = heldVault();
    show(v.vault);
    fireEvent.change(box(), { target: { value: FIRST } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(v.sent).toHaveLength(1));
    const sending = screen.getByRole('button', { name: /Sending/ });
    expect(sending).toBeDisabled();
    fireEvent.change(box(), { target: { value: SECOND } });
    await v.release();
    expect(screen.queryByRole('button', { name: /Sending/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Send/ })).toBeEnabled();
  });

  it('F2 raw-words-cleared: the words sent are the box as it was at Send, so trailing spaces still clear', async () => {
    const v = heldVault();
    show(v.vault);
    fireEvent.change(box(), { target: { value: `${FIRST} ` } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(v.sent).toHaveLength(1));
    await v.release();
    expect(v.sent[0]?.text).toBe(FIRST);
    await waitFor(() => expect(box()).toHaveValue(''));
  });

  it('F2 blocked-storage-kept: with storage blocked, words typed while a request saves stay when it ends', async () => {
    const blocked = (): never => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    const v = heldVault();
    show(v.vault);
    fireEvent.change(box(), { target: { value: FIRST } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(v.sent).toHaveLength(1));
    fireEvent.change(box(), { target: { value: SECOND } });
    await v.release();
    expect(v.sent.map((s) => s.text)).toEqual([FIRST]);
    expect(box()).toHaveValue(SECOND);
  });
});
