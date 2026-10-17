/**
 * B8 lint (TL-P4-50 Q3, Q4, Q7): report-only findings from frozen evidence, rendered whole as Bower's health note.
 * A person's notes get only broken links and duplicate names; Bower's notes also get a missing summary, more than three
 * tags and, only on a complete inbound graph, the orphan check (R24). Nothing here reads or writes Drive.
 */
import { dateOk, validSummary } from '../../src/data/contracts/note-format';
import { isHub } from '../../src/data/contracts/hub';
import { linkTarget } from '../../src/data/contracts/links';
import type { MaintenanceNote } from '../../src/data/contracts/run-manifest';
import { NOTE_TAGS_MAX } from '../../src/data/contracts/tag-format';
import { isRoot, nameOf } from '../../src/data/contracts/tree';

export const HEALTH_NAME = 'Bower health.md';

const title = (path: string): string => nameOf(path).replace(/\.md$/i, '');
const and = (items: string[]): string => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
/** The existing resolver (R25): a bare title or a folder path suffix, with or without `.md`. */
const matches = (key: string, target: string): boolean => key === target || key.endsWith(`/${target}`);
const keys = (path: string): string[] => {
  const lower = path.toLowerCase();
  return lower.endsWith('.md') ? [lower, lower.slice(0, -3)] : [lower];
};

/**
 * The health note from the notes Bower checks at the start of the run (the health note itself never among them), every
 * visible file path a link may name, and each note's place after the run by id. Findings come from the start, named
 * at the place after; a note the run merged away or binned has no place after, so its findings drop (ruling 3).
 * The same frozen inputs always give the same bytes, so an unchanged check writes nothing (AC15).
 */
export function renderHealth(notes: Readonly<Record<string, MaintenanceNote>>, files: readonly string[],
  after: Readonly<Record<string, { path: string }>>): string {
  const sorted = Object.entries(notes).map(([id, note]) => ({ ...note, lint: note.lint === 'unreadable' ? undefined : note.lint, refused: note.lint === 'unreadable', id })).sort((a, b) => a.path.localeCompare(b.path));
  const placed = new Map(sorted.map((note) => [note.path, after[note.id]?.path]));
  // A title two notes share is shown as their places, so the duplicate-name line can tell them apart (R3).
  // Counted over every visible .md file: the checked notes leave out some places (the Inbox).
  const shared = new Map<string, number>();
  for (const path of new Set([...files, ...sorted.map((note) => note.path)].filter((p) => /\.md$/i.test(p)))) {
    shared.set(title(path).toLowerCase(), (shared.get(title(path).toLowerCase()) ?? 0) + 1);
  }
  const link = (path: string): string => {
    const place = (placed.get(path) ?? path).replace(/\.md$/i, '');
    return (shared.get(title(path).toLowerCase()) ?? 0) > 1 ? `[[${place}]]` : `[[${place}|${title(path)}]]`;
  };
  // One lookup by last path segment narrows the candidates; `matches` still decides within them (a bucket of notes
  // sharing a name is scanned whole, which stays small in a folder).
  const lastOf = (s: string): string => s.slice(s.lastIndexOf('/') + 1);
  const bySegment = <T,>(items: readonly T[], keysOf: (item: T) => string[]): Map<string, Array<{ item: T; key: string }>> => {
    const map = new Map<string, Array<{ item: T; key: string }>>();
    for (const item of items) for (const key of keysOf(item)) map.set(lastOf(key), [...(map.get(lastOf(key)) ?? []), { item, key }]);
    return map;
  };
  const targets = bySegment(files, keys);
  const notePaths = bySegment(sorted.map((note) => note.path), keys);
  const unchecked = sorted.filter((note) => !note.lint && !note.refused);
  const broken: string[] = [];
  const inbound = new Map<string, number>();
  for (const note of sorted) {
    for (const raw of note.lint?.links ?? []) {
      const target = linkTarget(raw).replace(/^\/+/, '');
      if (!target) continue;
      if (!targets.get(lastOf(target))?.some(({ key }) => matches(key, target))) {
        if (placed.get(note.path)) broken.push(`- Broken link in ${link(note.path)}: no note is called ${raw.split(/[#^]/)[0]?.trim() ?? raw}.`);
        continue;
      }
      // Self-links never count; a title two notes share counts for both, as Obsidian picks one of them.
      for (const { item: other, key } of notePaths.get(lastOf(target)) ?? []) {
        if (other !== note.path && matches(key, target)) inbound.set(other, (inbound.get(other) ?? 0) + 1);
      }
    }
  }
  const byName = new Map<string, string[]>();
  for (const note of sorted) byName.set(title(note.path).toLowerCase(), [...(byName.get(title(note.path).toLowerCase()) ?? []), note.path]);
  const duplicates = [...byName.values()].map((paths) => paths.filter((path) => placed.get(path))).filter((paths) => paths.length > 1)
    .map((paths) => `- Duplicate name: ${and(paths.map(link))} share the name ${title(paths[0] ?? '')}, so a link to ${title(paths[0] ?? '')} may open either.`);
  const bower = sorted.filter((note) => note.owner === 'bower' && note.lint && placed.get(note.path));
  const summaries = bower.filter((note) => note.lint?.summary === false)
    .map((note) => `- Missing summary: ${link(note.path)} has no summary, so nothing says what it is at a glance.`);
  const dated = bower.filter((note) => (title(note.path).match(/\d{4}-\d{2}-\d{2}/g) ?? []).some(dateOk))
    .map((note) => `- Date in the name: ${link(note.path)} has a date in its name; dates belong in the note's properties.`);
  const long = bower.filter((note) => note.lint?.summary === true && !validSummary(note.summary))
    .map((note) => note.summary.length > 200 ? `- Long summary: ${link(note.path)} has a summary over 200 characters.`
      : `- Summary to fix: ${link(note.path)} has a summary Bower cannot show on one line.`);
  const bySummary = new Map<string, string[]>();
  for (const note of bower.filter((n) => n.lint?.summary === true)) {
    const key = note.summary.trim().toLowerCase();
    bySummary.set(key, [...(bySummary.get(key) ?? []), note.path]);
  }
  const sharedSummaries = [...bySummary.values()].filter((paths) => paths.length > 1)
    .map((paths) => `- Duplicate summary: ${and(paths.map(link))} have the same summary, so it does not tell them apart.`);
  const tags = bower.filter((note) => (note.lint?.tags ?? 0) > NOTE_TAGS_MAX)
    .map((note) => `- Too many tags: ${link(note.path)} has ${note.lint?.tags ?? 0}; Bower keeps ${NOTE_TAGS_MAX} at most.`);
  // An orphan needs the whole inbound graph; About me and Rules are the notes the app opens directly, never linked to.
  const orphans = sorted.some((note) => !note.lint) ? [] : bower.filter((note) => !inbound.has(note.path) && !isRoot(note.path)
    && !isHub(note.path, nameOf(note.path), note.type ?? undefined)).map((note) => `- Nothing links to ${link(note.path)}.`);
  const notChecked = unchecked.filter((note) => placed.get(note.path)).map((note) => `- Waiting: ${link(note.path)}. Bower will check it next time.`);
  const couldNotRead = sorted.filter((note) => note.refused && placed.get(note.path))
    .map((note) => `- Could not read ${link(note.path)}: Bower will try again when it changes.`);
  const findings = [...broken, ...duplicates, ...sharedSummaries, ...summaries, ...long, ...dated, ...tags, ...orphans];
  const lines = [...notChecked, ...couldNotRead, ...findings];
  return '---\nsummary: What Bower found when it checked the links and names in your notes.\nby: bower\n---\n\n## Bower\'s note\n'
    + (lines.length ? lines.join('\n') : 'No findings in the checked notes.') + '\n';
}
