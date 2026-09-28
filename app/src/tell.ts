/**
 * The instruction-note writer, shared by whatever in the app writes an
 * instruction note (today the Bower tab's box, which a note's "This was
 * misfiled" and Health's "Ask Bower to fix these" prefill). No DOM, no
 * fetch: unit-tested
 * directly. `instructionFileName` and `instructionNote` build the
 * `Bower - …md` instruction note the Instructions workflow reads
 * (`vault-template/CLAUDE.md`); `instructionBody` and
 * `rewriteInstruction` read and rewrite one for the Bower tab's Requests
 * (#344). The Tell Bower screen and its conversation feed are gone
 * (#347), and so is the list of sent sentences this device kept (#344).
 */

/** A note's frontmatter block, with the line break after it. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/;

/** Characters not allowed in a Drive/Windows file name. */
const ILLEGAL_CHARS = /[\\/:*?"<>|]/g;
const MAX_TITLE_LENGTH = 60;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function sanitizeTitle(raw: string): string {
  return raw
    .trim()
    .replace(ILLEGAL_CHARS, '')
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
}

/** The first six whitespace-separated words of `text`, joined by a space. */
function firstSixWords(text: string): string {
  return text.trim().split(/\s+/).slice(0, 6).join(' ');
}

/**
 * `Bower - YYYY-MM-DD HHmm <title>.md`: the title is `title` when given
 * (trimmed), otherwise the first six words of `text`. Either way, characters
 * illegal in a file name are stripped and the title is capped at 60 chars.
 */
export function instructionFileName(
  text: string,
  title: string,
  now: Date,
): string {
  const rawTitle = title.trim() !== '' ? title : firstSixWords(text);
  const cleanTitle = sanitizeTitle(rawTitle);
  const datePart = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const timePart = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `Bower - ${datePart} ${timePart} ${cleanTitle}.md`;
}

/**
 * What an instruction note is, when the app says so (Part D, D.2): the
 * Bower tab's box writes `request` and leaves it to the agent to decide
 * whether the sentence is a rule, a job or a question; Add's "What is
 * this?" box writes `context`, for the files of one batch (#335).
 */
export type InstructionKind = 'request' | 'context';

/**
 * The Markdown content of an instruction note: frontmatter (`tags:
 * [instruction]`, `date`, `via: app`, then `kind` when given) followed by
 * the text as written.
 */
export function instructionNote(
  text: string,
  now: Date,
  kind?: InstructionKind,
): string {
  const kindLine = kind === undefined ? '' : `kind: ${kind}\n`;
  return `---\ntags: [instruction]\ndate: ${now.toISOString()}\nvia: app\n${kindLine}---\n\n${text.trim()}\n`;
}

/**
 * The words of an instruction note: its content without the frontmatter,
 * trimmed. For a context note (#335) that includes its "Applies to" list.
 */
export function instructionBody(note: string): string {
  return note.replace(FRONTMATTER, '').trim();
}

/** Whether the note says it is Add's context note (`kind: context`). */
export function isContextNote(note: string): boolean {
  const head = FRONTMATTER.exec(note)?.[0] ?? '';
  return /^kind:\s*context\s*$/m.test(head);
}

/**
 * The note with its words replaced by `text` (a request's Edit, #344): the
 * frontmatter stays exactly as written, so the note keeps its date, `via`
 * and `kind`.
 */
export function rewriteInstruction(note: string, text: string): string {
  const head = FRONTMATTER.exec(note)?.[0];
  if (head === undefined) return `${text.trim()}\n`;
  return `${head.replace(/\s+$/, '')}\n\n${text.trim()}\n`;
}

// --- The old sent list -------------------------------------------------

/** Where older versions kept a list of what this device sent. */
const SENT_KEY = 'bower.tell.sent';

/**
 * Drops the list of sent sentences older versions kept on the device
 * (Requests now reads everything from the Bower folder, #344). Per-user,
 * so `forget.ts` calls this on sign-out and account deletion. Never
 * throws.
 */
export function clearSent(): void {
  try {
    localStorage.removeItem(SENT_KEY);
  } catch {
    // Storage blocked: nothing to remove.
  }
}

/** The first line of `text`, shortened if it runs long. */
export function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length > 140 ? `${line.slice(0, 140)}…` : line;
}
