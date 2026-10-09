/// <reference types="node" />
/**
 * One subject, one key, one open-questions function (TL-P4-14 stage 3, `c3-subject`): what a question is about and
 * whether it is still open are decided in `contracts/questions.ts` alone, for the reader (`DriveVault.questions()`,
 * the answer loop) and the planner (`planScripted`, the runner's answers).
 *
 * That only the home builds or reads a `q-ask-`/`q-state-` id is an ESLint rule (scripts/eslint-question-key.mjs, run
 * by `pnpm lint` over every file; TL-P4-17 addendum 4). This test feeds the configs ESLint runs sample source; it never
 * scans the repo.
 */
import { join, resolve } from 'node:path';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../..');
const load = async (path: string): Promise<Linter.Config[]> => ((await import(/* @vite-ignore */ join(REPO, path))) as { default: Linter.Config[] }).default;

/** What the package's own ESLint config says of a sample file at `filename`: line and rule part, syntax rules only. */
async function flagged(pkg: '' | 'runner', filename: string, text: string): Promise<string[]> {
  const cwd = join(REPO, pkg);
  const config = await load(join(pkg, 'eslint.config.js'));
  return new Linter({ configType: 'flat', cwd })
    // typescript-eslint finds its root from the caller, which is vitest here: name it.
    .verify(text, [...config, { languageOptions: { parserOptions: { tsconfigRootDir: cwd } } }], { filename: join(cwd, filename) })
    .filter((m) => m.ruleId === 'no-restricted-syntax' || m.fatal)
    .map((m) => `${m.line} ${m.message.slice(0, m.message.indexOf(':'))}`);
}

describe('one key and one open-questions function (c3-subject)', () => {
  it('one key and one open-questions function serve the reader and the planner', async () => {
    // A copy of the key, spelled out, in the app or the runner.
    expect(await flagged('', 'src/data/vault/sample.ts', 'export const ask = (id: string): string => `q-ask-${id}`;\n')).toEqual(['1 spells a question id']);
    expect(await flagged('', 'src/data/sample.ts', "export const isState = (id: string): boolean => id.startsWith('q-state-');\n")).toEqual(['1 spells a question id']);
    expect(await flagged('runner', 'src/sample.ts', 'export const state = (id: string): string => `q-state-${id}`;\n')).toEqual(['1 spells a question id']);
    // A copy built from other constants: the key's construction is found, not one spelling of it.
    const pieces = [
      "const Q = 'q-';",
      "const KIND = 'ask';",
      'export const mine = (id: string): string => `${Q}${KIND}-${id}`;',
      "export const theirs = (id: string): string => 'q' + '-' + KIND + '-' + id;",
      'export const again = (id: string): string => `q-${KIND}-${id}`;',
    ].join('\n');
    expect(await flagged('', 'src/data/spine/sample.ts', pieces)).toEqual(['1 builds a question id', '4 builds a question id', '5 builds a question id']);
    // Other questions keep their own ids: a disagreement's, the summaries rule's.
    const others = "export const dis = (r: { id: string }, n: number): string => `q-${r.id}-${n}`;\nexport const ADOPT = 'q-adopt-states';\n";
    expect(await flagged('', 'src/data/demo/sample.ts', others)).toEqual([]);
    // The home alone builds the key, and the other syntax rules still hold there; a file the reservation rule allows
    // is still held to this one.
    const home = "const ASK = 'q-ask-';\nexport const askId = (id: string): string => `${ASK}${id}`;\n";
    expect(await flagged('', 'src/data/contracts/questions.ts', home)).toEqual([]);
    expect(await flagged('', 'src/data/contracts/questions.ts', 'export const ids = (d: Drive) => d.generateIds(1);\n')).toEqual(['1 calls for ids']);
    expect(await flagged('', 'src/data/spine/write-once.ts', home)).toEqual(['1 spells a question id']);
  });
});
