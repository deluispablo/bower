/**
 * The one title a note shows everywhere (issue #306, spec: titles, never
 * file names): frontmatter `title`, else the note's first `# ` heading,
 * else, for a filed link whose body is nothing but the URL (#557), its
 * host and path, else the file name with its `.md` dropped. Extensions
 * never appear except in the Add queue.
 *
 * `text` is the note's raw text when the caller already has it (the open
 * note, or a cache entry it happened to load for something else); this
 * never fetches or reads a cache itself, so a caller with no text on hand
 * (a list of many notes it never opened) gets the file-name fallback.
 */

import { parseFrontmatter } from './markdown/frontmatter.js';

/** A fenced code block's opening or closing line: three or more backticks
 * or tildes, nothing else that would make it a heading. */
const FENCE = /^(?:`{3,}|~{3,})/;

/** A level-1 ATX heading: `#` then at least one space, not `##…`. */
const HEADING = /^#[ \t]+(.+?)[ \t]*$/;

function stripMdExtension(name: string): string {
  return name.replace(/\.md$/i, '');
}

/** `data.title` as display text, or `null` when there is none worth
 * showing (absent, blank, or not a plain scalar). */
function titleFromFrontmatter(data: Record<string, unknown>): string | null {
  const title = data.title;
  if (typeof title === 'string') {
    const trimmed = title.trim();
    return trimmed === '' ? null : trimmed;
  }
  if (typeof title === 'number' || typeof title === 'boolean') {
    return String(title);
  }
  return null;
}

/**
 * `body` (frontmatter already removed) is one bare `http:`/`https:` URL and
 * nothing else — the way a link pasted into Add is saved (#557,
 * `add.ts#linkNoteName`/`onSaveLink`: no page title fetched, just the URL):
 * its host and path (`add.ts#linkDisplayTitle`'s own logic), the same
 * title Add's own queue row already shows. `null` for anything else,
 * including a note that merely mentions a URL among other text.
 */
function titleFromBareUrl(body: string): string | null {
  const trimmed = body.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./i, '');
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  return `${host}${path}`;
}

/**
 * The first `# ` heading in `body` (the note's text, frontmatter already
 * removed), or `null` when it has none. A heading inside a fenced code
 * block (` ``` ` or `~~~`) is ignored, matching what the renderer itself
 * would show. Handles `\r\n` and bare `\r` line endings.
 */
function firstHeading(body: string): string | null {
  let inFence = false;
  for (const line of body.split(/\r\n|\r|\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING.exec(line);
    if (match !== null) return match[1] ?? null;
  }
  return null;
}

/**
 * The title to show for `file`: frontmatter `title`, else the first `# `
 * heading from `text`, else `file.name` without its `.md` extension.
 * `text` is optional — pass it whenever it is already on hand (the open
 * note's text, a cache hit); left out, the file name is all there is.
 */
export function noteTitle(file: { name: string }, text?: string): string {
  if (text !== undefined) {
    const { data, body } = parseFrontmatter(text);
    const fromFrontmatter = titleFromFrontmatter(data);
    if (fromFrontmatter !== null) return fromFrontmatter;
    const fromHeading = firstHeading(body);
    if (fromHeading !== null) return fromHeading;
    const fromUrl = titleFromBareUrl(body);
    if (fromUrl !== null) return fromUrl;
  }
  return stripMdExtension(file.name);
}
