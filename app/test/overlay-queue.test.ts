import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  OVERLAY_PRIORITY,
  close,
  currentOverlay,
  isOverlayOpen,
  open,
  queuedOverlays,
  resetOverlayQueue,
  subscribeOverlays,
} from '../src/overlay-queue.js';
import type { OverlayEntry, OverlayPriority } from '../src/overlay-queue.js';

function entry(id: string, priority: OverlayPriority): OverlayEntry {
  return { id, priority, render: () => null };
}

function ids(): string[] {
  return queuedOverlays().map((waiting) => waiting.id);
}

afterEach(() => {
  resetOverlayQueue();
});

describe('overlay queue: one at a time', () => {
  it('shows the first overlay and queues the next', () => {
    expect(isOverlayOpen()).toBe(false);
    expect(open(entry('menu', OVERLAY_PRIORITY.own))).toBe('shown');
    expect(open(entry('tour', OVERLAY_PRIORITY.tour))).toBe('queued');
    expect(currentOverlay()?.id).toBe('menu');
    expect(ids()).toEqual(['tour']);
    expect(isOverlayOpen()).toBe(true);
  });

  it('never pushes the overlay in front aside, even for a higher priority', () => {
    open(entry('tour', OVERLAY_PRIORITY.tour));
    expect(open(entry('menu', OVERLAY_PRIORITY.own))).toBe('queued');
    expect(currentOverlay()?.id).toBe('tour');
  });

  it('closing the last overlay leaves none open', () => {
    open(entry('menu', OVERLAY_PRIORITY.own));
    close('menu');
    expect(currentOverlay()).toBeNull();
    expect(isOverlayOpen()).toBe(false);
  });

  it('ignores an unknown id on close', () => {
    open(entry('menu', OVERLAY_PRIORITY.own));
    const listener = vi.fn();
    subscribeOverlays(listener);
    close('nothing');
    expect(currentOverlay()?.id).toBe('menu');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('overlay queue: priority', () => {
  it('orders the waiting line own, run, tour, then hints and toasts', () => {
    open(entry('front', OVERLAY_PRIORITY.own));
    open(entry('toast', OVERLAY_PRIORITY.hint));
    open(entry('tour', OVERLAY_PRIORITY.tour));
    open(entry('sheet', OVERLAY_PRIORITY.run));
    open(entry('dialog', OVERLAY_PRIORITY.own));
    expect(ids()).toEqual(['dialog', 'sheet', 'tour', 'toast']);

    const shown: string[] = [];
    while (currentOverlay() !== null) {
      const id = currentOverlay()?.id ?? '';
      shown.push(id);
      close(id);
    }
    expect(shown).toEqual(['front', 'dialog', 'sheet', 'tour', 'toast']);
  });

  it('keeps arrival order within one priority', () => {
    open(entry('front', OVERLAY_PRIORITY.own));
    open(entry('hint-a', OVERLAY_PRIORITY.hint));
    open(entry('hint-b', OVERLAY_PRIORITY.hint));
    open(entry('hint-c', OVERLAY_PRIORITY.hint));
    expect(ids()).toEqual(['hint-a', 'hint-b', 'hint-c']);
  });

  it('never shows a hint or toast over an open overlay', () => {
    open(entry('sheet', OVERLAY_PRIORITY.run));
    expect(open(entry('toast', OVERLAY_PRIORITY.hint))).toBe('queued');
    expect(currentOverlay()?.id).toBe('sheet');
  });

  it('holds each id once, whether it shows or waits', () => {
    expect(open(entry('menu', OVERLAY_PRIORITY.own))).toBe('shown');
    expect(open(entry('menu', OVERLAY_PRIORITY.own))).toBe('shown');
    expect(open(entry('tour', OVERLAY_PRIORITY.tour))).toBe('queued');
    expect(open(entry('tour', OVERLAY_PRIORITY.tour))).toBe('queued');
    expect(ids()).toEqual(['tour']);
  });

  it('drops a waiting overlay that closes before it shows', () => {
    open(entry('menu', OVERLAY_PRIORITY.own));
    open(entry('tour', OVERLAY_PRIORITY.tour));
    close('tour');
    expect(ids()).toEqual([]);
    close('menu');
    expect(currentOverlay()).toBeNull();
  });

  it('tells subscribers of every change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const stop = subscribeOverlays(listener);
    open(entry('menu', OVERLAY_PRIORITY.own));
    open(entry('tour', OVERLAY_PRIORITY.tour));
    close('menu');
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    close('tour');
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('overlay queue: failure path (spec §7c)', () => {
  it('shows an overlay queued while another closes next, once', () => {
    open(entry('confirm', OVERLAY_PRIORITY.run));
    const shown: string[] = [];
    subscribeOverlays(() => {
      const id = currentOverlay()?.id;
      if (id !== undefined && shown[shown.length - 1] !== id) shown.push(id);
      // A listener that reacts to the close by asking for the tour.
      if (currentOverlay() === null) return;
      open(entry('tour', OVERLAY_PRIORITY.tour));
    });

    // Queued while the confirm sheet is still in front.
    expect(open(entry('tour', OVERLAY_PRIORITY.tour))).toBe('queued');
    close('confirm');

    expect(currentOverlay()?.id).toBe('tour');
    expect(ids()).toEqual([]);

    close('tour');
    expect(currentOverlay()).toBeNull();
    expect(shown.filter((id) => id === 'tour')).toHaveLength(1);
  });

  it('shows an overlay opened from inside a close listener exactly once', () => {
    open(entry('sheet', OVERLAY_PRIORITY.run));
    let asked = 0;
    subscribeOverlays(() => {
      if (currentOverlay() === null && asked === 0) {
        asked += 1;
        expect(open(entry('dialog', OVERLAY_PRIORITY.own))).toBe('shown');
      }
    });
    close('sheet');
    expect(currentOverlay()?.id).toBe('dialog');
    expect(ids()).toEqual([]);
    close('dialog');
    expect(currentOverlay()).toBeNull();
    expect(asked).toBe(1);
  });
});
