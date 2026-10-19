/**
 * The complete corpus scorer (corpus-scorer-home): `scoreCase` in `runner/src/corpus.ts` scores every expectation of a
 * case, including the protected ranges, Drive properties, typed question subjects and per-press runs that only the test
 * driver used to check, from plain data (the starting folder and what each press left), and it reads no test runtime.
 * It scores only expectations and reports in their current schema, and no placement or wildcard note passes vacuously
 * (corpus-scorer-validation). A file is kept unchanged from an explicit baseline, the seed, the preceding press or the
 * press's own start, and every press and the count of presses are scored (corpus-scorer-state).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { loadCorpus, scoreCase, type Expected } from '../src/corpus';

const RUNNER = resolve(import.meta.dirname, '..');
const PERSONAL = 'Projects/Alex.md';
const PERSON_TEXT = '---\r\ntitle: Alex\r\n---\r\n\r\n## My thoughts\r\nAlex likes café light.\r\n\r\n## Timeline\r\n';
const PATHS = { a: 'Projects/A.md', b: 'Projects/B.md', c: 'Projects/C.md', p: PERSONAL, i: 'Inbox/Seeds.txt' };
const LAST_RUN = '.bower/last-run.json';
/** A finished run and its report rows, as the runner writes `last-run.json` today (corpus-scorer-validation AC2). */
const RUN = { id: 'run-1', scope: 'all', phase: 'done', requestedAt: 0, phaseAt: 0 };
const ROWS = { filed: [], created: [], updated: [], setAside: [], questions: [] };
const asked = (q: Record<string, string>): Record<string, unknown> => ({ text: 'Is this right?', yes: 'Yes', no: 'No', askedAt: 0, ...q });
const report = (questions: Array<Record<string, string>>, rows: Record<string, unknown> = {}): unknown =>
  ({ v: 1, run: { ...RUN, report: { ...ROWS, questions: questions.map(asked), ...rows } } });
const press = (over: { after?: Record<string, string>; props?: Record<string, Record<string, string>>; lastRun?: unknown } = {}) =>
  ({ after: { [PERSONAL]: PERSON_TEXT }, props: {}, pathsById: PATHS, lastRun: report([]), ...over });
const unmet = (expected: Expected, final = press(), runs?: Array<ReturnType<typeof press>>): string[] =>
  scoreCase({ expected, folder: { [PERSONAL]: PERSON_TEXT } }, runs ? { ...final, runs } : final).unmet;

it('corpus-scorer-home AC1: shared scorer enforces all existing driver-only expectations', () => {
  expect(typeof scoreCase, 'the shared scorer is runner code').toBe('function');
  // Protected ranges: the raw bytes of a personal heading's section and of the front matter, against the starting folder.
  const thoughts: Expected = { protectedRanges: [{ path: PERSONAL, range: { heading: 'My thoughts' } }] };
  expect(unmet(thoughts)).toEqual([]);
  expect(unmet(thoughts, press({ after: { [PERSONAL]: `${PERSON_TEXT}- 2026-10-07 · New line.\r\n` } }))).toEqual([]);
  expect(unmet(thoughts, press({ after: { [PERSONAL]: PERSON_TEXT.replace('light', 'Light') } }))).toEqual([`${PERSONAL}: protected range changed: My thoughts`]);
  expect(unmet(thoughts, press({ after: { [PERSONAL]: PERSON_TEXT.replace(/\r\n/g, '\n') } }))).toEqual([`${PERSONAL}: protected range changed: My thoughts`]);
  expect(unmet(thoughts, press({ after: { [PERSONAL]: PERSON_TEXT.replace('## Timeline', '## My thoughts\r\nAgain.\r\n\r\n## Timeline') } }))).toEqual([`${PERSONAL}: missing or ambiguous protected range My thoughts`]);
  expect(unmet(thoughts, press({ after: {} }))).toEqual([`${PERSONAL}: missing or ambiguous protected range My thoughts`]);
  const front: Expected = { protectedRanges: [{ path: PERSONAL, range: { frontMatter: true } }] };
  expect(unmet(front)).toEqual([]);
  expect(unmet(front, press({ after: { [PERSONAL]: PERSON_TEXT.replace('Alex\r', 'ALEX\r') } }))).toEqual([`${PERSONAL}: protected range changed: front matter`]);
  expect(unmet(front, press({ after: { [PERSONAL]: 'No front matter.\n' } }))).toEqual([`${PERSONAL}: missing or ambiguous protected range front matter`]);
  // Drive properties, read directly: absent keys, exact values, a missing file and empty lists.
  const props: Expected = { properties: [{ path: PERSONAL, absent: ['by', 'bower_state'], equals: { custom: 'Alex' } }] };
  expect(unmet(props, press({ props: { [PERSONAL]: { custom: 'Alex' } } }))).toEqual([]);
  expect(unmet(props, press({ props: { [PERSONAL]: { custom: 'Alex', by: 'bower' } } }))).toEqual([`${PERSONAL}: appProperty by should be absent`]);
  expect(unmet(props, press({ props: { [PERSONAL]: { custom: 'Alex', bower_state: '' } } }))).toEqual([`${PERSONAL}: appProperty bower_state should be absent`]);
  expect(unmet(props, press({ props: { [PERSONAL]: { custom: 'alex' } } }))).toEqual([`${PERSONAL}: appProperty custom expected "Alex"`]);
  expect(unmet(props)).toEqual([`${PERSONAL}: appProperty custom expected "Alex"`]);
  expect(unmet(props, press({ after: {} }))).toEqual([`missing file for properties: ${PERSONAL}`]);
  expect(unmet({ properties: [{ path: PERSONAL, absent: [], equals: {} }] })).toEqual([
    'expected.properties[0].absent: expected a non-empty list', 'expected.properties[0].equals: expected at least one key']);
  // Typed question subjects, by the resolved Drive ids: each kind, a wrong id, an empty list and no report.
  const subjects = (questionSubjects: NonNullable<Expected['report']>['questionSubjects']): Expected => ({ report: { questionSubjects } });
  expect(unmet(subjects([{ kind: 'state', note: PERSONAL }]), press({ lastRun: report([{ id: 'q-state-p' }]) }))).toEqual([]);
  expect(unmet(subjects([{ kind: 'state', note: PERSONAL }]), press({ lastRun: report([{ id: 'q-state-other' }, { id: 'q-ask-p', subject: 'p' }]) })))
    .toEqual([`report.questions: missing {"kind":"state","note":"${PERSONAL}"} subject`]);
  expect(unmet(subjects([{ kind: 'pair', notes: [PATHS.a, PATHS.b] }]), press({ lastRun: report([{ id: 'q-pair-b.a' }]) }))).toEqual([]);
  expect(unmet(subjects([{ kind: 'pair', notes: [PATHS.a, PATHS.b] }]), press({ lastRun: report([{ id: 'q-pair-a.c' }]) })))
    .toEqual([`report.questions: missing {"kind":"pair","notes":["${PATHS.a}","${PATHS.b}"]} subject`]);
  expect(unmet(subjects([{ kind: 'inbox', path: PATHS.i }, { kind: 'request' }, { kind: 'folder' }]),
    press({ lastRun: report([{ id: 'q-ask-i' }, { id: 'q-request-change-1' }, { id: 'q-folder', text: 'Where do recipes go?' }]) }))).toEqual([]);
  expect(unmet(subjects([{ kind: 'inbox', path: PATHS.i }]), press({ lastRun: report([{ id: 'q-ask-a' }]) })))
    .toEqual([`report.questions: missing {"kind":"inbox","path":"${PATHS.i}"} subject`]);
  expect(unmet(subjects([]))).toEqual(['expected.report.questionSubjects: expected a non-empty list']);
  expect(unmet(subjects([{ kind: 'folder' }]), press({ lastRun: null }))).toEqual(['report: no last-run.json report', 'report.questions: missing {"kind":"folder"} subject']);
  // The older pair expectation goes through the same typed match.
  const pair: Expected = { report: { pairSubject: { kind: 'pair', notes: [PATHS.a, PATHS.b] } } };
  expect(unmet(pair, press({ lastRun: report([{ id: 'q-pair-b.a' }]) }))).toEqual([]);
  expect(unmet(pair, press({ lastRun: report([{ id: 'q-pair-a.c' }]) }))).toEqual([`report.questions: missing pair subject [${PATHS.a}, ${PATHS.b}]`]);
  // Every press against its own runs entry, in order, and the count of presses; driver-only checks apply per press too.
  const two: Expected = { runs: [{ report: { questionsExactly: 1 } }, { report: { questionsExactly: 0 } }] };
  const asked = press({ lastRun: report([{ id: 'q-state-p' }]) });
  expect(unmet(two, press(), [asked])).toEqual([]);
  expect(unmet(two, asked, [press()])).toEqual(['run 1: report.questions: 0, expected exactly 1', 'run 2: report.questions: 1, expected exactly 0']);
  expect(unmet(two)).toEqual(['runs: 1, expected 2', 'run 1: report.questions: 0, expected exactly 1', 'run 2: missing press']);
  expect(unmet(two, press(), [asked, asked])).toEqual(['runs: 3, expected 2', 'run 2: report.questions: 1, expected exactly 0', 'run 3: extra press']);
  const changed = press({ after: { [PERSONAL]: PERSON_TEXT.replace('light', 'Light') } });
  expect(unmet({ runs: [thoughts, {}] }, press(), [changed])).toEqual([`run 1: ${PERSONAL}: protected range changed: My thoughts`]);
  expect(unmet({ ...props, runs: [props] }, press({ props: { [PERSONAL]: { custom: 'Alex' } } }))).toEqual([]);
  expect(unmet({ ...props, runs: [props] })).toEqual([`${PERSONAL}: appProperty custom expected "Alex"`, `run 1: ${PERSONAL}: appProperty custom expected "Alex"`]);
});

it('corpus-scorer-validation AC1: every expectation field is recursively validated', async () => {
  const invalid = (expected: unknown): string[] => unmet(expected as Expected);
  // An unknown key at any depth is unmet, at its place: a note, a range, a placement, a report, a property, a file list,
  // a press's answer and table.
  expect(invalid({ notes: [{ path: PERSONAL, contain: ['café'] }] }), 'a nested unknown key is unmet').toEqual(['expected.notes[0]: Unrecognized key: "contain"']);
  expect(invalid({
    protectedRanges: [{ path: PERSONAL, range: { frontMatter: true, level: 2 } }],
    placement: { files: ['*.md'], allowed: [{ under: 'Projects', link: 'Alex' }] },
    report: { filed: 0, question: [] },
    properties: [{ path: PERSONAL, equal: { custom: 'Alex' } }],
    files: { presnt: [PERSONAL] },
    runs: [{ answers: [{ request: 'Rent?', contain: ['1,450'] }] }, { tables: [{ path: PERSONAL, header: ['A'], rows: [], cells: [] }] }],
  })).toEqual([
    'expected.protectedRanges[0].range: Unrecognized key: "level"',
    'expected.properties[0]: Unrecognized key: "equal"',
    'expected.files: Unrecognized key: "presnt"',
    'expected.placement.allowed[0]: Unrecognized key: "link"',
    'expected.report: Unrecognized key: "question"',
    'expected.runs[0].answers[0]: Unrecognized key: "contain"',
    'expected.runs[1].tables[0]: Unrecognized key: "cells"',
  ]);
  // Wrong types, at their places.
  expect(invalid({ report: { filed: '1' }, notes: [{ path: PERSONAL, contains: 'café' }], linksResolve: 'yes', unchanged: PERSONAL })).toEqual([
    'expected.unchanged: Invalid input: expected array, received string',
    'expected.notes[0].contains: Invalid input: expected array, received string',
    'expected.linksResolve: Invalid input: expected boolean, received string',
    'expected.report.filed: Invalid input: expected number, received string',
  ]);
  // Bounds: a count is a whole number from 0, a heading or folder is named, and a list that would pass empty has an entry.
  expect(invalid({
    report: { questionsExactly: -1 }, notes: [{ path: PERSONAL, timelineMin: 1.5 }], placement: { files: [], allowed: [{ under: '' }] },
    protectedRanges: [{ path: PERSONAL, range: { heading: '' } }], tables: [{ path: PERSONAL, header: [], rows: [['a']] }],
  })).toEqual([
    'expected.tables[0].header: expected a non-empty list',
    'expected.protectedRanges[0].range.heading: Too small: expected string to have >=1 characters',
    'expected.placement.files: expected a non-empty list',
    'expected.placement.allowed[0].under: Too small: expected string to have >=1 characters',
    'expected.notes[0].timelineMin: Invalid input: expected int, received number',
    'expected.report.questionsExactly: Too small: expected number to be >=0',
  ]);
  // Malformed presses: not a list, not an object, a press with its own runs.
  expect(invalid({ runs: {} })).toEqual(['expected.runs: Invalid input: expected array, received object']);
  expect(invalid({ runs: [null, { runs: [] }] })).toEqual([
    'expected.runs[0]: Invalid input: expected object, received null',
    'expected.runs[1]: Unrecognized key: "runs"',
  ]);
  // Malformed subjects, answers and tables.
  expect(invalid({
    report: { questionSubjects: [{ kind: 'pair', notes: [PATHS.a] }, { kind: 'person' }], pairSubject: { kind: 'state', note: PERSONAL } },
    answers: [{ contains: ['1,450'] }], tables: [{ path: PERSONAL, header: ['A'], rows: [[1]] }],
  })).toEqual([
    'expected.answers[0].request: Invalid input: expected string, received undefined',
    'expected.tables[0].rows[0][0]: Invalid input: expected string, received number',
    'expected.report.pairSubject.kind: Invalid input: expected "pair"',
    'expected.report.pairSubject.notes: Invalid input: expected tuple, received undefined',
    'expected.report.pairSubject: Unrecognized key: "note"',
    'expected.report.questionSubjects[0].notes: Too small: expected array to have >=2 items',
    `expected.report.questionSubjects[1].kind: Invalid discriminator value. Expected 'pair' | 'state' | 'inbox' | 'request' | 'folder'`,
  ]);
  // An expectation that is not the schema scores nothing else: its other checks would be read from a guess.
  expect(invalid({ files: { present: ['Z.md'] }, linksResolve: 'yes' })).toEqual(['expected.linksResolve: Invalid input: expected boolean, received string']);
  // Guards: an empty expectation passes, and every case's expected.json is the schema.
  expect(unmet({})).toEqual([]);
  const cases = await loadCorpus(resolve(RUNNER, '../testing/corpus'));
  expect(cases.length).toBeGreaterThan(0);
  expect(cases.flatMap((c) => scoreCase(c, { after: {}, lastRun: null }).unmet.filter((line) => /^expected[.:]/.test(line)).map((line) => `${c.id}: ${line}`))).toEqual([]);
});

it('corpus-scorer-validation AC2: report contents count only after current schema validation', () => {
  const counts: Expected = { report: { filed: 1, questionsExactly: 1 } };
  const filed = { name: 'Seeds.txt', title: 'Seeds', to: 'Projects', kind: 'note' };
  // A malformed row satisfies no count: a filed row with no fields, a question with only an id.
  expect(unmet(counts, press({ lastRun: { v: 1, run: { ...RUN, report: { ...ROWS, filed: [{}], questions: [{ id: 'q-state-p' }] } } } })), 'a malformed report counts nothing')
    .toEqual([`report: ${LAST_RUN} is not a last-run file`]);
  expect(unmet(counts, press({ lastRun: report([{ id: 'q-state-p' }], { filed: [filed] }) }))).toEqual([]);
  // Another version, a run with no phase, a report missing a list, a filed row of no known kind, the old bare shape.
  for (const lastRun of [
    { v: 2, run: { ...RUN, report: { ...ROWS, filed: [filed], questions: [asked({ id: 'q-state-p' })] } } },
    { v: 1, run: { ...RUN, phase: undefined, report: { ...ROWS, filed: [filed], questions: [asked({ id: 'q-state-p' })] } } },
    { v: 1, run: { ...RUN, report: { ...ROWS, setAside: undefined, filed: [filed], questions: [asked({ id: 'q-state-p' })] } } },
    { v: 1, run: { ...RUN, report: { ...ROWS, filed: [{ ...filed, kind: 'video' }], questions: [asked({ id: 'q-state-p' })] } } },
    { v: 1, run: { report: { filed: [filed], questions: [asked({ id: 'q-state-p' })] } } },
  ]) expect(unmet(counts, press({ lastRun })), JSON.stringify(lastRun)).toEqual([`report: ${LAST_RUN} is not a last-run file`]);
  // Typed subjects read only a report in the current shape.
  expect(unmet({ report: { questionSubjects: [{ kind: 'state', note: PERSONAL }] } }, press({ lastRun: { v: 1, run: { report: { questions: [{ id: 'q-state-p' }] } } } })))
    .toEqual([`report: ${LAST_RUN} is not a last-run file`, `report.questions: missing {"kind":"state","note":"${PERSONAL}"} subject`]);
  // No file, or a run that ended with no report, is no report.
  expect(unmet(counts, press({ lastRun: null }))).toEqual(['report: no last-run.json report']);
  expect(unmet(counts, press({ lastRun: { v: 1, run: { ...RUN, phase: 'failed', failure: 'The model did not answer.' } } }))).toEqual(['report: no last-run.json report']);
  // The requests file an answer is read from is its current shape too: a done row with no id or time is refused.
  const answers: Expected = { answers: [{ request: 'Rent?', contains: ['1,450'] }] };
  const requests = (done: unknown[]): ReturnType<typeof press> => press({ after: { [PERSONAL]: PERSON_TEXT, '.bower/requests.json': JSON.stringify({ v: 1, done }) } });
  expect(unmet(answers, requests([{ id: 'change-1', at: 0, text: 'Rent?', done: 'Rent is 1,450.' }]))).toEqual([]);
  expect(unmet(answers, requests([{ text: 'Rent?', done: 'Rent is 1,450.' }]))).toEqual(['answers: .bower/requests.json is not a requests file']);
});

it('corpus-scorer-validation AC3: placement requires a match and wildcard notes check every match', () => {
  const garden: Expected = { placement: { files: ['*Garden*.md'], allowed: [{ under: 'Projects' }] } };
  expect(unmet(garden), 'zero matched files fails').toEqual(['placement: no file matches [*Garden*.md]']);
  const put = (files: Record<string, string>): ReturnType<typeof press> => press({ after: { [PERSONAL]: PERSON_TEXT, ...files } });
  expect(unmet(garden, put({ 'Projects/Garden.md': 'Seeds.\n' }))).toEqual([]);
  expect(unmet(garden, put({ 'Areas/Garden.md': 'Seeds.\n' }))).toEqual(['placed outside the rubric: Areas/Garden.md']);
  // A file held in the Inbox is placed like any other: it passes only where the rubric names the Inbox as an outcome.
  expect(unmet(garden, put({ 'Inbox/Garden.md': 'Seeds.\n' })), 'an inbox-held file is no vacuous pass').toEqual(['placed outside the rubric: Inbox/Garden.md']);
  const held: Expected = { placement: { files: ['*Garden*.md'], allowed: [{ under: 'Projects' }, { under: 'Inbox' }] } };
  expect(unmet(held, put({ 'Inbox/Garden.md': 'Seeds.\n' }))).toEqual([]);
  // Each placement of a list needs its own match.
  const two: Expected = { placement: [{ files: ['*Garden*.md'], allowed: [{ under: 'Projects' }] }, { files: ['*.pdf'], allowed: [{ under: 'Projects' }] }] };
  expect(unmet(two, put({ 'Projects/Garden.md': 'Seeds.\n' }))).toEqual(['placement: no file matches [*.pdf]']);
  // A wildcard note: every note it matches meets the expectation, each named by its own path; no match is a missing note.
  const notes: Expected = { notes: [{ path: 'Projects/Garden*.md', contains: ['Seeds'], excludes: ['Weeds'] }] };
  expect(unmet(notes, put({ 'Projects/Garden.md': 'Seeds.\n', 'Projects/Garden plot.md': 'Seeds and weeds.\n' }))).toEqual([]);
  expect(unmet(notes, put({ 'Projects/Garden.md': 'Seeds.\n', 'Projects/Garden plot.md': 'Weeds.\n' })), 'every match is checked')
    .toEqual(['Projects/Garden plot.md: lacks "Seeds"', 'Projects/Garden plot.md: has "Weeds"']);
  expect(unmet(notes)).toEqual(['missing note: Projects/Garden*.md']);
});

it('corpus-scorer-state AC1: unchanged comparisons select an explicit baseline', () => {
  const NOTE = 'Projects/Garden.md';
  const MADE = 'Projects/Garden plot.md';
  const SEEDED = 'Alex grows herbs.\n';
  const EDITED = 'Alex grows herbs and mint.\n';
  /** A folder with each file's Drive id and a stand-in for the SHA-256 of its bytes. */
  const at = (files: Record<string, [id: string, text: string]>): { after: Record<string, string>; files: Record<string, { id: string; sha256: string }> } => ({
    after: Object.fromEntries(Object.entries(files).map(([p, [, text]]) => [p, text])),
    files: Object.fromEntries(Object.entries(files).map(([p, [id, text]]) => [p, { id, sha256: `sha256 of ${text}` }])),
  });
  // Press 1 makes a note; Alex edits the seeded note between the presses; press 2 changes neither.
  const first = { ...at({ [NOTE]: ['f1', SEEDED], [MADE]: ['f2', 'Plot.\n'] }), lastRun: report([]), start: at({ [NOTE]: ['f1', SEEDED] }) };
  const second = { ...at({ [NOTE]: ['f1', EDITED], [MADE]: ['f2', 'Plot.\n'] }), lastRun: report([]), start: at({ [NOTE]: ['f1', EDITED], [MADE]: ['f2', 'Plot.\n'] }) };
  const atSecond = (expected: Expected): string[] => scoreCase({ expected: { runs: [{}, expected] }, folder: { [NOTE]: SEEDED } }, { ...second, runs: [first] }).unmet;
  expect(atSecond({ unchangedSinceStart: [NOTE, MADE] }), 'a between-press personal edit is measured from the press start').toEqual([]);
  // Seed-relative `unchanged` keeps its meaning: the edited note differs from the seed, and a note a press made is not in it.
  expect(atSecond({ unchanged: [NOTE] })).toEqual([`run 2: file changed: ${NOTE}`]);
  expect(atSecond({ unchanged: [MADE] })).toEqual([`run 2: file changed: ${MADE}`]);
  // The preceding press: what press 1 made is kept; the person's edit is a change since then.
  expect(atSecond({ unchangedSincePrevious: [MADE] })).toEqual([]);
  expect(atSecond({ unchangedSincePrevious: [NOTE, MADE] })).toEqual([`run 2: unchangedSincePrevious: ${NOTE} changed bytes`]);
  // The top-level expectations score the final press against the same preceding press; a pattern checks every match.
  expect(scoreCase({ expected: { unchangedSincePrevious: ['Projects/*'], runs: [{}, {}] }, folder: {} }, { ...second, runs: [first] }).unmet)
    .toEqual([`unchangedSincePrevious: ${NOTE} changed bytes`]);
  // Each pattern must match a file of its baseline, and a baseline with no snapshot fails closed.
  expect(atSecond({ unchangedSinceStart: ['Areas/*'] })).toEqual(['run 2: unchangedSinceStart: no file matches Areas/*']);
  const plain = { ...at({ [NOTE]: ['f1', SEEDED] }), lastRun: report([]) };
  expect(scoreCase({ expected: { unchangedSincePrevious: [NOTE] }, folder: {} }, plain).unmet).toEqual(['unchangedSincePrevious: no snapshot of the preceding press']);
  expect(scoreCase({ expected: { unchangedSinceStart: [NOTE] }, folder: {} }, plain).unmet).toEqual(['unchangedSinceStart: no snapshot of this press before it ran']);
  expect(unmet({ unchangedSinceStart: [] })).toEqual(['expected.unchangedSinceStart: expected a non-empty list']);
});

/** Every module a source file reaches through its imports (relative ones resolved to files), with the bare specifiers it names. */
function closure(start: string): { files: string[]; packages: string[]; unresolved: string[] } {
  const files: string[] = [];
  const packages = new Set<string>();
  const unresolved: string[] = [];
  const visit = (file: string): void => {
    if (files.includes(file)) return;
    files.push(file);
    const text = readFileSync(file, 'utf8');
    // A static import or re-export at the start of a line (no quote before its `from`), a literal dynamic import, a bare import.
    for (const m of text.matchAll(/^(?:import|export)\s[^'"]*?\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)|^import\s+'([^']+)'/gm)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? '';
      if (!spec.startsWith('.')) { packages.add(spec); continue; }
      const base = resolve(dirname(file), spec);
      const found = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), base].find((p) => existsSync(p) && statSync(p).isFile());
      if (!found) unresolved.push(`${relative(RUNNER, file)} -> ${spec}`);
      else if (/\.tsx?$/.test(found)) visit(found);
    }
  };
  visit(resolve(RUNNER, start));
  return { files: files.map((f) => relative(RUNNER, f)), packages: [...packages].sort(), unresolved };
}

/** What a scorer must not reach: Vitest or another test library, the runner's tests and drivers (scripted replies and planning), a test file. */
const testRuntime = (c: ReturnType<typeof closure>): string[] => [
  ...c.packages.filter((p) => /^(vitest|@vitest\/|@testing-library\/)/.test(p)),
  ...c.files.filter((f) => f.startsWith('test/') || /\.test\.tsx?$/.test(f) || f.endsWith('src/test-setup.ts')),
];

it('corpus-scorer-home AC3: evaluation code has no test-runtime dependency', () => {
  const sources = ['src', 'test'].flatMap((dir) => readdirSync(join(RUNNER, dir)).filter((f) => f.endsWith('.ts')).map((f) => `${dir}/${f}`));
  const homes = sources.filter((f) => /^export function scoreCase\b/m.test(readFileSync(join(RUNNER, f), 'utf8')));
  expect(homes, 'the complete scorer is defined once, in runner evaluation code').toEqual(['src/corpus.ts']);
  const scorer = closure(homes[0] ?? 'src/corpus.ts');
  expect(scorer.unresolved).toEqual([]);
  expect(scorer.files).toContain('../src/data/contracts/ownership-format.ts');
  expect(testRuntime(scorer), 'the scorer reaches no test runtime').toEqual([]);
  // Negative control: the test driver reaches Vitest and its scripted provider, and the check sees both.
  const driver = closure('test/corpus-run.ts');
  expect(driver.files).toEqual(expect.arrayContaining(['test/corpus-run.ts', 'test/b1-planning-support.ts']));
  expect(testRuntime(driver)).toEqual(expect.arrayContaining(['vitest', 'test/b1-planning-support.ts']));
});
