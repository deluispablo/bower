// @vitest-environment jsdom

/** #1004: Sign in says the account is gone after Delete my account. */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/session.js', () => ({
  useSession: () => ({ status: 'signed-out', error: null }),
}));
vi.mock('../src/api.js', () => ({
  loginUrl: () => '/api/auth/login',
}));

const { ACCOUNT_DELETED, Login } = await import('../src/routes/login.js');

let root: HTMLDivElement | undefined;

function mount(url: string): HTMLDivElement {
  window.history.replaceState(null, '', url);
  const host = document.createElement('div');
  document.body.append(host);
  void act(() => {
    render(h(Login, null), host);
  });
  root = host;
  return host;
}

afterEach(() => {
  if (root !== undefined) {
    void act(() => {
      render(null, root as HTMLDivElement);
    });
  }
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});

describe('Sign in after Delete my account', () => {
  it('says the account is deleted and the folder stays', () => {
    const host = mount('/login?deleted=1');
    const notice = host.querySelector('[role="status"]');
    expect(notice?.textContent).toBe(ACCOUNT_DELETED);
    expect(ACCOUNT_DELETED).toBe(
      'Your account is deleted. Your Bower folder is still in your Google Drive.',
    );
  });

  it('says nothing of the kind on an ordinary visit', () => {
    const host = mount('/login');
    expect(host.textContent).not.toContain('Your account is deleted.');
  });
});
