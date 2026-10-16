/**
 * qa6-tell-bower (qa-6 Claude F5, designer 8): what is typed in Tell Bower is kept for the visit as Add keeps its draft
 * (forgotten at sign-out with the rest of this device's memory of the person).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { forgetThisPerson } from '@/data/device';
import type { Request } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { BowerScreen } from './BowerScreen';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

function screenWith(requests: Request[] = []) {
  const sources = loadingSources();
  const vault = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'driveLinks') return false;
      if (k === 'subscribe') return () => () => undefined;
      if (k === 'requests') return async () => requests;
      if (k === 'rules' || k === 'questions' || k === 'failedChanges') return async () => [];
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

describe('qa6-tell-bower: the request being typed is kept', () => {
  it('AC1 qa6-tell-bower-draft-kept: a request being typed is there again after the screen loads again', () => {
    screenWith();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your request' }), { target: { value: 'A long request I am still writing, about the flat hunt' } });
    cleanup();
    screenWith();
    expect(screen.getByRole('textbox', { name: 'Your request' })).toHaveValue('A long request I am still writing, about the flat hunt');
  });

  it('AC1 qa6-tell-bower-draft-forgotten: sign-out forgets the draft', () => {
    screenWith();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your request' }), { target: { value: 'Compare the flats' } });
    cleanup();
    forgetThisPerson();
    screenWith();
    expect(screen.getByRole('textbox', { name: 'Your request' })).toHaveValue('');
  });
});
