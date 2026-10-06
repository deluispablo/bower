/**
 * Rules of the code's shape, checked by machine so no agent has to remember
 * them (docs/harness/METHOD.md, "Rules machines check"). Each failure says
 * what to do instead.
 */
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = dirname(fileURLToPath(import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });

/** Where the data comes from is picked once, in main.tsx; screens only see the doors. */
/** An import of a data source: static or dynamic, by alias or by a relative path. */
const SOURCES = /(from |import\()'(@\/|(\.\.\/)+)data\/(demo|drive|vault|live|worker|fake|choose|contract)[/']/;
/** The app shell may mount the demo panel (it shows only on demo and fake). */
const ALLOWED: Record<string, RegExp> = { 'app/App.tsx': /(from |import\()'@\/data\/(demo\/DemoPanel|demo\/scenario|demo\/world|choose)'/ };

describe('the shape of the code', () => {
  it('the import rule sees dynamic and relative imports', () => {
    expect(SOURCES.test("import { DemoWorld } from '@/data/demo/world';")).toBe(true);
    expect(SOURCES.test("const m = await import('@/data/fake/pretend');")).toBe(true);
    expect(SOURCES.test("import { FakeDrive } from '../../data/drive/fake-drive';")).toBe(true);
    expect(SOURCES.test("import { useSources } from '@/data/provider';")).toBe(false);
  });

  it('screens never import a data source directly', () => {
    const bad: string[] = [];
    for (const dir of ['features', 'app', 'ui', 'bird']) {
      for (const f of files(join(SRC, dir))) {
        const rel = relative(SRC, f);
        readFileSync(f, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (SOURCES.test(line) && !ALLOWED[rel]?.test(line)) bad.push(`${rel}:${i + 1}  ${line.trim()}`);
          });
      }
    }
    expect(bad, 'Screens talk to data only through src/data/sources.ts (useSources, useLoad hooks in provider.tsx) and types.ts. Move what the screen needs behind a VaultSource/RunSource method, or into a pure module outside demo/drive/vault/live/worker/fake.').toEqual([]);
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
    /** Pure libraries a contract may import. None today: the contracts need only the platform (Web Crypto, TextEncoder). */
    const ALLOWLIST: Record<string, string> = {};
    const FORBIDDEN = /\b(window|document|localStorage|sessionStorage|indexedDB|fetch|React|import\.meta\.env|process\.env)\b|from 'react/;
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

    it('contracts import only themselves and allowlisted pure libraries', () => {
      const { seen, external } = closure(files(CONTRACTS));
      const outside = [...seen].filter((f) => !f.startsWith(CONTRACTS + '/')).map((f) => relative(SRC, f));
      const impure = [...seen].filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, ''))).map((f) => relative(SRC, f));
      expect({ outside, external, impure }, 'The contracts run in the Worker too. Move the pure helper under src/data/contracts/ (leave a re-export at the old path), or split the module so only its pure part moves.').toEqual({ outside: [], external: [], impure: [] });
    });

    it('api imports nothing from src except contracts', () => {
      const API = join(SRC, '..', 'api');
      let exists = true;
      try {
        statSync(API);
      } catch {
        exists = false; // expected: api/ is added by the other P3-2 entry
      }
      if (!exists) return;
      const bad: string[] = [];
      for (const f of files(API)) {
        for (const spec of specs(readFileSync(f, 'utf8'))) {
          if (/(^|\/)src\//.test(spec) && !/src\/data\/contracts(\/|$)/.test(spec)) bad.push(`${relative(API, f)} imports '${spec}'`);
        }
      }
      expect(bad, 'api/ may import only src/data/contracts.').toEqual([]);
    });
  });
});
