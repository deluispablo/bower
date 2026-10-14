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
import type { Rule } from './types';
import { parseOwnership } from './ownership-format';
import { ownershipError } from './note-format';

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

/** A region takes precedence over whole-file ownership; personal prose never becomes app rules. */
export function managedRules(text: string, byBower: boolean): Rule[] {
  const bytes = new TextEncoder().encode(text);
  const own = parseOwnership(bytes);
  if (own.status === 'invalid') throw ownershipError(own.reason);
  const span = own.payloads?.['rules-added'];
  return span ? parseRules(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(span.start, span.end)))
    : byBower ? parseRules(text) : [];
}

/** The model reads all personal prose first, then nonempty app rules, without ownership marks. */
export function modelRules(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const own = parseOwnership(bytes);
  if (own.status === 'invalid') return text;
  const span = own.payloads?.['rules-added'];
  if (!span) return text;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const before = decoder.decode(bytes.subarray(0, span.start));
  const payload = decoder.decode(bytes.subarray(span.start, span.end));
  const after = decoder.decode(bytes.subarray(span.end));
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lead = `${eol}## Rules added in Bower${eol}<!-- bower:ownership/2 begin rules-added -->${eol}`;
  const end = `<!-- bower:ownership/2 end rules-added -->${eol}`;
  if (!before.endsWith(lead) || !after.startsWith(end)) return text;
  const prose = before.slice(0, -lead.length) + after.slice(end.length);
  return parseRules(payload).length ? `${prose}${prose ? eol : ''}## Rules added in Bower${eol}${payload}` : prose;
}

export function serializeRules(rules: readonly Rule[]): string {
  const worded = rules.filter((r) => !r.pending);
  const body = worded.flatMap((r) => [
    `- ${r.text}${r.since ? ` <!-- since ${new Date(r.since).toISOString().slice(0, 10)} -->` : ''}`,
    ...(r.yourWords ? [`  *You wrote: "${r.yourWords}"*`] : []),
  ]);
  return ['---', `summary: ${worded.length} ${worded.length === 1 ? 'rule' : 'rules'} Bower follows in every tidy-up.`, 'by: bower', 'kind: Rules', '---', '', RULES_HEADING, '', ...body, ''].join('\n');
}

/**
 * The `Rules.md` a new Bower folder starts with: no rules yet, and the mark that makes the file Bower's to word
 * (the key is `PROP.by`). The fake Worker and the real Worker's template both make the file from this, so the two
 * cannot drift apart.
 */
export const RULES_TEMPLATE: { readonly text: string; readonly appProperties: Readonly<Record<string, string>> } = {
  text: serializeRules([]),
  appProperties: { by: 'bower' },
};

/**
 * The text the first template put in `Rules.md`: plain, without Bower's mark. A root `Rules.md` with exactly these
 * bytes is repaired to `RULES_TEMPLATE` (by the Worker's `POST /vault` and by the runner before it plans); any other
 * text is never touched. Shared, so the two cannot disagree on what the old file was.
 */
export const OLD_RULES_TEMPLATE = `## Rules

Your own rules for Bower, one per line. Where they disagree with Bower's own, these win.
`;
