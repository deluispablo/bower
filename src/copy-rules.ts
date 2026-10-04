/**
 * The copy check's reader and rules (used by src/copy.test.ts; kept out of the
 * test file so a change here is proved red first like any other code).
 */
/** Pieces of copy: JSX text, and string or template literals that read like words. */
/** `tsx`: a screen, where two words are already copy (aria-label="Your notes"). */
export function copyIn(text: string, tsx = false): Array<{ line: number; words: string }> {
  const out: Array<{ line: number; words: string }> = [];
  // Comments are for the code's readers: blank them out, keeping the lines.
  text = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
  const lineOf = (i: number): number => text.slice(0, i).split('\n').length;
  for (const m of text.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) out.push({ line: lineOf(m.index ?? 0), words: m[1] ?? '' });
  for (const m of text.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
    const w = m[2] ?? '';
    // A sentence: three words or more (a name like "Pile note.md" is code, not copy); in a screen, two.
    if ((tsx ? /[A-Za-z]{2,}\s+[A-Za-z]{2,}/ : /[A-Za-z]{2,}\s+[A-Za-z]+\s+[A-Za-z]/).test(w)) out.push({ line: lineOf(m.index ?? 0), words: w });
  }
  return out;
}

export const RULES: Array<{ bad: RegExp; say: string }> = [
  { bad: /\b[\w ]*\.md\b|\$\{PILE_NOTE\}/, say: 'name the thing ("your rules", "the pile\'s note"), never a file name' },
  { bad: /\bvaults?\b/i, say: 'say "your notes" or "your Bower folder"' },
  { bad: /\bfive minutes\b/i, say: 'write durations with digits: "about 5 minutes"' },
  { bad: /\bObsidian\b/, say: 'say "any notes app"; product names are jargon here' },
];
