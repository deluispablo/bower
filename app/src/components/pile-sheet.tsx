/**
 * The pile's pieces (spec §6.15, boards Add-PileOpen-375, Add-PileFilling-375):
 * the item rows the new pile card and the sheet share, and the pile sheet
 * itself, an Overlay that opens a waiting pile: its note (saved as typed),
 * its files, "Add more to this pile", and "Remove this pile from the inbox".
 * The pure helpers (times, counts, which piles show, a row's state) are
 * exported so they are unit tested apart from the screen.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import type { Pile, PileItemState } from '../pile-store.js';
import { formatPolicy } from '../formats.js';
import type { FileKind } from '../vault-index.js';
import { fileKind } from '../vault-index.js';
import { IconCheck, IconClose } from './icons.js';
import { KindBadge } from './kind-badge.js';
import { Overlay } from './overlay.js';
import { Queued } from './queued-overlay.js';

/** PILE-2, PILE-3, PILE-4: the note box's words. */
export const PILE_NOTE_LABEL = 'What is this pile?';
export const PILE_NOTE_PLACEHOLDER =
  'For example: five job offers. Score them against my CV and write a CV for the best ones.';
export const PILE_SAVED_LINE =
  'Saved in your inbox as you type. Bower reads it with these files only.';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "today" or "12 Oct" for the day a pile started (local time). */
export function pileDay(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  if (sameDay(at, now)) return 'today';
  return `${at.getDate()} ${MONTHS[at.getMonth()] ?? ''}`;
}

/** "10:42" for the time a pile started (local time). */
export function pileTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
}

/** PILE-10: "Pile from today, 10:42". */
export function pileTitle(iso: string, now: Date = new Date()): string {
  return `Pile from ${pileDay(iso, now)}, ${pileTime(iso)}`;
}

/** "1 thing", "5 things". */
export function thingsText(count: number): string {
  return `${count} ${count === 1 ? 'thing' : 'things'}`;
}

/** The inbox's file names, for telling which of a pile's files are in it. */
export function inboxNameSet(
  files: readonly { name: string; path: string }[],
): Set<string> {
  const names = new Set<string>();
  for (const file of files) {
    if (file.path === `0-Inbox/${file.name}`) names.add(file.name);
  }
  return names;
}

/** A context note's name in the inbox: the one a batch wrote (`Bower -
 * YYYY-MM-DD HHmm Context.md`) or a pile's (`... HHmm-ss Context <xx>.md`,
 * `pileNoteName`). Neither is a thing to tidy. */
const CONTEXT_NOTE_NAME =
  /^Bower - \d{4}-\d{2}-\d{2} \d{4}(?:-\d{2})? Context(?: [0-9a-f]{2})?\.md$/;

export function isContextNoteName(name: string): boolean {
  return CONTEXT_NOTE_NAME.test(name);
}

function isUnfinished(state: PileItemState): boolean {
  return state === 'waiting' || state === 'uploading';
}

/** How many of a pile's files are still on their way. */
export function uploadingCount(pile: Pile): number {
  return pile.items.filter((item) => isUnfinished(item.state)).length;
}

/**
 * The piles Add lists: the one being made (`open`) and the closed ones still
 * waiting (`waiting`). A closed pile whose files a tidy-up already moved out
 * of the inbox is gone from the listing, so it is no longer shown.
 */
export function splitPiles(
  piles: readonly Pile[],
  inbox: ReadonlySet<string>,
): { open: Pile | undefined; waiting: Pile[] } {
  const open = piles.find((pile) => !pile.closed);
  const waiting = piles.filter(
    (pile) =>
      pile.closed &&
      pile.items.some(
        (item) => isUnfinished(item.state) || inbox.has(item.name),
      ),
  );
  return { open, waiting };
}

/** The inbox files named in no pile (R-PILE-4). `named` holds the names any
 * pile or context note lists; `requests` are not things and are left out by
 * the caller. */
export function addedFromElsewhere<T extends { name: string }>(
  inboxFiles: readonly T[],
  named: ReadonlySet<string>,
): T[] {
  return inboxFiles.filter((file) => !named.has(file.name));
}

/** Every file name the given piles list. */
export function pileNames(piles: readonly Pile[]): Set<string> {
  const names = new Set<string>();
  for (const pile of piles) {
    for (const item of pile.items) names.add(item.name);
  }
  return names;
}

export type RowState = 'uploading' | 'queued' | 'done' | 'failed' | 'offline';

/** What a row shows: from the pile's own state, the connection, and the
 * percentage the upload reports. */
export function rowState(input: {
  state: PileItemState;
  online: boolean;
  offlineError: boolean;
  percent: number;
}): RowState {
  if (input.state === 'failed') return 'failed';
  if (input.state === 'done') return 'done';
  if (input.offlineError || !input.online) return 'offline';
  return input.state === 'uploading' ? 'uploading' : 'queued';
}

/** One file of a pile, as a row shows it. */
export interface PileRow {
  name: string;
  /** What the row reads: a link shows its address, not its file name. */
  label: string;
  kind: FileKind;
  state: RowState;
  percent: number;
  /** A line for the done state, when the kind's own policy line is not it. */
  note?: string;
  /** What a failed row says, when it is not the connection sentence. */
  error?: string;
}

/** A row's kind from its name alone (a pile item keeps no MIME type). */
export function kindOfName(name: string): FileKind {
  return fileKind({ name, mimeType: '' });
}

export interface PileRowsProps {
  rows: readonly PileRow[];
  onRemove: (name: string) => void;
  onRetry: (name: string) => void;
}

/** The pile's items, one row each (aria-label "In this pile"). */
export function PileRows({
  rows,
  onRemove,
  onRetry,
}: PileRowsProps): JSX.Element {
  return (
    <ul class="pile-rows" aria-label="In this pile">
      {rows.map((row) => {
        const kept = row.note ?? formatPolicy(row.kind).queueLine;
        return (
          <li key={row.name} class={`pile-row pile-row-${row.state}`}>
            <KindBadge kind={row.kind} file={{ name: row.name, mimeType: '' }} />
            <span class="pile-row-body">
              <span class="pile-row-name">{row.label}</span>
              {row.state === 'uploading' && (
                <span class="pile-row-progress">
                  <span
                    class="add-queue-bar"
                    role="progressbar"
                    aria-label={`Uploading ${row.label}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={row.percent}
                  >
                    <span
                      class="add-queue-bar-fill"
                      style={{ width: `${row.percent}%` }}
                    />
                  </span>
                  <span class="pile-row-state">{row.percent}%</span>
                </span>
              )}
              {row.state === 'queued' && (
                <span class="pile-row-state">queued</span>
              )}
              {row.state === 'offline' && (
                <span class="pile-row-state">no signal</span>
              )}
              {row.state === 'done' && (
                <span class="pile-row-state pile-row-ok">
                  <IconCheck />
                  <span class="pile-row-sr">In your inbox</span>
                  {kept !== null && <span>{kept}</span>}
                </span>
              )}
              {row.state === 'failed' && (
                <span class="pile-row-state pile-row-error" role="alert">
                  {row.error ?? 'Could not upload. Check your connection.'}{' '}
                  <button
                    type="button"
                    class="button-link"
                    onClick={() => onRetry(row.name)}
                  >
                    Retry
                  </button>
                </span>
              )}
            </span>
            <button
              type="button"
              class="pile-row-remove"
              aria-label={`Remove ${row.label} from this pile`}
              onClick={() => onRemove(row.name)}
            >
              <IconClose />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Saves a note box as the person types: `schedule` waits `ms` after the last
 * key, `flush` saves at once (on blur, on leaving). `save` reads the latest
 * pile when it runs, so a pile that starts meanwhile still gets the text.
 */
export function useDebouncedSave(
  save: (text: string) => void,
  ms = 1000,
): { schedule: (text: string) => void; flush: () => void } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const latest = useRef(save);
  latest.current = save;
  const flush = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const text = pending.current;
    pending.current = null;
    if (text !== null) latest.current(text);
  };
  const schedule = (text: string): void => {
    pending.current = text;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(flush, ms);
  };
  useEffect(() => flush, []);
  return { schedule, flush };
}

export interface PileSheetProps {
  pile: Pile;
  rows: readonly PileRow[];
  /** A tidy-up is going: the pile cannot be removed (R-PILE-10). */
  running: boolean;
  now?: Date;
  onText: (text: string) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveItem: (name: string) => void;
  onRetry: (name: string) => void;
  /** Sends the pile's files and note to the Bin; resolves `false` when some
   * could not be removed. */
  onRemovePile: () => Promise<boolean>;
  onClose: () => void;
}

const TITLE_ID = 'pile-sheet-title';

export function PileSheet({
  pile,
  rows,
  running,
  now,
  onText,
  onAddFiles,
  onRemoveItem,
  onRetry,
  onRemovePile,
  onClose,
}: PileSheetProps): JSX.Element {
  const [text, setText] = useState(pile.text);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const saver = useDebouncedSave(onText);
  const count = rows.length;

  async function remove(): Promise<void> {
    setRemoving(true);
    setFailed(false);
    try {
      if (await onRemovePile()) onClose();
      else setFailed(true);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Queued id={`pile-${pile.id}`} priority={OVERLAY_PRIORITY.own}>
      <Overlay kind="sheet" labelledBy={TITLE_ID} onClose={onClose}>
        <div class="pile-sheet">
          <h2 id={TITLE_ID} class="pile-sheet-title">
            {pileTitle(pile.createdAt, now)}
          </h2>
          <p class="pile-sheet-sub">
            {thingsText(count)} · waiting for the next tidy-up
          </p>

          <label class="pile-note-label" for="pile-sheet-note">
            {PILE_NOTE_LABEL}{' '}
            <span class="add-context-optional">optional</span>
          </label>
          <textarea
            id="pile-sheet-note"
            class="pile-note"
            rows={3}
            placeholder={PILE_NOTE_PLACEHOLDER}
            value={text}
            onInput={(event) => {
              const next = event.currentTarget.value;
              setText(next);
              saver.schedule(next);
            }}
            onBlur={saver.flush}
          />
          <p class="pile-saved">{PILE_SAVED_LINE}</p>

          <PileRows rows={rows} onRemove={onRemoveItem} onRetry={onRetry} />

          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const input = event.currentTarget;
              if (input.files !== null && input.files.length > 0) {
                onAddFiles(Array.from(input.files));
              }
              input.value = '';
            }}
          />
          <button
            type="button"
            class="button button-secondary pile-more"
            onClick={() => fileInput.current?.click()}
          >
            Add more to this pile
          </button>

          {confirming ? (
            <div class="pile-confirm" role="group" aria-label="Remove this pile">
              <p class="pile-confirm-text">
                {`Remove this pile? Its ${count} ${count === 1 ? 'file goes' : 'files go'} to the Bin in Drive.`}
              </p>
              {failed && (
                <p class="add-field-error" role="alert">
                  Could not remove everything. Try again.
                </p>
              )}
              <div class="pile-confirm-actions">
                <button
                  type="button"
                  class="button pile-remove-yes"
                  disabled={removing || running}
                  onClick={() => void remove()}
                >
                  Remove
                </button>
                <button
                  type="button"
                  class="button button-secondary"
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                class="button-link pile-remove"
                disabled={running}
                aria-disabled={running}
                onClick={() => setConfirming(true)}
              >
                Remove this pile from the inbox
              </button>
              {running && (
                <p class="pile-saved">
                  Bower is tidying up now. You can remove this pile when it is
                  done.
                </p>
              )}
            </>
          )}
        </div>
      </Overlay>
    </Queued>
  );
}
