// @vitest-environment jsdom

/**
 * Not found (#504, Phone-NotFound board): one screen (the bird, the
 * heading, Search for it, Go home) whichever kind of thing is missing,
 * with only the sentence changing per kind. `routes/folder.tsx` (an
 * unknown folder) and `routes/app.tsx`'s catch-all (any other unknown URL)
 * wire this component up with `kind="folder"` and the default `"page"`;
 * `folder.test.tsx` covers the folder route's own wiring.
 */

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { NotFound } from '../src/routes/not-found.js';
import type { NotFoundKind } from '../src/routes/not-found.js';

let root: HTMLDivElement;

function mount(kind?: NotFoundKind): void {
  root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(NotFound, kind === undefined ? {} : { kind }), root);
  });
}

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  root.remove();
});

describe('NotFound (#504)', () => {
  it('always shows the same heading and the two ways out', () => {
    mount('note');
    expect(root.querySelector('h1')?.textContent).toBe('I can’t find that');
    expect(root.querySelector('a[href="/search"]')?.textContent).toBe(
      'Search for it',
    );
    expect(root.querySelector('a[href="/"]')?.textContent).toBe('Go home');
  });

  it('reads a missing note’s own sentence for kind="note"', () => {
    mount('note');
    expect(root.querySelector('.auth-note')?.textContent).toBe(
      "It isn't in your Bower folder any more. Maybe it moved, or the link is old.",
    );
  });

  it('reads an unknown folder’s own sentence for kind="folder"', () => {
    mount('folder');
    expect(root.querySelector('.auth-note')?.textContent).toBe(
      "This folder isn't in your Bower folder any more. Maybe it moved, or the link is old.",
    );
  });

  it('reads a missing file’s own sentence for kind="file" (#529)', () => {
    mount('file');
    expect(root.querySelector('.auth-note')?.textContent).toBe(
      "It isn't in your Bower folder any more. Maybe it moved, or the link is old.",
    );
  });

  it('reads the generic page sentence for kind="page", and by default', () => {
    mount('page');
    expect(root.querySelector('.auth-note')?.textContent).toBe(
      "That page doesn't exist. Maybe the link is old, or it was never there.",
    );
    mount();
    expect(root.querySelector('.auth-note')?.textContent).toBe(
      "That page doesn't exist. Maybe the link is old, or it was never there.",
    );
  });
});
