/**
 * "Is that everything?" (#337, `Phone-Tidy-Confirm` board): the confirmation
 * every Tidy up now opens first, before a run starts — the count and what
 * one run costs, in plain words, with no way to skip it going forward (no
 * "Don't ask again": handover Part C.6). Mounted next to the working sheet
 * (`run-sheets.tsx`, `{confirmOpen && <TidyConfirmSheet .../>}` — mounting
 * fresh on each open, the same as the note menu and the pin sheet, so its
 * focus trap always attaches); the run store (`run-store.tsx`) owns
 * whether it is open and the count it shows.
 *
 * The board's wording differs a little from the issue text ("your Claude
 * plan" for "your plan", "so it is better to add the whole pile first" for
 * "so once is better than five times"); the board is the source of truth
 * (same wording `help-rows.ts` and `Phone-Add.dc.html` already use
 * elsewhere), so this follows it — see the PR's "Left out"/notes.
 *
 * The demo build (`isDemo()`) swaps in its own sentence instead
 * (`demoConfirmSentenceParts`, #489, `Demo-Tidy-Confirm` board): "in the
 * inbox" rather than "waiting", "In your own Bower..." rather than "A
 * tidy-up...", since what follows is a recording. That swap is for the
 * whole-inbox tidy-up only; a waiting request's own "Do it now" (#501,
 * `Phone-Bower-Requests` board item 2.4) opens this sheet with
 * `kind="request"` instead — its own title, count line and button, about
 * the request rather than a pile of files, in the demo or not.
 */

import { useRef } from 'preact/hooks';
import type { JSX } from 'preact';

import { isDemo } from '../api.js';
import { Bird } from './bird.js';
import { IconSparkle } from './icons.js';
import { useDismissGuard } from './use-dismiss-guard.js';
import { useFocusTrap } from './use-focus-trap.js';

import '../styles/tidy-confirm-sheet.css';

/**
 * The demo's extra amber line (#363, `Demo-Tidy-Confirm` board, handover
 * C.10): tidy up in the demo never runs the model, so the confirmation
 * says so before the recording starts. `demo/server.ts`'s scripted run is
 * unchanged; this is copy only.
 */
export const DEMO_RECORDING_NOTICE =
  'Demo: what follows is a recording. Nothing is sent to Claude, nothing is saved.';

/**
 * The count phrase ("1 thing" / "3 things") and the rest of the sentence,
 * split so the count can be bold as on the board. Pure, so it is
 * unit-tested without rendering anything.
 */
export function confirmSentenceParts(count: number): {
  lead: string;
  rest: string;
} {
  const lead = `${count} ${count === 1 ? 'thing' : 'things'}`;
  const verb = count === 1 ? 'is' : 'are';
  return {
    lead,
    rest:
      `${verb} waiting. A tidy-up takes a few minutes and uses one run ` +
      'of your Claude plan, so it is better to add the whole pile first.',
  };
}

/**
 * The demo's own confirmation sentence (#489, `Demo-Tidy-Confirm` board):
 * "in the inbox", not "waiting", and "In your own Bower..." rather than
 * "A tidy-up...", since what follows is a recording, not a real one.
 * Demo build only (`isDemo()`); the real sentence above is unchanged. Only
 * for the whole-inbox tidy-up (`kind === 'tidy'`) — a request's own "Do
 * it now" below keeps its own copy in the demo too.
 */
export function demoConfirmSentenceParts(count: number): {
  lead: string;
  rest: string;
} {
  const lead = `${count} ${count === 1 ? 'thing' : 'things'}`;
  return {
    lead,
    rest:
      'in the inbox. In your own Bower this takes a few minutes and uses ' +
      'one run of your plan, so once is better than five times.',
  };
}

/**
 * The same split for "Do it now" on a request (#501, `Phone-Bower-Requests`
 * board, item 2.4): the count is the request or requests themselves, not
 * files waiting in the inbox, and the run is instructions-only, so the
 * tidy-up's "add the whole pile first" reasoning does not apply.
 */
export function requestConfirmSentenceParts(count: number): {
  lead: string;
  rest: string;
} {
  const lead = `${count} ${count === 1 ? 'request' : 'requests'}`;
  const verb = count === 1 ? 'is' : 'are';
  const pronoun = count === 1 ? 'it' : 'them';
  const possessive = count === 1 ? 'its' : 'their';
  return {
    lead,
    rest: `${verb} waiting. Do it now runs ${pronoun} on ${possessive} own, in one turn of your Claude plan.`,
  };
}

/** "tidy": the whole-inbox confirmation every Tidy up opens (unchanged).
 * "request": a waiting request's own "Do it now" (#501) — its own title,
 * count line and button, about the request rather than a pile of files. */
export type TidyConfirmKind = 'tidy' | 'request';

export interface TidyConfirmSheetProps {
  /** How many things the sentence counts (see `run-store.ts#tidyUp`/`doItNow`). */
  count: number;
  /** Which copy to show (see `TidyConfirmKind`). Defaults to `'tidy'`. */
  kind?: TidyConfirmKind;
  /** "Yes, tidy up"/"Yes, do it now": starts the run. */
  onConfirm: () => void;
  /** The secondary button, the backdrop, or Escape: no run starts. */
  onDismiss: () => void;
}

export function TidyConfirmSheet({
  count,
  kind = 'tidy',
  onConfirm,
  onDismiss,
}: TidyConfirmSheetProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onDismiss);
  const guardedDismiss = useDismissGuard(onDismiss);

  const isRequest = kind === 'request';
  const { lead, rest } = isRequest
    ? requestConfirmSentenceParts(count)
    : isDemo()
      ? demoConfirmSentenceParts(count)
      : confirmSentenceParts(count);
  const title = isRequest ? 'Run this now?' : 'Is that everything?';

  return (
    <div class="tidy-confirm">
      <div
        class="tidy-confirm-backdrop"
        aria-hidden="true"
        onClick={guardedDismiss}
      />
      <div
        ref={panelRef}
        class="tidy-confirm-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <Bird state="idle" face="curious" size={84} />
        <h2 class="tidy-confirm-title">{title}</h2>
        <p class="tidy-confirm-text">
          <b>{lead}</b> {rest}
        </p>
        {isDemo() && <p class="tidy-confirm-demo">{DEMO_RECORDING_NOTICE}</p>}
        <button type="button" class="tidy-confirm-button" onClick={onConfirm}>
          <IconSparkle />
          {isRequest ? 'Yes, do it now' : 'Yes, tidy up'}
        </button>
        <button
          type="button"
          class="tidy-confirm-button tidy-confirm-button-secondary"
          onClick={onDismiss}
        >
          {isRequest ? 'Not now' : 'Add more first'}
        </button>
      </div>
    </div>
  );
}
