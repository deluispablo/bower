// @vitest-environment jsdom

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import { close, open, resetOverlayQueue } from '../src/overlay-queue.js';

const run = vi.hoisted(() => ({
  phase: 'done' as 'idle' | 'done',
  resultSeen: true,
}));
const push = vi.hoisted(() => ({ prompted: false, markPrompted: vi.fn() }));

vi.mock('../src/run-store.js', () => ({ useRun: () => run }));
vi.mock('../src/push.js', () => ({
  currentPermission: () => 'default',
  currentPushSupport: () => 'supported',
  enablePush: vi.fn().mockResolvedValue(undefined),
  hasBeenPrompted: () => push.prompted,
  markPrompted: push.markPrompted,
  shouldPrompt: () => true,
}));

const { PushPrompt } = await import('../src/components/push-prompt.js');

let root: HTMLDivElement;

function mount(): void {
  void act(() => {
    render(h(Fragment, null, h(PushPrompt, null), h(OverlayHost, null)), root);
  });
}

function dialog(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="dialog"]');
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
  run.phase = 'done';
  run.resultSeen = true;
  push.prompted = false;
  push.markPrompted.mockClear();
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  resetOverlayQueue();
  document.body.replaceChildren();
});

describe('PushPrompt on Overlay', () => {
  it('is a named dialog once the run is done and its result seen', () => {
    mount();
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(dialog()?.textContent).toContain('Want a ping when I');
  });

  it('does not show while the chip is still in the done state', () => {
    run.resultSeen = false;
    mount();
    expect(dialog()).toBeNull();
  });

  it('waits behind an open overlay and shows when it closes', () => {
    void act(() => {
      open({ id: 'own', priority: 1, render: () => h('p', null, 'mine') });
    });
    mount();
    expect(dialog()).toBeNull();
    void act(() => {
      close('own');
    });
    expect(dialog()).not.toBeNull();
  });

  it('remembers Not now and goes away', () => {
    mount();
    const notNow = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent === 'Not now',
    );
    void act(() => notNow?.click());
    expect(push.markPrompted).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });
});
