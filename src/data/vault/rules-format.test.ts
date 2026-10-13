import { describe, expect, it } from 'vitest';
import { seedRules } from '../demo/fixture';
import { managedRules, parseRules, serializeRules } from './rules-format';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

describe('Rules.md', () => {
  it('parses wording, your words and the day it was added', () => {
    const text = [
      '---',
      'summary: 1 rule Bower follows in every tidy-up.',
      '---',
      '',
      '## Rules',
      '',
      '- Receipts go to Areas / Money / Receipts. <!-- since 2026-10-03 -->',
      '  *You wrote: "receipts to money by month"*',
      '',
    ].join('\n');
    expect(parseRules(text)).toEqual([
      { id: 'rule-1', text: 'Receipts go to Areas / Money / Receipts.', yourWords: 'receipts to money by month', since: Date.parse('2026-10-03T00:00:00Z') },
    ]);
  });

  it("round-trips the demo's rules", () => {
    const rules = seedRules(NOW);
    const back = parseRules(serializeRules(rules));
    expect(back.map((r) => [r.text, r.yourWords, day(r.since)])).toEqual(rules.map((r) => [r.text, r.yourWords, day(r.since)]));
  });

  it('a rule you wrote straight into the file has no words of yours and no date', () => {
    expect(parseRules('## Rules\n\n- Keep it short.\n')).toEqual([{ id: 'rule-1', text: 'Keep it short.', since: 0 }]);
  });

  it('a file with no Rules heading has no rules', () => {
    expect(parseRules('# Something else\n\n- not a rule')).toEqual([]);
  });

  it('reads region rules before whole-file ownership and refuses damaged framing', () => {
    const prefix = '\ufeff---\r\nby: bower\r\n---\r\n## Rules\r\n- Personal rule.\r\n';
    const region = '## Rules added in Bower\r\n<!-- bower:ownership/2 begin rules-added -->\r\n## Rules\r\n- App rule.\r\n<!-- bower:ownership/2 end rules-added -->\r\n';
    const suffix = '## Rules\r\n- Another personal rule.';
    for (const owned of [false, true]) {
      expect(managedRules(prefix + region + suffix, owned)).toEqual([{ id: 'rule-1', text: 'App rule.', since: 0 }]);
      expect(managedRules(prefix, owned)).toEqual(owned ? [{ id: 'rule-1', text: 'Personal rule.', since: 0 }] : []);
      expect(() => managedRules(prefix + region.replace('end rules-added -->', 'end rules-added'), owned)).toThrow(/damaged-boundary/);
    }
  });
});
