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
 */

import { useRef } from 'preact/hooks';
import type { JSX } from 'preact';

import { isDemo } from '../api.js';
import { Bird } from './bird.js';
import { IconSparkle } from './icons.js';
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

export interface TidyConfirmSheetProps {
  /** How many things the sentence counts (see `run-store.ts#tidyUp`). */
  count: number;
  /** "Yes, tidy up": starts the run. */
  onConfirm: () => void;
  /** "Add more first", the backdrop, or Escape: no run starts. */
  onDismiss: () => void;
}

export function TidyConfirmSheet({
  count,
  onConfirm,
  onDismiss,
}: TidyConfirmSheetProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, onDismiss);

  const { lead, rest } = confirmSentenceParts(count);

  return (
    <div class="tidy-confirm">
      <div
        class="tidy-confirm-backdrop"
        aria-hidden="true"
        onClick={onDismiss}
      />
      <div
        ref={panelRef}
        class="tidy-confirm-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Is that everything?"
        tabIndex={-1}
      >
        <Bird state="idle" face="curious" size={84} />
        <h2 class="tidy-confirm-title">Is that everything?</h2>
        <p class="tidy-confirm-text">
          <b>{lead}</b> {rest}
        </p>
        {isDemo() && (
          <p class="tidy-confirm-demo">{DEMO_RECORDING_NOTICE}</p>
        )}
        <button type="button" class="tidy-confirm-button" onClick={onConfirm}>
          <IconSparkle />
          Yes, tidy up
        </button>
        <button
          type="button"
          class="tidy-confirm-button tidy-confirm-button-secondary"
          onClick={onDismiss}
        >
          Add more first
        </button>
      </div>
    </div>
  );
}
