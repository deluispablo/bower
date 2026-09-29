/**
 * Bower's note box (issue #757, spec §5 and §6.9 R-INS, boards Note-*,
 * Note-Folded-*): the one place a note's insights live. Open it shows the
 * summary lines (each with its origin square), the key facts once, every
 * other field as Details, and what to check. Folded it shows one line: the
 * score, the first key facts and how many things to check. The fold is one
 * device preference for every note (`bower:pref:noteFolded`), open by
 * default. The note page and the file page use this same component.
 */

import { useEffect, useId, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { requestsByTargetPath } from '../bower-tab.js';
import type { RequestRow } from '../bower-tab.js';
import { keyFactsFor, kindById } from '../kinds.js';
import type { Kind } from '../kinds.js';
import { noteMetaFrom } from '../note-meta.js';
import type { NoteMeta } from '../note-meta.js';
import { showToast } from '../toast-store.js';
import { Bird, BowerMark } from './bird.js';
import { chipLabel, Details, questionsFor } from './details.js';
import { inlineFactsText, KeyFacts, scoreName } from './key-facts.js';
import { NoteBody } from './note-body.js';

import '../styles/bower-note-box.css';

/** The device preference: the box is folded on every note (R-INS-5). */
export const NOTE_FOLDED_KEY = 'bower:pref:noteFolded';

export function readNoteFolded(): boolean {
  try {
    return localStorage.getItem(NOTE_FOLDED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeNoteFolded(folded: boolean): void {
  try {
    localStorage.setItem(NOTE_FOLDED_KEY, String(folded));
  } catch {
    // Storage blocked or full: the choice just does not stick.
  }
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

/** "the agent", "the employer", "payroll": who the questions go to. */
export function whoFor(kind: Kind | undefined): string {
  const match = /^Ask (the [^:]+|[^:]+):/.exec(kind?.questionsLabel ?? '');
  return match?.[1] ?? 'the agent';
}

/** The things to check: the note's own section, else the fields the
 * document did not state (R-INS-4). */
export function checkItems(
  kind: Kind | undefined,
  meta: NoteMeta,
  sectionItems: readonly string[],
): { items: string[]; questions: string[] } {
  if (sectionItems.length > 0) {
    return { items: [...sectionItems], questions: [...sectionItems] };
  }
  return {
    items: meta.not_stated.map((key) =>
      kind === undefined ? key.replace(/[_-]+/g, ' ') : chipLabel(kind, key),
    ),
    questions:
      kind === undefined
        ? meta.not_stated.map(
            (key) => `What is the ${key.replace(/[_-]+/g, ' ')}?`,
          )
        : questionsFor(kind, meta.not_stated),
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
): { row: RequestRow; expiresAt: number } | null {
  const running = (requestsByTargetPath(rows).get(path) ?? []).find(
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

function copyLines(lines: readonly string[]): void {
  const clipboard =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard === undefined) {
    showToast("Bower couldn't copy that. Try again.");
    return;
  }
  const noun = lines.length === 1 ? 'question' : 'questions';
  clipboard.writeText(lines.join('\n')).then(
    () => {
      showToast(`Copied ${String(lines.length)} ${noun}`);
    },
    (error: unknown) => {
      console.error('Copying the questions failed', error);
      showToast("Bower couldn't copy that. Try again.");
    },
  );
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
}: BowerNoteBoxProps): JSX.Element {
  const [folded, setFolded] = useState<boolean>(readNoteFolded);
  const [changed, setChanged] = useState(false);
  const bodyId = useId();
  const changeId = useId();
  const [clock, setClock] = useState(() => Date.now());
  const reading =
    path === undefined
      ? null
      : readingRequest(requests, path, clock, updatedAt);
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
      if (event.key === NOTE_FOLDED_KEY) setFolded(readNoteFolded());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const meta = noteMetaFrom(frontmatter);
  const kind = meta.kind === undefined ? undefined : kindById(meta.kind);
  const facts =
    kind === undefined ? [] : keyFactsFor(kind, meta.fields, { score: true });
  const parts = boxParts(html);
  const check = checkItems(kind, meta, checkSection);
  const change = ruleChange(meta.fields);
  const score = facts.find((fact) => fact.tone !== undefined);
  const others = facts.filter((fact) => fact.tone === undefined);

  const toggle = (): void => {
    const next = !folded;
    setFolded(next);
    writeNoteFolded(next);
  };

  if (reading !== null) {
    return (
      <section
        class={`bower-note-box is-reading${extra === undefined ? '' : ` ${extra}`}`}
        aria-label="Bower's note"
      >
        <div class="bower-note-box-head">
          <BowerMark size={20} />
          <span class="bower-note-box-name">{"Bower's note"}</span>
          <span class="bower-note-box-writing">Writing now</span>
        </div>
        <div class="bower-note-box-body bower-note-box-reading" role="status">
          <Bird state="reading" size={64} />
          <p>{readingText(kind, sources)}</p>
          <span
            class="bower-note-box-skeleton"
            aria-hidden="true"
            style="display:block;height:12px;border-radius:6px;background:currentColor;opacity:.12;margin-top:8px"
          />
          <span
            class="bower-note-box-skeleton"
            aria-hidden="true"
            style="display:block;height:12px;width:70%;border-radius:6px;background:currentColor;opacity:.12;margin-top:8px"
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
      <button
        type="button"
        class="bower-note-box-head"
        aria-expanded={!folded}
        aria-controls={bodyId}
        onClick={toggle}
      >
        <BowerMark size={20} />
        <span class="bower-note-box-name">{"Bower's note"}</span>
        <svg
          class="bower-note-box-chevron"
          viewBox="0 0 20 20"
          width="20"
          height="20"
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

      {folded && (
        <p class="bower-note-box-line">
          {score !== undefined && (
            <span
              class={`key-fact-pill key-fact-pill-${score.tone ?? 'fair'}`}
              role="img"
              aria-label={scoreName(score.value)}
            >
              {score.value}
            </span>
          )}
          {others.length > 0 && (
            <span class="bower-note-box-facts">
              {inlineFactsText(others.slice(0, 3))}
            </span>
          )}
          {check.items.length > 0 && (
            <span class="bower-note-box-tocheck">
              {`${String(check.items.length)} to check`}
            </span>
          )}
        </p>
      )}

      <div id={bodyId} class="bower-note-box-body" hidden={folded}>
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

        {(parts.rows !== '' || parts.joined !== '') && (
          <div class="bower-note-box-summary">
            <h3 class="bower-box-title">Summary</h3>
            <NoteBody html={`${parts.legend}${parts.rows}${parts.joined}`} />
          </div>
        )}

        {facts.length > 0 && (
          <div class="bower-note-box-facts-block">
            <h3 class="bower-box-title">Key facts</h3>
            <KeyFacts facts={facts} />
          </div>
        )}

        {kind !== undefined && <Details kind={kind} meta={meta} />}

        {check.items.length > 0 && (
          <div class="bower-note-box-check">
            <h3 class="bower-box-title">What to check</h3>
            <ul class="bower-check-rows">
              {check.items.map((item) => (
                <li class="bower-check-row" key={item}>
                  {item}
                </li>
              ))}
            </ul>
            <button
              type="button"
              class="bower-note-box-copy"
              onClick={() => {
                copyLines(check.questions);
              }}
            >
              {`Copy as questions for ${whoFor(kind)}`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
