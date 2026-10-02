/**
 * "Questions about this" (#1003): the questions asked about one file or
 * note, under Bower's note on its page. An answer stays in `Answers/`
 * (the owner's ruling of 2 Oct 2026); rules v26 books it with the item as
 * its original, so its `index.md` row ends `· [[<item path>]]`, and that
 * row is what ties it here (the answer's frontmatter has no `original`).
 * A question still in the inbox (`About <name>: <question>`) shows too, as
 * "Asked <day>: <question> · waiting for the next tidy-up". Hidden when
 * there is nothing to show.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import type { RequestRow } from '../bower-tab.js';
import type { DriveFile } from '../drive.js';
import { CATALOGUE_PATH } from '../file-origin.js';
import { dayWords } from '../meta-line.js';
import type { VaultIndex } from '../vault-index.js';
import {
  peekCatalogueText,
  readCatalogueText,
} from './use-catalogue-origins.js';

import '../styles/questions-about.css';

/** An answer the catalogue ties to an item. */
export interface AnswerAbout {
  /** The answer note's path, as the row links it. */
  path: string;
  /** Its name without the date and `.md`: "When can I move in". */
  title: string;
  /** `YYYY-MM-DD` from its name, `''` when the name has none. */
  day: string;
}

/** A list item starting with a wikilink: `- [[target|alias]] rest`. */
const ROW = /^\s*[-*+]\s+\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\](.*)$/;
/** A field that is one wikilink and nothing else: `[[path|alias]]`. */
const LINK_FIELD = /^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/;
/** An answer's name: `2026-10-02 When can I move in.md`. */
const DATED_NAME = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/;

function isAnswerRow(path: string, type: string): boolean {
  return (
    path.toLowerCase().startsWith('answers/') || type.toLowerCase() === 'answer'
  );
}

/**
 * The answers `index.md`'s text ties to `itemPath`: rows of an answer (in
 * `Answers/`, or typed Answer) whose last field links to the item, in the
 * catalogue's order. Pure.
 */
export function answersAbout(text: string, itemPath: string): AnswerAbout[] {
  const wanted = itemPath.trim().toLowerCase();
  if (wanted === '') return [];
  const answers: AnswerAbout[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r\n|\r|\n/)) {
    const match = ROW.exec(line);
    const path = match?.[1]?.trim() ?? '';
    if (path === '' || seen.has(path.toLowerCase())) continue;
    const fields = (match?.[2] ?? '')
      .split('·')
      .slice(1)
      .map((field) => field.trim());
    const last = fields[fields.length - 1] ?? '';
    const origin = LINK_FIELD.exec(last)?.[1]?.trim().toLowerCase();
    if (origin !== wanted || !isAnswerRow(path, fields[0] ?? '')) continue;
    seen.add(path.toLowerCase());
    const name = path
      .slice(path.lastIndexOf('/') + 1)
      .replace(/\.md$/i, '')
      .trim();
    const dated = DATED_NAME.exec(name);
    answers.push({
      path,
      title: dated?.[2]?.trim() ?? name,
      day: dated?.[1] ?? '',
    });
  }
  return answers;
}

/** A question about the item still waiting in the inbox. */
export interface WaitingQuestion {
  key: string;
  question: string;
  /** ISO-8601: when it was sent. */
  since: string;
  /** The request note's Drive id, for Undo; `null` while the listing
   * does not have it. */
  fileId: string | null;
}

/**
 * The requests waiting for the next tidy-up that ask about the item by one
 * of `names` (`About <name>: <question>`, as the Ask sheet writes them).
 * Pure.
 */
export function waitingAbout(
  rows: readonly RequestRow[],
  names: readonly string[],
): WaitingQuestion[] {
  const prefixes = names
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .map((name) => `about ${name.toLowerCase()}:`);
  const waiting: WaitingQuestion[] = [];
  for (const row of rows) {
    if (row.state !== 'waiting') continue;
    const text = row.text.trim();
    const prefix = prefixes.find((p) => text.toLowerCase().startsWith(p));
    if (prefix === undefined) continue;
    const question = text.slice(prefix.length).trim();
    if (question === '') continue;
    waiting.push({
      key: row.key,
      question,
      since: row.since,
      fileId: row.fileId,
    });
  }
  return waiting;
}

/** One line of the block. */
export interface QuestionLine {
  key: string;
  text: string;
  /** The answer note's page; `null` for a question still waiting, or an
   * answer the listing does not have. */
  href: string | null;
}

/**
 * The block's lines: each answer, "<title> · <day>" linking to its note,
 * then each waiting question. Pure.
 */
export function questionLines(
  answers: readonly AnswerAbout[],
  waiting: readonly WaitingQuestion[],
  byPath: ReadonlyMap<string, DriveFile>,
  now: number,
): QuestionLine[] {
  const lines: QuestionLine[] = answers.map((answer) => {
    const note = byPath.get(answer.path);
    const when =
      answer.day !== ''
        ? `${answer.day}T12:00:00`
        : (note?.createdTime ?? note?.modifiedTime ?? '');
    const day = when === '' ? '' : dayWords(when, now);
    return {
      key: `answer:${answer.path}`,
      text: day === '' ? answer.title : `${answer.title} · ${day}`,
      href: note === undefined ? null : `/note/${encodeURIComponent(note.id)}`,
    };
  });
  for (const question of waiting) {
    const day = dayWords(question.since, now);
    lines.push({
      key: `waiting:${question.key}`,
      text: `Asked ${day === '' ? '' : `${day}: `}${question.question} · waiting for the next tidy-up`,
      href: null,
    });
  }
  return lines;
}

/** `index.md`'s text through the vault's note cache; `''` until it comes,
 * when there is none or when it cannot be read. */
function useCatalogueText(
  catalogue: DriveFile | undefined,
  getNoteText: (id: string) => Promise<string>,
): string {
  const [text, setText] = useState<string>(
    () => peekCatalogueText(catalogue) ?? '',
  );
  const id = catalogue?.id;
  const version = catalogue?.modifiedTime;
  useEffect(() => {
    let cancelled = false;
    void readCatalogueText(catalogue, getNoteText).then((next) => {
      if (!cancelled) setText(next);
    });
    return () => {
      cancelled = true;
    };
  }, [id, version, getNoteText]);
  return text;
}

export interface QuestionsAboutProps {
  /** The vault path of the file or note on show. */
  path: string;
  /** The names a question about it is asked by (`About <name>: …`). */
  names: readonly string[];
  index: VaultIndex;
  /** The requests store's rows (`useRequestRows`). */
  rows: readonly RequestRow[];
  getNoteText: (id: string) => Promise<string>;
}

export function QuestionsAbout({
  path,
  names,
  index,
  rows,
  getNoteText,
}: QuestionsAboutProps): JSX.Element | null {
  const text = useCatalogueText(index.byPath.get(CATALOGUE_PATH), getNoteText);
  const lines = questionLines(
    answersAbout(text, path),
    waitingAbout(rows, names),
    index.byPath,
    Date.now(),
  );
  if (lines.length === 0) return null;
  return (
    <section class="questions-about" aria-labelledby="questions-about-title">
      <h2 id="questions-about-title" class="questions-about-title">
        Questions about this
      </h2>
      <ul class="questions-about-list">
        {lines.map((line) => (
          <li key={line.key} class="questions-about-line">
            {line.href === null ? (
              <span>{line.text}</span>
            ) : (
              <a href={line.href}>{line.text}</a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
