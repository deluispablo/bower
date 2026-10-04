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
const SOURCES = /from '@\/data\/(demo|drive|vault|live|worker|fake|choose|contract)[/']/;
/** The app shell may mount the demo panel (it shows only on demo and fake). */
const ALLOWED: Record<string, RegExp> = { 'app/App.tsx': /from '@\/data\/(demo\/DemoPanel|demo\/scenario|demo\/world|choose)'/ };

describe('the shape of the code', () => {
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
    }
    expect(bad, 'Say what went wrong: console.error with the details (and a toast with one sentence for the person), or rethrow. If ignoring is really right, say why in a comment that starts "expected:".').toEqual([]);
  });
});
