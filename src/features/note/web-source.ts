/** Files a source can name; a name ending so is a file in the folder, never a web address. */
const FILE = /\.(pdf|jpe?g|png|heic|webp|gif|docx?|xlsx?|csv|md|txt|url)$/i;
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

/**
 * A timeline source that is a web address someone saved, as a link: a bare
 * address ("flat-listing.example") opens over https; a full one keeps its
 * scheme and shows without it. Anything else (a file, another scheme) is null.
 */
export function webSource(source: string): { href: string; label: string } | null {
  const s = source.trim();
  const full = /^(https?):\/\/(.+)$/i.exec(s);
  const rest = full ? (full[2] ?? '') : s;
  if (!HOST.test(rest) || FILE.test(rest.replace(/[?#].*$/, ''))) return null;
  return { href: full ? s : `https://${s}`, label: rest };
}
