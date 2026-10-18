import { displayName, nameOf } from './tree';
import type { ChangeEntry } from './types';

/** A resolved target written as a note link. */
export const renderLink = (target: string): string => `[[${target}]]`;

/**
 * Names notes had before a rename or move since the last tidy-up, lowercased,
 * each to where the note is now. A [[link]] to an old name keeps working until
 * the tidy-up writes the new name into the notes that link. `taken`: names a
 * note has now (lowercased); a former name another note took is not followed.
 */
export function formerNames(changes: readonly ChangeEntry[], taken: ReadonlySet<string> = new Set()): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of [...changes].sort((a, b) => a.at - b.at)) {
    if ((c.kind !== 'rename' && c.kind !== 'move') || !c.from || !c.path) continue;
    const from = c.from;
    const to = c.path;
    // What was renamed before, and is in what moved now (a note in a renamed folder), follows it.
    for (const [k, v] of out) {
      if (v === from) out.set(k, to);
      else if (v.startsWith(`${from}/`)) out.set(k, to + v.slice(from.length));
    }
    const was = displayName(nameOf(from)).toLowerCase();
    if (was !== displayName(nameOf(to)).toLowerCase()) out.set(was, to);
  }
  for (const name of taken) out.delete(name);
  return out;
}

/** Raw matched text, name and optional alias, with a UTF-16 start offset. */
export type WikiLink = [string, string, string | undefined] & { index: number };

/**
 * The one forward-only wikilink scanner for the app and runner. Names and aliases may contain literal `[`;
 * the first pipe separates them, and a single `]` or line ending ends a failed candidate, including nested openers.
 * Normally yields nonoverlapping matches. A token reader may resume with next(offset) after consuming an earlier
 * token; the cached closing bracket and pipe advance without scanning the overlapping suffix again.
 */
export function* scanLinks(text: string): Generator<WikiLink, undefined, number | undefined> {
  let at = 0;
  let end = -1;
  let pipe = -1;
  while (at < text.length) {
    const start = text.indexOf('[[', at);
    if (start < 0) return;
    if (start >= end) {
      end = start + 2;
      pipe = -1;
      while (end < text.length && text[end] !== ']' && text[end] !== '\r' && text[end] !== '\n') {
        if (text[end] === '|' && pipe < 0) pipe = end;
        end++;
      }
      if (text[end] !== ']' || text[end + 1] !== ']') {
        at = end + 1;
        continue;
      }
      if (pipe < 0) pipe = end;
    }
    if (pipe < start + 2) {
      pipe = start + 2;
      while (pipe < end && text[pipe] !== '|') pipe++;
    }
    const match: WikiLink = Object.assign([
      text.slice(start, end + 2), text.slice(start + 2, pipe), pipe < end ? text.slice(pipe + 1, end) : undefined,
    ] as [string, string, string | undefined], { index: start });
    const resume = yield match;
    at = resume === undefined ? end + 2 : Math.max(start + 1, resume);
  }
}

/** Replace recognized links while preserving every unmatched UTF-16 code unit. */
export function replaceLinks(text: string, replace: (all: string, name: string, alias: string | undefined) => string): string {
  const parts: string[] = [];
  let at = 0;
  for (const match of scanLinks(text)) {
    parts.push(text.slice(at, match.index), replace(match[0], match[1], match[2]));
    at = match.index + match[0].length;
  }
  parts.push(text.slice(at));
  return parts.join('');
}

/** Text with each [[link]] as its shown words: the label when not blank, else the name; a link naming nothing stays as written. */
export const plainLinks = (text: string): string =>
  replaceLinks(text, (all, name: string, label: string | undefined) => (name ? (label?.trim() || name).trim() : all));

/** The note a link names, without a #heading or ^block after it. */
const target = (name: string): string => name.split(/[#^]/)[0]?.trim().toLowerCase() ?? '';

/** Every [[link]] to a former name written with the note's name now (a #heading and a label after | stay as written). */
export function rewriteLinks(text: string, former: ReadonlyMap<string, string>): string {
  if (!former.size) return text;
  return replaceLinks(text, (all, name: string, label: string | undefined) => {
    const now = former.get(target(name));
    const rest = name.slice(name.search(/[#^]/) < 0 ? name.length : name.search(/[#^]/));
    return now ? `[[${displayName(nameOf(now))}${rest}${label === undefined ? '' : `|${label}`}]]` : all;
  });
}

/** For a resolver: the note name a link points at, whatever heading follows it. */
export const linkTarget = target;

/** Bare sources ending in a known file extension stay local. Explicit HTTP(S) URLs do not. */
const FILE = /\.(pdf|jpe?g|png|heic|webp|gif|docx?|xlsx?|csv|md|txt|url)$/i;
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]\S*)?$/i;

/** A web citation: full HTTP(S) URLs keep their spelling; dotted bare hosts open over HTTPS. */
export function webSource(source: string): { href: string; label: string } | null {
  const s = source.trim();
  if (/\s/.test(s)) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      if (!url.hostname || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null;
      return { href: s, label: s.replace(/^https?:\/\//i, '') };
    } catch {
      // expected: not a valid web address, so the caller treats it as a note link.
      return null;
    }
  }
  if (!HOST.test(s) || FILE.test(s.replace(/[?#].*$/, ''))) return null;
  return { href: `https://${s}`, label: s };
}
