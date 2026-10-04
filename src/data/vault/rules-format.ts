/**
 * `Rules.md`: the rules Bower follows in every tidy-up, in Bower's wording,
 * each with the words you typed under it and the day it was added. Bower
 * writes it (a tidy-up words the rules you added in the app); the app reads
 * it. Rules waiting for a tidy-up live in the journal, not here.
 *
 *   ## Rules
 *
 *   - <wording> <!-- since 2026-10-03 -->
 *     *You wrote: "<your words>"*
 */
import type { Rule } from '../types';

export const RULES_HEADING = '## Rules';

export function parseRules(text: string): Rule[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === RULES_HEADING);
  if (start < 0) return [];
  const out: Rule[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    const rule = /^- (.*?)(?:\s*<!-- since (\d{4}-\d{2}-\d{2}) -->)?\s*$/.exec(line);
    if (rule) {
      const since = rule[2] ? Date.parse(`${rule[2]}T00:00:00Z`) : 0;
      out.push({ id: `rule-${out.length + 1}`, text: rule[1] ?? '', since: Number.isNaN(since) ? 0 : since });
      continue;
    }
    const words = /^\s+\*You wrote: "(.*)"\*\s*$/.exec(line);
    const last = out.at(-1);
    if (words && last) last.yourWords = words[1] ?? '';
  }
  return out;
}

export function serializeRules(rules: readonly Rule[]): string {
  const worded = rules.filter((r) => !r.pending);
  const body = worded.flatMap((r) => [
    `- ${r.text}${r.since ? ` <!-- since ${new Date(r.since).toISOString().slice(0, 10)} -->` : ''}`,
    ...(r.yourWords ? [`  *You wrote: "${r.yourWords}"*`] : []),
  ]);
  return ['---', `summary: ${worded.length} ${worded.length === 1 ? 'rule' : 'rules'} Bower follows in every tidy-up.`, 'by: bower', 'kind: Rules', '---', '', RULES_HEADING, '', ...body, ''].join('\n');
}
