// @vitest-environment jsdom

import type { JSX } from 'preact';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useShowAppFiles } from '../src/components/explorer.js';
import { resetPrefs, setPref, subscribePref } from '../src/prefs.js';

let host: HTMLElement;

function Probe(): JSX.Element {
  return <p>{useShowAppFiles() ? 'shown' : 'hidden'}</p>;
}

beforeEach(() => {
  resetPrefs();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  void act(() => {
    render(null, host);
  });
  host.remove();
  resetPrefs();
});

describe('useShowAppFiles (#920 T-14)', () => {
  it('follows setPref, as Settings writes it, with no other cue', () => {
    void act(() => {
      render(<Probe />, host);
    });
    expect(host.textContent).toBe('hidden');
    void act(() => {
      setPref('showAppFiles', true);
    });
    expect(host.textContent).toBe('shown');
    void act(() => {
      setPref('showAppFiles', false);
    });
    expect(host.textContent).toBe('hidden');
  });
});

describe('subscribePref', () => {
  it('calls back for its own key only, and stops when unsubscribed', () => {
    const listener = vi.fn();
    const stop = subscribePref('showAppFiles', listener);
    setPref('explorerSort', 'modified');
    expect(listener).not.toHaveBeenCalled();
    setPref('showAppFiles', true);
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'bower:pref:showAppFiles' }),
    );
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    setPref('showAppFiles', false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
