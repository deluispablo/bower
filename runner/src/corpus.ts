/**
 * The synthetic capability corpus (`testing/corpus/`, P4-A) and its one complete structural scorer.
 *
 * Why here: the runner is where a run's resulting folder and `last-run.json` are produced and where the scripted
 * provider already runs over a pretend Drive, so the scorer and its loader sit beside them. The scorer (`scoreCase`) is
 * pure (no file system, no Drive, no test runtime): it takes a case's `expected.json` and starting folder and what each
 * press left (the folder as a map of path to text, each file's Drive properties, paths by Drive id and the parsed
 * `last-run.json`), so the test driver and a live run score a case the same way (corpus-scorer-home).
 * Semantic expectations are not scored here: each case's `rubric.md` is for the quality reviewer.
 */
import { readFile, readdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { z } from 'zod';
import type { Question } from '../../src/data/contracts/types';
import { subjectOf } from '../../src/data/contracts/questions';
import { distinctPaths } from '../../src/data/spine/report';
import { timelineBullets } from '../../src/data/vault/note-format';
import { displayName, nameOf } from '../../src/data/contracts/tree';
import { scanLinks, linkTarget } from '../../src/data/contracts/links';
import { fenceAfter, parseOwnership } from '../../src/data/contracts/ownership-format';
import { SYSTEM, isRunnerFile } from '../../src/data/vault/layout';

/** The capabilities the corpus covers: C04 to C15, and C17 for the second brain's B cases (TL-P4-39). */
export const CORPUS_CAPABILITIES = ['C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C15', 'C17'] as const;
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
  /** The run scope of the case's presses (the runner's `RunScope`). */
  scope: 'all' | 'instructions';
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

/**
 * How a retained case executes today (corpus-registry AC1), recorded apart from `covers`, which is only a label.
 * `consumer` is the runner test (under `runner/test`) that runs the case through main; `setup` names the fault or extra
 * Drive state that test supplies beyond the case's files. `replies` runs the case's `replies.json` at the Claude
 * boundary, `provider` runs it through the scripted provider, `inline` through replies its consumer writes. A case is
 * live-ready when a live run can execute it: not excluded, and needing no setup or one the test driver registers
 * (`CORPUS_SETUPS` in `runner/test/corpus-run.ts`, corpus-live-hooks).
 */
export type CaseExecution =
  | { consumer: string; setup: string | null; mode: 'replies' | 'provider' | 'inline'; live: boolean }
  /** Never dispatched: `reason` says what Bower does not support (the README's exclusion paragraph). */
  | { consumer: string; setup: null; mode: 'excluded'; live: false; reason: string };

const replies = (consumer: string, setup: string | null = null): CaseExecution => ({ consumer, setup, mode: 'replies', live: setup === null });
/** A setup the test driver registers, so a live run applies it as the consumer does: live-ready. */
const registered = (consumer: string, setup: string): CaseExecution => ({ consumer, setup, mode: 'replies', live: true });
const provider = (consumer: string): CaseExecution => ({ consumer, setup: null, mode: 'provider', live: true });
const inline = (consumer: string): CaseExecution => ({ consumer, setup: null, mode: 'inline', live: true });
const excluded = (reason: string): CaseExecution => ({ consumer: 'corpus-requirements.test.ts', setup: null, mode: 'excluded', live: false, reason });
const NO_LOOKUP = 'Bower has no web lookup: the runner gives the model no web tool';
const NO_UNDO = 'the owner dropped Undo of a whole tidy-up on 2026-10-16';

/** The one execution registry: every retained case once, by id (corpus-registry AC1). */
export const CORPUS_EXECUTION: Readonly<Record<string, CaseExecution>> = {
  'b1-changes-person-edit': replies('b1-index.test.ts'),
  'b1-index-job-offer': replies('b1-planning.test.ts'),
  'b1-index-no-change': replies('b1-index.test.ts'),
  'b1-maintenance-crash-resume': registered('b1a-contract.test.ts', 'maintenance-reply-lost'),
  'b1-moc-over-40': replies('b1-index.test.ts'),
  'b23-hot-evidence-only': replies('b23-hot-recovery.test.ts'),
  'b23-hot-question-answer': replies('b23-hot-context.test.ts'),
  'b23-summary-person-lint': replies('words-note-summary.test.ts'),
  'b23-summary-words': replies('words-note-summary.test.ts'),
  'c04-garden-newsletter': inline('c04-incorporation.test.ts'),
  'c04-hardware-receipt': inline('c04-incorporation.test.ts'),
  'c04-offer-and-flat': provider('corpus.test.ts'),
  'c05-confirms-known-fact': inline('c05-incorporation.test.ts'),
  'c05-hub-lines': replies('c05-incorporation.test.ts'),
  'c05-keep-one-note': replies('corpus-driver.test.ts'),
  'c05-line-not-repeated': replies('c05-incorporation.test.ts'),
  'c05-marked-state-keeps-history': replies('c05-marked-history.test.ts'),
  'c05-merge-answer-no': replies('corpus-driver.test.ts'),
  'c05-merge-question-first': replies('pair-ask.test.ts'),
  'c05-note-not-written-by-bower': replies('c05-person-notes.test.ts'),
  'c05-person-edited-between-runs': replies('c05-between.test.ts'),
  'c06-clipping-compared': replies('c06-corpus.test.ts'),
  'c06-shared-name-unrelated': replies('c06-corpus.test.ts'),
  'c06-stored-project-connection': replies('c06-corpus.test.ts'),
  'c06-two-sources-attributed': replies('c06-corpus.test.ts'),
  'c07-answer-yes': replies('state-rewrite.test.ts'),
  'c07-dated-rent-change': replies('c07-cases.test.ts'),
  'c07-same-period-rent': replies('c07-cases.test.ts'),
  'c07-tentative-closure': replies('c07-cases.test.ts'),
  'c08-compare-flats': provider('c08-documents.test.ts'),
  'c08-compare-missing-fact': replies('c08-attached-reports.test.ts'),
  'c08-report-with-sources': replies('c08-attached-reports.test.ts'),
  'c08-revise-keeps-personal-text': excluded('Bower does not revise a generated document: asking again makes a new note'),
  'c09-burst-pipe': replies('c09-corpus.test.ts'),
  'c09-closest-flat': provider('c09-corpus.test.ts'),
  'c09-not-in-sources': replies('c09-corpus.test.ts'),
  'c09-original-over-summary': replies('c09-corpus.test.ts'),
  'c09-two-source-answer': replies('c09-corpus.test.ts'),
  'c10-denied-keeps-prior-result': excluded(NO_LOOKUP),
  'c10-fresh-result-cited': excluded(NO_LOOKUP),
  'c10-lookup-fails': excluded(NO_LOOKUP),
  'c10-stale-result-withheld': excluded(NO_LOOKUP),
  'c11-ambiguous-stays': provider('c11-corpus.test.ts'),
  'c11-document-is-not-policy': provider('corpus.test.ts'),
  'c11-request-is-one-time': inline('c11-corpus.test.ts'),
  'c11-rule-worded': provider('corpus.test.ts'),
  'c11-saltmere-question': provider('c11-corpus.test.ts'),
  'c11-source-cannot-answer': inline('c11-corpus.test.ts'),
  'c11-source-cannot-override-rule': inline('c11-corpus.test.ts'),
  'c12-admission-waits': replies('c12-corpus-admit.test.ts', 'admission-estimate-2'),
  'c12-group-waits': registered('c12-corpus.test.ts', 'group-reply-refused'),
  'c12-model-failure-retry': replies('c12-corpus.test.ts', 'model-call-fails'),
  'c12-text-budget-truthful': replies('c12-corpus.test.ts'),
  'c12-tool-interruption-recovery': registered('c12-corpus.test.ts', 'filing-answer-lost'),
  'c13-manifest-move-and-create': excluded(NO_UNDO),
  'c13-manifest-partial-edited-note': excluded(NO_UNDO),
  'c13-manifest-state-with-personal-edit': excluded(NO_UNDO),
  'c15-context-budget-exhausted': replies('c15-corpus.test.ts'),
  'c15-current-admitted-evidence': replies('c15-corpus.test.ts'),
  'c15-image-only-pdf-asked': replies('c15-corpus.test.ts'),
  'c15-short-pdfs-read-whole': replies('c15-corpus.test.ts'),
  'c17-b10-complete-tail': replies('b10-corpus.test.ts'),
  'c17-b10-partial-pdf': replies('b10-corpus.test.ts'),
  'c17-b10-personal-original': replies('b10-corpus.test.ts'),
  'c17-b10-shared-budget': replies('b10-corpus.test.ts'),
  'c17-b11-flat-formulas': replies('b11-proposals.test.ts'),
  'c17-b11-monthly-money': replies('b11-proposals.test.ts'),
  'c17-b11-proposal-authority': replies('b11-proposals.test.ts'),
  'c17-b11-skills-tally': replies('b11-proposals.test.ts'),
  'c17-b12-authority-person-boundary': replies('b12-result-note.test.ts'),
  'c17-b12-closed-ops': replies('b12-result-note.test.ts'),
  'c17-b12-large-first-part': replies('b12-large-part.test.ts'),
  'c17-b12-shared-target': replies('b12-result-note.test.ts'),
  'c17-b4-forget-no-return': replies('b4c-fixtures.test.ts'),
  'c17-b4-gate-archive-first': replies('b4c-fixtures.test.ts'),
  'c17-b4-origin-not-authority': replies('b4c-fixtures.test.ts'),
  'c17-b56-clear-topic-templates': replies('b56-corpus.test.ts'),
  'c17-b56-cv-profile': registered('b5c-profile.test.ts', 'career-profile-property'),
  'c17-b56-offer-job-search': registered('b5-incorporation.test.ts', 'career-profile-property'),
  'c17-b56-personal-sale-project': replies('b56-corpus.test.ts'),
  'c17-b7-authority-full-cap': replies('b7-incorporation.test.ts'),
  'c17-b7-automatic-capacity-order': replies('b7-incorporation.test.ts'),
  'c17-b7-automatic-growth-replay': replies('b7-incorporation.test.ts'),
  'c17-b7-reuse-known': replies('b7-incorporation.test.ts'),
  'c17-b8-bounded-encoding': replies('b8-log.test.ts'),
  'c17-b8-findings-refresh': replies('b8-health.test.ts'),
  'c17-b8-report-only-grammar': replies('b8-health.test.ts'),
  'c17-b8-settled-recovery': registered('b8-health.test.ts', 'hub-edit-refused-log-lost'),
  'c17-b9-person-list-kept': replies('b9-corpus.test.ts'),
  'c17-b9-uncertain-and-inferred': replies('b9-corpus.test.ts'),
};

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
  /** Things that waited with no row of their own (admission); none counts as 0. */
  waiting?: number;
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
  /**
   * Files of the preceding press's folder that are physically the same after this press (corpus-scorer-state AC1): the
   * same Drive id at the same path, the same bytes and the same appProperties. A path may use `*`; each must match.
   */
  unchangedSincePrevious?: string[];
  /** The same, against this press's folder just before it ran: after the person's between steps. */
  unchangedSinceStart?: string[];
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

/**
 * `case.json`, declared once with zod 4 (https://zod.dev, as the runner's model reply in `claude.ts`): strict objects
 * refuse unknown keys, so a misspelt or retired key (`folderFrom`, `speedBaseline`) fails instead of being ignored.
 */
const PairSubject = z.strictObject({ kind: z.literal('pair'), notes: z.tuple([z.string(), z.string()]) });
const Subject = z.discriminatedUnion('kind', [
  PairSubject,
  z.strictObject({ kind: z.literal('state'), note: z.string() }),
  z.strictObject({ kind: z.literal('inbox'), path: z.string() }),
  z.strictObject({ kind: z.literal('request') }),
  z.strictObject({ kind: z.literal('folder') }),
]);
const Between = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('words'), line: z.string() }),
  z.strictObject({ kind: z.literal('edit'), path: z.string(), text: z.string() }),
  z.strictObject({ kind: z.literal('create'), path: z.string(), text: z.string() }),
  z.strictObject({ kind: z.literal('move'), path: z.string(), to: z.string() }),
  z.strictObject({ kind: z.literal('answer'), question: z.union([z.strictObject({ id: z.string() }), Subject]), yes: z.boolean() }),
]);
const CaseMeta: z.ZodType<CorpusCase> = z.strictObject({
  id: z.string(), capability: z.enum(CORPUS_CAPABILITIES), title: z.string(), covers: z.enum(['scripted', 'model']), source: z.string(),
  scope: z.enum(['all', 'instructions']), allowWeb: z.boolean(),
  inbox: z.array(z.strictObject({ line: z.string(), files: z.array(z.string()) })),
  journal: z.array(z.strictObject({ kind: z.enum(['request', 'rule', 'answer']), text: z.string(), questionId: z.string().optional() })),
  questions: z.array(z.strictObject({ id: z.string(), text: z.string(), yes: z.string(), no: z.string(), about: z.string().optional(), askedAt: z.number() })),
  bowerOwned: z.array(z.string()),
  between: z.array(Between).optional(),
  presses: z.array(z.strictObject({
    between: z.array(Between).optional(),
    request: z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('replay'), id: z.string() }), z.strictObject({ kind: z.literal('tidy'), text: z.string().optional() })]).optional(),
  })).optional(),
});

/**
 * `expected.json`, declared once with zod like `case.json` (corpus-scorer-validation AC1): every object is strict at
 * every depth, a count is a whole number from 0, and a list that would pass by being empty needs an entry. A press in
 * `runs` has no `runs` of its own.
 */
const count = z.number().int().nonnegative();
const texts = z.array(z.string());
const SOME = 'expected a non-empty list';
const PlacementShape = z.strictObject({
  files: texts.min(1, SOME),
  allowed: z.array(z.strictObject({ under: z.string().min(1), linking: z.string().min(1).optional() })).min(1, SOME),
});
const PressExpected = z.strictObject({
  answers: z.array(z.strictObject({ request: z.string(), contains: texts.optional(), excludes: texts.optional(), links: texts.optional() })).optional(),
  tables: z.array(z.strictObject({ path: z.string(), header: texts.min(1, SOME), rows: z.array(texts) })).optional(),
  protectedRanges: z.array(z.strictObject({
    path: z.string(), range: z.union([z.strictObject({ heading: z.string().min(1) }), z.strictObject({ frontMatter: z.literal(true) })]),
  })).optional(),
  properties: z.array(z.strictObject({
    path: z.string(), absent: texts.min(1, SOME).optional(),
    equals: z.record(z.string(), z.string()).refine((e) => Object.keys(e).length > 0, 'expected at least one key').optional(),
  })).optional(),
  files: z.strictObject({ present: texts.optional(), absent: texts.optional() }).optional(),
  placement: z.union([PlacementShape, z.array(PlacementShape).min(1, SOME)]).optional(),
  unchanged: texts.optional(),
  unchangedSincePrevious: texts.min(1, SOME).optional(),
  unchangedSinceStart: texts.min(1, SOME).optional(),
  notes: z.array(z.strictObject({
    path: z.string(), contains: texts.optional(), excludes: texts.optional(), timeline: texts.optional(), timelineCount: count.optional(), timelineMin: count.optional(),
  })).optional(),
  linksResolve: z.boolean().optional(),
  report: z.strictObject({
    filed: count.optional(), filedAtLeast: count.optional(), created: texts.optional(), updated: texts.optional(), createdAtLeast: count.optional(),
    updatedAtLeast: count.optional(), questionsAtMost: count.optional(), questionsExactly: count.optional(),
    pairSubject: PairSubject.optional(),
    questionSubjects: z.array(Subject).min(1, SOME).optional(), setAside: count.optional(), questions: texts.optional(), requests: texts.optional(),
    rulesWorded: count.optional(), yourChanges: count.optional(), waiting: count.optional(),
  }).optional(),
});
const ExpectedShape: z.ZodType<Expected> = PressExpected.extend({ runs: z.array(PressExpected).optional() });

/** Where a zod issue sits, as a corpus author reads it (`.inbox[0].files`). */
const issueAt = (path: readonly PropertyKey[]): string => path.map((p) => typeof p === 'number' ? `[${p}]` : `.${String(p)}`).join('');

/** A case's `case.json`, validated before anything is read or seeded from it (corpus-registry AC2); `name` is its folder. */
function caseMeta(name: string, text: string): CorpusCase {
  let json: unknown;
  try { json = JSON.parse(text); } catch (e) { throw new Error(`corpus case ${name}: case.json is not JSON`, { cause: e }); }
  const parsed = CaseMeta.safeParse(json);
  if (!parsed.success) {
    // The first issue, at its path (`case.json.inbox[0].files`): one plain line for the corpus author.
    const issue = parsed.error.issues[0];
    throw new Error(`corpus case ${name}: case.json${issueAt(issue?.path ?? [])}: ${issue?.message ?? 'invalid'}`);
  }
  if (parsed.data.id !== name) throw new Error(`corpus case ${name}: case.json id "${parsed.data.id}" is not its folder name`);
  return parsed.data;
}

export async function loadCase(dir: string): Promise<LoadedCase> {
  const name = basename(dir);
  const text = await readFile(join(dir, 'case.json'), 'utf8').catch((e: unknown) => { throw new Error(`corpus case ${name}: case.json cannot be read`, { cause: e }); });
  const meta = caseMeta(name, text);
  const expected = JSON.parse(await readFile(join(dir, 'expected.json'), 'utf8')) as Expected;
  const rubric = await readFile(join(dir, 'rubric.md'), 'utf8');
  const start = await walk(join(dir, 'folder'));
  const inbox = await walk(join(dir, 'inbox'));
  // Every input a case names is one of its files: no seeded stand-in hides a missing one.
  for (const [i, pile] of meta.inbox.entries()) {
    for (const file of pile.files) if (!(file in inbox.text || file in inbox.binary)) throw new Error(`corpus case ${name}: pile ${i + 1} names ${file}, which is not in inbox/`);
  }
  for (const path of meta.bowerOwned) if (!(path in start.text || path in start.binary)) throw new Error(`corpus case ${name}: bowerOwned names ${path}, which is not in folder/`);
  return { ...meta, dir, folder: start.text, folderBinary: start.binary, inboxFiles: inbox.text, inboxBinary: inbox.binary, expected, rubric };
}

/** Every case under the corpus root, in id order; a root that cannot be read fails, and no directory is skipped. */
export async function loadCorpus(root: string): Promise<LoadedCase[]> {
  const found = await readdir(root, { withFileTypes: true }).catch((e: unknown) => { throw new Error(`corpus root ${root} cannot be read`, { cause: e }); });
  const names = found.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return Promise.all(names.map((n) => loadCase(join(root, n))));
}

/** The folder at one moment, as the scorer reads it: what a press left, or the folder just before a press ran. */
interface Snapshot {
  /** Every file of the folder (not folders, not the Bin), path to text. */
  after: Readonly<Record<string, string>>;
  /** Each file's Drive appProperties, by the same paths (none: no entry). */
  props?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Shown paths by stable Drive id, for typed report questions. */
  pathsById?: Readonly<Record<string, string>>;
  /** Each file's stable Drive id and the SHA-256 of its bytes, text or binary, by the same paths (corpus-scorer-state AC2). */
  files?: Readonly<Record<string, { id: string; sha256: string }>>;
  /** Drive ids of files the press started with that are now in the Drive Bin, so a binned file is told from a gone one. */
  binned?: readonly string[];
}

/** What one press left, as the scorer reads it: a test driver's run or a live run's snapshot. */
export interface PressResult extends Snapshot {
  /** The parsed `.bower/last-run.json`; null when there is none. */
  lastRun: unknown;
  /** The folder just before this press ran: after the person's between steps, before the press's request. */
  start?: Snapshot;
}

export interface ScoreInput extends PressResult {
  expected: Expected;
  /** The starting folder before the run. */
  before: Readonly<Record<string, string>>;
}

export interface Score {
  pass: boolean;
  /** One line per unmet expectation. */
  unmet: string[];
}

/** A link's name as the corpus checks read it: before any #heading (a ^block stays). */
const named = (name: string): string => name.split('#')[0] ?? '';

/** The Timeline lines of a note: the bullets of its Timeline section, as the app's one note parser frames it. */
export const timelineOf = timelineBullets;

/** The report of a `last-run.json` that passes the runner's current schema (corpus-scorer-validation AC2); else none. */
function reportOf(lastRun: unknown): Record<string, unknown> | null {
  const report = isRunnerFile(SYSTEM.lastRun, lastRun) ? lastRun.run.report : undefined;
  return report ? { ...report } : null;
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** The rows of a report list that name a path. */
const paths = (v: unknown): Array<{ path: string }> => list(v).flatMap((x) => (x && typeof x === 'object' && typeof (x as { path?: unknown }).path === 'string' ? [{ path: (x as { path: string }).path }] : []));

/** The paths of the folder a pattern matches: an exact path, or a pattern with `*` for any run of characters. */
function matching(after: Readonly<Record<string, unknown>>, pattern: string): string[] {
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

/**
 * Whether prose states `fact` (corpus-scorer-validation AC4): the words around it are free, but a figure is whole, so
 * "1,450" is not stated by "11,450" or "1,450.50", and an excluded "900" is not stated by "1,900".
 */
function says(text: string, fact: string): boolean {
  for (let i = text.indexOf(fact); i >= 0; i = text.indexOf(fact, i + 1)) {
    const joined = (/^\d/.test(fact) && /\d[.,]?$/.test(text.slice(Math.max(0, i - 2), i)))
      || (/\d$/.test(fact) && /^[.,]?\d/.test(text.slice(i + fact.length, i + fact.length + 2)));
    if (!joined) return true;
  }
  return false;
}

/** The files a `[[target]]` could mean: its whole path (a note without `.md`), else the files with that name. */
function linkCandidates(target: string, after: Readonly<Record<string, string>>): string[] {
  const key = linkTarget(target);
  const all = Object.keys(after);
  const whole = all.filter((p) => displayName(p).toLowerCase() === key || p.toLowerCase() === key);
  return whole.length ? whole : all.filter((p) => nameOf(p).toLowerCase() === key || displayName(nameOf(p)).toLowerCase() === key);
}

function scoreAnswer(want: AnswerExpectation, rows: ReadonlyArray<{ text: string; done?: string }>, after: Readonly<Record<string, string>>): string[] {
  const unmet: string[] = [];
  // A row with no `done`, or an empty one, is not done; with the same words twice, the one that has `done` counts.
  const found = rows.filter((r) => r.text === want.request && r.done);
  if (found.length !== 1) return [...unmet, found.length ? `answers: ${found.length} rows for "${want.request}"` : `answers: no done row for "${want.request}"`];
  const done = found[0]?.done ?? '';
  const at = `answers "${want.request}"`;
  for (const c of want.contains ?? []) if (!says(done, c)) unmet.push(`${at}: lacks "${c}"`);
  for (const c of want.excludes ?? []) if (says(done, c)) unmet.push(`${at}: has "${c}"`);
  if (want.links) {
    const got: string[] = [];
    let clear = true;
    for (const m of scanLinks(done)) {
      const name = m[1] ?? '';
      if (!name) continue;
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
  const unmet: string[] = [];
  const text = after[want.path];
  if (text === undefined) return [...unmet, `${at}: missing note`];
  const same = tablesOf(text).filter((t) => JSON.stringify(t.header) === JSON.stringify(want.header));
  if (same.length !== 1) return [...unmet, `${at}: ${same.length ? `${same.length} tables` : 'no table'} with header [${want.header.join(', ')}]`];
  const got = same[0]?.rows ?? [];
  if (JSON.stringify(got) !== JSON.stringify(want.rows)) unmet.push(`${at}: rows ${JSON.stringify(got)}, expected ${JSON.stringify(want.rows)}`);
  return unmet;
}

/** Compare typed subjects by id; paths are fixture selectors, never substring matches. */
export function matchesSubject(q: Question, want: QuestionSubjectExpectation, pathsById: Readonly<Record<string, string>>): boolean {
  const subject = subjectOf(q);
  if (subject.kind !== want.kind) return false;
  switch (want.kind) {
    case 'pair': return subject.kind === 'pair' && subject.by === 'id'
      && JSON.stringify(subject.notes.map((id) => pathsById[id]).sort()) === JSON.stringify([...want.notes].sort());
    case 'state': return subject.kind === 'state' && pathsById[subject.id] === want.note;
    case 'inbox': return subject.kind === 'inbox' && pathsById[subject.id] === want.path;
    case 'request': return subject.kind === 'request';
    case 'folder': return subject.kind === 'folder';
  }
}

/** Read-only byte selection: the ownership parser supplies front matter and the app's named section spans. */
function protectedBytes(text: string | undefined, range: NonNullable<Expected['protectedRanges']>[number]['range']): Buffer | null {
  if (text === undefined) return null;
  const bytes = Buffer.from(text, 'utf8');
  const ownership = parseOwnership(bytes);
  if (ownership.status === 'invalid') return null;
  if ('frontMatter' in range) return ownership.layout.front ? bytes.subarray(0, ownership.layout.frontEnd) : null;
  const known = range.heading === 'Current state' ? ownership.layout.current
    : range.heading === 'Timeline' ? ownership.layout.timeline
    : range.heading === "Bower's note" ? ownership.layout.bowerNote : undefined;
  if (known !== undefined) return known ? bytes.subarray(known.start, known.end) : null;
  // Personal ATX headings: keep raw offsets, ignore fenced code, and refuse an ambiguous repeated heading.
  const headings: Array<{ start: number; level: number; title: string }> = [];
  let fence: ReturnType<typeof fenceAfter> = null;
  for (let start = ownership.personal.start; start < ownership.personal.end;) {
    const newline = bytes.indexOf(10, start);
    const after = newline < 0 ? ownership.personal.end : Math.min(newline + 1, ownership.personal.end);
    const line = bytes.subarray(start, after).toString('utf8').replace(/\r?\n$/, '');
    const heading = !fence ? /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+[ \t]*)?$/.exec(line) : null;
    if (heading) headings.push({ start, level: heading[1]?.length ?? 0, title: heading[2] ?? '' });
    fence = fenceAfter(line, fence);
    start = after;
  }
  const found = headings.filter((h) => h.title === range.heading);
  const first = found[0];
  if (found.length !== 1 || !first) return null;
  const end = headings.find((h) => h.start > first.start && h.level <= first.level)?.start ?? ownership.personal.end;
  return bytes.subarray(first.start, end);
}

/**
 * How a file of `base` is not physically the same in `now` (corpus-scorer-state AC2): gone (in the Bin, moved, or
 * missing), recreated under a new Drive id, or kept with other bytes or appProperties. None when it is the same.
 */
function drift(base: Snapshot, now: Snapshot, path: string, was: { id: string; sha256: string }): string[] {
  const is = now.files?.[path];
  if (!is) {
    const moved = Object.entries(now.files ?? {}).find(([, f]) => f.id === was.id)?.[0];
    return [now.binned?.includes(was.id) ? 'is in the Bin' : moved ? `moved to ${moved}` : 'is missing'];
  }
  if (is.id !== was.id) return ['was recreated with a new Drive id'];
  const a = base.props?.[path] ?? {};
  const b = now.props?.[path] ?? {};
  const sameProps = Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => Object.hasOwn(b, k) && b[k] === v);
  return [...(is.sha256 === was.sha256 ? [] : ['changed bytes']), ...(sameProps ? [] : ['changed properties'])];
}

/**
 * One press against one set of expectations: every check, `unchanged` and the protected ranges against the starting
 * folder, the explicit baselines against the preceding press and this press's start (corpus-scorer-state AC1).
 */
function scorePress(expected: Expected, before: Readonly<Record<string, string>>, press: PressResult, previous: Snapshot | undefined): string[] {
  const { after, lastRun } = press;
  const unmet: string[] = [];
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
    // A file held in the Inbox counts like any other: it passes only where `allowed` names the Inbox (AC3).
    const placed = files.flatMap((p) => matching(after, p));
    if (placed.length === 0) unmet.push(`placement: no file matches [${files.join(', ')}]`);
    for (const path of placed) {
      const rule = allowed.find((a) => isUnder(path, a.under));
      if (!rule) unmet.push(`placed outside the rubric: ${path}`);
      else if (rule.linking !== undefined) {
        // The exact link target ([[Garden plot]], [[Garden plot|text]], [[Garden plot#heading]]), not one that starts the same.
        const linksTo = (text: string, target: string): boolean => [...scanLinks(text)].some((m) => named(m[1] ?? '').trim() === target);
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
  for (const [key, base, none] of [
    ['unchangedSincePrevious', previous, 'no snapshot of the preceding press'],
    ['unchangedSinceStart', press.start, 'no snapshot of this press before it ran'],
  ] as const) {
    const want = expected[key];
    const files = base?.files;
    if (!want) continue;
    if (!base || !files) { unmet.push(`${key}: ${none}`); continue; }
    for (const pattern of want) {
      const found = matching(files, pattern);
      if (found.length === 0) unmet.push(`${key}: no file matches ${pattern}`);
      for (const path of found) {
        const was = files[path];
        if (was) for (const why of drift(base, press, path, was)) unmet.push(`${key}: ${path} ${why}`);
      }
    }
  }
  for (const n of expected.notes ?? []) {
    const found = matching(after, n.path);
    if (found.length === 0) unmet.push(`missing note: ${n.path}`);
    // Every note a wildcard matches meets the expectation, each named by its own path (AC3).
    for (const at of found) {
      const text = after[at] ?? '';
      for (const c of n.contains ?? []) if (!says(text, c)) unmet.push(`${at}: lacks "${c}"`);
      for (const c of n.excludes ?? []) if (says(text, c)) unmet.push(`${at}: has "${c}"`);
      const lines = timelineOf(text);
      for (const t of n.timeline ?? []) if (!lines.some((l) => says(l, t))) unmet.push(`${at}: no Timeline line with "${t}"`);
      if (n.timelineCount !== undefined && lines.length !== n.timelineCount) unmet.push(`${at}: ${lines.length} Timeline lines, expected ${n.timelineCount}`);
      if (n.timelineMin !== undefined && lines.length < n.timelineMin) unmet.push(`${at}: ${lines.length} Timeline lines, expected at least ${n.timelineMin}`);
    }
  }
  if (expected.linksResolve) {
    for (const [p, text] of Object.entries(after)) {
      if (!p.endsWith('.md') || p.startsWith('.bower/') || before[p] === text) continue;
      for (const m of scanLinks(text)) {
        const name = named(m[1] ?? '');
        if (name && !resolves(name, after)) unmet.push(`${p}: link [[${name}]] does not resolve`);
      }
    }
  }
  const want = expected.report;
  if (want) {
    const report = reportOf(lastRun);
    if (!report) unmet.push(lastRun !== null && !isRunnerFile(SYSTEM.lastRun, lastRun) ? `report: ${SYSTEM.lastRun} is not a last-run file` : 'report: no last-run.json report');
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
      const pair = want.pairSubject;
      if (pair && !list(report.questions).some((q) => asked(q) && matchesSubject(q, pair, press.pathsById ?? {}))) {
        unmet.push(`report.questions: missing pair subject [${[...pair.notes].sort().join(', ')}]`);
      }
      if (want.questions) {
        const got = list(report.questions).flatMap((q) => (q && typeof q === 'object' && typeof (q as { id?: unknown }).id === 'string' ? [(q as { id: string }).id] : []));
        if (JSON.stringify([...got].sort()) !== JSON.stringify([...want.questions].sort())) unmet.push(`report.questions: [${got.join(', ')}], expected [${want.questions.join(', ')}]`);
      }
      if (want.requests && JSON.stringify(list(report.requests)) !== JSON.stringify(want.requests)) unmet.push(`report.requests: ${JSON.stringify(list(report.requests))}, expected ${JSON.stringify(want.requests)}`);
      if (want.rulesWorded !== undefined && (report.rulesWorded ?? 0) !== want.rulesWorded) unmet.push(`report.rulesWorded: ${String(report.rulesWorded ?? 0)}, expected ${want.rulesWorded}`);
      if (want.yourChanges !== undefined && (report.yourChanges ?? 0) !== want.yourChanges) unmet.push(`report.yourChanges: ${String(report.yourChanges ?? 0)}, expected ${want.yourChanges}`);
      if (want.waiting !== undefined && (report.waiting ?? 0) !== want.waiting) unmet.push(`report.waiting: ${String(report.waiting ?? 0)}, expected ${want.waiting}`);
    }
  }
  for (const { path, range } of expected.protectedRanges ?? []) {
    const was = protectedBytes(before[path], range);
    const now = protectedBytes(after[path], range);
    const name = 'heading' in range ? range.heading : 'front matter';
    if (!was || !now) unmet.push(`${path}: missing or ambiguous protected range ${name}`);
    else if (!was.equals(now)) unmet.push(`${path}: protected range changed: ${name}`);
  }
  for (const want of expected.properties ?? []) {
    if (!(want.path in after)) { unmet.push(`missing file for properties: ${want.path}`); continue; }
    const props = press.props?.[want.path] ?? {};
    for (const key of want.absent ?? []) if (Object.hasOwn(props, key)) unmet.push(`${want.path}: appProperty ${key} should be absent`);
    for (const [key, value] of Object.entries(want.equals ?? {})) {
      if (!Object.hasOwn(props, key) || props[key] !== value) unmet.push(`${want.path}: appProperty ${key} expected ${JSON.stringify(value)}`);
    }
  }
  if (expected.report?.questionSubjects) {
    const questions = list(reportOf(lastRun)?.questions);
    for (const want of expected.report.questionSubjects) {
      if (!questions.some((q) => asked(q) && matchesSubject(q, want, press.pathsById ?? {}))) unmet.push(`report.questions: missing ${JSON.stringify(want)} subject`);
    }
  }
  return unmet;
}

/** A report row that is a question: an object with a string id. */
const asked = (q: unknown): q is Question => !!q && typeof q === 'object' && typeof (q as { id?: unknown }).id === 'string';

/**
 * The one complete scorer (corpus-scorer-home): the final press against the case's top-level expectations, then, when
 * the case lists `runs`, every press (earlier ones in `final.runs`, in order) against its own entry, each with the press
 * before it as its preceding press. Every press is scored (corpus-scorer-state AC4): with no `runs` only one press
 * may be given, and a press with no entry, or an entry with no press, is unmet.
 */
export function scoreCase(c: { expected: Expected; folder: Readonly<Record<string, string>> }, final: PressResult & { runs?: readonly PressResult[] }): Score {
  // Expectations that are not the current schema score nothing: each issue is unmet, at its place (AC1).
  const shape = ExpectedShape.safeParse(c.expected);
  if (!shape.success) return { pass: false, unmet: shape.error.issues.map((issue) => `expected${issueAt(issue.path)}: ${issue.message}`) };
  const runs = [...final.runs ?? [], final];
  const unmet = scorePress(c.expected, c.folder, final, runs.at(-2));
  const each = c.expected.runs;
  if (runs.length !== (each?.length ?? 1)) unmet.push(`runs: ${runs.length}, expected ${each?.length ?? 1}`);
  if (each) {
    for (const [i, run] of runs.entries()) {
      const expected = each[i];
      if (!expected) unmet.push(`run ${i + 1}: extra press`);
      else unmet.push(...scorePress(expected, c.folder, run, runs[i - 1]).map((line) => `run ${i + 1}: ${line}`));
    }
    for (let i = runs.length; i < each.length; i++) unmet.push(`run ${i + 1}: missing press`);
  }
  return { pass: unmet.length === 0, unmet };
}

/** One press with no earlier ones, scored by the complete scorer; kept for the callers that score a single run. */
export function score(input: ScoreInput): Score {
  return scoreCase({ expected: input.expected, folder: input.before }, input);
}
