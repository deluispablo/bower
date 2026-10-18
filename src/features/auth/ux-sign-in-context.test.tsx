import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { SignIn } from './SignIn';

const invitation = "This Google account isn't invited to Bower yet. Try another account.";
const failure = "Bower couldn't sign you in. Try again.";
const consent = 'Google will ask to let Bower see and change your Drive. Bower keeps to its own folder. Only people invited to this Bower can sign in.';

afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function open(search = '') {
  const sources = loadingSources();
  const signIn = vi.spyOn(sources.session, 'signIn');
  render(<MemoryRouter initialEntries={[`/sign-in${search}`]}><DataProvider sources={sources}><SignIn /><Where /></DataProvider></MemoryRouter>);
  return signIn;
}

it('AC1: shows the exact introduction and landing/legal links without self-hosting', () => {
  open();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your Drive, tidied by a bowerbird.');
  expect(screen.getByText('Throw in photos, PDFs, links and notes. Bower names each one and files it in a folder of your own Drive.').textContent)
    .toBe('Throw in photos, PDFs, links and notes. Bower names each one and files it in a folder of your own Drive.');
  expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  for (const [name, href] of [['See how Bower works', '/landing/'], ['Privacy', '/privacy'], ['Terms', '/terms']]) {
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
  }
  expect(screen.queryByRole('link', { name: /Run your own Bower/ })).toBeNull();
});

it('AC4: explains the actual full Drive permission separately from Bower’s folder restriction', async () => {
  // Load the real Worker export without adding its Cloudflare types to the browser project.
  const googleModule = '../../../api/src/google';
  const { GOOGLE_SCOPE } = await import(googleModule);
  expect(GOOGLE_SCOPE.split(' ')).toContain('https://www.googleapis.com/auth/drive');
  open();
  expect(screen.getByText(consent, { exact: true }).textContent).toBe(consent);
  expect(screen.queryByText(/Google.*(?:only one folder|only.*Bower.s folder)/)).toBeNull();
});

it('AC2: preserves the invitation bytes and action after query cleanup, but not a cleaned reload', async () => {
  open('?signin=not-invited');
  expect(screen.getByText(invitation, { exact: true }).textContent).toBe(invitation);
  expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Use another account' })).toBeEnabled();
  await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/sign-in'));
  expect(screen.getByText(invitation, { exact: true }).textContent).toBe(invitation);
  cleanup();
  open();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Use another account' })).toBeNull();
});

it.each(['Continue with Google', 'Use another account'])('AC2: %s shares pending state, rejection and retry with the other control', async (first) => {
  const signIn = open('?signin=not-invited');
  let reject!: (error: Error) => void;
  signIn.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const google = screen.getByRole('button', { name: 'Continue with Google' });
  const another = within(screen.getByRole('alert')).getByRole('button', { name: 'Use another account' });
  fireEvent.click(first === 'Continue with Google' ? google : another);
  expect(google).toHaveTextContent('Opening Google…');
  expect(google).toBeDisabled();
  expect(another).toBeDisabled();
  fireEvent.click(google);
  fireEvent.click(another);
  fireEvent.click(first === 'Continue with Google' ? google : another);
  expect(signIn).toHaveBeenCalledTimes(1);
  const error = new Error('controlled sign-in rejection');
  await act(async () => reject(error));
  expect(logged).toHaveBeenCalledWith(error);
  expect(screen.getByRole('alert')).toHaveTextContent(failure);
  expect(screen.queryByText(invitation, { exact: true })).toBeNull();
  expect(google).toBeEnabled();
  expect(another).toBeEnabled();
  fireEvent.click(first === 'Continue with Google' ? another : google);
  expect(signIn).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(failure, { exact: true })).toBeNull();
  expect(screen.getByText(invitation, { exact: true }).textContent).toBe(invitation);
  expect(google).toBeDisabled();
  expect(another).toBeDisabled();
});

it.each(['cancelled', 'failed', 'unknown'])('offers no account-switch action for %s', (reason) => {
  open(`?signin=${reason}`);
  expect(screen.queryByRole('button', { name: 'Use another account' })).toBeNull();
});
