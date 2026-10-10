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

function animatedCssClasses(css: string): Set<string> {
  const sheet = document.createElement('style');
  sheet.textContent = css;
  document.head.append(sheet);
  const classes = new Set<string>();
  const visit = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if ('cssRules' in rule) visit(rule.cssRules as CSSRuleList);
      if (!('selectorText' in rule) || !('style' in rule)) continue;
      const style = rule.style as CSSStyleDeclaration;
      const animated = Array.from({ length: style.length }, (_, i) => style.item(i))
        .some((name) => /^(?:animation|transition)(?:-|$)/.test(name));
      if (!animated) continue;
      // CSSOM parses declarations, excluding comments and quoted declaration
      // lookalikes. Strip quoted selector values too: [title=".fake"] is no class.
      const selector = (rule.selectorText as string)
        .replace(/\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
      for (const match of selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
        if (match[1]) classes.add(match[1]);
      }
    }
  };
  try {
    if (!sheet.sheet) throw new Error('Missing CSS sheet.');
    visit(sheet.sheet.cssRules);
    return classes;
  } finally { sheet.remove(); }
}

function engineCssGate(source: string) {
  const file = ts.createSourceFile('engine.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const methods = new Map<string, ts.MethodDeclaration>();
  const toggled = new Set<string>();
  const unresolved: string[] = [];
  const property = (node: ts.Expression): string | undefined => {
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      return node.argumentExpression.text;
    }
    return undefined;
  };
  const receiver = (node: ts.Expression): ts.Expression | undefined =>
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) ? node.expression : undefined;
  const classCall = (node: ts.Node): ts.CallExpression | undefined => {
    if (!ts.isCallExpression(node)) return undefined;
    const target = receiver(node.expression);
    return target && property(target) === 'classList' &&
      ['add', 'remove', 'toggle', 'replace'].includes(property(node.expression) ?? '') ? node : undefined;
  };
  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) methods.set(node.name.text, node);
    const call = classCall(node);
    if (call) {
      const args = property(call.expression) === 'toggle' ? call.arguments.slice(0, 1) : call.arguments;
      for (const arg of args) {
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) toggled.add(arg.text);
        else unresolved.push(arg.getText(file));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  const cleared = new Set<string>();
  const visited = new Set<string>();
  const settle = (name: string): void => {
    if (visited.has(name)) return;
    visited.add(name);
    const method = methods.get(name);
    if (!method?.body) return;
    const walk = (node: ts.Node): void => {
      const call = classCall(node);
      if (call) {
        const operation = property(call.expression);
        const removes = operation === 'remove' || operation === 'replace' ||
          (operation === 'toggle' && call.arguments[1]?.kind === ts.SyntaxKind.FalseKeyword);
        if (removes) {
          const args = operation === 'remove' ? call.arguments : call.arguments.slice(0, 1);
          for (const arg of args) {
            if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) cleared.add(arg.text);
          }
        }
      }
      if (ts.isCallExpression(node) && receiver(node.expression)?.kind === ts.SyntaxKind.ThisKeyword) {
        const called = property(node.expression);
        if (called) settle(called);
      }
      ts.forEachChild(node, walk);
    };
    walk(method.body);
  };
  settle('beginSettle');
  return { toggled, cleared, unresolved, hasSettle: methods.has('beginSettle') };
}

it('settle begin clears every engine-toggled animated CSS class', () => {
  // Derive the list by intersecting CSSOM animation/transition selectors with
  // classList operations in the TypeScript AST. AST trivia and opaque strings
  // are excluded; only actual classList literal arguments supply class names.
  // Follow this.method() from beginSettle, so a shared clearing helper counts.
  // A new animated selector + engine toggle without settle handling must fail;
  // dynamic class expressions fail explicitly rather than silently escaping.
  const css = animatedCssClasses(`
    /* .comment { animation: fake 1s; } */
    .spark.go { animation: spark 0.7s; }
    @media screen { .chip.slide { transition: opacity 0.2s; } }
    .plain { content: "animation: fake 1s"; }
    [title=".quoted"].real { animation-name: pulse; }
  `);
  expect([...css].sort()).toEqual(['chip', 'go', 'real', 'slide', 'spark']);
  const fixture = engineCssGate(`class Engine {
    private beginSettle() { this.clearCss(); }
    private clearCss() { this.spark.classList.remove('go'); this.chip.classList.toggle('slide', false); }
    private sparkle() {
      // this.spark.classList.add('comment');
      const text = "this.spark.classList.add('quoted')";
      const template = \`this.spark.classList.add('template')\`;
      this.spark.classList.add('go'); this.chip.classList.add('slide');
    }
  }`);
  expect([...fixture.toggled].sort()).toEqual(['go', 'slide']);
  expect([...fixture.cleared].sort()).toEqual(['go', 'slide']);
  expect(engineCssGate('class Engine { sparkle() { this.el.classList.add(name); } }').unresolved)
    .toEqual(['name']);
  const engine = engineCssGate(readFileSync('src/bird/engine.ts', 'utf8'));
  const animated = animatedCssClasses(readFileSync('src/bird/bower.css', 'utf8'));
  expect(engine.unresolved, 'all engine class toggles must be structurally enumerable').toEqual([]);
  expect(engine.hasSettle, 'the production settle-begin path exists').toBe(true);
  const owned = [...animated].filter((name) => engine.toggled.has(name));
  expect(owned.length, 'positive control: CSS motion is owned by the engine').toBeGreaterThan(0);
  expect(owned.filter((name) => !engine.cleared.has(name)),
    'animated classes missing removal in the settle-begin path').toEqual([]);
});
