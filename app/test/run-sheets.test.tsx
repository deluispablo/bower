// @vitest-environment jsdom

/**
 * The Done sheet the run sheets open after a tidy-up (#914, board AR-Run):
 * "Done" with its times, the ✕ "Close the tidy-up result" and no
 * full-width Close (K-25), four stat tiles, a row per thing filed with its
 * name without the extension (K-17) and a "Filed" badge, and "See what
 * changed". Hermetic: the listing is stubbed, no network.
 */

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import { resetOverlayQueue } from '../src/overlay-queue.js';
import { resetBirdPresence } from '../src/bird-presence.js';
import { buildRun } from './fixtures/run-outcome-builders.js';

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ files: [] }),
}));

const { WorkingSheet } = await import('../src/components/working-sheet.js');

let root: HTMLDivElement;
const onDismiss = vi.fn();

function mountDone(): HTMLElement {
  const run = buildRun('done', {
    runId: 'run-1',
    items: [
      {
        path: '0-Inbox/Passport copy.pdf',
        kind: 'file' as const,
        to: '2-Areas/Visa & Immigration/Passport copy.pdf',
      },
    ],
    created: [],
    updated: [],
  });
  void act(() => {
    render(
      h(
        Fragment,
        null,
        h(WorkingSheet, {
          phase: 'done',
          run,
          now: Date.now(),
          open: true,
          onDismiss,
        }),
        h(OverlayHost, null),
      ),
      root,
    );
  });
  const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog === null) throw new Error('no sheet');
  return dialog;
}

beforeEach(() => {
  const app = document.createElement('div');
  app.id = 'app';
  const page = document.createElement('div');
  page.className = 'shell';
  app.append(page);
  document.body.append(app);
  root = document.createElement('div');
  page.append(root);
  onDismiss.mockClear();
});

afterEach(() => {
  void act(() => {
    render(null, root);
  });
  document.body.replaceChildren();
  resetOverlayQueue();
  document.body.removeAttribute('style');
  resetBirdPresence();
});

describe('the Done sheet (AR-Run)', () => {
  it('has the ✕ only, closing on the first tap', () => {
    const sheet = mountDone();
    const buttons = [...sheet.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent?.trim())).not.toContain('Close');
    const close = sheet.querySelector<HTMLButtonElement>(
      'button[aria-label="Close the tidy-up result"]',
    );
    expect(close).not.toBeNull();
    void act(() => {
      close?.click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows Done, four stat tiles, the filed row and See what changed', () => {
    const sheet = mountDone();
    expect(sheet.querySelector('h2')?.textContent).toBe('Done');
    const labels = [...sheet.querySelectorAll('.stat-tile-label')].map(
      (label) => label.textContent,
    );
    expect(labels).toEqual(['Filed', 'New notes', 'Updated', 'Needs you']);
    const row = sheet.querySelector('.working-sheet-row');
    expect(row?.querySelector('.list-row-title')?.textContent).toBe(
      'Passport copy',
    );
    expect(row?.querySelector('.list-row-meta')?.textContent).toContain(
      'PDF · ',
    );
    expect(row?.querySelector('.list-row-meta')?.textContent).toContain(
      'Areas › Visa & Immigration',
    );
    expect(row?.querySelector('.badge-filed')?.textContent).toBe('Filed');
    const see = [...sheet.querySelectorAll('a')].find(
      (a) => a.textContent === 'See what changed',
    );
    expect(see?.getAttribute('href')).toBe('/just-filed?run=run-1');
    // The full-width primary button, as on the board.
    expect(see?.classList.contains('tidy-confirm-button')).toBe(true);
    expect(see?.classList.contains('tidy-confirm-button-secondary')).toBe(
      false,
    );
  });
});
