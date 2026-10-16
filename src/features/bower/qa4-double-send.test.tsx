/**
 * qa4-double-send (qa-4, both testers): a second press of Send, or of Keep this rule, while the first is still being
 * saved records nothing more. The press is ignored and the button is disabled until the save ends, as Add and the
 * question answers already do (a ref checked first, then a busy state).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { BowerError } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerScreen } from './BowerScreen';

afterEach(cleanup);

/** Bower's screen over a vault whose saves wait until `release` is called. */
function screenWithHeldSaves() {
  const calls = { addRequest: 0, addRule: 0 };
  let release: () => void = () => undefined;
  let fail = false;
  const gate = (): Promise<void> => new Promise<void>((done) => (release = done));
  const sources = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'rules' || k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
      if (k === 'addRequest') return async (text: string) => {
        calls.addRequest++;
        await gate();
        if (fail) throw new BowerError('offline', 'That did not send. Try again.');
        return { id: `R${calls.addRequest}`, text, at: 0 };
      };
      if (k === 'addRule') return async (text: string) => {
        calls.addRule++;
        await gate();
        return { id: `rule-${calls.addRule}`, text, yourWords: text, since: 0, pending: true };
      };
      return () => new Promise(() => undefined);
    },
  });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
        <BowerScreen />
      </DataProvider>
    </MemoryRouter>,
  );
  return { calls, release: () => act(async () => release()), failNext: () => (fail = true) };
}

describe('qa4-double-send: one press, one request', () => {
  it('AC1 double-send-one-request: a second Send and a Ctrl+Enter while the first is saving record nothing more', async () => {
    const s = screenWithHeldSaves();
    const box = screen.getByRole('textbox', { name: 'Your request' });
    fireEvent.change(box, { target: { value: 'Put my id papers together' } });
    const send = screen.getByRole('button', { name: /Send/ });
    fireEvent.click(send);
    fireEvent.click(send);
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(s.calls.addRequest).toBeGreaterThan(0));
    expect(s.calls.addRequest).toBe(1);
    await s.release();
    await waitFor(() => expect(box).toHaveValue(''));
    expect(s.calls.addRequest).toBe(1);
  });

  it('AC2 send-busy: Send is disabled while the request is being saved, and enabled again after', async () => {
    const s = screenWithHeldSaves();
    const box = screen.getByRole('textbox', { name: 'Your request' });
    fireEvent.change(box, { target: { value: 'Compare the flats by commute' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(s.calls.addRequest).toBe(1));
    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled();
    await s.release();
    await waitFor(() => expect(box).toHaveValue(''));
    fireEvent.change(box, { target: { value: 'And the lease dates' } });
    expect(screen.getByRole('button', { name: /Send/ })).toBeEnabled();
  });

  it('AC3 rule-once: a second Keep this rule while the rule is being saved records nothing more', async () => {
    const s = screenWithHeldSaves();
    fireEvent.click(screen.getByRole('radio', { name: 'A rule' }));
    const box = screen.getByRole('textbox', { name: 'The rule' });
    fireEvent.change(box, { target: { value: 'Receipts go to Money, by month' } });
    const keep = screen.getByRole('button', { name: /Keep this rule/ });
    fireEvent.click(keep);
    fireEvent.click(keep);
    await waitFor(() => expect(s.calls.addRule).toBeGreaterThan(0));
    expect(s.calls.addRule).toBe(1);
    await s.release();
    await waitFor(() => expect(box).toHaveValue(''));
    expect(s.calls.addRule).toBe(1);
  });

  it('R4 failed-send-again: after a save that failed, Send works again and the words stay', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = screenWithHeldSaves();
    s.failNext();
    const box = screen.getByRole('textbox', { name: 'Your request' });
    fireEvent.change(box, { target: { value: 'Put my id papers together' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(s.calls.addRequest).toBe(1));
    await s.release();
    await waitFor(() => expect(screen.getByRole('button', { name: /Send/ })).toBeEnabled());
    expect(box).toHaveValue('Put my id papers together');
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    await waitFor(() => expect(s.calls.addRequest).toBe(2));
  });
});
