import { describe, expect, it } from 'vitest';

import legacyRulebook from './fixtures/rulebook-v1.md?raw';
import {
  TEMPLATE_RULEBOOK,
  TEMPLATE_RULES,
  TEMPLATE_RULES_VERSION,
} from '../src/rulebook-template.js';
import {
  countRuleLines,
  isRulebookBehind,
  rulesSectionLines,
  rulesVersionOf,
  rulesWithUserLines,
  splitLegacyRules,
} from '../src/rulebook.js';

// The v1 fixture is `vault-template/CLAUDE.md` as of a21ae9e, before the
// split (#197): no `bower_rules_version`, the owner's rules written straight
// into its `## Rules` section.
const V1 = legacyRulebook.replace(/\r\n/g, '\n');

/** The v1 fixture with `lines` added at the end of its `## Rules` section. */
function v1With(...lines: string[]): string {
  return `${V1.replace(/\n+$/, '')}\n${lines.join('\n')}\n`;
}

describe('rulesVersionOf', () => {
  it('reads the template version, 2 or later', () => {
    expect(TEMPLATE_RULES_VERSION).toBeGreaterThanOrEqual(2);
    expect(rulesVersionOf(TEMPLATE_RULEBOOK)).toBe(TEMPLATE_RULES_VERSION);
  });

  it('reads a rulebook with no version field as 1', () => {
    expect(rulesVersionOf(V1)).toBe(1);
    expect(rulesVersionOf('# No frontmatter at all\n')).toBe(1);
    expect(rulesVersionOf('')).toBe(1);
  });

  it('reads a quoted number, and anything else as 1', () => {
    expect(rulesVersionOf('---\nbower_rules_version: "3"\n---\n')).toBe(3);
    expect(rulesVersionOf('---\nbower_rules_version: 7\n---\n')).toBe(7);
    expect(rulesVersionOf('---\nbower_rules_version: two\n---\n')).toBe(1);
    expect(rulesVersionOf('---\nbower_rules_version: 2.5\n---\n')).toBe(1);
    expect(rulesVersionOf('---\nbower_rules_version: 0\n---\n')).toBe(1);
  });

  it('compares versions', () => {
    expect(isRulebookBehind(1, 2)).toBe(true);
    expect(isRulebookBehind(2, 2)).toBe(false);
    expect(isRulebookBehind(3, 2)).toBe(false);
  });
});

describe('rulesSectionLines', () => {
  it('stops at the next level-two heading, not a level-three one', () => {
    const text = '# T\n## Rules\n- a\n### Sub\n- b\n## Next\n- c\n';
    expect(rulesSectionLines(text)).toEqual(['- a', '### Sub', '- b']);
  });

  it('ignores headings inside a code fence', () => {
    const text = '```\n## Rules\n```\n## Rules\n- a\n';
    expect(rulesSectionLines(text)).toEqual(['- a', '']);
  });

  it('is null without a Rules section', () => {
    expect(rulesSectionLines('# T\n## Other\n- a\n')).toBeNull();
  });
});

describe('splitLegacyRules', () => {
  it('finds no owner lines in the unchanged v1 template', () => {
    expect(splitLegacyRules(V1, TEMPLATE_RULEBOOK)).toEqual({ userRules: [] });
  });

  it("keeps the owner's lines from a v1 rulebook, byte for byte", () => {
    const own = [
      "- Invoices go to `2-Areas/Finance/` (owner's request, 2026-09-20).",
      '',
      '### Job offers',
      '  - Compare salary *and* commute; flag anything under €40k.',
    ];
    const old = v1With('', ...own, '', '');
    expect(splitLegacyRules(old, TEMPLATE_RULEBOOK)).toEqual({
      userRules: own,
    });
  });

  it('treats an edited template line as the owner’s', () => {
    const old = V1.replace(
      '- Never delete notes or originals. Archive or move to `Processed/`.',
      '- Never delete notes or originals, except screenshots (owner’s request).',
    );
    expect(splitLegacyRules(old, TEMPLATE_RULEBOOK).userRules).toEqual([
      '- Never delete notes or originals, except screenshots (owner’s request).',
    ]);
  });

  it('ignores CRLF line endings when matching template lines', () => {
    const old = v1With('- Mine.').replace(/\n/g, '\r\n');
    expect(splitLegacyRules(old, TEMPLATE_RULEBOOK).userRules).toEqual([
      '- Mine.',
    ]);
  });

  it('is a no-op for an already split rulebook', () => {
    expect(splitLegacyRules(TEMPLATE_RULEBOOK, TEMPLATE_RULEBOOK)).toEqual({
      userRules: [],
    });
    // Even if something was added under its Rules heading: at version 2
    // the owner's rules already live in Rules.md.
    const edited = `${TEMPLATE_RULEBOOK.replace(/\n+$/, '')}\n- Stray.\n`;
    expect(splitLegacyRules(edited, TEMPLATE_RULEBOOK)).toEqual({
      userRules: [],
    });
  });

  it('is a no-op for a rulebook with no Rules section', () => {
    const old = V1.slice(0, V1.indexOf('## Rules'));
    expect(splitLegacyRules(old, TEMPLATE_RULEBOOK)).toEqual({
      userRules: [],
    });
  });

  it('drops the pointer lines of an unversioned rulebook from after the Rules.md split', () => {
    // Between #180 and #197 the template already pointed at Rules.md but
    // had no version field; its Rules lines are all still the template's.
    const unversioned = TEMPLATE_RULEBOOK.replace(
      /^bower_rules_version: \d+\n/m,
      '',
    );
    expect(rulesVersionOf(unversioned)).toBe(1);
    expect(splitLegacyRules(unversioned, TEMPLATE_RULEBOOK)).toEqual({
      userRules: [],
    });
  });
});

describe('rulesWithUserLines', () => {
  it('appends the block after one blank line', () => {
    expect(rulesWithUserLines('# Rules\n\nIntro.\n\n', ['- a', '- b'])).toBe(
      '# Rules\n\nIntro.\n\n- a\n- b\n',
    );
  });

  it('leaves the text alone with nothing to add, or the block already there', () => {
    expect(rulesWithUserLines(TEMPLATE_RULES, [])).toBe(TEMPLATE_RULES);
    const once = rulesWithUserLines(TEMPLATE_RULES, ['- a', '- b']);
    expect(rulesWithUserLines(once, ['- a', '- b'])).toBe(once);
  });

  it('starts an empty file with the block', () => {
    expect(rulesWithUserLines('', ['- a'])).toBe('- a\n');
  });

  it('counts only non-blank lines', () => {
    expect(countRuleLines(['- a', '', '### B', '- c'])).toBe(3);
  });
});

describe('the v1 update end to end (pure part)', () => {
  it('ends with the current rulebook and the owner rules in Rules.md', () => {
    const old = v1With('- Mine (owner’s request, 2026-09-20).');
    const { userRules } = splitLegacyRules(old, TEMPLATE_RULEBOOK);
    const rules = rulesWithUserLines(TEMPLATE_RULES, userRules);
    expect(rules.startsWith(TEMPLATE_RULES.replace(/\n+$/, ''))).toBe(true);
    expect(rules.endsWith('\n- Mine (owner’s request, 2026-09-20).\n')).toBe(
      true,
    );
    // The new rulebook is the template itself, at the template's version.
    expect(rulesVersionOf(TEMPLATE_RULEBOOK)).toBe(TEMPLATE_RULES_VERSION);
  });
});
