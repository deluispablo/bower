// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Overlay, OverlayHost } from '../src/components/overlay.js';
import type {
  OverlayKind,
  OverlayPlacement,
} from '../src/components/overlay.js';
import {
  OVERLAY_PRIORITY,
  close,
  currentOverlay,
  open,
  resetOverlayQueue,
} from '../src/overlay-queue.js';

let app: HTMLElement;
let shell: HTMLElement;
let opener: HTMLButtonElement;
let host: HTMLElement;

beforeEach(() => {
  app = document.createElement('div');
  app.id = 'app';
  shell = document.createElement('div');
  shell.className = 'shell';
  opener = document.createElement('button');
  opener.textContent = 'Open';
  shell.appendChild(opener);
  host = document.createElement('div');
  shell.appendChild(host);
  app.appendChild(shell);
  document.body.appendChild(app);
  void act(() => {
    render(<OverlayHost />, host);
  });
  opener.focus();
});

afterEach(() => {
  void act(() => {
    render(null, host);
  });
  resetOverlayQueue();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

function openDialog(
  id: string,
  kind: OverlayKind = 'dialog',
  desktopPlacement?: OverlayPlacement,
): void {
  void act(() => {
    open({
      id,
      priority: OVERLAY_PRIORITY.own,
      render: () => (
        <Overlay
          kind={kind}
          labelledBy={`${id}-title`}
          onClose={() => {
            close(id);
          }}
          {...(desktopPlacement === undefined ? {} : { desktopPlacement })}
        >
          <h2 id={`${id}-title`}>Rename {id}</h2>
          <button type="button">Save</button>
          <button
            type="button"
            onClick={() => {
              close(id);
            }}
          >
            Cancel
          </button>
        </Overlay>
      ),
    });
  });
}

function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.overlay-panel');
}

function press(key: string): void {
  void act(() => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
  });
}

describe('Overlay', () => {
  it('renders a labelled modal dialog outside the page', () => {
    openDialog('rename');
    const dialog = panel();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('rename-title');
    expect(shell.contains(dialog)).toBe(false);
    expect(document.querySelector('.overlay-scrim')).not.toBeNull();
  });

  it('makes the page inert, locks scroll and traps focus while open', () => {
    openDialog('rename');
    expect(shell.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement?.textContent).toBe('Save');
  });

  it('closes on Escape, undoes inert and scroll lock, and returns focus', () => {
    document.body.style.overflow = 'auto';
    openDialog('rename');
    press('Escape');
    expect(panel()).toBeNull();
    expect(currentOverlay()).toBeNull();
    expect(shell.hasAttribute('inert')).toBe(false);
    expect(document.body.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(opener);
  });

  it('an overlay rendered inline is portalled out of the inert page and focused', () => {
    const inline = document.createElement('div');
    shell.appendChild(inline);
    void act(() => {
      render(
        <Overlay kind="dialog" label="Inline" onClose={() => undefined}>
          <button type="button">First</button>
        </Overlay>,
        inline,
      );
    });
    const dialog = panel();
    expect(dialog).not.toBeNull();
    expect(shell.contains(dialog)).toBe(false);
    expect(dialog?.closest('[inert]')).toBeNull();
    expect(shell.hasAttribute('inert')).toBe(true);
    expect(dialog?.contains(document.activeElement)).toBe(true);
    void act(() => {
      render(null, inline);
    });
  });

  it('returns focus to the opener on Escape and on the close button, even if the page blurred it', () => {
    for (const closeWith of ['escape', 'button'] as const) {
      openDialog('rename');
      // The inert page drops focus from the opener in a real browser.
      opener.blur();
      if (closeWith === 'escape') press('Escape');
      else {
        void act(() => {
          [
            ...document.querySelectorAll<HTMLButtonElement>(
              '.overlay-panel button',
            ),
          ]
            .find((b) => b.textContent === 'Cancel')
            ?.click();
        });
      }
      expect(panel()).toBeNull();
      expect(document.activeElement).toBe(opener);
    }
  });

  it('closes on a tap on the scrim', () => {
    openDialog('rename');
    void act(() => {
      document.querySelector<HTMLElement>('.overlay-scrim')?.click();
    });
    expect(panel()).toBeNull();
  });

  it('uses role menu for menus, without aria-modal', () => {
    void act(() => {
      open({
        id: 'menu',
        priority: OVERLAY_PRIORITY.own,
        render: () => (
          <Overlay
            kind="menu"
            label="Note actions"
            onClose={() => close('menu')}
          >
            <button type="button" role="menuitem">
              Rename
            </button>
          </Overlay>
        ),
      });
    });
    expect(panel()?.getAttribute('role')).toBe('menu');
    expect(panel()?.getAttribute('aria-label')).toBe('Note actions');
    expect(panel()?.hasAttribute('aria-modal')).toBe(false);
  });

  it('places each kind by default and honours desktopPlacement', () => {
    openDialog('sheet', 'sheet');
    expect(document.querySelector('.overlay')?.className).toContain(
      'overlay--desktop-right',
    );
    void act(() => close('sheet'));
    openDialog('dialog', 'dialog');
    expect(document.querySelector('.overlay')?.className).toContain(
      'overlay--desktop-center',
    );
    void act(() => close('dialog'));
    openDialog('menu', 'menu');
    expect(document.querySelector('.overlay')?.className).toContain(
      'overlay--desktop-anchor',
    );
    expect(panel()?.style.getPropertyValue('--overlay-anchor-top')).not.toBe(
      '',
    );
    void act(() => close('menu'));
    openDialog('help', 'sheet', 'center');
    expect(document.querySelector('.overlay')?.className).toContain(
      'overlay--desktop-center',
    );
  });

  it('shows one overlay at a time and the queued one after the first closes', () => {
    openDialog('first');
    openDialog('second');
    expect(document.querySelectorAll('.overlay-panel')).toHaveLength(1);
    expect(panel()?.getAttribute('aria-labelledby')).toBe('first-title');
    press('Escape');
    expect(document.querySelectorAll('.overlay-panel')).toHaveLength(1);
    expect(panel()?.getAttribute('aria-labelledby')).toBe('second-title');
    expect(shell.hasAttribute('inert')).toBe(true);
    press('Escape');
    expect(panel()).toBeNull();
    expect(shell.hasAttribute('inert')).toBe(false);
  });
});

describe('overlay.css', () => {
  const css = readFileSync('src/styles/overlay.css', 'utf8');

  it('uses the stacking, scrim and sheet tokens', () => {
    expect(css).toContain('var(--z-scrim)');
    expect(css).toContain('var(--z-overlay)');
    expect(css).toContain('var(--color-scrim)');
    expect(css).toContain('var(--radius-sheet)');
    expect(css).toContain('var(--motion-base)');
  });

  it('animates only transform and opacity, and only opacity under reduced motion', () => {
    const keyframes =
      css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? [];
    expect(keyframes.length).toBeGreaterThan(0);
    for (const block of keyframes) {
      const properties = Array.from(
        block.matchAll(/([a-z-]+)\s*:/g),
        (m) => m[1],
      );
      for (const property of properties) {
        expect(['opacity', 'transform']).toContain(property);
      }
    }
    const reduced = css.slice(
      css.indexOf('@media (prefers-reduced-motion: reduce)'),
    );
    expect(reduced).toContain('animation: overlay-fade');
    const fade =
      keyframes.find((block) => block.includes('overlay-fade')) ?? '';
    expect(fade).not.toContain('transform');
  });
});
