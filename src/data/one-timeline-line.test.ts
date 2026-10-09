/// <reference types="node" />
/**
 * One Timeline-line pattern (TL-P4-14 stage 3, `c3-note-sections`): only `contracts/timeline-line.ts` spells the
 * pattern that reads a Timeline line (`parseTimelineLine`) or the template that writes one (`timelineLine`). That is
 * an ESLint rule (scripts/eslint-timeline-line.mjs, run by `pnpm lint` over every file; TL-P4-17 addendum 4). This
 * test feeds the configs ESLint runs sample source; it never scans the repo.
 */
import { join, resolve } from 'node:path';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../..');
const load = async (path: string): Promise<Linter.Config[]> => ((await import(/* @vite-ignore */ join(REPO, path))) as { default: Linter.Config[] }).default;

async function flagged(pkg: '' | 'runner', filename: string, text: string): Promise<string[]> {
  const cwd = join(REPO, pkg);
  const config = await load(join(pkg, 'eslint.config.js'));
  return new Linter({ configType: 'flat', cwd })
    .verify(text, [...config, { languageOptions: { parserOptions: { tsconfigRootDir: cwd } } }], { filename: join(cwd, filename) })
    .filter((m) => m.ruleId === 'no-restricted-syntax' || m.fatal)
    .map((m) => `${m.line} ${m.message.slice(0, m.message.indexOf(':'))}`);
}

describe('one Timeline-line pattern', () => {
  it('the Timeline-line pattern exists once', async () => {
    const reader = 'export const read = (l: string) => /^- (.*?) · (.*?)(?: · \\[\\[([^\\]]+)\\]\\])?$/.exec(l);\n';
    const looser = 'export const said = (l: string) => /^- .*? · (.*?)$/.exec(l);\n';
    const writer = 'export const write = (d: string, t: string, s: string) => `- ${d} · ${t}${s ? ` · [[${s}]]` : ""}`;\n';
    // A copy of the reader, in the app, the Worker's package or the runner.
    expect(await flagged('', 'src/data/spine/sample.ts', reader)).toEqual(['1 spells the Timeline-line pattern']);
    expect(await flagged('', 'src/data/contracts/sample.ts', looser)).toEqual(['1 spells the Timeline-line pattern']);
    expect(await flagged('runner', 'src/sample.ts', reader)).toEqual(['1 spells the Timeline-line pattern']);
    // A copy of the writer.
    expect(await flagged('', 'src/data/contracts/sample.ts', writer)).toEqual(['1 writes a Timeline line']);
    // The home alone spells both.
    expect(await flagged('', 'src/data/contracts/timeline-line.ts', reader + writer)).toEqual([]);
    // Other regexes and templates are left alone.
    expect(await flagged('', 'src/data/spine/sample.ts', 'export const r = /^- (.*?)$/;\nexport const t = (a: string) => `${a} · ${a}`;\n')).toEqual([]);
    // The other syntax rules still hold in the home.
    expect(await flagged('', 'src/data/contracts/timeline-line.ts', 'export const ids = (d: Drive) => d.generateIds(1);\n')).toEqual(['1 calls for ids']);
  });
});
