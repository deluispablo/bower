// @vitest-environment jsdom

import { h, render } from 'preact';
import type { FunctionComponent } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import { Privacy } from '../src/routes/privacy.js';
import { Terms } from '../src/routes/terms.js';

function mount(Component: FunctionComponent): HTMLDivElement {
  const root = document.createElement('div');
  document.body.append(root);
  void act(() => {
    render(h(Component, null), root);
  });
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Privacy', () => {
  it('renders the privacy policy, reachable signed out', () => {
    const root = mount(Privacy);
    expect(root.querySelector('h1')?.textContent).toBe('Privacy');
  });
});

describe('Terms', () => {
  it('renders the terms of service, reachable signed out', () => {
    const root = mount(Terms);
    expect(root.querySelector('h1')?.textContent).toBe('Terms of Service');
  });
});
