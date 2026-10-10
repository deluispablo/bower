import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';

function drawCalls(source: string) {
  const file = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls: ts.CallExpression[] = [];
  // Strip comments and strings from consideration using the TypeScript parser,
  // not a regex: trivia and literal contents cannot become CallExpression nodes.
  // Template interpolations remain code; definitions are MethodDeclaration nodes.
  // Count every apply(...) call, even a bare or optional call, so a new caller
  // cannot hide outside this.apply(...). Syntax structure decides ownership.
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if ((ts.isIdentifier(callee) && callee.text === 'apply') ||
          (ts.isPropertyAccessExpression(callee) && callee.name.text === 'apply') ||
          (ts.isElementAccessExpression(callee) && ts.isStringLiteral(callee.argumentExpression) &&
            callee.argumentExpression.text === 'apply')) calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { file, calls };
}

function isMotionCheck(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword &&
      node.name.text === 'motion') return true;
  return ts.forEachChild(node, isMotionCheck) ?? false;
}

it('apply has exactly one call site inside the private motion gate', () => {
  // Positive control: comments, quoted text, regexes, template text and the
  // definition do not count. Actual code inside interpolation does count.
  const fixture = drawCalls(`class Engine {
    private motion = 'live';
    private apply() {}
    private gate() {
      // this.apply();
      const text = "this.apply()";
      const pattern = /apply\\(/;
      const template = \`apply() \${this.motion}\`;
      if (this.motion === 'still') return;
      this.apply();
    }
  }`);
  expect(fixture.calls).toHaveLength(1);
  expect(drawCalls('const text = `text ${this.apply()}`;').calls).toHaveLength(1);

  const { file, calls } = drawCalls(readFileSync('src/bird/engine.ts', 'utf8'));
  const sites = calls.map((call) => {
    const { line } = file.getLineAndCharacterOfPosition(call.getStart(file));
    return `line ${line + 1}: ${call.getText(file)}`;
  });
  expect(sites, 'every caller must reach apply through one gate').toHaveLength(1);
  const call = calls[0];
  if (!call) throw new Error('Missing draw call.');
  let owner: ts.Node | undefined = call.parent;
  while (owner && !ts.isMethodDeclaration(owner)) owner = owner.parent;
  expect(owner && ts.isMethodDeclaration(owner), 'the gate is a class method').toBe(true);
  if (!owner || !ts.isMethodDeclaration(owner) || !owner.body) throw new Error('Missing gate method.');
  expect(owner.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword),
    'only the private draw path may call apply').toBe(true);
  // The sole caller must actually examine motion before drawing. No method
  // name is prescribed; the mounted property proves the branches' behaviour.
  const checks: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isIfStatement(node) && isMotionCheck(node.expression)) ||
        (ts.isSwitchStatement(node) && isMotionCheck(node.expression)) ||
        (ts.isConditionalExpression(node) && isMotionCheck(node.condition))) checks.push(node);
    ts.forEachChild(node, visit);
  };
  visit(owner.body);
  expect(checks.some((check) => check.getStart(file) < call.getStart(file)),
    'the private draw path checks this.motion before apply').toBe(true);
});
