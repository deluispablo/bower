/// <reference types="node" />
/**
 * Rules for the words people read, checked by machine (AGENTS.md, "UI
 * copy"). It reads every sentence-like string and JSX text in the screens.
 * A failure names the file, the line and what to write instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = dirname(fileURLToPath(import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [p] : [];
  });

/** Pieces of copy: JSX text, and string or template literals that read like words (two or more). */
function copyIn(text: string): Array<{ line: number; words: string }> {
  const out: Array<{ line: number; words: string }> = [];
  // Comments are for the code's readers: blank them out, keeping the lines.
  text = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
  const lineOf = (i: number): number => text.slice(0, i).split('\n').length;
  for (const m of text.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) out.push({ line: lineOf(m.index ?? 0), words: m[1] ?? '' });
  for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const w = m[2] ?? '';
    if (/[A-Za-z]{2,}\s+[A-Za-z]/.test(w)) out.push({ line: lineOf(m.index ?? 0), words: w });
  }
  return out;
}

const RULES: Array<{ bad: RegExp; say: string }> = [
  { bad: /\b[\w ]*\.md\b|\$\{PILE_NOTE\}/, say: 'name the thing ("your rules", "the pile\'s note"), never a file name' },
  { bad: /\bvaults?\b/i, say: 'say "your notes" or "your Bower folder"' },
  { bad: /\bfive minutes\b/i, say: 'write durations with digits: "about 5 minutes"' },
  { bad: /\bObsidian\b/, say: 'say "any notes app"; product names are jargon here' },
];

describe('the words people read', () => {
  it('no file names, no jargon, one way to say a duration', () => {
    const bad: string[] = [];
    for (const dir of ['features', 'app', 'ui']) {
      for (const f of files(join(SRC, dir))) {
        for (const c of copyIn(readFileSync(f, 'utf8'))) {
          if (/^\s*(import|export)\b/.test(c.words) || /className|aria-hidden|\$\{s\./.test(c.words)) continue;
          for (const r of RULES) if (r.bad.test(c.words)) bad.push(`${relative(SRC, f)}:${c.line}  "${c.words.trim().slice(0, 70)}" → ${r.say}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
