import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { SignIn } from './SignIn';

afterEach(cleanup);

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

function open(search: string) {
  render(
    <MemoryRouter initialEntries={[`/sign-in${search}`]}>
      <DataProvider sources={loadingSources()}>
        <SignIn />
        <Where />
      </DataProvider>
    </MemoryRouter>,
  );
}

describe('sign-in after Google sends the person back', () => {
  it('says so when the sign-in was cancelled, then drops the parameter', async () => {
    open('?signin=cancelled');
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in was cancelled.');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/sign-in$/));
    // The sentence stays after the address is cleaned.
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in was cancelled.');
  });

  it('says so when the sign-in failed, then drops the parameter', async () => {
    open('?signin=failed');
    expect(screen.getByRole('alert')).toHaveTextContent("Bower couldn't sign you in. Try again.");
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/sign-in$/));
    expect(screen.getByRole('alert')).toHaveTextContent("Bower couldn't sign you in. Try again.");
  });

  it('says nothing for an unknown value, and still cleans the address', async () => {
    open('?signin=whatever');
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/sign-in$/));
  });
});
