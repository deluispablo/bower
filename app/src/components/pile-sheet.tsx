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
import { kindLabel } from '../meta-line.js';
import { displayName } from '../navigation.js';
import { Composer } from './composer.js';
import { Confirm } from './confirm.js';
import { IconClose, IconPlus } from './icons.js';
import { ListRow } from './list-row.js';
import { Overlay, OverlayHeader } from './overlay.js';
import { Queued } from './queued-overlay.js';

/** PILE-2, PILE-3, PILE-4: the note box's words. */
export const PILE_NOTE_LABEL = 'What is this pile?';
export const PILE_NOTE_PLACEHOLDER =
  'For example: five job offers. Score them against my CV and write a CV for the best ones.';
export const PILE_SAVED_LINE =
  'Saved as you type. Bower reads this note with these files only.';

/** S-AD-8: a row's meta line in each state. */
export const IN_INBOX_LINE = 'In your inbox';
export const UPLOADING_LINE = 'Uploading…';
export const FAILED_LINE = 'Could not upload. Try again.';
export const OFFLINE_LINE = 'Waiting for a connection';

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

/** The kind in words for a row (K-14): "PDF", "Spreadsheet", "Link". */
export function rowKindWord(row: Pick<PileRow, 'name' | 'kind'>): string {
  return kindLabel({ name: row.name, mimeType: '' });
}

/** "Kept, not read: …" as it reads after a dot, lower case first. */
function afterDot(line: string): string {
  return line.charAt(0).toLowerCase() + line.slice(1);
}

/**
 * A row's meta line (S-AD-8, AD-Pile): "PDF · in your inbox", "Spreadsheet ·
 * kept, not read: a Google Sheet works instead", "Uploading…", "Could not
 * upload. Try again."
 */
export function rowMeta(row: PileRow): string {
  switch (row.state) {
    case 'uploading':
    case 'queued':
      return UPLOADING_LINE;
    case 'offline':
      return OFFLINE_LINE;
    case 'failed':
      return row.error ?? FAILED_LINE;
    case 'done': {
      const kept = row.note ?? formatPolicy(row.kind).queueLine;
      return `${rowKindWord(row)} · ${afterDot(kept ?? IN_INBOX_LINE)}`;
    }
  }
}

/** What a row reads as its title: a link its address, a file its name
 * without the extension (K-17). */
function rowTitle(row: PileRow): string {
  return row.label === row.name ? displayName(row.name) : row.label;
}

/** The pile's items, one ListRow each (aria-label "In this pile"). */
export function PileRows({
  rows,
  onRemove,
  onRetry,
}: PileRowsProps): JSX.Element {
  return (
    <ul class="pile-rows" aria-label="In this pile">
      {rows.map((row) => {
        const title = rowTitle(row);
        return (
          <li key={row.name} class={`pile-row pile-row-${row.state}`}>
            <ListRow
              item={{ id: row.name, title, name: row.name, mimeType: '' }}
              meta={rowMeta(row)}
              trailing={
                <>
                  {row.state === 'failed' && (
                    <button
                      type="button"
                      class="button-link pile-row-retry"
                      onClick={() => onRetry(row.name)}
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    class="icon-button pile-row-remove"
                    aria-label={`Remove ${title}`}
                    onClick={() => onRemove(row.name)}
                  >
                    <IconClose />
                  </button>
                </>
              }
            />
            {row.state === 'uploading' && (
              <span
                class="pile-row-bar"
                role="progressbar"
                aria-label={`Uploading ${title}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={row.percent}
              >
                <span
                  class="pile-row-bar-fill"
                  style={{ width: `${row.percent}%` }}
                />
              </span>
            )}
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

/** A waiting pile opened (AD-Sheet): a phone sheet, a 440 side panel on
 * desktop, ✕ "Close the pile", the note, the rows, "Add more to this pile"
 * and the destructive "Remove this pile from the inbox" through the one
 * confirm (§3.39). */
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
  const [failed, setFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const saver = useDebouncedSave(onText);
  const count = rows.length;

  async function remove(): Promise<void> {
    setConfirming(false);
    setFailed(false);
    if (await onRemovePile()) onClose();
    else setFailed(true);
  }

  return (
    <>
      {!confirming && (
        <Queued id={`pile-${pile.id}`} priority={OVERLAY_PRIORITY.own}>
          <Overlay kind="sheet" labelledBy={TITLE_ID} onClose={onClose}>
            <div class="overlay-body pile-sheet">
              <OverlayHeader
                titleId={TITLE_ID}
                title={pileTitle(pile.createdAt, now)}
                closeLabel="Close the pile"
                onClose={onClose}
              />
              <p class="pile-sheet-sub">
                {thingsText(count)} · waiting for the next tidy-up
              </p>

              <label class="pile-note-label" for="pile-sheet-note">
                {PILE_NOTE_LABEL}{' '}
                <span class="add-context-optional">optional</span>
              </label>
              <Composer
                id="pile-sheet-note"
                mode="save"
                rows={3}
                label={PILE_NOTE_LABEL}
                placeholder={PILE_NOTE_PLACEHOLDER}
                value={text}
                onChange={(next) => {
                  setText(next);
                  saver.schedule(next);
                }}
                onCommit={(value) => {
                  saver.schedule(value);
                  saver.flush();
                }}
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
                class="button-link pile-more"
                onClick={() => fileInput.current?.click()}
              >
                <IconPlus />
                Add more to this pile
              </button>

              {failed && (
                <p class="add-field-error" role="alert">
                  Could not remove everything. Try again.
                </p>
              )}
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
            </div>
          </Overlay>
        </Queued>
      )}
      {confirming && (
        <Confirm
          action="removePile"
          count={count}
          onConfirm={() => void remove()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
