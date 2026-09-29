// @vitest-environment jsdom

/**
 * The tidy-up sheet on Overlay (#752, R-SHEET-1 to R-SHEET-6, R-BIRD-8): its
 * four states, the actions of each, and the sheet that stays away for a
 * vanished folder. Hermetic: the listing is stubbed, no network.
 */

import { Fragment, h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import {
  close,
  open,
  OVERLAY_PRIORITY,
  queuedOverlays,
  resetOverlayQueue,
} from '../src/overlay-queue.js';

import type { Run } from '../src/api.js';
import { WORKING_STAGE_HEIGHT } from '../src/components/bower-working.js';
import { resetBirdPresence } from '../src/bird-presence.js';
import { buildRun } from './fixtures/run-outcome-builders.js';

vi.mock('../src/vault-store.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/vault-store.js')>()),
  useVault: () => ({ files: [] }),
}));

const { WorkingSheet } = await import('../src/components/working-sheet.js');
type Phase = Parameters<typeof WorkingSheet>[0]['phase'];

let root: HTMLDivElement;
let page: HTMLElement;
const onDismiss = vi.fn();
const onTryAgain = vi.fn();

function mount(phase: Phase, run: Run | null): void {
  void act(() => {
    render(
      h(
        Fragment,
        null,
        h(WorkingSheet, {
          phase,
          run,
          now: Date.parse('2026-09-29T10:03:00.000Z'),
          open: true,
          onDismiss,
          onTryAgain,
        }),
        h(OverlayHost, null),
      ),
      root,
    );
  });
}

function dialog(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('[role="dialog"]');
}

function button(name: string): HTMLElement {
  const found = [
    ...document.body.querySelectorAll<HTMLElement>('button, a'),
  ].find((element) => element.textContent?.trim() === name);
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

beforeEach(() => {
  // The page the overlay makes inert (`#app > .shell`).
  const app = document.createElement('div');
  app.id = 'app';
  page = document.createElement('div');
  page.className = 'shell';
  app.append(page);
  document.body.append(app);
  root = document.createElement('div');
  page.append(root);
  onDismiss.mockClear();
  onTryAgain.mockClear();
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

describe('#859: a partly done run', () => {
  it('shows the two board tiles and keeps the buttons in the sheet', () => {
    mount('failed', buildRun('partial'));
    const tiles = [...document.body.querySelectorAll('.run-summary-tile')].map(
      (tile) => tile.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(tiles).toEqual(['1 new note', '1 still in your inbox']);
    expect(button('Finish the tidy-up')).toBeTruthy();
  });

  it('waits behind an overlay the person opened', () => {
    open({
      id: 'own',
      priority: OVERLAY_PRIORITY.own,
      render: () => h('p', { class: 'own' }, 'own'),
    });
    mount('running', buildRun('running'));
    expect(dialog()).toBeNull();
    expect(queuedOverlays().map((entry) => entry.id)).toEqual([
      'working-sheet',
    ]);
    act(() => {
      close('own');
    });
    expect(dialog()).not.toBeNull();
  });
});

describe('R-SHEET-1: an Overlay sheet', () => {
  it('is a modal dialog outside the page, which is inert and cannot scroll', () => {
    mount('running', buildRun('running'));
    const panel = dialog();
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    expect(panel?.getAttribute('aria-label')).toBe('Tidying up');
    expect(page.contains(panel)).toBe(false);
    expect(page.hasAttribute('inert')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.querySelector('.overlay--sheet')).not.toBeNull();
    expect(document.body.querySelector('.overlay-scrim')).not.toBeNull();
  });

  it('is named for each state', () => {
    mount('done', buildRun('done'));
    expect(dialog()?.getAttribute('aria-label')).toBe('Tidy-up done');
    mount('failed', buildRun('partial'));
    expect(dialog()?.getAttribute('aria-label')).toBe('Tidy-up partly done');
  });

  it('closes on the scrim and on Close', () => {
    mount('running', buildRun('running'));
    void act(() => {
      button('Close').click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    void act(() => {
      document.body
        .querySelector<HTMLElement>('.overlay-scrim')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});

describe('running (R-SHEET-2, R-SHEET-5, R-BIRD-8)', () => {
  it('shows the title, the steps from phase, the stage and the note', () => {
    mount('running', buildRun('running'));
    const text = dialog()?.textContent ?? '';
    expect(text).toContain('Tidying up 2 things');
    expect(text).toContain('Started');
    expect(text).toContain('usually 3 to 6 min');
    const steps = [
      ...(dialog()?.querySelectorAll('[aria-label="Steps"] li') ?? []),
    ];
    expect(steps).toHaveLength(4);
    expect(steps[2]?.textContent).toContain('Writing notes');
    expect(steps[2]?.textContent).toContain('1 of 2');
    expect(steps[2]?.textContent).toContain('in progress');
    expect(steps[3]?.textContent).toContain('not started');
    expect(text).toContain('the tidy-up bar above the tabs shows how it goes');
    const stage = dialog()?.querySelector<HTMLElement>('.working-sheet-stage');
    expect(stage?.style.height).toBe(`${WORKING_STAGE_HEIGHT}px`);
    expect(stage?.querySelector('.bw--running')).not.toBeNull();
  });

  it('never plays Hello: the stage bird is the tidying one', () => {
    mount('running', buildRun('running'));
    const bird = dialog()?.querySelector('.working-sheet-stage .bw-stage svg');
    expect(bird?.getAttribute('class') ?? '').not.toContain('hello');
  });

  it('falls back to one indeterminate step without a phase', () => {
    mount('running', buildRun('running', { phase: undefined }));
    const steps = dialog()?.querySelectorAll('[aria-label="Steps"] li');
    expect(steps).toHaveLength(1);
    expect(steps?.[0]?.textContent).toContain('Working on it');
  });

  it('before the run exists it still shows the sheet (starting)', () => {
    mount('starting', null);
    expect(dialog()?.textContent).toContain('Tidying up');
  });
});

describe('done (R-SHEET-2, R-SHEET-3, R-SHEET-6)', () => {
  it('shows the tiles, the quote with the bird, the rows and See everything', () => {
    mount(
      'done',
      buildRun('done', {
        runId: 'run-9',
        added: 'I compared the flats and added them to your table.',
      }),
    );
    const text = dialog()?.textContent ?? '';
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Done');
    expect(
      dialog()?.querySelector('[aria-label="What this tidy-up did"]'),
    ).not.toBeNull();
    expect(text).toContain(
      'I compared the flats and added them to your table.',
    );
    const rows = [...(dialog()?.querySelectorAll('.working-sheet-row') ?? [])];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.textContent).toMatch(/New note|Updated|Filed|Needs you/);
    const see = button('See everything');
    expect(see.getAttribute('href')).toBe('/just-filed?run=run-9');
  });

  it('lists what needs you first', () => {
    mount(
      'done',
      buildRun('done', {
        setAside: [
          { path: '0-Inbox/Floor plan.heic', reason: 'kept-not-read' },
        ],
      }),
    );
    const first = dialog()?.querySelector('.working-sheet-row');
    expect(first?.getAttribute('data-action')).toBe('needs');
    expect(first?.textContent).toContain('Needs you');
  });

  it('lists at most four rows on a phone', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      path: `0-Inbox/File ${index}.pdf`,
      kind: 'file' as const,
      to: `2-Areas/Home/File ${index}.pdf`,
    }));
    mount('done', buildRun('done', { items: many, created: [], updated: [] }));
    expect(dialog()?.querySelectorAll('.working-sheet-row')).toHaveLength(4);
  });
});

describe('partly done (R-SHEET-4)', () => {
  it('says what happened and offers Finish the tidy-up and Not now', () => {
    mount('failed', buildRun('partial'));
    const text = dialog()?.textContent ?? '';
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Partly done');
    expect(text).toContain('then stopped before filing');
    expect(text).toContain(
      'Finish the tidy-up files them without writing the notes again.',
    );
    const stopped = dialog()?.querySelector('.working-sheet-step-stopped');
    expect(stopped?.textContent).toContain('Filing and saving to Drive');
    expect(stopped?.textContent).toContain('stopped');
    expect(button('Not now')).toBeDefined();
  });

  it('Finish the tidy-up goes straight to the confirmation', () => {
    mount('failed', buildRun('partial'));
    void act(() => {
      button('Finish the tidy-up').click();
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });
});

describe('did not finish', () => {
  it('gives the reason and Tidy up again', () => {
    mount('failed', buildRun('failed'));
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Did not finish');
    expect(dialog()?.textContent).toContain('Nothing was lost');
    void act(() => {
      button('Tidy up again').click();
    });
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it('shows no sheet for a vanished folder: the recovery screen takes over', () => {
    mount('failed', buildRun('failed', { reason: 'vault_missing' }));
    expect(dialog()).toBeNull();
  });

  it('a stale run reads as did not finish', () => {
    mount('stale', buildRun('running'));
    expect(dialog()?.querySelector('h2')?.textContent).toBe('Did not finish');
  });
});
