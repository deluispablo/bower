/** The line under a thing being added: what it needs from you first, else where it came from. */
export function draftLine(d: { origin: string; missing: boolean; empty: boolean; dup?: string | undefined }, dupWords?: string): string {
  if (d.missing) return 'Add this file again';
  if (d.dup && dupWords) return dupWords;
  if (d.empty) return 'This file is empty. Add it anyway, or take it out.';
  return d.origin;
}
