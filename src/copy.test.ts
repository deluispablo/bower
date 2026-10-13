/// <reference types="node" />
/**
 * Rules for the words people read, checked by machine (CLAUDE.md, "UI
 * copy"). It reads every sentence-like string and JSX text in the screens.
 * A failure names the file, the line and what to write instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { copyIn, RULES } from './copy-rules';

const SRC = dirname(fileURLToPath(import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });

describe('the words people read', () => {
  it('no file names, no jargon, one way to say a duration', () => {
    const bad: string[] = [];
    // Fixture data (made-up notes) and the code's own comments are not copy.
    const skip = /data\/demo\/(fixture|notes)\.ts$|data\/fake\/|data\/contract\/|\.d\.ts$/;
    for (const dir of ['features', 'app', 'ui', 'data']) {
      for (const f of files(join(SRC, dir)).filter((x) => !skip.test(x))) {
        for (const c of copyIn(readFileSync(f, 'utf8'), f.endsWith('.tsx'))) {
          if (/^\s*(import|export)\b/.test(c.words) || /className|aria-hidden|\$\{s\./.test(c.words)) continue;
          for (const r of RULES) if (r.bad.test(c.words)) bad.push(`${relative(SRC, f)}:${c.line}  "${c.words.trim().slice(0, 70)}" → ${r.say}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('two words are copy in a screen (.tsx)', () => {
    const words = (text: string, tsx: boolean): string[] => copyIn(text, tsx).map((c) => c.words);
    expect(words('<b aria-label="Your vault" />', true)).toContain('Your vault');
    expect(words('<b title="Open Obsidian" />', true)).toContain('Open Obsidian');
    // In plain .ts a two-word string is usually a key or a name, not copy.
    expect(words("const k = 'pile note';", false)).toEqual([]);
  });
});
