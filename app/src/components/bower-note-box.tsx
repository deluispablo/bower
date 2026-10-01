/**
 * Bower's note box (issues #757 and #908, spec §3.27 R-NOTEBOX-1 to 3,
 * boards NO-Main, NO-Fold and PF-Main-1280): the one place a note's
 * insights live. Open it keeps today's look: SUMMARY, the points with
 * their origin squares, Details and what to check; no key-fact or score
 * tiles (G-18) and no "Joined from" chips (R-NO-7).
 * Folded it is one 52 px row: the bird, "Bower's note" and "3 points · 1 to
 * check". The fold is remembered per note (`foldedNotes` in `prefs.ts`),
 * open by default. The note page, the file page and the desktop preview
 * column (O-R6, `fold`) use this same component.
 */

import { useEffect, useId, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { requestsForNote } from '../bower-tab.js';
import type { RequestRow } from '../bower-tab.js';
import { kindById, scoreTone } from '../kinds.js';
import type { Kind } from '../kinds.js';
import { noteMetaFrom } from '../note-meta.js';
import type { NoteMeta } from '../note-meta.js';
import { getPref, setPref } from '../prefs.js';
import { Bird, BowerMark } from './bird.js';
import type { BirdState } from './bird.js';
import { chipLabel, Details } from './details.js';
import { NoteBody } from './note-body.js';

import '../styles/bower-note-box.css';

/** The accessible name of a score pill: "Your score 82 of 100". */
export function scoreName(value: string): string | undefined {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? undefined : `Your score ${n} of 100`;
}

/** Where the folds live: the `foldedNotes` preference (`prefs.ts`). */
export const NOTE_FOLDED_KEY = 'bower:pref:foldedNotes';

/** Whether the box of the note at `path` is folded (open by default). */
export function readNoteFolded(path: string | undefined): boolean {
  if (path === undefined) return false;
  return getPref('foldedNotes').includes(path);
}

/** Remembers the fold of the note at `path` (R-NOTEBOX-2, per note). */
export function writeNoteFolded(
  path: string | undefined,
  folded: boolean,
): void {
  if (path === undefined) return;
  const others = getPref('foldedNotes').filter((one) => one !== path);
  setPref('foldedNotes', folded ? [...others, path] : others);
}

/** The folded row's words: "3 points · 1 to check", " · 0 to check"
 * left out (R-NOTEBOX-2). */
export function foldedLine(points: number, toCheck: number): string {
  const head = `${String(points)} ${points === 1 ? 'point' : 'points'}`;
  return toCheck > 0 ? `${head} · ${String(toCheck)} to check` : head;
}

/** How many summary points the rendered rows hold, and how many of them
 * carry "Check". */
export function countPoints(rows: string): {
  points: number;
  toCheck: number;
} {
  if (rows === '') return { points: 0, toCheck: 0 };
  const template = document.createElement('template');
  template.innerHTML = rows;
  const all = template.content.querySelectorAll('.bower-note-row');
  const checks = template.content.querySelectorAll(
    '.bower-note-row.bower-note-check',
  );
  return { points: all.length, toCheck: checks.length };
}

/**
 * Splits a rendered note at the end of its opening Bower boxes: what comes
 * first (Bower's note and "Joined from") and the rest (the contents strip
 * and the body). Key facts and Details sit between the two (board
 * `Phone-Note-Details`). A note that does not open with a box has an empty
 * `top`.
 */
export function splitOpening(html: string): { top: string; rest: string } {
  const template = document.createElement('template');
  template.innerHTML = html;
  const top: string[] = [];
  const children = Array.from(template.content.children);
  let taken = 0;
  for (const child of children) {
    if (
      !child.classList.contains('bower-note') &&
      !child.classList.contains('bower-joined')
    ) {
      break;
    }
    top.push(child.outerHTML);
    taken += 1;
  }
  const rest = children
    .slice(taken)
    .map((child) => child.outerHTML)
    .join('\n');
  return { top: top.join('\n'), rest };
}

/** The pieces of a rendered `.bower-note` box (renderer output). */
export interface BoxParts {
  /** `<div class="bower-note-legend">…</div>`, or '' when no origins. */
  legend: string;
  /** `<ul class="bower-note-rows">…</ul>`, or ''. */
  rows: string;
  /** The "Joined from" chips, or ''. */
  joined: string;
}

/** Takes the top box's rendered HTML apart; the box's own title goes. */
export function boxParts(html: string): BoxParts {
  const template = document.createElement('template');
  template.innerHTML = html;
  const part = (selector: string): string =>
    template.content.querySelector(selector)?.outerHTML ?? '';
  return {
    legend: part('.bower-note-legend'),
    rows: part('.bower-note-rows'),
    joined: part('.bower-joined'),
  };
}

/** Headings that open a note's own "What to check" section (R-INS-4). */
const CHECK_HEADINGS: readonly string[] = [
  'what to check',
  'before you apply, check',
];

/**
 * Takes the "What to check" section out of the body: its list items as text,
 * and the rest of the HTML without the heading and its list, so the note
 * does not say it twice. No such section: no items, the HTML unchanged.
 */
export function takeCheckSection(html: string): {
  items: string[];
  rest: string;
} {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const heading of Array.from(
    template.content.querySelectorAll('h1,h2,h3,h4'),
  )) {
    const text = (heading.textContent ?? '').trim().toLowerCase();
    if (!CHECK_HEADINGS.includes(text)) continue;
    const list = heading.nextElementSibling;
    if (list === null || (list.tagName !== 'UL' && list.tagName !== 'OL')) {
      continue;
    }
    const items = Array.from(list.querySelectorAll('li'))
      .map((item) => (item.textContent ?? '').trim())
      .filter((item) => item !== '');
    heading.remove();
    list.remove();
    const holder = document.createElement('div');
    holder.append(template.content);
    return { items, rest: holder.innerHTML };
  }
  return { items: [], rest: html };
}

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

function localDay(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "today" or "29 Sep" for an ISO date; the text itself for anything else. */
export function updatedWhen(value: string, now: Date = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) return value;
  if (match[0] === localDay(now)) return 'today';
  const month = MONTHS[Number(match[2]) - 1];
  return month === undefined ? value : `${String(Number(match[3]))} ${month}`;
}

export interface VerdictRow {
  /** The score as a whole number, 0 to 100. */
  score: string;
  tone: 'good' | 'fair' | 'low';
  /** "Apply first", "Worth a look", "Skip": as the agent wrote it. */
  verdict: string;
}

/**
 * The decision row (R-VERDICT-1): only when the frontmatter has a numeric
 * `score` (or `fit`) and a `verdict`. The box text is never parsed; the
 * agent's "why" line stays in the Summary rows.
 */
export function verdictRow(fields: Record<string, unknown>): VerdictRow | null {
  const verdict =
    typeof fields.verdict === 'string' ? fields.verdict.trim() : '';
  if (verdict === '') return null;
  for (const key of ['score', 'fit']) {
    const raw = fields[key];
    const n =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(raw)
          ? Number(raw)
          : Number.NaN;
    if (!Number.isFinite(n) || n < 0 || n > 100) continue;
    return { score: String(Math.round(n)), tone: scoreTone(n), verdict };
  }
  return null;
}

function oneLine(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** The blue rule-change line and the "Before today" text (R-INS-3). Null
 * when there is no `bower_change`. */
export function ruleChange(
  fields: Record<string, unknown>,
  now: Date = new Date(),
): { line: string; before: string } | null {
  const change = oneLine(fields.bower_change);
  if (change === '') return null;
  const date = oneLine(fields.bower_updated);
  const when = date === '' ? '' : ` ${updatedWhen(date, now)}`;
  return {
    line: `Updated${when} · ${change}`,
    before: oneLine(fields.bower_before),
  };
}

/** The things to check: the note's own section, else the fields the
 * document did not state (R-INS-4). */
export function checkItems(
  kind: Kind | undefined,
  meta: NoteMeta,
  sectionItems: readonly string[],
): { items: string[] } {
  if (sectionItems.length > 0) {
    return { items: [...sectionItems] };
  }
  return {
    items: meta.not_stated.map((key) =>
      kind === undefined ? key.replace(/[_-]+/g, ' ') : chipLabel(kind, key),
    ),
  };
}

/** Without an update for this long, a running request no longer counts
 * (R-BIRD-10). */
export const READING_STALE_MS = 10 * 60_000;

/**
 * The running request whose target is this note, while it is fresh: the row
 * and when it stops counting. `null` when nothing is writing the note, the
 * request ended, or it went 10 minutes without an update (R-BIRD-10).
 * `updatedAt` is the request's last update (ISO-8601); the row's own
 * `since` stands in for it.
 */
export function readingRequest(
  rows: readonly RequestRow[],
  path: string,
  now: number,
  updatedAt?: string,
  names: readonly string[] = [],
): { row: RequestRow; expiresAt: number } | null {
  const running = requestsForNote(rows, path, names).find(
    (row) => row.state === 'tidying',
  );
  if (running === undefined) return null;
  const last = Date.parse(updatedAt ?? running.since);
  if (Number.isNaN(last)) return null;
  const expiresAt = last + READING_STALE_MS;
  return now < expiresAt ? { row: running, expiresAt } : null;
}

/** "the offer", "the listing", "the document": what the kind's "Not in the
 * …" label names. */
export function readingNoun(kind: Kind | undefined): string {
  const match = /^Not (?:in|on) (.+)$/.exec(kind?.notStatedLabel ?? '');
  return match?.[1] ?? 'the document';
}

/** The status line: "Reading the offer and your CV. About a minute; you can
 * keep reading." (up to two sources). */
export function readingText(
  kind: Kind | undefined,
  sources: readonly string[] = [],
): string {
  const named = sources
    .map((source) => source.trim())
    .filter((source) => source !== '')
    .slice(0, 2);
  const what = readingNoun(kind);
  const from = named.length === 0 ? '' : ` and ${named.join(' and ')}`;
  return `Reading ${what}${from}. About a minute; you can keep reading.`;
}

export interface BowerNoteBoxProps {
  /** The rendered top box (`.bower-note` and "Joined from"). */
  html: string;
  /** The note's frontmatter, raw. */
  frontmatter: Record<string, unknown>;
  /** Items of the note's own "What to check" section, when it has one. */
  checkSection?: readonly string[];
  /** Extra class, for the page that hosts the box. */
  class?: string;
  /** This note's path, to find the request writing it (R-BIRD-10). */
  path?: string;
  /** The requests store's rows; a running one aimed at `path` shows the
   * reading state. */
  requests?: readonly RequestRow[];
  /** What the request also reads ("your CV"), at most two are shown. */
  sources?: readonly string[];
  /** The request's last update (ISO-8601), for the 10-minute limit. */
  updatedAt?: string;
  /** Other names the note is asked about by, such as its title: an Ask or
   * Rename request names a note as `[[title]]`. */
  names?: readonly string[];
  /** The fold chevron ("Fold Bower's note"): on the note page and in the
   * desktop preview column (O-R6); `false` keeps the box open with no
   * control (a picture of the box). */
  fold?: boolean;
  /** The preview column's box (PF-Main, LI-Main): the summary only, no
   * Details and no "What to check" with its Copy. */
  summaryOnly?: boolean;
  /** The bird by the box's name: the still mark when left out; a pose
   * (the intro's reading bird, board IN-P2) draws the moving bird at its
   * 40 px floor in the mark's 32 px slot. */
  headBird?: BirdState;
}

export function BowerNoteBox({
  html,
  frontmatter,
  checkSection = [],
  class: extra,
  path,
  requests = [],
  sources = [],
  updatedAt,
  names,
  fold = true,
  summaryOnly = false,
  headBird,
}: BowerNoteBoxProps): JSX.Element {
  const [foldedState, setFolded] = useState<boolean>(() =>
    readNoteFolded(path),
  );
  const folded = fold && foldedState;
  const [changed, setChanged] = useState(false);
  const bodyId = useId();
  const changeId = useId();
  const [clock, setClock] = useState(() => Date.now());
  const reading =
    path === undefined
      ? null
      : readingRequest(requests, path, clock, updatedAt, names);
  const expiresAt = reading?.expiresAt ?? null;

  // Back to the normal box once the request has gone 10 minutes quiet.
  useEffect(() => {
    if (expiresAt === null) return undefined;
    const timer = setTimeout(
      () => {
        setClock(Date.now());
      },
      Math.max(0, expiresAt - Date.now()) + 1,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [expiresAt]);

  // Another box on the page (or another tab) folded: follow it.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === NOTE_FOLDED_KEY) setFolded(readNoteFolded(path));
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [path]);

  // The preview column shows another note: take that note's fold.
  useEffect(() => {
    setFolded(readNoteFolded(path));
  }, [path]);

  const meta = noteMetaFrom(frontmatter);
  const kind = meta.kind === undefined ? undefined : kindById(meta.kind);
  const verdict = verdictRow(meta.fields);
  const parts = boxParts(html);
  const check = checkItems(kind, meta, checkSection);
  const change = ruleChange(meta.fields);
  const counted = countPoints(parts.rows);

  const toggle = (): void => {
    const next = !folded;
    setFolded(next);
    writeNoteFolded(path, next);
  };

  if (reading !== null) {
    return (
      <section
        class={`bower-note-box is-reading${extra === undefined ? '' : ` ${extra}`}`}
        aria-label="Bower's note"
      >
        <div class="bower-note-box-head">
          <BowerMark size={32} />
          <span class="bower-note-box-name">{"Bower's note"}</span>
          <span class="bower-note-box-writing">Writing now</span>
        </div>
        <div class="bower-note-box-body bower-note-box-reading" role="status">
          <Bird state="reading" size={64} />
          <p>{readingText(kind, sources)}</p>
          <span class="bower-note-box-skeleton" aria-hidden="true" />
          <span
            class="bower-note-box-skeleton bower-note-box-skeleton-short"
            aria-hidden="true"
          />
        </div>
      </section>
    );
  }

  return (
    <section
      class={`bower-note-box${folded ? ' is-folded' : ''}${extra === undefined ? '' : ` ${extra}`}`}
      aria-label="Bower's note"
    >
      <div class="bower-note-box-head">
        {headBird === undefined ? (
          <BowerMark size={32} />
        ) : (
          <span class="bower-note-box-head-bird">
            <Bird state={headBird} size={40} />
          </span>
        )}
        <span class="bower-note-box-name">{"Bower's note"}</span>
        {folded && counted.points > 0 && (
          <span class="bower-note-box-line">
            {foldedLine(counted.points, counted.toCheck)}
          </span>
        )}
        {fold && (
          <button
            type="button"
            class="bower-note-box-fold"
            aria-label="Fold Bower's note"
            aria-expanded={!folded}
            aria-controls={bodyId}
            onClick={toggle}
          >
            <svg
              class="bower-note-box-chevron"
              viewBox="0 0 20 20"
              width="16"
              height="16"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M5 8l5 5 5-5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      <div id={bodyId} class="bower-note-box-body" hidden={folded}>
        {verdict !== null && (
          <p class="bower-note-box-verdict">
            <span
              class={`key-fact-pill key-fact-pill-${verdict.tone}`}
              role="img"
              aria-label={scoreName(verdict.score)}
            >
              {verdict.score}
            </span>
            <strong>{verdict.verdict}</strong>
          </p>
        )}

        {change !== null && (
          <div class="bower-note-box-updated">
            <p class="bower-note-box-updated-line">
              <span>{change.line}</span>
              {change.before !== '' && (
                <button
                  type="button"
                  class="bower-note-box-changed"
                  aria-expanded={changed}
                  aria-controls={changeId}
                  onClick={() => {
                    setChanged((current) => !current);
                  }}
                >
                  {changed ? 'Hide' : 'What changed'}
                </button>
              )}
            </p>
            {changed && change.before !== '' && (
              <div id={changeId} class="bower-note-box-before">
                <h3 class="bower-box-title">Before today</h3>
                <p>{change.before}</p>
              </div>
            )}
          </div>
        )}

        {/* No "Joined from" chips here: the notes are named in the points
            and in About (R-NO-7); no key-fact or score tiles (G-18). */}
        {parts.rows !== '' && (
          <div class="bower-note-box-summary">
            <h3 class="bower-box-title">Summary</h3>
            <NoteBody html={`${parts.legend}${parts.rows}`} />
          </div>
        )}

        {!summaryOnly && kind !== undefined && (
          <Details kind={kind} meta={meta} />
        )}

        {!summaryOnly && check.items.length > 0 && (
          <div class="bower-note-box-check">
            <h3 class="bower-box-title">What to check</h3>
            <ul class="bower-check-rows">
              {check.items.map((item) => (
                <li class="bower-check-row" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
