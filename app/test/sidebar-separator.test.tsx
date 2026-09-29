// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SidebarSeparator,
  clampWidth,
  widthForKey,
} from '../src/components/sidebar-separator.js';

describe('clampWidth', () => {
  it('keeps 200 to 480 and leaves the main column 560 px', () => {
    expect(clampWidth(100, 1600)).toBe(200);
    expect(clampWidth(380, 1600)).toBe(380);
    expect(clampWidth(900, 1600)).toBe(480);
    expect(clampWidth(480, 900)).toBe(340);
    expect(clampWidth(300, 700)).toBe(200);
  });
});

describe('widthForKey', () => {
  it('maps the arrows, Home, End and Enter, and ignores other keys', () => {
    expect(widthForKey('ArrowLeft', 264)).toBe(248);
    expect(widthForKey('ArrowRight', 264)).toBe(280);
    expect(widthForKey('Home', 300)).toBe(200);
    expect(widthForKey('End', 300)).toBe(480);
    expect(widthForKey('Enter', 300)).toBe(264);
    expect(widthForKey('a', 300)).toBeNull();
  });
});

describe('SidebarSeparator', () => {
  let shell: HTMLElement;
  let handle: HTMLElement;
  let frames: FrameRequestCallback[];

  beforeEach(async () => {
    localStorage.clear();
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    Object.defineProperty(window, 'innerWidth', {
      value: 1600,
      configurable: true,
    });
    shell = document.createElement('div');
    shell.className = 'shell';
    document.body.append(shell);
    await act(() => {
      render(
        h('div', { class: 'shell-sidebar' }, h(SidebarSeparator, {})),
        shell,
      );
    });
    handle = shell.querySelector<HTMLElement>('[role="separator"]')!;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;
  });

  afterEach(() => {
    render(null, shell);
    shell.remove();
    vi.unstubAllGlobals();
  });

  function pointer(type: string, clientX: number): void {
    const event = new MouseEvent(type, {
      clientX,
      button: 0,
      bubbles: true,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    handle.dispatchEvent(event);
  }

  async function press(key: string): Promise<void> {
    await act(() => {
      handle.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    });
  }

  const width = (): string => shell.style.getPropertyValue('--sidebar-width');
  const stored = (): string | null =>
    localStorage.getItem('bower:pref:sidebarWidth');

  it('is a vertical separator with its range and a tab stop', () => {
    expect(handle.getAttribute('aria-orientation')).toBe('vertical');
    expect(handle.getAttribute('aria-valuemin')).toBe('200');
    expect(handle.getAttribute('aria-valuemax')).toBe('480');
    expect(handle.getAttribute('aria-valuenow')).toBe('264');
    expect(handle.getAttribute('aria-label')).toBe('Resize the sidebar');
    expect(handle.tabIndex).toBe(0);
  });

  it('moves 16 px per arrow and jumps with Home and End', async () => {
    await press('ArrowRight');
    expect(width()).toBe('280px');
    expect(handle.getAttribute('aria-valuenow')).toBe('280');
    expect(stored()).toBe('280');
    await press('ArrowLeft');
    await press('ArrowLeft');
    expect(width()).toBe('248px');
    await press('End');
    expect(width()).toBe('480px');
    await press('ArrowRight');
    expect(width()).toBe('480px');
    await press('Home');
    expect(width()).toBe('200px');
  });

  it('resets to 264 on Enter and on double-click', async () => {
    await press('End');
    await press('Enter');
    expect(width()).toBe('264px');
    await press('Home');
    await act(() => {
      handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(width()).toBe('264px');
    expect(stored()).toBe('264');
  });

  it('drags with pointer capture, one write per frame, and commits at the end', async () => {
    pointer('pointerdown', 264);
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1);
    pointer('pointermove', 300);
    pointer('pointermove', 380);
    pointer('pointermove', 400);
    expect(frames).toHaveLength(1);
    expect(width()).toBe('');
    frames.shift()?.(0);
    expect(width()).toBe('400px');
    expect(stored()).toBeNull();
    await act(() => {
      pointer('pointerup', 400);
    });
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(width()).toBe('400px');
    expect(stored()).toBe('400');
    expect(handle.getAttribute('aria-valuenow')).toBe('400');
  });

  it('clamps a drag to the limits', async () => {
    pointer('pointerdown', 264);
    pointer('pointermove', 2000);
    frames.shift()?.(0);
    expect(width()).toBe('480px');
    await act(() => {
      pointer('pointercancel', 2000);
    });
    expect(stored()).toBe('480');
  });

  it('still resizes when storage is blocked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await press('ArrowRight');
    expect(width()).toBe('280px');
    expect(warn).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});