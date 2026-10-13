/**
 * Rules of the code's shape, checked by machine so no agent has to remember
 * them. Each failure says
 * what to do instead.
 */
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { fixture, removeFixtures, ROOT, run } from '@/testing/dependency-gate';

afterAll(removeFixtures);

const SRC = dirname(fileURLToPath(import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });

// Who may import which data source is checked by dependency-cruiser (.dependency-cruiser.cjs) on the real tree in pnpm check;
// this test drives that gate on small fixture trees (the rule list itself: src/dependency-rules.test.ts).
describe('the shape of the code', () => {
  it('the import rule sees dynamic and relative imports', () => {
    const base = { 'src/data/demo/world.ts': 'export const w = 1;\n', 'src/data/fake/pretend.ts': 'export const p = 1;\n', 'src/data/drive/fake-drive.ts': 'export const d = 1;\n' };
    for (const text of ["import { w } from '@/data/demo/world';", "export const m = () => import('../../data/fake/pretend');", "import { d } from '../../data/drive/fake-drive';"]) {
      const r = run(fixture({ ...base, 'src/features/a/Screen.ts': `${text}\n` }));
      expect(r.code, text).not.toBe(0);
      expect(r.out).toContain('screens-use-data-only-through-sources');
    }
    expect(run(fixture({ ...base, 'src/data/provider.tsx': 'export const q = 1;\n', 'src/features/a/Screen.ts': "import { q } from '../../data/provider';\n" })).code).toBe(0);
  });

  it('the claude provider path cannot reach the fixture modules', () => {
    // Even through a module that may import the demo (a wiring root such as choose.ts), the model path never reaches it.
    const base = { 'src/data/demo/fixture.ts': 'export const f = 1;\n', 'src/data/choose.ts': "import { f } from './demo/fixture';\nexport const c = f;\n" };
    const r = run(fixture({ ...base, 'runner/src/claude.ts': "import { c } from '../../src/data/choose';\nexport const x = c;\n" }));
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('claude-provider-reaches-no-fixture');
    expect(run(fixture({ ...base, 'runner/src/claude.ts': 'export const x = 1;\n' })).code).toBe(0);
  });

  it('screens never import a data source directly', () => {
    // The rule list (dependency-cruiser itself runs once, on the real tree, in pnpm check).
    const { forbidden } = createRequire(import.meta.url)(join(ROOT, '.dependency-cruiser.cjs')) as { forbidden: { name: string; from: { path: string }; to: { path: string } }[] };
    const hits = (re: string, path: string): boolean => new RegExp(re).test(path);
    const [screens, shell] = forbidden.filter((r) => r.name === 'screens-use-data-only-through-sources');
    // Screens (features, app, ui, bird) reach data only through sources: every source folder is a target.
    for (const from of ['src/features/a/Screen.ts', 'src/app/Shell.tsx', 'src/ui/Button.tsx', 'src/bird/presence.ts']) expect(hits(screens?.from.path ?? '', from), from).toBe(true);
    for (const target of ['demo', 'drive', 'vault', 'live', 'worker', 'fake', 'contract'].map((d) => `src/data/${d}/x.ts`).concat('src/data/choose.ts')) expect(hits(screens?.to.path ?? '', target), target).toBe(true);
    expect(hits(screens?.to.path ?? '', 'src/data/sources.ts')).toBe(false);
    expect(hits(screens?.from.path ?? '', 'src/data/provider.tsx')).toBe(false);
    expect(hits(shell?.from.path ?? '', 'src/app/App.tsx')).toBe(true);
  });

  it('errors are never swallowed', () => {
    // Every catch (a block, or a .catch handler, or a .then rejection handler) logs,
    // throws on, or says in a comment starting "expected:" why ignoring is right.
    const bad: string[] = [];
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
      });
    /** The text of a handler from `start`: up to its matching close, counting brackets. */
    const body = (text: string, start: number): string => {
      let depth = 0;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (c === '{' || c === '(') depth++;
        else if (c === '}' || c === ')') {
          depth--;
          if (depth <= 0) return text.slice(start, i + 1);
        }
      }
      return text.slice(start);
    };
    /** The second argument of a call's text "(a, b)", or null when there is one argument. */
    const secondArg = (call: string): string | null => {
      let depth = 0;
      for (let i = 0; i < call.length; i++) {
        const c = call[i];
        if (c === '{' || c === '(' || c === '[') depth++;
        else if (c === '}' || c === ')' || c === ']') depth--;
        else if (c === ',' && depth === 1) return call.slice(i + 1, -1).trim() || null;
      }
      return null;
    };
    const OK = /console\.error|report\(|throw\b|reject\(|expected:/;
    for (const f of walk(SRC)) {
      const text = readFileSync(f, 'utf8');
      const lineOf = (i: number): number => text.slice(0, i).split('\n').length;
      const prevLine = (i: number): string => text.split('\n')[lineOf(i) - 2] ?? '';
      for (const m of text.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{/g)) {
        const i = m.index ?? 0;
        if (!OK.test(body(text, i + m[0].length - 1)) && !/expected:/.test(prevLine(i))) bad.push(`${relative(SRC, f)}:${lineOf(i)}  catch block`);
      }
      for (const m of text.matchAll(/\.catch\(/g)) {
        const i = m.index ?? 0;
        if (!OK.test(body(text, i + 6)) && !/expected:/.test(prevLine(i))) bad.push(`${relative(SRC, f)}:${lineOf(i)}  .catch(…)`);
      }
      for (const m of text.matchAll(/\.then\(/g)) {
        const i = m.index ?? 0;
        const onError = secondArg(body(text, i + 5));
        if (onError !== null && !OK.test(onError) && !/expected:/.test(prevLine(i))) bad.push(`${relative(SRC, f)}:${lineOf(i)}  .then(…, onError)`);
      }
    }
    expect(bad, 'Say what went wrong: console.error with the details (and a toast with one sentence for the person), or rethrow. If ignoring is really right, say why in a comment that starts "expected:".').toEqual([]);
  });

  describe('the shared core', () => {
    const CONTRACTS = join(SRC, 'data', 'contracts');
    /** Pure libraries a contract may import. @noble/hashes for SHA-256 and MD5 in hashes.ts. */
    const ALLOWLIST: Record<string, string> = { '@noble/hashes/sha2': 'pure', '@noble/hashes/legacy': 'pure' };
    const FORBIDDEN = /^(window|document|localStorage|sessionStorage|indexedDB|fetch|React)$/;
    /** Parse syntax so literals/comments are inert, but expressions inside templates still count. */
    const usesForbiddenGlobal = (text: string, fileName: string): boolean => {
      const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest);
      const visit = (node: ts.Node): true | undefined => {
        if (ts.isIdentifier(node) && FORBIDDEN.test(node.text)) return true;
        if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)
          && FORBIDDEN.test(node.argumentExpression.text)) return true;
        if (ts.isPropertyAccessExpression(node) && node.name.text === 'env') {
          const object = node.expression;
          if (ts.isIdentifier(object) && object.text === 'process') return true;
          if (ts.isMetaProperty(object) && object.keywordToken === ts.SyntaxKind.ImportKeyword && object.name.text === 'meta') return true;
        }
        return ts.forEachChild(node, visit);
      };
      return visit(source) === true;
    };
    const specs = (text: string): string[] =>
      [...text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+'([^']+)'|import\(\s*'([^']+)'\s*\)|(?:^|\n)\s*import\s+'([^']+)'/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
      if (base === null) return null;
      for (const c of [base + '.ts', base + '.tsx', join(base, 'index.ts')]) {
        try {
          if (statSync(c).isFile()) return c;
        } catch {
          // expected: the candidate path does not exist, try the next one
        }
      }
      return null;
    };
    /** Every file reachable from the contracts, with the files that import it. */
    const closure = (roots: string[]): { seen: Set<string>; external: string[] } => {
      const seen = new Set<string>();
      const external: string[] = [];
      const stack = [...roots];
      while (stack.length) {
        const f = stack.pop() as string;
        if (seen.has(f)) continue;
        seen.add(f);
        for (const spec of specs(readFileSync(f, 'utf8'))) {
          const r = resolve(f, spec);
          if (r) stack.push(r);
          else if (!(spec in ALLOWLIST)) external.push(`${relative(SRC, f)} imports '${spec}'`);
        }
      }
      return { seen, external };
    };

    it.each(['src/data/contracts/control.ts', 'runner/src/control.ts'])('the global scan ignores literals and comments but rejects real access in %s', (fileName) => {
      for (const text of [
        "export const origin = 'document';",
        'export const label = "window.document";',
        'export const label = `document. window.`;',
        'export const label = `document ${"window"} process.env`;',
        'export const pattern = /document.window/;',
        '// document.title; window.location\nexport const value = 1;',
        '/** document.title; window.location */\nexport const value = 1;',
        '/* window. */ export const value = "https://example.com/document";',
      ]) expect(usesForbiddenGlobal(text, fileName), text).toBe(false);
      for (const text of [
        'export const value = document.title;',
        'export const value = window.location;',
        'export const value = `safe ${document.title}`;',
        'export const value = `safe ${`nested ${window.location}`}`;',
        'export const value = "https://example.com"; document.title;',
        '/* safe */ window.location;',
        'export const value = process /* safe */ . env;',
        'export const value = import.meta /* safe */ . env;',
        'export const value = localStorage.getItem("key");',
        'export const value = sessionStorage.getItem("key");',
        'export const value = indexedDB.open("key");',
        'export const value = fetch("https://example.com");',
        'export const value = React.createElement("div");',
      ]) expect(usesForbiddenGlobal(text, fileName), text).toBe(true);
    });

    it('contracts import only themselves and allowlisted pure libraries', () => {
      const { seen, external } = closure(files(CONTRACTS));
      const outside = [...seen].filter((f) => !f.startsWith(CONTRACTS + '/')).map((f) => relative(SRC, f));
      const impure = [...seen].filter((f) => usesForbiddenGlobal(readFileSync(f, 'utf8'), f)).map((f) => relative(SRC, f));
      expect({ outside, external, impure }, 'The contracts run in the Worker too. Move the pure helper under src/data/contracts/ (leave a re-export at the old path), or split the module so only its pure part moves.').toEqual({ outside: [], external: [], impure: [] });
    });

    it('the spine runs in every runtime: its closure uses no browser or environment globals', () => {
      // TL-P3-21: the shared plan runs in the fake, the Worker and the runner. Its adapters own the I/O (spine/read.ts).
      // The explorer's "new" dot (vault/seen.ts, behind VaultIndex.entries) reads localStorage in a try; the spine never
      // calls it, and where there is no localStorage it reads nothing.
      // The demo fixture is the scripted provider's data (TL-P3-22): its only match is the words "document numbers"
      // in one rule's text.
      const KNOWN = new Set(['data/vault/seen.ts', 'data/demo/fixture.ts']);
      const { seen, external } = closure(files(join(SRC, 'data', 'spine')));
      const impure = [...seen].filter((f) => usesForbiddenGlobal(readFileSync(f, 'utf8'), f)).map((f) => relative(SRC, f)).filter((f) => !KNOWN.has(f));
      expect({ external, impure }, 'The spine runs in the Worker and the runner too. Keep browser and network code in an adapter, outside src/data/spine and what it imports.').toEqual({ external: [], impure: [] });
    });

    // TL-P3-21 widens this rule: the Worker also builds the admission manifest with the spine and the Drive adapter.
    it('api imports from src only contracts, the spine and the Drive adapter', () => {
      const API = join(SRC, '..', 'api');
      let exists = true;
      try {
        statSync(API);
      } catch {
        exists = false; // expected: api/ is added by the other P3-2 entry
      }
      if (!exists) return;
      const bad: string[] = [];
      // A test helper builds piles the way the app does (`declarationRecord`); it is not the Worker's code.
      for (const f of files(API).filter((x) => !x.endsWith('/test/admission-support.ts'))) {
        for (const spec of specs(readFileSync(f, 'utf8'))) {
          // Only the app's src counts: the Worker's own (`api/src`, as its test host imports it) is not the shared core.
          if (/(^|\/)src\//.test(spec) && join(dirname(f), spec).startsWith(`${SRC}/`) && !/src\/data\/(contracts|spine)(\/|$)|src\/data\/(types|drive\/drive-http|drive\/drive-api|drive\/fake-drive)(\.js)?$/.test(spec)) bad.push(`${relative(API, f)} imports '${spec}'`);
        }
      }
      expect(bad, 'api/ may import only src/data/contracts, src/data/spine and the Drive adapter (TL-P3-21).').toEqual([]);
    });
  });
});
