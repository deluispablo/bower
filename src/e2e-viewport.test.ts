/// <reference types="node" />
import { join, resolve } from 'node:path';
import { Linter } from 'eslint';
import { expect, it } from 'vitest';

const repo = resolve(import.meta.dirname, '..');

it('e2e viewport changes go through the shell-settling helper', async () => {
  const config = ((await import(/* @vite-ignore */ join(repo, 'eslint.config.js'))) as { default: Linter.Config[] }).default;
  const flagged = (filename: string, source: string) => new Linter({ configType: 'flat', cwd: repo })
    .verify(source, [...config, { languageOptions: { parserOptions: { tsconfigRootDir: repo } } }], {
      filename: join(repo, filename),
    })
    .filter((message) => message.ruleId === 'no-restricted-properties' || message.fatal);

  const direct = 'await page.setViewportSize({ width: 1440, height: 900 });';
  expect(flagged('e2e/sample.spec.ts', direct)).toHaveLength(1);
  expect(flagged('e2e/sample.spec.ts', "await page['setViewportSize']({ width: 375, height: 900 });")).toHaveLength(1);
  expect(flagged('e2e/viewport.ts', direct)).toHaveLength(0);
  expect(flagged('e2e/sample.spec.ts', 'await resize(page, { width: 1440, height: 900 });')).toHaveLength(0);
});
