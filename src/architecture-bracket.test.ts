/// <reference types="node" />
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';

// Execute the unexported production declarations without importing its repository-wide tests.
const text = readFileSync(new URL('./architecture.test.ts', import.meta.url), 'utf8');
const source = ts.createSourceFile('architecture.test.ts', text, ts.ScriptTarget.Latest);
const declarations = new Map<string, string>();
const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
    && ['FORBIDDEN', 'usesForbiddenGlobal'].includes(node.name.text)) {
    declarations.set(node.name.text, `const ${node.getText(source)};`);
  }
  ts.forEachChild(node, visit);
};
visit(source);
if (declarations.size !== 2) throw new Error('The production purity scanner declarations were not found.');
const compiled = ts.transpileModule(
  `${declarations.get('FORBIDDEN')}\n${declarations.get('usesForbiddenGlobal')}\nreturn usesForbiddenGlobal;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const usesForbiddenGlobal = new Function('ts', compiled)(ts) as (text: string, fileName: string) => boolean;

it.each(['src/data/contracts/bracket-fixture.ts', 'runner/src/bracket-fixture.ts'])('bracket-global: %s', (fileName) => {
  expect(usesForbiddenGlobal("console.log('document');", fileName), 'ordinary log literal stays inert').toBe(false);
  expect(usesForbiddenGlobal("export const get = () => globalThis.fetch('https://example.com');", fileName),
    'dotted fetch remains impure').toBe(true);
  expect({
    fetch: usesForbiddenGlobal("export const get = () => globalThis['fetch']('https://example.com');", fileName),
    document: usesForbiddenGlobal("export const title = () => globalThis['document'].title;", fileName),
  }, 'each computed global access must be impure').toEqual({ fetch: true, document: true });
});
