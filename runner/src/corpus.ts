/**
 * The synthetic capability corpus (`testing/corpus/`, P4-A) and its structural scorer.
 *
 * Why here: the runner is where a run's resulting folder and `last-run.json` are produced and where the scripted
 * provider already runs over a pretend Drive, so the scorer and its loader sit beside them. The scorer is pure (no
 * file system, no Drive): it takes a case's `expected.json`, the starting folder and the folder after a run, as maps
 * of path to text, plus the parsed `last-run.json`. A later entry (`original-baseline`, the model slices) reuses it.
 * Semantic expectations are not scored here: each case's `rubric.md` is for the quality reviewer.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Question } from '../../src/data/contracts/types';
import { subjectOf } from '../../src/data/contracts/questions';
import { distinctPaths } from '../../src/data/spine/report';
import { timelineBullets } from '../../src/data/vault/note-format';
import { displayName, nameOf } from '../../src/data/contracts/tree';
import { linkTarget } from '../../src/data/contracts/links';
import { SYSTEM, isRunnerFile } from '../../src/data/vault/layout';

/** The capabilities the corpus covers, by the ids of `docs/P2_ACCEPTANCE.md`. */
export const CORPUS_CAPABILITIES = ['C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C13', 'C15'] as const;
export type CorpusCapability = (typeof CORPUS_CAPABILITIES)[number];

export interface CorpusPile {
  /** What the person wrote about it; empty for a loose thing. */
  line: string;
  /** Names of files under the case's `inbox/`, in the order added. */
  files: string[];
}

/** A question a case starts with: Bower's one question type, as the accepted app wrote it (no subject). */
export type CorpusQuestion = Pick<Question, 'id' | 'text' | 'yes' | 'no' | 'about' | 'askedAt'>;

export interface CorpusJournalLine {
  kind: 'request' | 'rule' | 'answer';
  /** The words, or `yes` / `no` for an answer. */
  text: string;
  questionId?: string;
}

export type CorpusBetween =
  /** A words pile the person adds before the press: `p-<press>-<n>`, `n` counting only that press's words steps. */
  | { kind: 'words'; line: string }
  | { kind: 'edit'; path: string; text: string }
  /** A note the person adds (a later arrival) before the press, in a folder that is there. */
  | { kind: 'create'; path: string; text: string }
  | { kind: 'move'; path: string; to: string }
  | { kind: 'answer'; question: { id: string } | QuestionSubjectExpectation; yes: boolean };

/** A later press; omitted request means a fresh tidy-up, unless a yes already scheduled an answer run. */
export interface CorpusPress {
  between?: CorpusBetween[];
  request?: { kind: 'replay'; id: string } | { kind: 'tidy'; text?: string };
}

/** Note paths resolve to stable Drive ids before comparing a question's typed subject. */
export type QuestionSubjectExpectation =
  | { kind: 'pair'; notes: [string, string] }
  | { kind: 'state'; note: string }
  | { kind: 'inbox'; path: string }
  /** A large request's one question (B12d). */
  | { kind: 'request' }
  | { kind: 'folder' };

export interface CorpusCase {
  id: string;
  capability: CorpusCapability;
  title: string;
  /** `scripted`: the scripted provider does this today; `model`: needs the model (P4 slices), expectations are by hand. */
  covers: 'scripted' | 'model';
  /** `bench:<case>`, `p2-journey:<C0x>` or `new`, and how it was adapted. */
  source: string;
  /** One of the original app's five bench cases, kept unchanged for the speed comparison (TL-P4-01). */
  speedBaseline?: boolean;
  /** A shared starting folder under the corpus root (the original's bench folder), used instead of the case's `folder/`. */
  folderFrom?: string;
  scope: 'all' | 'instructions' | 'undo';
  allowWeb: boolean;
  inbox: CorpusPile[];
  journal: CorpusJournalLine[];
  questions: CorpusQuestion[];
  /** Files of `folder/` that Bower owns (marked `by: bower` in Drive), such as `Rules.md`. */
  bowerOwned: string[];
  /** The person changes the same folder after run 1, before run 2. */
  between?: CorpusBetween[];
  /** Later presses on the same Drive; legacy `between` still supplies one second press. */
  presses?: CorpusPress[];
}

export interface ReportExpectation {
  /** How many things were filed. */
  filed?: number;
  /** For a case where the model may ask about a thing it cannot place: at least this many filed. */
  filedAtLeast?: number;
  created?: string[];
  updated?: string[];
  /** For cases where the model chooses names: at least this many. */
  createdAtLeast?: number;
  updatedAtLeast?: number;
  /** At most this many questions (a bounded ask). */
  questionsAtMost?: number;
  questionsExactly?: number;
  pairSubject?: { kind: 'pair'; notes: [string, string] };
  questionSubjects?: QuestionSubjectExpectation[];
  setAside?: number;
  /** Question ids. */
  questions?: string[];
  requests?: string[];
  rulesWorded?: number;
  yourChanges?: number;
}

export interface NoteExpectation {
  path: string;
  /** Text that must appear in the note. */
  contains?: string[];
  /** Text that must not appear. */
  excludes?: string[];
  /** Timeline lines, each a text that must be part of one line of the Timeline. */
  timeline?: string[];
  /** Exactly this many Timeline lines. */
  timelineCount?: number;
  /** At least this many Timeline lines. */
  timelineMin?: number;
}

/** An `under` folder may use `*` for any run of characters inside one folder name ("Areas/Pay*"). */
export interface Placement { files: string[]; allowed: Array<{ under: string; linking?: string }> }

/** The done row of the request whose text is `request` (c09-score AC1): its `done` read apart from every other row's. */
export interface AnswerExpectation {
  request: string;
  contains?: string[];
  excludes?: string[];
  /** The paths the row's `[[links]]` resolve to, in order of first appearance, each once. */
  links?: string[];
}

/** A GFM table of the note at `path`: its header cells and its body rows, exactly and in order (c09-score AC2). */
export interface TableExpectation { path: string; header: string[]; rows: string[][] }

export interface Expected {
  /** One answer per request, read from `.bower/requests.json` as JSON. */
  answers?: AnswerExpectation[];
  tables?: TableExpectation[];
  /** One expectation per press, including the first. Top-level expectations still check the final press. */
  runs?: Expected[];
  /** Compare the raw UTF-8 range with the seeded note; a missing or ambiguous range fails. */
  protectedRanges?: Array<{ path: string; range: { heading: string } | { frontMatter: true } }>;
  /** Drive appProperties, compared directly rather than inferred from Markdown. */
  properties?: Array<{ path: string; absent?: string[]; equals?: Record<string, string> }>;
  /** Paths here may use `*` for any run of characters (a model picks names; the rules fix only the place). */
  files?: { present?: string[]; absent?: string[] };
  /**
   * Where the matched files may be filed (a rubric that allows more than one place). Each file must sit under one
   * `allowed` folder; an entry with `linking` also needs a note among the files that links that note (`[[linking]]`).
   */
  placement?: Placement | Placement[];
  /** Paths of the starting folder that must be byte-identical after the run. */
  unchanged?: string[];
  notes?: NoteExpectation[];
  /** Every `[[link]]` in every note the run wrote resolves to a note or file. */
  linksResolve?: boolean;
  report?: ReportExpectation;
}

export interface LoadedCase extends CorpusCase {
  dir: string;
  /** The starting folder, path to text. */
  folder: Record<string, string>;
  /** Files of the starting folder that are not text (a PDF, a picture), path to bytes. */
  folderBinary: Record<string, Uint8Array>;
  /** The files of the inbox, name to text. */
  inboxFiles: Record<string, string>;
  inboxBinary: Record<string, Uint8Array>;
  expected: Expected;
  rubric: string;
}

/** Every file under `dir`: text decoded as UTF-8, anything else (a PDF, a picture) kept as its bytes. */
async function walk(dir: string): Promise<{ text: Record<string, string>; binary: Record<string, Uint8Array> }> {
  const text: Record<string, string> = {};
  const binary: Record<string, Uint8Array> = {};
  const strict = new TextDecoder('utf-8', { fatal: true });
  const visit = async (d: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return;
      throw e;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.name !== '.gitkeep' && entry.name !== '.DS_Store') {
        const path = relative(dir, full).split('\\').join('/');
        const bytes = await readFile(full);
        try {
          text[path] = strict.decode(bytes);
        } catch {
          binary[path] = new Uint8Array(bytes);
        }
      }
    }
  };
  await visit(dir);
  return { text, binary };
}

export async function loadCase(dir: string): Promise<LoadedCase> {
  const meta = JSON.parse(await readFile(join(dir, 'case.json'), 'utf8')) as CorpusCase;
  const expected = JSON.parse(await readFile(join(dir, 'expected.json'), 'utf8')) as Expected;
  const rubric = await readFile(join(dir, 'rubric.md'), 'utf8');
  const start = await walk(meta.folderFrom ? join(dir, '..', meta.folderFrom) : join(dir, 'folder'));
  const inbox = await walk(join(dir, 'inbox'));
  return { ...meta, dir, folder: start.text, folderBinary: start.binary, inboxFiles: inbox.text, inboxBinary: inbox.binary, expected, rubric };
}

/** Every case under the corpus root, in id order. */
export async function loadCorpus(root: string): Promise<LoadedCase[]> {
  const found = await readdir(root, { withFileTypes: true }).catch(() => []);
  const names = found.filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name).sort();
  return Promise.all(names.map((n) => loadCase(join(root, n))));
}

export interface ScoreInput {
  /** Shown paths by stable Drive id, for typed pair report questions. */
  pathsById?: Readonly<Record<string, string>>;
  expected: Expected;
  /** The starting folder before the run. */
  before: Readonly<Record<string, string>>;
  /** Every file of the folder after the run (not folders, not the Bin), path to text. */
  after: Readonly<Record<string, string>>;
  /** The parsed `.bower/last-run.json`; null when there is none. */
  lastRun: unknown;
}

export interface Score {
  pass: boolean;
  /** One line per unmet expectation. */
  unmet: string[];
}

const LINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

/** The Timeline lines of a note: the bullets of its Timeline section, as the app's one note parser frames it. */
export const timelineOf = timelineBullets;

function reportOf(lastRun: unknown): Record<string, unknown> | null {
  if (!lastRun || typeof lastRun !== 'object') return null;
  const run = (lastRun as { run?: unknown }).run;
  if (!run || typeof run !== 'object') return null;
  const report = (run as { report?: unknown }).report;
  return report && typeof report === 'object' ? (report as Record<string, unknown>) : null;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** The rows of a report list that name a path. */
const paths = (v: unknown): Array<{ path: string }> => list(v).flatMap((x) => (x && typeof x === 'object' && typeof (x as { path?: unknown }).path === 'string' ? [{ path: (x as { path: string }).path }] : []));

/** The paths of the folder a pattern matches: an exact path, or a pattern with `*` for any run of characters. */
function matching(after: Readonly<Record<string, string>>, pattern: string): string[] {
  if (!pattern.includes('*')) return pattern in after ? [pattern] : [];
  const re = new RegExp(`^${pattern.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return Object.keys(after).filter((p) => re.test(p));
}

/** Whether `path` is under the folder `under`; a `*` in it stands for any run of characters inside one folder name. */
function isUnder(path: string, under: string): boolean {
  if (!under.includes('*')) return path.startsWith(`${under}/`);
  return new RegExp(`^${under.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}/`).test(path);
}

/** Whether a `[[target]]` names a note or file of the folder (by name with or without `.md`, or by path). */
function resolves(target: string, after: Readonly<Record<string, string>>): boolean {
  const t = target.trim();
  return Object.keys(after).some((p) => {
    const base = p.split('/').pop() ?? p;
    return p === t || p === `${t}.md` || base === t || base === `${t}.md` || base === `${t}.url`;
  });
}

const EXPECTED_KEYS = ['runs', 'protectedRanges', 'properties', 'files', 'placement', 'unchanged', 'notes', 'linksResolve', 'report', 'answers', 'tables'];
const ANSWER_KEYS = ['request', 'contains', 'excludes', 'links'];
const TABLE_KEYS = ['path', 'header', 'rows'];
/** A misspelt key is unmet, never skipped; only these four places refuse one (c09-score AC3). */
const unknownKeys = (value: unknown, known: string[], where: string): string[] =>
  value && typeof value === 'object' ? Object.keys(value).filter((k) => !known.includes(k)).map((k) => `${where}: unknown key "${k}"`) : [];

/** The files a `[[target]]` could mean: its whole path (a note without `.md`), else the files with that name. */
function linkCandidates(target: string, after: Readonly<Record<string, string>>): string[] {
  const key = linkTarget(target);
  const all = Object.keys(after);
  const whole = all.filter((p) => displayName(p).toLowerCase() === key || p.toLowerCase() === key);
  return whole.length ? whole : all.filter((p) => nameOf(p).toLowerCase() === key || displayName(nameOf(p)).toLowerCase() === key);
}

function scoreAnswer(want: AnswerExpectation, rows: ReadonlyArray<{ text: string; done?: string }>, after: Readonly<Record<string, string>>): string[] {
  const unmet = unknownKeys(want, ANSWER_KEYS, `answers "${want.request}"`);
  // A row with no `done`, or an empty one, is not done; with the same words twice, the one that has `done` counts.
  const found = rows.filter((r) => r.text === want.request && r.done);
  if (found.length !== 1) return [...unmet, found.length ? `answers: ${found.length} rows for "${want.request}"` : `answers: no done row for "${want.request}"`];
  const done = found[0]?.done ?? '';
  const at = `answers "${want.request}"`;
  for (const c of want.contains ?? []) if (!done.includes(c)) unmet.push(`${at}: lacks "${c}"`);
  for (const c of want.excludes ?? []) if (done.includes(c)) unmet.push(`${at}: has "${c}"`);
  if (want.links) {
    const got: string[] = [];
    let clear = true;
    for (const m of done.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      const name = m[1] ?? '';
      const files = linkCandidates(name, after);
      if (files.length !== 1) { clear = false; unmet.push(`${at}: link [[${name}]] ${files.length ? `could be ${files.length} files` : 'does not resolve'}`); }
      else if (!got.includes(files[0] ?? '')) got.push(files[0] ?? '');
    }
    if (clear && JSON.stringify(got) !== JSON.stringify(want.links)) unmet.push(`${at}: links [${got.join(', ')}], expected [${want.links.join(', ')}]`);
  }
  return unmet;
}

/** The cells of one table row: outer pipes dropped, `\|` read as `|`, each cell trimmed. */
const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** The GFM tables of a note outside fenced code: a header row, a delimiter row of as many cells, then body rows up to a blank line. */
function tablesOf(text: string): Array<{ header: string[]; rows: string[][] }> {
  const lines = text.split('\n');
  const found: Array<{ header: string[]; rows: string[][] }> = [];
  let fence = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    // A closing fence: the same character, at least as long, only spaces after it (GFM).
    if (fence) { if (new RegExp(`^\\s{0,3}\\${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = ''; continue; }
    if (open) { fence = open; continue; }
    const header = cells(line);
    if (!line.includes('|') || !DELIMITER.test(lines[i + 1] ?? '') || cells(lines[i + 1] ?? '').length !== header.length) continue;
    const rows: string[][] = [];
    // The table ends at a blank line or another block (heading, quote, fence); the outer scan resumes there.
    for (i += 2; i < lines.length && (lines[i] ?? '').trim() && !/^\s{0,3}(#{1,6}(\s|$)|>|`{3,}|~{3,})/.test(lines[i] ?? ''); i++) rows.push(header.map((_, c) => cells(lines[i] ?? '')[c] ?? ''));
    found.push({ header, rows });
    i--;
  }
  return found;
}

function scoreTable(want: TableExpectation, after: Readonly<Record<string, string>>): string[] {
  const at = `tables ${want.path}`;
  const unmet = unknownKeys(want, TABLE_KEYS, at);
  const text = after[want.path];
  if (text === undefined) return [...unmet, `${at}: missing note`];
  const same = tablesOf(text).filter((t) => JSON.stringify(t.header) === JSON.stringify(want.header));
  if (same.length !== 1) return [...unmet, `${at}: ${same.length ? `${same.length} tables` : 'no table'} with header [${want.header.join(', ')}]`];
  const got = same[0]?.rows ?? [];
  if (JSON.stringify(got) !== JSON.stringify(want.rows)) unmet.push(`${at}: rows ${JSON.stringify(got)}, expected ${JSON.stringify(want.rows)}`);
  return unmet;
}

export function score(input: ScoreInput): Score {
  const { expected, before, after, lastRun } = input;
  const unmet: string[] = [...unknownKeys(expected, EXPECTED_KEYS, 'expected'), ...list(expected.runs).flatMap((r, i) => unknownKeys(r, EXPECTED_KEYS, `runs[${i}]`))];
  if (expected.answers) {
    let file: unknown = null;
    try { file = JSON.parse(after[SYSTEM.requests] ?? ''); } catch { /* not JSON: unmet below */ }
    if (!isRunnerFile(SYSTEM.requests, file)) unmet.push(`answers: ${SYSTEM.requests} is not a requests file`);
    else for (const a of expected.answers) unmet.push(...scoreAnswer(a, file.done, after));
  }
  for (const t of expected.tables ?? []) unmet.push(...scoreTable(t, after));
  for (const p of expected.files?.present ?? []) if (matching(after, p).length === 0) unmet.push(`missing file: ${p}`);
  for (const p of expected.files?.absent ?? []) for (const found of matching(after, p)) unmet.push(`file should not exist: ${found}`);
  for (const { files, allowed } of [expected.placement ?? []].flat()) {
    const placed = files.flatMap((p) => matching(after, p)).filter((p) => !p.startsWith('Inbox/'));
    for (const path of placed) {
      const rule = allowed.find((a) => isUnder(path, a.under));
      if (!rule) unmet.push(`placed outside the rubric: ${path}`);
      else if (rule.linking !== undefined) {
        // The exact link target ([[Garden plot]], [[Garden plot|text]], [[Garden plot#heading]]), not one that starts the same.
        const linksTo = (text: string, target: string): boolean => [...text.matchAll(/\[\[([^\]|#]*)[^\]]*\]\]/g)].some((m) => (m[1] ?? '').trim() === target);
        const inFolder = (q: string): boolean => q.endsWith('.md') && q.startsWith(`${rule.under}/`);
        // Tied together either way: a placed note links the linking note, or the linking note's own lines link a placed note.
        const plot = after[`${rule.under}/${rule.linking}.md`] ?? '';
        const linked = placed.some((q) => inFolder(q) && linksTo(after[q] ?? '', rule.linking ?? '')) || placed.some((q) => linksTo(plot, (q.split('/').pop() ?? '').replace(/\.[^.]+$/, '')));
        if (!linked) unmet.push(`placed under ${rule.under} without a link to [[${rule.linking}]]: ${path}`);
      }
    }
  }
  for (const p of expected.unchanged ?? []) {
    if (!(p in after)) unmet.push(`missing file: ${p} (expected unchanged)`);
    else if (after[p] !== before[p]) unmet.push(`file changed: ${p}`);
  }
  for (const n of expected.notes ?? []) {
    const at = matching(after, n.path)[0];
    const text = at === undefined ? undefined : after[at];
    if (text === undefined) {
      unmet.push(`missing note: ${n.path}`);
      continue;
    }
    for (const c of n.contains ?? []) if (!text.includes(c)) unmet.push(`${n.path}: lacks "${c}"`);
    for (const c of n.excludes ?? []) if (text.includes(c)) unmet.push(`${n.path}: has "${c}"`);
    const lines = timelineOf(text);
    for (const t of n.timeline ?? []) if (!lines.some((l) => l.includes(t))) unmet.push(`${n.path}: no Timeline line with "${t}"`);
    if (n.timelineCount !== undefined && lines.length !== n.timelineCount) unmet.push(`${n.path}: ${lines.length} Timeline lines, expected ${n.timelineCount}`);
    if (n.timelineMin !== undefined && lines.length < n.timelineMin) unmet.push(`${n.path}: ${lines.length} Timeline lines, expected at least ${n.timelineMin}`);
  }
  if (expected.linksResolve) {
    for (const [p, text] of Object.entries(after)) {
      if (!p.endsWith('.md') || p.startsWith('.bower/') || before[p] === text) continue;
      for (const m of text.matchAll(LINK)) if (!resolves(m[1] ?? '', after)) unmet.push(`${p}: link [[${m[1] ?? ''}]] does not resolve`);
    }
  }
  const want = expected.report;
  if (want) {
    const report = reportOf(lastRun);
    if (!report) unmet.push('report: no last-run.json report');
    else {
      if (want.filed !== undefined && list(report.filed).length !== want.filed) unmet.push(`report.filed: ${list(report.filed).length}, expected ${want.filed}`);
      if (want.filedAtLeast !== undefined && list(report.filed).length < want.filedAtLeast) unmet.push(`report.filed: ${list(report.filed).length}, expected at least ${want.filedAtLeast}`);
      if (want.setAside !== undefined && list(report.setAside).length !== want.setAside) unmet.push(`report.setAside: ${list(report.setAside).length}, expected ${want.setAside}`);
      for (const key of ['created', 'updated'] as const) {
        // The notes a run made or brought up to date, once each: a note with two new lines has two rows.
        const got = distinctPaths(paths(report[key]));
        const wanted = want[key];
        if (wanted && JSON.stringify([...got].sort()) !== JSON.stringify([...wanted].sort())) unmet.push(`report.${key}: [${got.join(', ')}], expected [${wanted.join(', ')}]`);
      }
      if (want.createdAtLeast !== undefined && paths(report.created).length < want.createdAtLeast) unmet.push(`report.created: ${paths(report.created).length}, expected at least ${want.createdAtLeast}`);
      const updated = distinctPaths(paths(report.updated)).length;
      if (want.updatedAtLeast !== undefined && updated < want.updatedAtLeast) unmet.push(`report.updated: ${updated}, expected at least ${want.updatedAtLeast}`);
      if (want.questionsAtMost !== undefined && list(report.questions).length > want.questionsAtMost) unmet.push(`report.questions: ${list(report.questions).length}, expected at most ${want.questionsAtMost}`);
      if (want.questionsExactly !== undefined && list(report.questions).length !== want.questionsExactly) unmet.push(`report.questions: ${list(report.questions).length}, expected exactly ${want.questionsExactly}`);
      if (want.pairSubject) {
        const wanted = [...want.pairSubject.notes].sort();
        const matches = list(report.questions).some((q) => {
          if (!q || typeof q !== 'object' || typeof (q as { id?: unknown }).id !== 'string') return false;
          const subject = subjectOf(q as { id: string });
          return subject.kind === 'pair' && subject.by === 'id'
            && JSON.stringify(subject.notes.map((id) => input.pathsById?.[id]).sort()) === JSON.stringify(wanted);
        });
        if (!matches) unmet.push(`report.questions: missing pair subject [${wanted.join(', ')}]`);
      }
      if (want.questions) {
        const got = list(report.questions).flatMap((q) => (q && typeof q === 'object' && typeof (q as { id?: unknown }).id === 'string' ? [(q as { id: string }).id] : []));
        if (JSON.stringify([...got].sort()) !== JSON.stringify([...want.questions].sort())) unmet.push(`report.questions: [${got.join(', ')}], expected [${want.questions.join(', ')}]`);
      }
      if (want.requests && JSON.stringify(list(report.requests)) !== JSON.stringify(want.requests)) unmet.push(`report.requests: ${JSON.stringify(list(report.requests))}, expected ${JSON.stringify(want.requests)}`);
      if (want.rulesWorded !== undefined && (report.rulesWorded ?? 0) !== want.rulesWorded) unmet.push(`report.rulesWorded: ${String(report.rulesWorded ?? 0)}, expected ${want.rulesWorded}`);
      if (want.yourChanges !== undefined && (report.yourChanges ?? 0) !== want.yourChanges) unmet.push(`report.yourChanges: ${String(report.yourChanges ?? 0)}, expected ${want.yourChanges}`);
    }
  }
  return { pass: unmet.length === 0, unmet };
}
