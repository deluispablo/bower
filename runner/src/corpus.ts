/**
 * The synthetic capability corpus (`harness/corpus/`, P4-A) and its structural scorer.
 *
 * Why here: the runner is where a run's resulting folder and `last-run.json` are produced and where the scripted
 * provider already runs over a pretend Drive, so the scorer and its loader sit beside them. The scorer is pure (no
 * file system, no Drive): it takes a case's `expected.json`, the starting folder and the folder after a run, as maps
 * of path to text, plus the parsed `last-run.json`. A later entry (`original-baseline`, the model slices) reuses it.
 * Semantic expectations are not scored here: each case's `rubric.md` is for the quality reviewer.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** The capabilities the corpus covers, by the ids of `docs/P2_ACCEPTANCE.md`. */
export const CORPUS_CAPABILITIES = ['C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C13', 'C15'] as const;
export type CorpusCapability = (typeof CORPUS_CAPABILITIES)[number];

export interface CorpusPile {
  /** What the person wrote about it; empty for a loose thing. */
  line: string;
  /** Names of files under the case's `inbox/`, in the order added. */
  files: string[];
}

export interface CorpusQuestion {
  id: string;
  text: string;
  yes: string;
  no: string;
  about?: string;
  askedAt: number;
}

export interface CorpusJournalLine {
  kind: 'request' | 'rule' | 'answer';
  /** The words, or `yes` / `no` for an answer. */
  text: string;
  questionId?: string;
}

export interface CorpusCase {
  id: string;
  capability: CorpusCapability;
  title: string;
  /** `scripted`: the scripted provider does this today; `model`: needs the model (P4 slices), expectations are by hand. */
  covers: 'scripted' | 'model';
  /** `bench:<case>`, `p2-journey:<C0x>` or `new`, and how it was adapted. */
  source: string;
  /** One of the original app's five bench cases, kept unchanged for the speed comparison (docs/harness/p4-speed-baseline.md). */
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
}

export interface ReportExpectation {
  /** How many things were filed. */
  filed?: number;
  created?: string[];
  updated?: string[];
  /** For cases where the model chooses names: at least this many. */
  createdAtLeast?: number;
  updatedAtLeast?: number;
  /** At most this many questions (a bounded ask). */
  questionsAtMost?: number;
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

export interface Expected {
  /** Paths here may use `*` for any run of characters (a model picks names; the rules fix only the place). */
  files?: { present?: string[]; absent?: string[] };
  /**
   * Where the matched files may be filed (a rubric that allows more than one place). Each file must sit under one
   * `allowed` folder; an entry with `linking` also needs a note among the files that links that note (`[[linking]]`).
   */
  placement?: { files: string[]; allowed: Array<{ under: string; linking?: string }> };
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

/** The Timeline lines of a note: the bullets under its `## Timeline` heading. */
export function timelineOf(text: string): string[] {
  const at = text.search(/^## Timeline\s*$/m);
  if (at < 0) return [];
  const out: string[] = [];
  for (const l of text.slice(at).split(/\r?\n/).slice(1)) {
    if (l.startsWith('## ')) break;
    if (l.startsWith('- ')) out.push(l);
  }
  return out;
}

function reportOf(lastRun: unknown): Record<string, unknown> | null {
  if (!lastRun || typeof lastRun !== 'object') return null;
  const run = (lastRun as { run?: unknown }).run;
  if (!run || typeof run !== 'object') return null;
  const report = (run as { report?: unknown }).report;
  return report && typeof report === 'object' ? (report as Record<string, unknown>) : null;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const paths = (v: unknown): string[] => list(v).flatMap((x) => (x && typeof x === 'object' && typeof (x as { path?: unknown }).path === 'string' ? [(x as { path: string }).path] : []));

/** The paths of the folder a pattern matches: an exact path, or a pattern with `*` for any run of characters. */
function matching(after: Readonly<Record<string, string>>, pattern: string): string[] {
  if (!pattern.includes('*')) return pattern in after ? [pattern] : [];
  const re = new RegExp(`^${pattern.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return Object.keys(after).filter((p) => re.test(p));
}

/** Whether a `[[target]]` names a note or file of the folder (by name with or without `.md`, or by path). */
function resolves(target: string, after: Readonly<Record<string, string>>): boolean {
  const t = target.trim();
  return Object.keys(after).some((p) => {
    const base = p.split('/').pop() ?? p;
    return p === t || p === `${t}.md` || base === t || base === `${t}.md` || base === `${t}.url`;
  });
}

export function score(input: ScoreInput): Score {
  const { expected, before, after, lastRun } = input;
  const unmet: string[] = [];
  for (const p of expected.files?.present ?? []) if (matching(after, p).length === 0) unmet.push(`missing file: ${p}`);
  for (const p of expected.files?.absent ?? []) for (const found of matching(after, p)) unmet.push(`file should not exist: ${found}`);
  if (expected.placement) {
    const { files, allowed } = expected.placement;
    const placed = files.flatMap((p) => matching(after, p)).filter((p) => !p.startsWith('Inbox/'));
    for (const path of placed) {
      const rule = allowed.find((a) => path.startsWith(`${a.under}/`));
      if (!rule) unmet.push(`placed outside the rubric: ${path}`);
      else if (rule.linking !== undefined) {
        const link = `[[${rule.linking}`;
        const linked = placed.some((q) => q.endsWith('.md') && q.startsWith(`${rule.under}/`) && (after[q] ?? '').includes(link));
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
      if (want.setAside !== undefined && list(report.setAside).length !== want.setAside) unmet.push(`report.setAside: ${list(report.setAside).length}, expected ${want.setAside}`);
      for (const key of ['created', 'updated'] as const) {
        const got = paths(report[key]);
        const wanted = want[key];
        if (wanted && JSON.stringify([...got].sort()) !== JSON.stringify([...wanted].sort())) unmet.push(`report.${key}: [${got.join(', ')}], expected [${wanted.join(', ')}]`);
      }
      if (want.createdAtLeast !== undefined && paths(report.created).length < want.createdAtLeast) unmet.push(`report.created: ${paths(report.created).length}, expected at least ${want.createdAtLeast}`);
      if (want.updatedAtLeast !== undefined && paths(report.updated).length < want.updatedAtLeast) unmet.push(`report.updated: ${paths(report.updated).length}, expected at least ${want.updatedAtLeast}`);
      if (want.questionsAtMost !== undefined && list(report.questions).length > want.questionsAtMost) unmet.push(`report.questions: ${list(report.questions).length}, expected at most ${want.questionsAtMost}`);
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
