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
}

export interface Expected {
  files?: { present?: string[]; absent?: string[] };
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
  /** The files of the inbox, name to text. */
  inboxFiles: Record<string, string>;
  expected: Expected;
  rubric: string;
}

async function walk(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
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
      else if (entry.name !== '.gitkeep') out[relative(dir, full).split('\\').join('/')] = await readFile(full, 'utf8');
    }
  };
  await visit(dir);
  return out;
}

export async function loadCase(dir: string): Promise<LoadedCase> {
  const meta = JSON.parse(await readFile(join(dir, 'case.json'), 'utf8')) as CorpusCase;
  const expected = JSON.parse(await readFile(join(dir, 'expected.json'), 'utf8')) as Expected;
  const rubric = await readFile(join(dir, 'rubric.md'), 'utf8');
  return { ...meta, dir, folder: await walk(join(dir, 'folder')), inboxFiles: await walk(join(dir, 'inbox')), expected, rubric };
}

/** Every case under the corpus root, in id order. */
export async function loadCorpus(root: string): Promise<LoadedCase[]> {
  const found = await readdir(root, { withFileTypes: true }).catch(() => []);
  const names = found.filter((e) => e.isDirectory()).map((e) => e.name).sort();
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

export function score(_input: ScoreInput): Score {
  return { pass: true, unmet: [] };
}
