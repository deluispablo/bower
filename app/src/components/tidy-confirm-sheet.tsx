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
 * The demo build (`isDemo()`) shows the same CONF-2 to CONF-5 copy, with
 * its amber "recording" line on top (#825). A waiting request's own "Do it now" (#501,
 * `Phone-Bower-Requests` board item 2.4) opens this sheet with
 * `kind="request"` instead — its own title, count line and button, about
 * the request rather than a pile of files, in the demo or not.
 */

import type { JSX } from 'preact';

import { isDemo } from '../api.js';
import { Bird } from './bird.js';
import { IconSparkle } from './icons.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import { pileConfirmLine, requestRowLabel } from '../pile-groups.js';
import type { PileConfirm } from '../pile-groups.js';
import { Overlay } from './overlay.js';
import { Queued } from './queued-overlay.js';

import '../styles/tidy-confirm-sheet.css';

/**
 * The demo's extra amber line (#363, `Demo-Tidy-Confirm` board, handover
 * C.10): tidy up in the demo never runs the model, so the confirmation
 * says so before the recording starts. `demo/server.ts`'s scripted run is
 * unchanged; this is copy only.
 */
export const DEMO_RECORDING_NOTICE =
  'Demo: what follows is a recording. Nothing is sent to Claude, nothing is saved.';

/** CONF-2: the line under the title (tidy-up only). */
export const CONFIRM_SUB = 'Tidy up now, or add the rest of the pile first.';

/** CONF-5: what a tidy-up costs; no number (Q4). */
export const CONFIRM_COST =
  'A tidy-up takes a few minutes and uses one run of the Claude plan this Bower runs on.';

/** The piles variant's line under the count (R-PILE-5). */
export const CONFIRM_PILES_NOTE = 'Bower reads each pile with its own note.';

/** R-UPL: files still on their way when the person confirms. */
export function stillUploadingLine(count: number): string {
  return count === 1
    ? '1 file is still uploading; it joins the next tidy-up.'
    : `${count} files are still uploading; they join the next tidy-up.`;
}

/** CONF-3: "5 things in your inbox" / "1 thing in your inbox". */
export function confirmCountLine(count: number): string {
  return `${count} ${count === 1 ? 'thing' : 'things'} in your inbox`;
}

/** What the inbox holds, for the CONF-4 line. */
export interface ConfirmBreakdown {
  files: number;
  links: number;
  requests: number;
}

/**
 * CONF-4: "3 files, 2 links · and 1 request". Zero parts are left out;
 * requests come after the dot; null when there is nothing to break down.
 */
export function confirmBreakdownLine(b: ConfirmBreakdown): string | null {
  const things: string[] = [];
  if (b.files > 0)
    things.push(`${b.files} ${b.files === 1 ? 'file' : 'files'}`);
  if (b.links > 0)
    things.push(`${b.links} ${b.links === 1 ? 'link' : 'links'}`);
  const request =
    b.requests > 0
      ? `${b.requests} ${b.requests === 1 ? 'request' : 'requests'}`
      : null;
  if (request === null) return things.length > 0 ? things.join(', ') : null;
  if (things.length === 0) return request;
  return `${things.join(', ')} · and ${request}`;
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
    rest: `${verb} waiting. Do it now runs ${pronoun} on ${possessive} own, in one turn of the Claude plan this Bower runs on.`,
  };
}

const TITLE_ID = 'tidy-confirm-title';

/** "tidy": the whole-inbox confirmation every Tidy up opens (unchanged).
 * "request": a waiting request's own "Do it now" (#501) — its own title,
 * count line and button, about the request rather than a pile of files. */
export type TidyConfirmKind = 'tidy' | 'request';

export interface TidyConfirmSheetProps {
  /**
   * How many things the sentence counts (see `run-store.ts#tidyUp`/
   * `doItNow`): the shared `inboxCount` total, the same number Add and
   * Home show (R-CONF-2).
   */
  count: number;
  /** The inbox listing has not resolved: a skeleton, never 0 (R-CONF-3). */
  loading?: boolean;
  /** Files, links and requests behind `count`, for the CONF-4 line. */
  breakdown?: ConfirmBreakdown;
  /**
   * The piles behind `count` (R-PILE-5): the line names how many, and each
   * gets a row ("From your pile: “…”"). Absent: the plain dialog.
   */
  piles?: PileConfirm;
  /** Files still uploading (R-UPL); they wait for the next tidy-up. */
  uploading?: number;
  /** Which copy to show (see `TidyConfirmKind`). Defaults to `'tidy'`. */
  kind?: TidyConfirmKind;
  /** "Yes, tidy up"/"Yes, do it now": starts the run. */
  onConfirm: () => void;
  /** The secondary button, the backdrop, or Escape: no run starts. */
  onDismiss: () => void;
}

export function TidyConfirmSheet({
  count,
  loading = false,
  breakdown,
  piles,
  uploading = 0,
  kind = 'tidy',
  onConfirm,
  onDismiss,
}: TidyConfirmSheetProps): JSX.Element {
  const isRequest = kind === 'request';
  const { lead, rest } = requestConfirmSentenceParts(count);
  const title = isRequest ? 'Run this now?' : 'Is that everything?';
  const demoTidy = !isRequest && isDemo();
  const breakdownLine =
    breakdown === undefined ? null : confirmBreakdownLine(breakdown);

  return (
    <Queued id="tidy-confirm" priority={OVERLAY_PRIORITY.run}>
      <Overlay
        kind="dialog"
        labelledBy={TITLE_ID}
        onClose={onDismiss}
        scrimGuardMs={350}
      >
        <div class="tidy-confirm">
          <Bird state="looking" size={56} />
          <h2 id={TITLE_ID} class="tidy-confirm-title">
            {title}
          </h2>
          {isRequest ? (
            <p class="tidy-confirm-text" aria-busy={loading}>
              {loading ? (
                <span
                  class="tidy-confirm-skeleton"
                  role="status"
                  aria-label="Counting your inbox"
                />
              ) : (
                <>
                  <b>{lead}</b> {rest}
                </>
              )}
            </p>
          ) : (
            <>
              {demoTidy && (
                <p class="tidy-confirm-demo">{DEMO_RECORDING_NOTICE}</p>
              )}
              <p class="tidy-confirm-text">{CONFIRM_SUB}</p>
              <div class="tidy-confirm-row" aria-busy={loading}>
                {loading ? (
                  <span
                    class="tidy-confirm-skeleton"
                    role="status"
                    aria-label="Counting your inbox"
                  />
                ) : (
                  <>
                    <b>
                      {piles === undefined
                        ? confirmCountLine(count)
                        : pileConfirmLine(count, piles)}
                    </b>
                    {piles === undefined ? (
                      breakdownLine !== null && <span>{breakdownLine}</span>
                    ) : (
                      <span>{CONFIRM_PILES_NOTE}</span>
                    )}
                  </>
                )}
              </div>
              {!loading && piles !== undefined && (
                <ul class="tidy-confirm-piles" aria-label="Your piles">
                  {piles.piles.map((pile) => (
                    <li key={pile.id}>
                      <span class="tidy-confirm-pile-label">{pile.label}</span>
                      <span class="tidy-confirm-pile-count">
                        {`${pile.count} ${pile.count === 1 ? 'thing' : 'things'}`}
                      </span>
                    </li>
                  ))}
                  {piles.elsewhere > 0 && (
                    <li>
                      <span class="tidy-confirm-pile-label">
                        Added from elsewhere
                      </span>
                      <span class="tidy-confirm-pile-count">
                        {`${piles.elsewhere} ${piles.elsewhere === 1 ? 'thing' : 'things'} · no note`}
                      </span>
                    </li>
                  )}
                  {(piles.requests ?? 0) > 0 && (
                    <li>
                      <span class="tidy-confirm-pile-label">
                        {requestRowLabel(piles.requests ?? 0)}
                      </span>
                      <span class="tidy-confirm-pile-count">
                        {`${piles.requests ?? 0} ${(piles.requests ?? 0) === 1 ? 'thing' : 'things'}`}
                      </span>
                    </li>
                  )}
                </ul>
              )}
              {uploading > 0 && (
                <p class="tidy-confirm-text" role="status">
                  {stillUploadingLine(uploading)}
                </p>
              )}
              <p class="tidy-confirm-text tidy-confirm-cost">{CONFIRM_COST}</p>
            </>
          )}
          <button
            type="button"
            class="tidy-confirm-button"
            disabled={loading}
            onClick={onConfirm}
          >
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
      </Overlay>
    </Queued>
  );
}
