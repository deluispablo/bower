/**
 * B8 lint (TL-P4-50 Q3, Q4, Q7): report-only findings from frozen evidence, rendered whole as Bower's health note.
 * A person's notes get only broken links and duplicate names; Bower's notes also get a missing summary, more than three
 * tags and, only on a complete inbound graph, the orphan check (R24). Nothing here reads or writes Drive.
 */
import { dateOk, NOTE_REFUSED, readTypeTable, validSummary } from '../../src/data/contracts/note-format';
import { isHub } from '../../src/data/contracts/hub';
import { linkTarget } from '../../src/data/contracts/links';
import type { MaintenanceDeclaration, MaintenanceNote } from '../../src/data/contracts/run-manifest';
import { normalizeTag, NOTE_TAGS_MAX, readTagList } from '../../src/data/contracts/tag-format';
import { isRoot, nameOf, parentOf } from '../../src/data/contracts/tree';

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
  after: Readonly<Record<string, { path: string }>>, declaration?: MaintenanceDeclaration,
  originals: readonly { path: string; after: string | null }[] = []): string {
  const sorted = Object.entries(notes).map(([id, note]) => ({ ...note, id,
    lint: note.lint === 'unreadable' || note.lint?.refused ? undefined : note.lint,
    refused: note.lint === 'unreadable', diagnostic: note.lint === 'unreadable' ? null : note.lint?.refused,
  })).sort((a, b) => a.path.localeCompare(b.path));
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
  const originalPaths = bySegment(originals, (original) => keys(original.path));
  const linkedOriginals = new Set<string>();
  const notePaths = bySegment(sorted.map((note) => note.path), keys);
  const unchecked = sorted.filter((note) => !note.lint && !note.refused && !note.diagnostic);
  const broken: string[] = [];
  const inbound = new Map<string, number>();
  for (const note of sorted) {
    for (const raw of note.lint?.links ?? []) {
      const target = linkTarget(raw).replace(/^\/+/, '');
      if (!target) continue;
      for (const { item, key } of originalPaths.get(lastOf(target)) ?? []) {
        if (item.after && matches(key, target)) linkedOriginals.add(item.after);
      }
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
  const tagText = declaration?.sources.find((source) => source.path === '.bower/tags.json')?.text;
  const vocabulary = tagText === undefined ? undefined : readTagList(tagText, false);
  const tagRules = bower.flatMap((note) => [...new Set(note.lint?.tagList ?? [])].flatMap((tag) => {
    const lines: string[] = [];
    if (vocabulary && !vocabulary.error && !vocabulary.tags.includes(tag)) lines.push(`- Tag not on your tag list: ${link(note.path)} has the tag ${tag}.`);
    if ((note.lint?.tagList ?? []).filter((t) => t === tag).length > 1) lines.push(`- Repeated tag: ${link(note.path)} has the tag ${tag} twice.`);
    const slug = normalizeTag(tag);
    if (slug !== tag) lines.push(slug ? `- Tag spelling: ${link(note.path)} has the tag ${tag}; Bower writes it ${slug}.`
      : `- Tag spelling: ${link(note.path)} has a tag Bower cannot use: ${JSON.stringify(tag)}.`);
    return lines;
  }));
  const today = declaration?.at.slice(0, 10);
  const quiet = today ? bower.filter((note) => {
    if (note.lint?.template !== 'project' || note.lint.status !== 'active') return false;
    const latest = (note.lint.active ?? []).filter((date) => dateOk(date) && date <= today).sort().at(-1);
    return latest !== undefined && Date.parse(today) - Date.parse(latest) > 60 * 86400000;
  }).map((note) => `- Quiet project: ${link(note.path)} is active, but its Timeline has nothing new for more than 60 days.`) : [];
  const table = readTypeTable(declaration?.sources.find((source) => source.path === '.bower/type-table.json')?.text ?? null, true);
  const types = !table.writeAllowed ? ['- Types: Bower could not read your list of types, so it used the standard ones.']
    : table.skipped ? [`- Types: Bower skipped ${table.skipped} ${table.skipped === 1 ? 'type' : 'types'} it could not read and kept the others.`] : [];
  const folders = new Set(sorted.filter((note) => note.owner === 'bower' && after[note.id]).map((note) => parentOf(after[note.id]?.path ?? '')));
  const bound = new Set(sorted.flatMap((note) => note.lint?.original && after[note.id]
    ? [`${parentOf(after[note.id]?.path ?? '')}/${note.lint.original}`.toLowerCase()] : []));
  const unlinked = sorted.some((note) => !note.lint) ? [] : originals.flatMap((original) => original.after ? [original.after] : []).filter((path) => folders.has(parentOf(path))
    && !linkedOriginals.has(path) && !bound.has(path.toLowerCase())).map((path) => `- Not linked: no note links to ${link(path)}.`);
  const binned = originals.filter((original) => original.after === null
    && sorted.some((note) => note.owner === 'bower' && parentOf(note.path) === parentOf(original.path)))
    .map((original) => `- Binned: ${original.path} was moved to the Bin.`);
  // An orphan needs the whole inbound graph; About me and Rules are the notes the app opens directly, never linked to.
  const orphans = sorted.some((note) => !note.lint) ? [] : bower.filter((note) => !inbound.has(note.path) && !isRoot(note.path)
    && !isHub(note.path, nameOf(note.path), note.type ?? undefined)).map((note) => `- Nothing links to ${link(note.path)}.`);
  const notChecked = unchecked.filter((note) => placed.get(note.path)).map((note) => `- Waiting: ${link(note.path)}. Bower will check it next time.`);
  const couldNotRead = sorted.filter((note) => note.refused && placed.get(note.path))
    .map((note) => `- Could not read ${link(note.path)}: Bower will try again when it changes.`);
  const diagnostics = sorted.filter((note) => note.diagnostic && placed.get(note.path))
    .map((note) => `- Not checked: ${link(note.path)} ${NOTE_REFUSED[note.diagnostic ?? 'damaged'].replace('This note ', '')}`);
  const unavailable = (declaration?.unavailable ?? []).map((source) =>
    `- Unavailable: Bower could not check your ${source.path === '.bower/tags.json' ? 'tag list' : 'list of types'} this time.`);
  const findings = [...broken, ...duplicates, ...sharedSummaries, ...summaries, ...long, ...dated, ...tags, ...tagRules, ...quiet, ...types, ...orphans, ...unlinked, ...binned];
  const lines = [...notChecked, ...couldNotRead, ...diagnostics, ...unavailable, ...findings];
  return '---\nsummary: What Bower found when it checked the links and names in your notes.\nby: bower\n---\n\n## Bower\'s note\n'
    + (lines.length ? lines.join('\n') : 'No findings in the checked notes.') + '\n';
}
