/**
 * add-timers-unmount: Add's delayed peck after adding things and its delayed focus move after taking one out stop
 * when Add closes. CI saw "document is not defined" at Add's peck timer after the test environment was torn down;
 * here the teardown is the document going away right after Add unmounts. Made-up links only.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataProvider } from '@/data/provider';
import { loadingSources } from '@/testing/loading-sources';
import { Add } from './Add';

const bird = vi.hoisted(() => ({ peck: { count: 0 } }));
vi.mock('@/ui/toast', () => ({ toast: vi.fn() }));
vi.mock('@/bird/Bower', () => ({
  BowerLayer: forwardRef(function BowerLayer(_: unknown, ref) {
    useImperativeHandle(ref, () => {
      const c = {
        flyTo: () => c,
        wait: () => c,
        peck: () => {
          bird.peck.count++;
          return c;
        },
        pointOn: () => ({ x: 0, y: 0 }),
      };
      return c;
    });
    return null;
  }),
}));

beforeEach(() => {
  sessionStorage.clear();
  bird.peck.count = 0;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  cleanup();
  sessionStorage.clear();
});

function open(rows: string[] = []): { unmount: () => void } {
  if (rows.length) sessionStorage.setItem('bower:add-items', JSON.stringify(rows.map((name, i) => ({ key: `K-${i}`, name, kind: 'link', origin: 'A link you pasted', url: `https://${name}` }))));
  const base = loadingSources();
  return render(
    <MemoryRouter initialEntries={['/add']}>
      <DataProvider sources={{ ...base, vault: { ...base.vault, duplicates: async () => [] } }}>
        <main id="main" tabIndex={-1}>
          <Routes><Route path="/add" element={<Add />} /></Routes>
        </main>
      </DataProvider>
    </MemoryRouter>,
  );
}

function addLink(url: string): void {
  fireEvent.change(screen.getByRole('textbox', { name: 'Paste a link' }), { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
}

function takeOut(name: string): void {
  const button = screen.getByRole('button', { name: `Take ${name} out` });
  button.focus();
  fireEvent.click(button);
}

/** Add closes, the document goes (the test environment's teardown), then every timer left runs. */
function closeThenRun(view: { unmount: () => void }, run: () => void = () => vi.runAllTimers()): void {
  view.unmount();
  vi.stubGlobal('document', undefined);
  expect(run).not.toThrow();
}

describe('add-timers-unmount: Add stops its delayed moves when it closes', () => {
  it('AC1 add-timers-unmount-add: the peck after adding a thing never runs once Add is gone', () => {
    const view = open();
    addLink('one.example/a');
    closeThenRun(view);
    expect(bird.peck.count).toBe(0);
  });

  it('AC1 add-timers-unmount-adds: every pending peck stops, not only the latest', () => {
    const view = open();
    addLink('one.example/a');
    addLink('one.example/b');
    addLink('one.example/c');
    closeThenRun(view);
    expect(bird.peck.count).toBe(0);
  });

  it('AC1 add-timers-unmount-remove: the focus move after taking a thing out never runs once Add is gone', () => {
    const view = open(['one.example/a', 'one.example/b']);
    takeOut('one.example/a');
    closeThenRun(view);
  });

  it('AC1 add-timers-unmount-removes: every pending focus move stops, not only the latest', () => {
    const view = open(['one.example/a', 'one.example/b', 'one.example/c']);
    takeOut('one.example/a');
    takeOut('one.example/b');
    closeThenRun(view);
  });

  it('AC1 add-timers-unmount-add-remove: a peck and a focus move both pending stop together', () => {
    const view = open(['one.example/a']);
    addLink('one.example/b');
    takeOut('one.example/a');
    closeThenRun(view);
    expect(bird.peck.count).toBe(0);
  });

  it('AC1 add-timers-unmount-fallback: the page focus queued by the last removal stops if Add closes before it runs', () => {
    const view = open(['one.example/a']);
    takeOut('one.example/a');
    // Only the removal's own timer: it finds no row left and hands the keyboard to the page (focusMain), a second timer.
    act(() => { vi.runOnlyPendingTimers(); });
    expect(vi.getTimerCount()).toBe(1);
    closeThenRun(view);
  });

  it('AC1 add-timers-unmount-mounted: while Add stays open, Bower still pecks what arrived', () => {
    open();
    addLink('one.example/a');
    act(() => { vi.advanceTimersByTime(59); });
    expect(bird.peck.count).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(bird.peck.count).toBe(1);
  });
});
