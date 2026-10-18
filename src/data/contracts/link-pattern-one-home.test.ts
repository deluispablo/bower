/** link-pattern-one-home red: one wikilink pattern in links.ts for the app and the runner (AC1, AC2; plan R8-R17). */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as links from './links';

const { linkTarget, rewriteLinks } = links;
const WIKI_LINK = (links as Record<string, unknown>).WIKI_LINK as RegExp;
const plainLinks = (links as Record<string, unknown>).plainLinks as (text: string) => string;

// input, group 1 (raw name), group 2 (label), linkTarget(name), plainLinks(input): R1, R2, R10, R12, R17.
const TABLE: Array<[string, string | null, string | undefined, string, string]> = [
  ['[[a]]', 'a', undefined, 'a', 'a'],
  ['[[a|b]]', 'a', 'b', 'a', 'b'],
  ['[[a|]]', 'a', '', 'a', 'a'],
  ['[[a| ]]', 'a', ' ', 'a', 'a'],
  ['[[a#h]]', 'a#h', undefined, 'a', 'a#h'],
  ['[[a#h|b]]', 'a#h', 'b', 'a', 'b'],
  ['[[a^x]]', 'a^x', undefined, 'a', 'a^x'],
  ['[[a.md]]', 'a.md', undefined, 'a.md', 'a.md'],
  ['[[]]', '', undefined, '', '[[]]'],
  ['[[|b]]', '', 'b', '', '[[|b]]'],
  ['[[#h]]', '#h', undefined, '', '#h'],
  ['[[ a ]]', ' a ', undefined, 'a', 'a'],
  ['[[a|b|c]]', 'a', 'b|c', 'a', 'b|c'],
  ['[[a\nb]]', null, undefined, '', '[[a\nb]]'],
];

describe('AC1 the one wikilink pattern', () => {
  it.each(TABLE)('%j', (input, name, label, target, plain) => {
    expect(WIKI_LINK).toBeInstanceOf(RegExp);
    const found = [...input.matchAll(WIKI_LINK)];
    if (name === null) expect(found).toEqual([]);
    else {
      expect(found.map((m) => [m[0], m[1], m[2]])).toEqual([[input, name, label]]);
      expect(linkTarget(name)).toBe(target);
    }
    expect(plainLinks(`see ${input} now`)).toBe(`see ${plain} now`);
  });

  it('rewriteLinks keeps a label exactly as written (R11) and leaves [[#h]] alone (R17)', () => {
    const former = new Map([['old', 'Notes/New.md']]);
    expect(rewriteLinks('[[Old|]] [[Old|b|c]] [[#h]] [[Old#h|b]] [[old]]', former)).toBe('[[New|]] [[New|b|c]] [[#h]] [[New#h|b]] [[New]]');
  });
});

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const HOME = 'src/data/contracts/links.ts';
/** R9 + R16: the R5 sites that capture or copy a [[ class, as (file, snippet of the literal). */
const ALLOWED: Array<[string, string]> = [
  ['src/data/contracts/timeline-line.ts', String.raw`(?: · \[\[([^\]\r\n]+)\]\])?$`],
  ['src/data/contracts/timeline-line.ts', String.raw`also from \[\[`],
  ['src/data/contracts/note-format.ts', String.raw`/^\[\[([^\]|]+)\]\]$/`],
  ['src/data/contracts/note-format.ts', String.raw`^\[\[[^\]|\r\n]+\]\](?:,`],
  ['src/data/contracts/questions.ts', String.raw`\[\[([^\]|#^]*)/g`],
  ['src/data/spine/scripted.ts', String.raw`see also (\[\[`],
  ['src/data/contracts/note-edit.ts', String.raw`\[\[[^\]\r\n|#^]*/g`],
  ['runner/src/claude.ts', String.raw`\[\[[^[\]|]*\]\]`],
];

const sources = (dir: string): string[] => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const path = `${dir}/${e.name}`;
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(path);
  return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts') ? [path] : [];
});

/** Every regex literal and `new RegExp(` source in a file. */
function regexes(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isRegularExpressionLiteral(node)) out.push(node.text);
    else if (ts.isNewExpression(node) && node.expression.getText(sf) === 'RegExp' && node.arguments?.[0]) {
      const arg = node.arguments[0];
      out.push(ts.isStringLiteralLike(arg) ? arg.text : arg.getText(sf));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** A [[ regex that captures (an unescaped `(` not followed by `?`) or copies a [[ name class (R9, R16). */
const copiesLink = (re: string): boolean =>
  re.includes(String.raw`\[\[`) && (re.includes(String.raw`\[\[[^`) || /\((?!\?)/.test(re.replace(/\\./g, '')));

describe('AC2 no second [[ pattern', () => {
  it('finds no capturing [[ regex outside links.ts and the allowlist', () => {
    const found = ['src', 'runner/src'].flatMap(sources).filter((f) => f !== HOME)
      .flatMap((f) => regexes(f).filter(copiesLink).map((re): [string, string] => [f, re]));
    const allowed = ([f, re]: [string, string]): boolean => ALLOWED.some(([af, snip]) => af === f && re.includes(snip));
    expect(found.filter((hit) => !allowed(hit))).toEqual([]);
    // Every allowlist entry still names exactly one site: a stale entry is a defect too.
    for (const [af, snip] of ALLOWED) expect(found.filter(([f, re]) => f === af && re.includes(snip)), `${af} ${snip}`).toHaveLength(1);
  });

  it('keeps one extensionOf, in extract.ts (R6)', () => {
    expect(readFileSync(join(ROOT, 'runner/src/claude.ts'), 'utf8')).not.toMatch(/const extensionOf\b/);
    expect(readFileSync(join(ROOT, 'runner/src/extract.ts'), 'utf8')).toMatch(/export const extensionOf\b/);
  });
});
