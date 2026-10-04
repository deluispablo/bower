import { displayName, nameOf } from './tree';
import type { ChangeEntry } from './types';

/**
 * Names notes had before a rename or move since the last tidy-up, lowercased,
 * each to where the note is now. A [[link]] to an old name keeps working until
 * the tidy-up writes the new name into the notes that link.
 */
export function formerNames(changes: readonly ChangeEntry[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of [...changes].sort((a, b) => a.at - b.at)) {
    if ((c.kind !== 'rename' && c.kind !== 'move') || !c.from || !c.path) continue;
    for (const [k, v] of out) if (v === c.from) out.set(k, c.path);
    const was = displayName(nameOf(c.from)).toLowerCase();
    if (was !== displayName(nameOf(c.path)).toLowerCase()) out.set(was, c.path);
  }
  return out;
}
