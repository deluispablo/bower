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

/** The note a link names, without a #heading or ^block after it. */
const target = (name: string): string => name.split(/[#^]/)[0]?.trim().toLowerCase() ?? '';

/** Every [[link]] to a former name written with the note's name now (a #heading and a label after | stay). */
export function rewriteLinks(text: string, former: ReadonlyMap<string, string>): string {
  if (!former.size) return text;
  return text.replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, (all, name: string, label: string | undefined) => {
    const now = former.get(target(name));
    const rest = name.slice(name.search(/[#^]/) < 0 ? name.length : name.search(/[#^]/));
    return now ? `[[${displayName(nameOf(now))}${rest}${label ?? ''}]]` : all;
  });
}

/** For a resolver: the note name a link points at, whatever heading follows it. */
export const linkTarget = target;
