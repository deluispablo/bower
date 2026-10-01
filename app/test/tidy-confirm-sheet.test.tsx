// @vitest-environment jsdom

import { Fragment, h, render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverlayHost } from '../src/components/overlay.js';
import { resetOverlayQueue } from '../src/overlay-queue.js';

const state = vi.hoisted(() => ({ demo: false }));

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  isDemo: () => state.demo,
}));

const {
  TidyConfirmSheet,
  confirmCountLine,
  confirmBreakdownLine,
  CONFIRM_SUB,
  CONFIRM_COST,
  requestConfirmSentenceParts,
  DEMO_RECORDING_NOTICE,
} = await import('../src/components/tidy-confirm-sheet.js');
type TidyConfirmKind = 'tidy' | 'request';
type PileConfirm = import('../src/pile-groups.js').PileConfirm;

let root: HTMLDivElement | undefined;

/**
 * Mounts `TidyConfirmSheet` the way `run-sheets.tsx` does —
 * `{confirmOpen && <TidyConfirmSheet .../>}` — so a dismiss really unmounts
 * it, the same as the note menu and the pin sheet.
 */
function mount(
  count: number,
  onConfirm = vi.fn(),
  onDismiss = vi.fn(),
  kind?: TidyConfirmKind,
  loading = false,
  breakdown?: { files: number; links: number; requests: number },
  extra: { piles?: PileConfirm; uploading?: number } = {},
): { onConfirm: () => void; onDismiss: () => void } {
  function Harness() {
    const [open, setOpen] = useState(true);
    if (!open) return null;
    return h(TidyConfirmSheet, {
      count,
      kind,
      loading,
      breakdown,
      ...extra,
      onConfirm: () => {
        onConfirm();
        setOpen(false);
      },
      onDismiss: () => {
        onDismiss();
        setOpen(false);
      },
    });
  }

  const container = document.createElement('div');
  document.body.append(container);
  root = container;
  void act(() => {
    render(h(Fragment, null, h(Harness, {}), h(OverlayHost, null)), container);
  });
  return { onConfirm, onDismiss };
}

function dialog(): HTMLElement {
  const el = document.querySelector('[role="dialog"]');
  if (el === null) throw new Error('dialog missing');
  return el as HTMLElement;
}

function buttonByText(text: string): HTMLButtonElement {
  const buttons = Array.from(document.querySelectorAll('button'));
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (button === undefined) throw new Error(`button "${text}" missing`);
  return button;
}

function click(el: Element): void {
  void act(() => {
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
}

afterEach(() => {
  const container = root;
  if (container !== undefined) {
    void act(() => {
      render(null, container);
    });
  }
  document.body.replaceChildren();
  resetOverlayQueue();
  root = undefined;
  state.demo = false;
});

describe('confirmCountLine and confirmBreakdownLine (CONF-3, CONF-4)', () => {
  it('singular and plural count', () => {
    expect(confirmCountLine(1)).toBe('1 thing in your inbox');
    expect(confirmCountLine(5)).toBe('5 things in your inbox');
  });

  it('breakdown: files, links, then requests after a dot', () => {
    expect(confirmBreakdownLine({ files: 3, links: 2, requests: 1 })).toBe(
      '3 files, 2 links · and 1 request',
    );
    expect(confirmBreakdownLine({ files: 1, links: 0, requests: 2 })).toBe(
      '1 file · and 2 requests',
    );
    expect(confirmBreakdownLine({ files: 0, links: 0, requests: 1 })).toBe(
      '1 request',
    );
    expect(confirmBreakdownLine({ files: 2, links: 0, requests: 0 })).toBe(
      '2 files',
    );
    expect(
      confirmBreakdownLine({ files: 0, links: 0, requests: 0 }),
    ).toBeNull();
  });
});

describe('TidyConfirmSheet', () => {
  it('shows the bird, the heading, the count and the two buttons, no "Don\'t ask again"', () => {
    mount(3);
    const el = dialog();
    const labelId = el.getAttribute('aria-labelledby');
    expect(labelId).not.toBeNull();
    expect(document.getElementById(labelId ?? '')?.textContent).toBe(
      'Is that everything?',
    );
    expect(el.querySelector('svg')).toBeDefined();
    expect(document.body.textContent).toContain('Is that everything?');
    expect(document.body.textContent).toContain(CONFIRM_SUB);
    expect(document.body.textContent).toContain('3 things in your inbox');
    expect(document.body.textContent).toContain(CONFIRM_COST);
    expect(buttonByText('Yes, tidy up')).toBeDefined();
    expect(buttonByText('Add more first')).toBeDefined();
    expect(document.body.textContent?.toLowerCase()).not.toContain(
      "don't ask again",
    );
  });

  it('singular count reads "1 thing in your inbox"', () => {
    mount(1);
    expect(document.body.textContent).toContain('1 thing in your inbox');
  });

  it('shows a skeleton, never 0, while the listing loads (R-CONF-3)', () => {
    mount(0, vi.fn(), vi.fn(), undefined, true);
    expect(document.body.textContent).not.toContain('0 things');
    expect(document.querySelector('.tidy-confirm-skeleton')).not.toBeNull();
    expect(buttonByText('Yes, tidy up').disabled).toBe(true);
  });

  it('shows the CONF-4 breakdown when given', () => {
    mount(6, vi.fn(), vi.fn(), undefined, false, {
      files: 3,
      links: 2,
      requests: 1,
    });
    expect(document.body.textContent).toContain(
      '3 files, 2 links · and 1 request',
    );
  });

  it('"Yes, tidy up" calls onConfirm', () => {
    const { onConfirm, onDismiss } = mount(2);
    click(buttonByText('Yes, tidy up'));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('"Add more first" calls onDismiss, not onConfirm', () => {
    const { onConfirm, onDismiss } = mount(2);
    click(buttonByText('Add more first'));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('the scrim dismisses without confirming', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { onConfirm, onDismiss } = mount(2);
    // Past useDismissGuard's window: a tap right after opening (#510) must
    // not dismiss, covered in use-dismiss-guard.test.ts; this test is
    // about the backdrop's own dismiss wiring, once that window has
    // passed.
    vi.advanceTimersByTime(350);
    const backdrop = document.querySelector('.overlay-scrim');
    if (backdrop === null) throw new Error('backdrop missing');
    click(backdrop);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('Escape dismisses without confirming', () => {
    const { onConfirm, onDismiss } = mount(2);
    void act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('no amber recording notice outside the demo', () => {
    state.demo = false;
    mount(2);
    expect(document.body.textContent).not.toContain(DEMO_RECORDING_NOTICE);
  });

  it('shows the amber recording notice in a demo build (#363)', () => {
    state.demo = true;
    mount(2);
    expect(document.body.textContent).toContain(DEMO_RECORDING_NOTICE);
  });

  it('the demo build shows the same CONF copy under the amber line (#825)', () => {
    state.demo = true;
    mount(3);
    const text = document.body.textContent ?? '';
    expect(text).toContain(DEMO_RECORDING_NOTICE);
    expect(text).toContain(CONFIRM_SUB);
    expect(text).toContain('3 things in your inbox');
    expect(text).toContain(CONFIRM_COST);
    expect(text.indexOf(DEMO_RECORDING_NOTICE)).toBeLessThan(
      text.indexOf(CONFIRM_SUB),
    );
    expect(text).not.toContain('In your own Bower');
  });

  it('the bird is looking, not idle or curious (#825)', () => {
    mount(2);
    const bird = dialog().querySelector('svg');
    expect(bird?.getAttribute('class')).toContain('p-look');
    expect(bird?.getAttribute('class')).not.toContain('curious');
  });
});

describe('requestConfirmSentenceParts', () => {
  it('singular: "1 request is waiting…"', () => {
    expect(requestConfirmSentenceParts(1)).toEqual({
      lead: '1 request',
      rest: 'is waiting. Do it now runs it on its own, in one turn of your Claude plan.',
    });
  });

  it('plural: "3 requests are waiting…"', () => {
    expect(requestConfirmSentenceParts(3)).toEqual({
      lead: '3 requests',
      rest: 'are waiting. Do it now runs them on their own, in one turn of your Claude plan.',
    });
  });
});

describe('TidyConfirmSheet, kind="request" (#501)', () => {
  it('shows a request-specific title, count line and button, not the tidy-up copy', () => {
    mount(1, vi.fn(), vi.fn(), 'request');
    const el = dialog();
    expect(el.getAttribute('aria-labelledby')).toBe('tidy-confirm-title');
    expect(document.body.textContent).toContain('Run this now?');
    expect(document.body.textContent).toContain('1 request');
    expect(document.body.textContent).toContain('is waiting');
    expect(document.body.textContent).not.toContain('Is that everything?');
    expect(document.body.textContent).not.toContain('the rest of the pile');
    expect(buttonByText('Yes, do it now')).toBeDefined();
    expect(buttonByText('Not now')).toBeDefined();
  });

  it('"Yes, do it now" calls onConfirm', () => {
    const { onConfirm, onDismiss } = mount(1, vi.fn(), vi.fn(), 'request');
    click(buttonByText('Yes, do it now'));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('"Not now" calls onDismiss, not onConfirm', () => {
    const { onConfirm, onDismiss } = mount(2, vi.fn(), vi.fn(), 'request');
    click(buttonByText('Not now'));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('TidyConfirmSheet, kind="tidy" (default, unchanged)', () => {
  it('still shows the whole-inbox copy when kind is left out', () => {
    mount(3);
    expect(document.body.textContent).toContain('Is that everything?');
    expect(document.body.textContent).toContain('the rest of the pile');
  });
});

describe('TidyConfirmSheet, counts agree (#914, R-AD-8, AD-Confirm)', () => {
  it('shows the same count as the sticky button and the running sheet', async () => {
    const { thingsText } = await import('../src/components/pile-sheet.js');
    const { sheetTitle } = await import('../src/components/working-sheet.js');
    const total = 6;
    const piles: PileConfirm = {
      piles: [
        { id: 'a', label: 'From your pile: “Rental applications”', count: 2 },
        { id: 'b', label: 'From your pile: “Two job offers”', count: 4 },
      ],
      elsewhere: 0,
    };
    mount(total, vi.fn(), vi.fn(), undefined, false, undefined, { piles });
    const text = document.body.textContent;
    // The sticky "Tidy up 6 things", the confirm and "Tidying up 6 things".
    expect(`Tidy up ${thingsText(total)}`).toBe('Tidy up 6 things');
    expect(text).toContain(`${thingsText(total)} in 2 piles`);
    expect(sheetTitle('running', total)).toBe('Tidying up 6 things');
    const rows = piles.piles.reduce((sum, pile) => sum + pile.count, 0);
    expect(rows).toBe(total);
    // Bird 56 looking (AD-Confirm), and the two buttons.
    expect(
      document.body.querySelector('.tidy-confirm svg')?.getAttribute('width'),
    ).toBe('56');
    expect(text).toContain('Yes, tidy up');
    expect(text).toContain('Add more first');
  });
});

describe('TidyConfirmSheet, piles (#771, R-PILE-5)', () => {
  const piles: PileConfirm = {
    piles: [
      { id: 'a', label: 'From your pile: “Job offers”', count: 2 },
      { id: 'b', label: 'From your pile: “Flat”', count: 1 },
    ],
    elsewhere: 2,
  };

  it('names the piles, one row each, and what came from elsewhere', () => {
    mount(5, vi.fn(), vi.fn(), undefined, false, undefined, { piles });
    const text = document.body.textContent;
    expect(text).toContain('5 things: 2 piles and 2 added from elsewhere');
    expect(text).toContain('Bower reads each pile with its own note.');
    expect(text).toContain('From your pile: “Job offers”');
    expect(text).toContain('2 things');
    expect(text).toContain('From your pile: “Flat”');
    expect(text).toContain('1 thing');
    expect(text).toContain('Added from elsewhere');
    expect(text).toContain('2 things · no note');
  });

  it('says how many files are still uploading', () => {
    mount(3, vi.fn(), vi.fn(), undefined, false, undefined, { uploading: 2 });
    expect(document.body.textContent).toContain(
      '2 files are still uploading; they join the next tidy-up.',
    );
  });

  it('shows no piles list and no uploading line by default', () => {
    mount(3);
    expect(document.querySelector('.tidy-confirm-piles')).toBeNull();
    expect(document.body.textContent).not.toContain('still uploading');
  });
});
