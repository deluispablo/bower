/**
 * The first-run interview (#198, spec D.2): four questions the bird asks
 * once, right after "Building your bower" and before "Start with what you
 * have" (#219) — what the owner will keep here, which languages their notes
 * come in, three areas of their life to start with, and how they like
 * titles and tags written, with an example. `components/interview.tsx`
 * collects the answers (a chip or free text per question); this module is
 * the pure part: turning them into the text `vault-store.tsx` writes to
 * Drive. Replayable from Settings, so every write here only ever replaces
 * its own `## From the interview` section — the rest of `About-Me.md` and
 * `Rules.md`, and any area the owner already has, are left exactly as they
 * were.
 */

import { ruleBullet } from './rules.js';

export interface InterviewAnswers {
  /** What the owner will keep here, in their own words or a chip's label. */
  keep: string;
  /** Which languages their notes come in. */
  languages: string;
  /** One to three areas of their life to start with. */
  areas: readonly string[];
  /** How they like titles and tags written. */
  titleStyle: string;
  /** One example of a title or tag in that style. */
  example: string;
}

/** `About-Me.md` and `Rules.md` as they stand before the interview writes
 * to them, so only the `## From the interview` section changes. */
export interface InterviewExisting {
  aboutMe: string;
  rules: string;
}

/** A `2-Areas/<name>/_<name>.md` folder note the interview would create. */
export interface AreaNote {
  name: string;
  note: string;
}

export interface InterviewFiles {
  /** `About-Me.md`'s full new text. */
  aboutMe: string;
  /** `Rules.md`'s full new text. */
  rules: string;
  /** The area folder notes to create, one per area answered — the caller
   * (`vault-store.tsx`) skips one whose folder already exists. */
  areas: AreaNote[];
}

const INTERVIEW_HEADING = '## From the interview';
const FENCE = /^(```|~~~)/;
const HEADING = /^## /;

function linesOf(text: string): string[] {
  return text.split('\n').map((line) => line.replace(/\r$/, ''));
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** Drops leading, trailing and doubled blank lines; keeps the rest as is. */
function tidyBlanks(lines: readonly string[]): string[] {
  const kept: string[] = [];
  for (const line of lines) {
    if (isBlank(line) && (kept.length === 0 || isBlank(kept.at(-1) ?? ''))) {
      continue;
    }
    kept.push(line);
  }
  while (kept.length > 0 && isBlank(kept.at(-1) ?? '')) kept.pop();
  return kept;
}

interface Chunk {
  /** The heading line as written, or `null` for what comes before the
   * first `## ` heading (frontmatter, title, intro). */
  heading: string | null;
  lines: string[];
}

/** `text` cut at every top-level (`## `) heading outside a fenced code
 * block, `\r` dropped. What comes before the first one is its own chunk
 * with `heading: null`. */
function chunksOf(text: string): Chunk[] {
  const chunks: Chunk[] = [{ heading: null, lines: [] }];
  let inFence = false;
  for (const line of linesOf(text)) {
    const isHeading = !inFence && HEADING.test(line);
    if (FENCE.test(line)) inFence = !inFence;
    if (isHeading) {
      chunks.push({ heading: line, lines: [] });
    } else {
      chunks.at(-1)?.lines.push(line);
    }
  }
  return chunks;
}

/**
 * `text` with the section headed exactly `heading` (a `## ` line) replaced
 * by `heading` followed by `bodyLines`; appended at the end when there is
 * no such section yet. Every other section — and anything before the first
 * heading — is kept, byte for byte but for its own leading, trailing and
 * doubled blank lines being tidied the same way `bodyLines` is. Pure.
 */
export function replaceSection(
  text: string,
  heading: string,
  bodyLines: readonly string[],
): string {
  const chunks = chunksOf(text);
  const next: Chunk = { heading, lines: [...bodyLines] };
  const at = chunks.findIndex((chunk) => chunk.heading === heading);
  if (at >= 0) chunks[at] = next;
  else chunks.push(next);

  const parts: string[] = [];
  for (const chunk of chunks) {
    const lines = tidyBlanks(chunk.lines);
    if (chunk.heading === null) {
      if (lines.length > 0) parts.push(lines.join('\n'));
    } else {
      parts.push([chunk.heading, ...lines].join('\n'));
    }
  }
  return `${parts.join('\n\n')}\n`;
}

/** `- <label>: <value>`, or `null` when `value` is blank — left out of the
 * section rather than written as an empty bullet. */
function bulletLine(label: string, value: string): string | null {
  const v = value.trim();
  return v === '' ? null : `- ${label}: ${v}`;
}

/** The title-and-tag rule line from the style and the example: either half
 * may be blank, and both blank means no rule at all. */
function titleAndTagRule(style: string, example: string): string {
  const s = style.trim();
  const e = example.trim();
  if (s === '') return e === '' ? '' : `e.g. \`${e}\``;
  return e === '' ? s : `${s}, e.g. \`${e}\``;
}

/** `text` with its own section replaced, or `text` unchanged when there is
 * nothing to say (every line would have been blank). */
function withInterviewSection(
  text: string,
  lines: readonly (string | null)[],
): string {
  const kept = lines.filter((line): line is string => line !== null);
  return kept.length === 0
    ? text
    : replaceSection(text, INTERVIEW_HEADING, kept);
}

/** A slash would split the area into a subfolder of its own; nothing else
 * about a Drive name needs escaping here. */
function sanitizeAreaName(name: string): string {
  return name
    .replace(/[/\\]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function areaNoteText(name: string): string {
  return [
    '---',
    'tags: [meta, area]',
    '---',
    '',
    `# ${name}`,
    '',
    'Ongoing area, added from the first-run interview.',
    '',
  ].join('\n');
}

/** `answers.areas`, sanitized, blank and duplicate names dropped, each with
 * its folder note text. */
function areaNotesFor(areas: readonly string[]): AreaNote[] {
  const seen = new Set<string>();
  const notes: AreaNote[] = [];
  for (const raw of areas) {
    const name = sanitizeAreaName(raw);
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    notes.push({ name, note: areaNoteText(name) });
  }
  return notes;
}

/**
 * `answers` turned into `About-Me.md`'s and `Rules.md`'s new text (only
 * their `## From the interview` section changes, created if missing,
 * replaced on replay) and the area folder notes to create. The rule is
 * written in `Rules.md`'s shape (`rules.ts`), dated `on` (`YYYY-MM-DD`).
 * Pure: no Drive, no Date — `vault-store.tsx`'s `runInterview` does the
 * writing and skips an area whose folder already exists.
 */
export function interviewToFiles(
  answers: InterviewAnswers,
  existing: InterviewExisting,
  on: string,
): InterviewFiles {
  const areas = answers.areas.map((a) => a.trim()).filter((a) => a !== '');

  const aboutMe = withInterviewSection(existing.aboutMe, [
    bulletLine('What to keep here', answers.keep),
    bulletLine('Notes come in', answers.languages),
    bulletLine('Areas to start with', areas.join(', ')),
  ]);

  const titles = titleAndTagRule(answers.titleStyle, answers.example);
  const rules = withInterviewSection(existing.rules, [
    titles === '' ? null : ruleBullet(`Titles and tags: ${titles}`, on),
  ]);

  return { aboutMe, rules, areas: areaNotesFor(answers.areas) };
}

/** The interview's copy (#584, board `Flow-01-Welcome`). Kept here, apart
 * from the component, so a test can scan it for the things Bower never
 * asks for. */
export const INTERVIEW_QUESTIONS = [
  'What will you keep here?',
  'Which languages do your notes come in?',
  'Three areas of your life to start with?',
  'How do you like titles and tags written?',
] as const;

export const INTERVIEW_TIP =
  'Bower learns from what you add over time: a contract, a bill, a letter. You never have to hand it anything; add what you want, when you want.';

export const INTERVIEW_KEEP_CHIPS: readonly string[] = [
  'Home and bills',
  'Work',
  'Health',
  'Money',
  'Travel',
  'Studies',
  'A project',
];

/** "Hi Alex. Four quick questions so I file things your way. Skip anything
 * you like." Without a name: "Hi." */
export function interviewGreeting(name?: string): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  const hi = first === '' ? 'Hi.' : `Hi ${first}.`;
  return `${hi} Four quick questions so I file things your way. Skip anything you like.`;
}

/** "1 of 4 · What will you keep here?" for the zero-based `index`. */
export function interviewQuestionLabel(index: number): string {
  const total = INTERVIEW_QUESTIONS.length;
  return `${index + 1} of ${total} · ${INTERVIEW_QUESTIONS[index] ?? ''}`;
}
