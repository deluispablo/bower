import { plural } from '@/app/words';

/** The line under a thing being added: what it needs from you first, else where it came from. */
export function draftLine(d: { origin: string; missing: boolean; empty: boolean; dup?: string | undefined }, dupWords?: string): string {
  if (d.missing) return 'Add this file again';
  if (d.dup && dupWords) return dupWords;
  if (d.empty) return 'This file is empty. Add it anyway, or take it out.';
  return d.origin;
}

/** After the pile went in: the files that lost their bytes in a reload and were not chosen again. */
export function leftOut(names: readonly string[]): string | null {
  if (!names.length) return null;
  if (names.length === 1) return `${names[0] ?? ''} was left out: choose it again to add it.`;
  return `${plural(names.length, 'file')} were left out (${names.join(', ')}): choose them again to add them.`;
}
