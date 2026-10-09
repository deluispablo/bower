/**
 * One subject, one key, one open-questions function (TL-P4-14 stage 3, `c3-subject`): what a question is about and
 * whether it is still open are decided in `contracts/questions.ts` alone, for the reader (`DriveVault.questions()`,
 * the answer loop) and the planner (`planScripted`, the runner's answers). A second copy of either is a rule failure.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../..');
const HOME = 'src/data/contracts/questions.ts';

/** Every source file of the app and the runner, tests left out. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'fixtures' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [relative(REPO, path)] : [];
  });
}
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8');

describe('one key and one open-questions function (c3-subject)', () => {
  it('one key and one open-questions function serve the reader and the planner', () => {
    const files = [...sources(join(REPO, 'src')), ...sources(join(REPO, 'runner/src'))];
    // The question ids' prefixes are spelled in one place: no other file reads a subject or a note out of an id.
    const spelled = files.filter((f) => f !== HOME && /['`]q-(ask|state)-/.test(read(f)));
    expect(spelled).toEqual([]);
    // The reader and the planner ask the one module; neither keeps its own copy.
    const users = ['src/data/vault/drive-vault.ts', 'src/data/answer-loop.ts', 'src/data/spine/scripted.ts', 'runner/src/claude.ts'];
    expect(users.filter((f) => !/from '[./]*(?:contracts\/|src\/data\/contracts\/)?questions'/.test(read(f)))).toEqual([]);
    expect(['src/data/vault/drive-vault.ts', 'src/data/spine/scripted.ts'].filter((f) => !read(f).includes('openQuestions('))).toEqual([]);
  });
});
