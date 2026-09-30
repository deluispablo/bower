/**
 * The project front page (issue #794, spec §6.18 R-FRONT-1 to R-FRONT-3,
 * boards Project-Front-375 and Project-Front-1280): opening a project
 * folder shows its project note on top as a card. The card reads the
 * project note's own sections (`## Goal`, `status` in the frontmatter,
 * `## Next steps`, `## Reference`) and the scored notes of the folder, so it
 * never needs a run. Ticking a step writes `- [x]` back into the project
 * note with the `modifiedTime` guard and rolls back with a toast on a
 * conflict. A folder with no project note shows no card.
 *
 * The pure parts (the sections, the tick, the "Best so far" list) are
 * exported for the tests; the card is the component at the end.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { SaveError } from '../drive.js';
import type { DriveFile } from '../drive.js';
import {
  defaultSort,
  extraColumns,
  noteTitle,
  notesOfKind,
  numberOf,
  sortNotes,
} from '../compare.js';
import type { CompareNote } from '../compare.js';
import { KINDS, statusLabel } from '../kinds.js';
import type { Kind } from '../kinds.js';
import { parseFrontmatter, splitFrontmatter } from '../markdown/frontmatter.js';
import { renderPlainMarkdown } from '../markdown/render.js';
import { showToast } from '../toast-store.js';
import { useVault } from '../vault-store.js';
import { FolderMark } from './folder-mark.js';
import type { ParaKind } from './folder-mark.js';

import '../styles/project-front.css';

// --- Pure: the project note's sections ---------------------------------------

/** One line of `## Next steps`. `line` is its 0-based line in the whole
 * note text, so a tick can rewrite exactly that line. */
export interface Step {
  line: number;
  text: string;
  done: boolean;
}

/** One folded entry of `## Reference`: a `###` table or the section itself. */
export interface ReferenceEntry {
  title: string;
  /** Markdown, without its heading. */
  body: string;
}

const STEP_LINE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/;

/** The 0-based line where the note's body starts (after the frontmatter). */
function bodyStart(text: string): number {
  const { lines } = splitFrontmatter(text);
  return lines === null ? 0 : lines.length + 2;
}

/** The `[start, end)` line range under the `## <heading>` line (case
 * ignored), or `null` when the note has no such section. A line starting
 * with `# ` or `## ` ends it. Fenced code is skipped. */
function sectionRange(
  lines: readonly string[],
  from: number,
  heading: string,
): [number, number] | null {
  const wanted = heading.toLowerCase();
  let start = -1;
  let fenced = false;
  for (let i = from; i < lines.length; i++) {
    const line = (lines[i] ?? '').replace(/\r$/, '');
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^(#{1,2})\s+(.*?)\s*#*\s*$/.exec(line);
    if (match === null) continue;
    if (start !== -1) return [start, i];
    if (match[1] === '##' && (match[2] ?? '').toLowerCase() === wanted) {
      start = i + 1;
    }
  }
  return start === -1 ? null : [start, lines.length];
}

/** The steps under `## Next steps`, ticked or not, in note order. */
export function parseSteps(text: string): Step[] {
  const lines = text.split('\n');
  const range = sectionRange(lines, bodyStart(text), 'Next steps');
  if (range === null) return [];
  const steps: Step[] = [];
  for (let i = range[0]; i < range[1]; i++) {
    const match = STEP_LINE.exec((lines[i] ?? '').replace(/\r$/, ''));
    if (match === null) continue;
    const label = (match[4] ?? '').trim();
    if (label === '') continue;
    steps.push({ line: i, text: label, done: match[2] !== ' ' });
  }
  return steps;
}

/**
 * `text` with the checkbox on `line` set to `done`; every other byte stays
 * as it was (line endings too). `null` when that line is no longer a step
 * (the note moved under the card).
 */
export function tickStep(
  text: string,
  line: number,
  done: boolean,
): string | null {
  const lines = text.split('\n');
  const current = lines[line];
  if (current === undefined) return null;
  const cr = current.endsWith('\r') ? '\r' : '';
  const match = STEP_LINE.exec(current.replace(/\r$/, ''));
  if (match === null) return null;
  lines[line] =
    `${match[1] ?? ''}${done ? 'x' : ' '}${match[3] ?? ''}${match[4] ?? ''}${cr}`;
  return lines.join('\n');
}

/** The project's one-line goal: the first line under `## Goal`, else a
 * `goal` frontmatter field. Markdown emphasis and a leading bullet go. */
export function goalOf(text: string): string {
  const lines = text.split('\n');
  const range = sectionRange(lines, bodyStart(text), 'Goal');
  if (range !== null) {
    for (let i = range[0]; i < range[1]; i++) {
      const line = (lines[i] ?? '')
        .replace(/\r$/, '')
        .replace(/^\s*(?:[-*]\s+)?/, '')
        .replace(/[*_`]/g, '')
        .trim();
      if (line !== '') return line;
    }
  }
  const goal = parseFrontmatter(text).data.goal;
  return typeof goal === 'string' ? goal.trim() : '';
}

/** The frontmatter `status` as the pill says it ("Active"), `''` when none. */
export function statusOf(text: string): string {
  const status = parseFrontmatter(text).data.status;
  if (typeof status !== 'string' || status.trim() === '') return '';
  const word = status.trim();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** The folded entries of `## Reference`: one per `###` heading, or the whole
 * section as one "Reference" entry when it has none. */
export function referenceEntries(text: string): ReferenceEntry[] {
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const range = sectionRange(lines, bodyStart(text), 'Reference');
  if (range === null) return [];
  const section = lines.slice(range[0], range[1]);
  const entries: ReferenceEntry[] = [];
  let title: string | null = null;
  let body: string[] = [];
  const flush = (): void => {
    const joined = body.join('\n').trim();
    if (title !== null && joined !== '') entries.push({ title, body: joined });
  };
  const preface: string[] = [];
  for (const line of section) {
    const heading = /^###\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading !== null) {
      flush();
      title = heading[1] ?? '';
      body = [];
    } else if (title === null) {
      preface.push(line);
    } else {
      body.push(line);
    }
  }
  flush();
  if (entries.length === 0) {
    const joined = preface.join('\n').trim();
    return joined === '' ? [] : [{ title: 'Reference', body: joined }];
  }
  return entries;
}

// --- Pure: Best so far -------------------------------------------------------

export const BEST_COUNT = 3;

export interface BestSoFar {
  kind: Kind;
  /** The top notes, best first (`BEST_COUNT` at most). */
  top: CompareNote[];
  /** Every note of the kind, for "Compare all {n} {plural}". */
  total: number;
}

/** A note's score: `score`, else `fit`; `null` when it has neither. */
export function scoreOf(note: Pick<CompareNote, 'fields'>): number | null {
  return numberOf(note.fields.score) ?? numberOf(note.fields.fit);
}

/** The verdict word the note carries (`verdict` in its frontmatter, written
 * by Bower), `''` when it has none. */
export function verdictOf(note: Pick<CompareNote, 'fields'>): string {
  const verdict = note.fields.verdict;
  return typeof verdict === 'string' ? verdict.trim() : '';
}

/**
 * R-FRONT-3: the folder's scored notes of its most-scored kind, ordered the
 * way Compare orders them (`defaultSort`: score, else fit, best first, ties
 * by the kind's first field then the title), cut to the top three. `null`
 * when no note has a score.
 */
export function bestSoFar(notes: readonly CompareNote[]): BestSoFar | null {
  let best: { kind: Kind; scored: number } | null = null;
  for (const kind of KINDS) {
    const scored = notesOfKind(notes, kind).filter(
      (note) => scoreOf(note) !== null,
    ).length;
    if (scored > 0 && (best === null || scored > best.scored)) {
      best = { kind, scored };
    }
  }
  if (best === null) return null;
  const ofKind = notesOfKind(notes, best.kind);
  const extras = extraColumns(best.kind, ofKind);
  const sort = defaultSort(best.kind, extras);
  const top = sortNotes(best.kind, ofKind, sort, extras)
    .filter((note) => scoreOf(note) !== null)
    .slice(0, BEST_COUNT);
  return { kind: best.kind, top, total: ofKind.length };
}

/** "Apply first · New": the verdict and the status the way Details says it. */
export function rowLine(kind: Kind, note: CompareNote): string {
  return [verdictOf(note), statusLabel(kind, note.fields)]
    .filter((part) => part !== '')
    .join(' · ');
}

const MONTHS: readonly string[] = [
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

/** "updated today", else "updated 26 Sep". */
export function updatedLine(modifiedTime: string | null, now: number): string {
  if (modifiedTime === null) return '';
  const then = new Date(modifiedTime);
  if (Number.isNaN(then.getTime())) return '';
  const today = new Date(now);
  if (then.toDateString() === today.toDateString()) return 'updated today';
  return `updated ${then.getDate()} ${MONTHS[then.getMonth()] ?? ''}`;
}

/** The project note of a folder: the note named like the folder. */
export function projectNoteOf(
  folderName: string,
  notes: readonly DriveFile[],
): DriveFile | undefined {
  const wanted = `${folderName}.md`.toLowerCase();
  return notes.find((note) => note.name.toLowerCase() === wanted);
}

// --- The card ----------------------------------------------------------------

interface Loaded {
  text: string;
  modifiedTime: string | null;
}

export interface ProjectFrontProps {
  /** The folder's display name, which names its project note. */
  folderName: string;
  /** The folder's own notes (`FolderContents.notes`). */
  notes: readonly DriveFile[];
  /** The folder's PARA root, for the mark. */
  para: ParaKind | null;
  /** "Compare all 4 offers" opens the Compare tab; `null` hides the link. */
  compare: { label: string; onOpen: () => void } | null;
}

function noteHref(id: string): string {
  return `/note/${encodeURIComponent(id)}`;
}

export function ProjectFront({
  folderName,
  notes,
  para,
  compare,
}: ProjectFrontProps): JSX.Element | null {
  const { openNoteForEdit, saveEditedNote } = useVault();
  const file = projectNoteOf(folderName, notes);
  const fileKey =
    file === undefined ? '' : `${file.id}:${file.modifiedTime ?? ''}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [scored, setScored] = useState<CompareNote[]>([]);
  // Ticks the person made that are still saving, by line.
  const [pending, setPending] = useState<ReadonlyMap<number, boolean>>(
    new Map(),
  );
  const saving = useRef(false);

  useEffect(() => {
    if (file === undefined) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    openNoteForEdit(file.id).then(
      (note) => {
        if (!cancelled && !saving.current) setLoaded(note);
      },
      (err: unknown) => console.error('Could not read the project note', err),
    );
    return () => {
      cancelled = true;
    };
  }, [fileKey]);

  const notesKey = notes
    .map((note) => `${note.id}:${note.modifiedTime ?? ''}`)
    .join('|');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { loadCompareNotes } = await import('./compare.js');
        const loadedNotes = await loadCompareNotes(
          notes.filter((note) => note.id !== file?.id),
        );
        if (!cancelled) setScored(loadedNotes);
      } catch (err) {
        console.error('Could not read the notes for the front page', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notesKey]);

  const text = loaded?.text ?? '';
  const steps = useMemo(() => parseSteps(text), [text]);
  const goal = useMemo(() => goalOf(text), [text]);
  const status = useMemo(() => statusOf(text), [text]);
  const reference = useMemo(() => referenceEntries(text), [text]);
  const best = useMemo(() => bestSoFar(scored), [scored]);

  if (file === undefined || loaded === null) return null;
  if (
    steps.length === 0 &&
    goal === '' &&
    status === '' &&
    reference.length === 0 &&
    best === null
  ) {
    return null;
  }

  async function tick(step: Step): Promise<void> {
    if (saving.current || file === undefined || loaded === null) return;
    const done = !(pending.get(step.line) ?? step.done);
    const next = tickStep(loaded.text, step.line, done);
    if (next === null) {
      showToast('The project note changed. Your tick was not saved.');
      return;
    }
    saving.current = true;
    setPending(new Map([[step.line, done]]));
    try {
      const saved = await saveEditedNote(file.id, next, {
        baseModifiedTime: loaded.modifiedTime,
      });
      setLoaded(saved);
    } catch (err) {
      console.error('Could not save a tick in the project note', err);
      showToast(
        err instanceof SaveError && err.code === 'conflict'
          ? 'The project note changed. Your tick was not saved.'
          : 'Could not save your tick. Try again.',
      );
      // Show what Drive has now.
      openNoteForEdit(file.id).then(setLoaded, (readErr: unknown) =>
        console.error('Could not read the project note', readErr),
      );
    } finally {
      saving.current = false;
      setPending(new Map());
    }
  }

  const stepsBlock = steps.length > 0 && (
    <section class="project-front-block" aria-labelledby="pf-steps">
      <h3 id="pf-steps" class="project-front-cap">
        Next steps
      </h3>
      <ul class="project-front-steps">
        {steps.map((step) => {
          const done = pending.get(step.line) ?? step.done;
          return (
            <li key={step.line}>
              <label class={`project-front-step${done ? ' is-done' : ''}`}>
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => void tick(step)}
                />
                <span>{step.text}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const bestBlock = best !== null && (
    <section class="project-front-block" aria-labelledby="pf-best">
      <h3 id="pf-best" class="project-front-cap">
        Best so far
      </h3>
      <ol class="project-front-best">
        {best.top.map((note) => {
          const score = scoreOf(note);
          return (
            <li key={note.id}>
              <a class="project-front-best-row" href={noteHref(note.id)}>
                <span class="project-front-score">
                  {score === null ? '' : Math.round(score)}
                </span>
                <span class="project-front-best-text">
                  <span class="project-front-best-title">
                    {noteTitle(note)}
                  </span>
                  <span class="project-front-best-line">
                    {rowLine(best.kind, note)}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      {compare !== null && (
        <button
          type="button"
          class="project-front-link"
          onClick={compare.onOpen}
        >
          {compare.label.replace(/^Compare /, 'Compare all ')}
        </button>
      )}
    </section>
  );

  const updated = updatedLine(file.modifiedTime ?? null, Date.now());

  return (
    <>
      <article class="project-front" aria-label={`${folderName}, project note`}>
        <header class="project-front-head">
          {para !== null && <FolderMark kind={para} size={28} />}
          <h2 class="project-front-title">{folderName}</h2>
          {status !== '' && <span class="project-front-pill">{status}</span>}
        </header>
        {goal !== '' && <p class="project-front-goal">{goal}</p>}
        {(stepsBlock !== false || bestBlock !== false) && (
          <div class="project-front-cols">
            {stepsBlock}
            {bestBlock}
          </div>
        )}
        {reference.length > 0 && (
          <section class="project-front-block" aria-labelledby="pf-ref">
            <h3 id="pf-ref" class="project-front-cap">
              Reference
            </h3>
            {reference.map((entry) => (
              <details key={entry.title} class="project-front-ref">
                <summary>
                  <span>{entry.title}</span>
                  {updated !== '' && <small>{updated}</small>}
                </summary>
                <div
                  class="markdown"
                  dangerouslySetInnerHTML={{
                    __html: renderPlainMarkdown(entry.body),
                  }}
                />
              </details>
            ))}
          </section>
        )}
        <p class="project-front-foot">
          From the project note <a href={noteHref(file.id)}>{file.name}</a>:
          Bower keeps it current, and you can edit it anywhere.
        </p>
      </article>
      <h2 class="project-front-list-heading">In this folder</h2>
    </>
  );
}
