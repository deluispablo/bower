/**
 * qa7-drafts (qa-7 Claude F2): Tell Bower keeps the words being typed for the tab (qa6-tell-bower), but not which kind
 * they were written as, so a rule draft comes back as a request and Send would send a rule as a request. The kind is
 * kept with the words, through the same session draft, and sign-out forgets it.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { forgetThisPerson } from '@/data/device';
import { loadingSources } from '@/testing/loading-sources';
import { BowerScreen } from './BowerScreen';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

/** `sent`: each request's intent, as Send passes it; the send never ends (a reload cuts it short). */
function screenWith(sent: Array<string | undefined> = []): void {
  const sources = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'addRequest') return (_text: string, intent?: string) => { sent.push(intent); return new Promise(() => undefined); };
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'rules' || k === 'requests' || k === 'questions' || k === 'failedChanges') return async () => [];
      return () => new Promise(() => undefined);
    },
  });
  render(
    <MemoryRouter>
      <DataProvider sources={{ ...sources, vault: vault as typeof sources.vault, runs: { ...sources.runs, subscribe: () => () => undefined } }}>
        <main id="main" tabIndex={-1} />
        <BowerScreen />
      </DataProvider>
    </MemoryRouter>,
  );
}

const RULE = 'Rule: photos by year';

describe('qa7-drafts: a draft keeps its kind', () => {
  it('AC2 qa7-drafts-rule-kept: a rule being typed comes back as a rule after the screen loads again', () => {
    screenWith();
    fireEvent.click(screen.getByRole('radio', { name: 'A rule' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'The rule' }), { target: { value: RULE } });
    cleanup();
    screenWith();
    expect(screen.getByRole('radio', { name: 'A rule' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'The rule' })).toHaveValue(RULE);
    expect(screen.getByRole('button', { name: /Keep this rule/ })).toBeEnabled();
  });

  it('AC2 qa7-drafts-request-default: with nothing kept, the screen starts on a request', () => {
    screenWith();
    expect(screen.getByRole('radio', { name: 'A request' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Your request' })).toHaveValue('');
  });

  it('AC2 qa7-drafts-kind-forgotten: sign-out forgets the kind with the words', () => {
    screenWith();
    fireEvent.click(screen.getByRole('radio', { name: 'A rule' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'The rule' }), { target: { value: RULE } });
    cleanup();
    forgetThisPerson();
    screenWith();
    expect(screen.getByRole('radio', { name: 'A request' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Your request' })).toHaveValue('');
  });

  it('AC1 qa7-drafts-token-kind: the same words after a reload keep their token; a change of kind makes a new one (review-gaps 14)', () => {
    const sent: Array<string | undefined> = [];
    screenWith(sent);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your request' }), { target: { value: 'Put the lease papers together' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    cleanup();
    // Positive control: after a reload the same words go with the same token.
    screenWith(sent);
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    cleanup();
    // The kind changed and changed back: a new intent, so a new request.
    screenWith(sent);
    fireEvent.click(screen.getByRole('radio', { name: 'A rule' }));
    fireEvent.click(screen.getByRole('radio', { name: 'A request' }));
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    cleanup();
    // Changed words: a new token too.
    screenWith(sent);
    fireEvent.change(screen.getByRole('textbox', { name: 'Your request' }), { target: { value: 'Put the lease papers together now' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    const [first, again, otherKind, otherWords] = sent;
    expect(first).toBeTruthy();
    expect(again).toBe(first);
    expect(otherKind).toBeTruthy();
    expect(otherKind).not.toBe(first);
    expect(otherWords).toBeTruthy();
    expect(otherWords).not.toBe(otherKind);
  });
});
