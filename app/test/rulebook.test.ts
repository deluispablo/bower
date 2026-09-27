import { describe, expect, it } from 'vitest';

import legacyRulebook from './fixtures/rulebook-v1.md?raw';
import {
  TEMPLATE_RETIRED_LINES,
  TEMPLATE_RULEBOOK,
  TEMPLATE_RULES,
  TEMPLATE_RULES_VERSION,
} from '../src/rulebook-template.js';
import {
  countRuleLines,
  isRulebookBehind,
  migrationBlock,
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

const TAGS_V1 =
  '`personal`, `career`, `finance`, `legal`, `health`, `home`, `travel`, `learning`, `hobby`';
const TAGS_OWN = `${TAGS_V1}, \`cooking\`, \`garden\``;
const RECIPES = [
  '### Recipes (owner’s request, 2026-09-21)',
  '1. File each recipe under `3-Resources/Cooking/`, one note per dish.',
  '2. Capture: servings, time, ingredients (table), steps.',
  '',
  '   Link it from the `Cooking` hub note.',
];

/** The v1 fixture with a custom workflow before Query and two domain tags. */
function v1Customised(): string {
  return V1.replace(TAGS_V1, TAGS_OWN).replace(
    '### Query\n',
    `${RECIPES.join('\n')}\n\n### Query\n`,
  );
}

function split(old: string): ReturnType<typeof splitLegacyRules> {
  return splitLegacyRules(old, TEMPLATE_RULEBOOK, TEMPLATE_RETIRED_LINES);
}

describe('splitLegacyRules', () => {
  it('finds nothing of the owner in the unchanged v1 template', () => {
    expect(split(V1)).toEqual({ userRules: [], migrated: [] });
  });

  it('needs the retired lines: without them, old template wording looks like the owner’s', () => {
    const { migrated } = splitLegacyRules(V1, TEMPLATE_RULEBOOK);
    expect(migrated).toContain(
      '### Instructions (only a file directly in `0-Inbox/` named `Bower - <date> <time> <title>.md` with frontmatter `tags: [instruction]` and `via: app` — how the app writes them)',
    );
  });

  it("keeps the owner's Rules lines from a v1 rulebook, byte for byte", () => {
    const own = [
      "- Invoices go to `2-Areas/Finance/` (owner's request, 2026-09-20).",
      '',
      '### Job offers',
      '  - Compare salary *and* commute; flag anything under €40k.',
    ];
    const old = v1With('', ...own, '', '');
    expect(split(old)).toEqual({ userRules: own, migrated: [] });
  });

  it('migrates a custom workflow whole and the domain tags the template lacks', () => {
    expect(split(v1Customised())).toEqual({
      userRules: [],
      migrated: ['## Tags', TAGS_OWN, '', ...RECIPES],
    });
  });

  it('copies a whole new level-two section with its subsections', () => {
    const old = V1.replace(
      '## Language\n',
      '## Household\n- Bins go out on Tuesday.\n\n### Plants\n- Water on Sunday.\n\n## Language\n',
    );
    expect(split(old).migrated).toEqual([
      '## Household',
      '- Bins go out on Tuesday.',
      '',
      '### Plants',
      '- Water on Sunday.',
    ]);
  });

  it('ignores headings inside a code fence', () => {
    const old = V1.replace(
      '## Language\n',
      '## Snippets\n```\n## Not a heading\n```\n\n## Language\n',
    );
    expect(split(old).migrated).toEqual([
      '## Snippets',
      '```',
      '## Not a heading',
      '```',
    ]);
  });

  it('treats an edited template line as the owner’s', () => {
    const old = V1.replace(
      '- Never delete notes or originals. Archive or move to `Processed/`.',
      '- Never delete notes or originals, except screenshots (owner’s request).',
    );
    expect(split(old).userRules).toEqual([
      '- Never delete notes or originals, except screenshots (owner’s request).',
    ]);
  });

  it('ignores CRLF line endings when matching template lines', () => {
    const old = v1With('- Mine.').replace(/\n/g, '\r\n');
    expect(split(old)).toEqual({ userRules: ['- Mine.'], migrated: [] });
  });

  it('is a no-op for an already split rulebook', () => {
    expect(split(TEMPLATE_RULEBOOK)).toEqual({ userRules: [], migrated: [] });
    // Even with something added: at version 2 the owner's rules already
    // live in Rules.md.
    const edited = `${TEMPLATE_RULEBOOK.replace(/\n+$/, '')}\n- Stray.\n`;
    expect(split(edited)).toEqual({ userRules: [], migrated: [] });
  });

  it('has no Rules lines for a rulebook with no Rules section', () => {
    const old = v1Customised();
    expect(split(old.slice(0, old.indexOf('## Rules')))).toEqual({
      userRules: [],
      migrated: ['## Tags', TAGS_OWN, '', ...RECIPES],
    });
  });

  it('finds nothing in an unversioned rulebook from after the Rules.md split', () => {
    // Between #180 and #197 the template already pointed at Rules.md but
    // had no version field; every line of it is still the template's.
    const unversioned = TEMPLATE_RULEBOOK.replace(
      /^bower_rules_version: \d+\n/m,
      '',
    );
    expect(rulesVersionOf(unversioned)).toBe(1);
    expect(split(unversioned)).toEqual({ userRules: [], migrated: [] });
  });
});

describe('migrationBlock', () => {
  it('puts the rest under a heading naming the old version, after the Rules lines', () => {
    expect(
      migrationBlock({ userRules: ['- a'], migrated: ['## Tags', 'x'] }, 1),
    ).toEqual([
      '- a',
      '',
      '## Migrated from your old rulebook (v1)',
      '',
      '## Tags',
      'x',
    ]);
  });

  it('has no heading when only Rules lines moved, and nothing for nothing', () => {
    expect(migrationBlock({ userRules: ['- a'], migrated: [] }, 1)).toEqual([
      '- a',
    ]);
    expect(migrationBlock({ userRules: [], migrated: [] }, 1)).toEqual([]);
    expect(migrationBlock({ userRules: [], migrated: ['x'] }, 1)[0]).toBe(
      '## Migrated from your old rulebook (v1)',
    );
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
  it('ends with the current rulebook and every owner addition in Rules.md, once', () => {
    const old = `${v1Customised().replace(/\n+$/, '')}\n- Mine (owner’s request, 2026-09-20).\n`;
    const block = migrationBlock(split(old), rulesVersionOf(old));
    const rules = rulesWithUserLines(TEMPLATE_RULES, block);
    expect(rules).toBe(
      [
        TEMPLATE_RULES.replace(/\n+$/, ''),
        '',
        '- Mine (owner’s request, 2026-09-20).',
        '',
        '## Migrated from your old rulebook (v1)',
        '',
        '## Tags',
        TAGS_OWN,
        '',
        ...RECIPES,
        '',
      ].join('\n'),
    );
    // Running it again (say the rulebook write failed) adds nothing.
    expect(rulesWithUserLines(rules, block)).toBe(rules);
    // The new rulebook is the template itself, at the template's version.
    expect(rulesVersionOf(TEMPLATE_RULEBOOK)).toBe(TEMPLATE_RULES_VERSION);
  });
});
