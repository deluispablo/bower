/**
 * The complete corpus scorer (corpus-scorer-home): `scoreCase` in `runner/src/corpus.ts` scores every expectation of a
 * case, including the protected ranges, Drive properties, typed question subjects and per-press runs that only the test
 * driver used to check, from plain data (the starting folder and what each press left), and it reads no test runtime.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { scoreCase, type Expected } from '../src/corpus';

const RUNNER = resolve(import.meta.dirname, '..');
const PERSONAL = 'Projects/Alex.md';
const PERSON_TEXT = '---\r\ntitle: Alex\r\n---\r\n\r\n## My thoughts\r\nAlex likes café light.\r\n\r\n## Timeline\r\n';
const PATHS = { a: 'Projects/A.md', b: 'Projects/B.md', c: 'Projects/C.md', p: PERSONAL, i: 'Inbox/Seeds.txt' };
const report = (questions: unknown[]): unknown => ({ v: 1, run: { report: { questions } } });
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
    `${PERSONAL}: properties.absent: expected a non-empty list`, `${PERSONAL}: properties.equals: expected at least one key`]);
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
  expect(unmet(subjects([]))).toEqual(['report.questionSubjects: expected a non-empty list']);
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
  expect(unmet(two, press(), [asked, asked])).toEqual(['runs: 3, expected 2', 'run 2: report.questions: 1, expected exactly 0']);
  const changed = press({ after: { [PERSONAL]: PERSON_TEXT.replace('light', 'Light') } });
  expect(unmet({ runs: [thoughts, {}] }, press(), [changed])).toEqual([`run 1: ${PERSONAL}: protected range changed: My thoughts`]);
  expect(unmet({ ...props, runs: [props] }, press({ props: { [PERSONAL]: { custom: 'Alex' } } }))).toEqual([]);
  expect(unmet({ ...props, runs: [props] })).toEqual([`${PERSONAL}: appProperty custom expected "Alex"`, `run 1: ${PERSONAL}: appProperty custom expected "Alex"`]);
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
