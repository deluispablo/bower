import { describe, expect, it } from 'vitest';

import fixtureRaw from './fixtures/rules.md?raw';
import rulesTemplate from '../../vault-template/Rules.md?raw';
import {
  allRules,
  appendRule,
  applyRuleEdit,
  applyToFiledRequest,
  dropRuleLead,
  formatRule,
  guessTopic,
  parseRules,
  RULES_LINE_CAP,
  ruleBullet,
  RuleError,
  ruleMeta,
  ruleSheetLabel,
  serialiseRules,
  shortDay,
  UNGROUPED_TOPIC,
} from '../src/rules.js';
import type { Rule, RuleEdit, RuleRef } from '../src/rules.js';

const FIXTURE = fixtureRaw.replace(/\r\n/g, '\n');
const TEMPLATE = rulesTemplate.replace(/\r\n/g, '\n');
const ON = '2026-09-29';

const SHAPED = [
  '# Rules',
  '',
  '## Finance',
  '',
  "- Receipts go to Finance, named by shop and date (owner's request, 2026-09-26)",
  '- ~~Never archive Finance~~ (paused 2026-09-27)',
  '',
  '## Flat hunt',
  '',
  "- One note per flat, named by street (owner's request, 2026-09-25)",
  '',
].join('\n');

function ruleAt(md: string, text: string): Rule {
  const rule = allRules(parseRules(md)).find((r) => r.text === text);
  if (rule === undefined) throw new Error(`no rule "${text}"`);
  return rule;
}

function refTo(md: string, text: string): RuleRef {
  const { line, raw } = ruleAt(md, text);
  return { line, raw };
}

describe('parseRules', () => {
  it('reads topics, counts, dates and the paused flag', () => {
    const parsed = parseRules(SHAPED);
    expect(parsed.groups.map((g) => [g.topic, g.count, g.paused])).toEqual([
      ['Finance', 2, 1],
      ['Flat hunt', 1, 0],
    ]);
    expect(parsed.groups[0]?.rules).toMatchObject([
      {
        line: 4,
        text: 'Receipts go to Finance, named by shop and date',
        paused: false,
        date: '2026-09-26',
        origin: "owner's request",
      },
      {
        line: 5,
        text: 'Never archive Finance',
        paused: true,
        date: '2026-09-27',
        origin: null,
      },
    ]);
  });

  it('reads every legacy section as a topic, no migration needed', () => {
    const parsed = parseRules(FIXTURE);
    expect(parsed.groups.map((g) => [g.topic, g.count, g.paused])).toEqual([
      [UNGROUPED_TOPIC, 1, 0],
      ['Finance', 4, 1],
      ['From the interview', 1, 0],
      ["From Bower's suggestions", 1, 0],
      ['Migrated from your old rulebook (v1)', 1, 0],
    ]);
  });

  it('reads a rule with no date, an older tail, and brackets in its text', () => {
    const interview = ruleAt(
      FIXTURE,
      'Titles and tags: Short and plain, e.g. `2026-09-27 Dentist`',
    );
    expect(interview).toMatchObject({ date: null, origin: null, tail: null });

    const accepted = ruleAt(
      FIXTURE,
      'File invoices under 2-Areas/Money with the tag finance.',
    );
    expect(accepted).toMatchObject({
      date: '2026-09-20',
      origin: 'accepted suggestion',
    });

    const taxes = ruleAt(
      FIXTURE,
      'Tax letters go to Finance/Taxes (see the folder note)',
    );
    expect(taxes.date).toBe('2026-09-28');
  });

  it('never counts frontmatter, prose, indented lines or a code block', () => {
    const texts = allRules(parseRules(FIXTURE)).map((r) => r.text);
    expect(texts).toHaveLength(8);
    expect(texts.join('\n')).not.toMatch(/meta|prose|indented|code block/);
  });

  it('has no groups for the template, which has no rules yet', () => {
    expect(parseRules(TEMPLATE).groups).toEqual([]);
    expect(parseRules('').groups).toEqual([]);
  });

  it(`flags a file over ${RULES_LINE_CAP} lines, the cap the lint check keeps`, () => {
    const at = (n: number): string =>
      Array.from({ length: n }, (_, i) => `- Rule ${i}`).join('\n') + '\n';
    expect(parseRules(at(RULES_LINE_CAP))).toMatchObject({
      lineCount: RULES_LINE_CAP,
      overCap: false,
    });
    expect(parseRules(at(RULES_LINE_CAP + 1)).overCap).toBe(true);
  });
});

describe('serialiseRules', () => {
  it('round-trips the shape byte for byte', () => {
    expect(serialiseRules(parseRules(SHAPED))).toBe(SHAPED);
  });

  it('round-trips the legacy sections byte for byte', () => {
    expect(serialiseRules(parseRules(FIXTURE))).toBe(FIXTURE);
  });

  it('keeps a file written with CRLF line endings', () => {
    const crlf = SHAPED.replace(/\n/g, '\r\n');
    expect(serialiseRules(parseRules(crlf))).toBe(crlf);
  });

  it('writes a rule back from its fields', () => {
    const parsed = parseRules(SHAPED);
    const rule = parsed.groups[1]?.rules[0];
    if (rule === undefined) throw new Error('shape changed');
    rule.text = 'One note per flat, named by street and floor';
    expect(serialiseRules(parsed)).toContain(
      "- One note per flat, named by street and floor (owner's request, 2026-09-25)\n",
    );
  });
});

describe('ruleBullet', () => {
  it('writes the bullet the interview and Accept use, on one line', () => {
    expect(ruleBullet('Keep  every\nscan', ON)).toBe(
      "- Keep every scan (owner's request, 2026-09-29)",
    );
    expect(
      parseRules(ruleBullet('Keep every scan', ON)).groups[0]?.rules[0],
    ).toMatchObject({ text: 'Keep every scan', date: ON, paused: false });
  });

  it('formats a paused rule struck through', () => {
    expect(
      formatRule({
        marker: '- ',
        text: 'Never archive Finance',
        paused: true,
        tail: `paused ${ON}`,
      }),
    ).toBe('- ~~Never archive Finance~~ (paused 2026-09-29)');
  });
});

describe('applyRuleEdit', () => {
  const receipts = 'Receipts go to Finance, named by shop and date';
  const archive = 'Never archive Finance';

  function only(md: string, edited: string, line: number): void {
    const before = md.split('\n');
    const after = edited.split('\n');
    expect(after).toHaveLength(before.length);
    after.forEach((l, i) => {
      if (i !== line) expect(l).toBe(before[i]);
    });
  }

  it('pauses a rule: struck through, dated, only its own line, said-on date kept', () => {
    const ref = refTo(SHAPED, receipts);
    const next = applyRuleEdit(SHAPED, { kind: 'pause', rule: ref }, ON);
    expect(next.split('\n')[ref.line]).toBe(
      `- ~~${receipts}~~ (said 2026-09-26, paused 2026-09-29)`,
    );
    only(SHAPED, next, ref.line);
    expect(ruleAt(next, receipts).paused).toBe(true);
  });

  it('pauses a rule with no known date: no said-on date to keep', () => {
    const ref = refTo(FIXTURE, 'Tag anything about the garden with garden.');
    const next = applyRuleEdit(FIXTURE, { kind: 'pause', rule: ref }, ON);
    expect(next.split('\n')[ref.line]).toBe(
      '* ~~Tag anything about the garden with garden.~~ (paused 2026-09-29)',
    );
  });

  it('resumes a paused rule as the owner asking again, today, with no said-on date to restore', () => {
    const ref = refTo(SHAPED, archive);
    const next = applyRuleEdit(SHAPED, { kind: 'resume', rule: ref }, ON);
    expect(next.split('\n')[ref.line]).toBe(
      "- Never archive Finance (owner's request, 2026-09-29)",
    );
    only(SHAPED, next, ref.line);
  });

  it('resumes keeping the date the rule was said on, not the pause date (#443)', () => {
    const ref = refTo(SHAPED, receipts);
    const paused = applyRuleEdit(SHAPED, { kind: 'pause', rule: ref }, ON);
    expect(ruleAt(paused, receipts).date).toBe('2026-09-29');

    const pausedRef = refTo(paused, receipts);
    const resumed = applyRuleEdit(
      paused,
      { kind: 'resume', rule: pausedRef },
      '2026-10-01',
    );
    expect(resumed.split('\n')[pausedRef.line]).toBe(
      "- Receipts go to Finance, named by shop and date (owner's request, 2026-09-26)",
    );
  });

  it('changes a rule inside its own line, keeping it paused if it was', () => {
    const active = refTo(SHAPED, receipts);
    const changed = applyRuleEdit(
      SHAPED,
      { kind: 'change', rule: active, text: '  Receipts go to Finance\n' },
      ON,
    );
    expect(changed.split('\n')[active.line]).toBe(
      "- Receipts go to Finance (owner's request, 2026-09-29)",
    );
    only(SHAPED, changed, active.line);

    const paused = refTo(SHAPED, archive);
    const stillPaused = applyRuleEdit(
      SHAPED,
      { kind: 'change', rule: paused, text: 'Never archive Taxes' },
      ON,
    );
    expect(stillPaused.split('\n')[paused.line]).toBe(
      '- ~~Never archive Taxes~~ (paused 2026-09-27)',
    );
  });

  it('removes only the rule its line holds', () => {
    const ref = refTo(SHAPED, archive);
    const next = applyRuleEdit(SHAPED, { kind: 'remove', rule: ref }, ON);
    const expected = SHAPED.split('\n');
    expected.splice(ref.line, 1);
    expect(next).toBe(expected.join('\n'));
  });

  it('edits a legacy line in place and keeps CRLF', () => {
    const crlf = FIXTURE.replace(/\n/g, '\r\n');
    const ref = refTo(crlf, 'Tag anything about the garden with garden.');
    const next = applyRuleEdit(crlf, { kind: 'pause', rule: ref }, ON);
    expect(next).toContain(
      '\r\n* ~~Tag anything about the garden with garden.~~ (paused 2026-09-29)\r\n',
    );
    expect(next.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('is a no-op on a retry: pause twice, resume an active rule, same text', () => {
    const paused = refTo(SHAPED, archive);
    expect(applyRuleEdit(SHAPED, { kind: 'pause', rule: paused }, ON)).toBe(
      SHAPED,
    );
    const active = refTo(SHAPED, receipts);
    expect(applyRuleEdit(SHAPED, { kind: 'resume', rule: active }, ON)).toBe(
      SHAPED,
    );
    expect(
      applyRuleEdit(
        SHAPED,
        { kind: 'change', rule: active, text: receipts },
        ON,
      ),
    ).toBe(SHAPED);
  });

  it('finds the rule when lines above it moved, by its text', () => {
    const ref = refTo(SHAPED, receipts);
    const moved = SHAPED.replace(
      '## Finance\n',
      '## Finance\n\n- A new one.\n',
    );
    const next = applyRuleEdit(moved, { kind: 'remove', rule: ref }, ON);
    expect(next).not.toContain(receipts);
    expect(next).toContain('- A new one.');
  });

  it('refuses a rule that is gone, or a change to no text', () => {
    const gone: RuleEdit = {
      kind: 'pause',
      rule: { line: 4, raw: '- Something else entirely' },
    };
    expect(() => applyRuleEdit(SHAPED, gone, ON)).toThrow(RuleError);
    const empty: RuleEdit = {
      kind: 'change',
      rule: refTo(SHAPED, receipts),
      text: ' \n ',
    };
    expect(() => applyRuleEdit(SHAPED, empty, ON)).toThrowError(
      expect.objectContaining({ code: 'empty' }),
    );
  });

  it('never grows the file: the line cap still holds after any edit', () => {
    const kinds = ['pause', 'resume', 'remove'] as const;
    for (const kind of kinds) {
      const next = applyRuleEdit(
        SHAPED,
        { kind, rule: refTo(SHAPED, archive) },
        ON,
      );
      expect(parseRules(next).lineCount).toBeLessThanOrEqual(
        parseRules(SHAPED).lineCount,
      );
    }
  });
});

describe('the Rules screen wording', () => {
  const rule = (line: string): Rule => {
    const found = allRules(parseRules(line))[0];
    if (found === undefined) throw new Error('No rule');
    return found;
  };

  it('writes a date the way the screen shows it, without the locale', () => {
    expect(shortDay('2026-09-26')).toBe('26 Sep');
    expect(shortDay('2026-01-05')).toBe('5 Jan');
    expect(shortDay('someday')).toBe('someday');
    expect(shortDay('2026-13-01')).toBe('2026-13-01');
  });

  it('says who asked for a rule and when, and since when a paused one waits', () => {
    expect(
      ruleMeta(rule("- Receipts go to Finance (owner's request, 2026-09-26)")),
    ).toBe('You said it · 26 Sep');
    expect(
      ruleMeta(
        rule('- Invoices go to Money (accepted suggestion, 2026-09-20)'),
      ),
    ).toBe('Accepted suggestion · 20 Sep');
    expect(
      ruleMeta(rule('- ~~Never archive Finance~~ (paused 2026-09-27)')),
    ).toBe('Since 27 Sep');
    expect(ruleMeta(rule('- A rule with no tail'))).toBe('');
  });

  it("heads a tapped rule's sheet with its topic, who and when", () => {
    expect(
      ruleSheetLabel(
        'Finance',
        rule("- Receipts go to Finance (owner's request, 2026-09-26)"),
      ),
    ).toBe('Finance · you said it on 26 Sep');
    expect(
      ruleSheetLabel(
        'Finance',
        rule('- ~~Never archive Finance~~ (paused 2026-09-27)'),
      ),
    ).toBe('Finance · paused on 27 Sep');
    expect(ruleSheetLabel(UNGROUPED_TOPIC, rule('- No tail'))).toBe(
      UNGROUPED_TOPIC,
    );
  });

  it('words the job that applies a rule to what is already filed', () => {
    expect(applyToFiledRequest('Receipts go to\nFinance ')).toBe(
      'Apply this rule to what is already filed: Receipts go to Finance',
    );
  });
});

describe('guessTopic', () => {
  const TOPICS = ['Finance', 'Flat hunt', 'Receipt', UNGROUPED_TOPIC];

  it('picks the topic the sentence names first, plural or singular', () => {
    expect(guessTopic('From now on, receipts go under Finance', TOPICS)).toBe(
      'Receipt',
    );
    expect(guessTopic('Never archive finance', TOPICS)).toBe('Finance');
    expect(
      guessTopic('Always put viewings for the flat hunt in one note', TOPICS),
    ).toBe('Flat hunt');
  });

  it('makes a new topic from the first noun: a capitalised word first', () => {
    expect(guessTopic('Always file recipes under Cooking', [])).toBe('Cooking');
    expect(guessTopic('Every time I add a payslip, keep it', [])).toBe(
      'Payslip',
    );
    expect(guessTopic('From now on, receipts go by date', [])).toBe('Receipts');
  });

  it('falls back to Everything else when there is no noun at all', () => {
    expect(guessTopic('Never do that', TOPICS)).toBe(UNGROUPED_TOPIC);
    expect(guessTopic('Always', [])).toBe(UNGROUPED_TOPIC);
  });
});

describe('appendRule', () => {
  it('appends under the topic, after its last line, before the next heading', () => {
    const md = appendRule(
      SHAPED,
      'Never archive old statements',
      'Finance',
      ON,
    );
    const lines = md.split('\n');
    const at = lines.indexOf(
      "- Never archive old statements (owner's request, 2026-09-29)",
    );
    expect(at).toBe(
      lines.indexOf('- ~~Never archive Finance~~ (paused 2026-09-27)') + 1,
    );
    expect(
      parseRules(md).groups.find((g) => g.topic === 'Finance')?.count,
    ).toBe(3);
    // Only one line added.
    expect(lines).toHaveLength(SHAPED.split('\n').length + 1);
  });

  it('adds a heading at the end for a topic the file does not have, the lead dropped (#558)', () => {
    const md = appendRule(
      TEMPLATE,
      'Always file recipes under Cooking',
      'Cooking',
      ON,
    );
    expect(md.startsWith(TEMPLATE.trimEnd())).toBe(true);
    expect(md.slice(TEMPLATE.trimEnd().length)).toBe(
      "\n\n## Cooking\n- File recipes under Cooking (owner's request, 2026-09-29)\n",
    );
    expect(parseRules(md).groups.map((g) => [g.topic, g.count])).toEqual([
      ['Cooking', 1],
    ]);
  });

  it('a new topic goes before Everything else, not after it (#558)', () => {
    const md = [
      '## Money',
      "- Never archive Money (owner's request, 2026-09-27)",
      '',
      '## Everything else',
      "- Photos become a note (owner's request, 2026-09-22)",
      '',
    ].join('\n');
    const out = appendRule(
      md,
      'From now on, job offers go to Job hunt',
      'Job hunt',
      ON,
    );
    const topics = parseRules(out).groups.map((g) => g.topic);
    expect(topics).toEqual(['Money', 'Job hunt', UNGROUPED_TOPIC]);
  });

  it('still appends at the very end when the file has no Everything else heading', () => {
    const md = appendRule(
      SHAPED,
      'File bank letters under Finance',
      'Post',
      ON,
    );
    const topics = parseRules(md).groups.map((g) => g.topic);
    expect(topics).toEqual(['Finance', 'Flat hunt', 'Post']);
  });

  it('writes a new file from nothing', () => {
    expect(appendRule('', 'Never do that', UNGROUPED_TOPIC, ON)).toBe(
      "## Everything else\n- Never do that (owner's request, 2026-09-29)\n",
    );
  });

  it('puts an Everything else rule after the rules before the first heading, keeping CRLF', () => {
    const md = [
      '# Rules',
      "- Old ungrouped rule (owner's request, 2026-09-01)",
      '',
      '## Finance',
      "- Receipts (owner's request, 2026-09-26)",
      '',
    ].join('\r\n');
    const out = appendRule(md, 'Never do that', UNGROUPED_TOPIC, ON);
    expect(out.split('\r\n')[2]).toBe(
      "- Never do that (owner's request, 2026-09-29)",
    );
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it('adds nothing twice, and refuses no text', () => {
    const once = appendRule(
      SHAPED,
      'Never archive old statements',
      'Finance',
      ON,
    );
    expect(appendRule(once, 'Never archive old statements', 'Money', ON)).toBe(
      once,
    );
    expect(() => appendRule(SHAPED, '   ', 'Finance', ON)).toThrow(RuleError);
  });
});

describe('dropRuleLead (#558)', () => {
  it('drops "From now on," and capitalises what is left', () => {
    expect(dropRuleLead('From now on, job offers go to Job hunt.')).toBe(
      'Job offers go to Job hunt',
    );
  });

  it('drops "Always," the same way', () => {
    expect(dropRuleLead('Always add the salary to every job offer.')).toBe(
      'Add the salary to every job offer',
    );
  });

  it('never touches "Never": dropping it would flip the rule\'s meaning', () => {
    expect(dropRuleLead('Never archive Finance')).toBe('Never archive Finance');
  });

  it('leaves "Every time" alone when the rest starts with a pronoun', () => {
    const text = 'Every time you get a receipt, file it under Finance';
    expect(dropRuleLead(text)).toBe(text);
  });

  it('drops "Every time" when the rest already reads as a bullet on its own', () => {
    expect(dropRuleLead('Every time, tag the receipt Finance')).toBe(
      'Tag the receipt Finance',
    );
  });

  it('leaves a sentence with no such lead untouched', () => {
    const text = 'Receipts go to Finance, named by shop and date';
    expect(dropRuleLead(text)).toBe(text);
  });

  it('leaves the lead alone when nothing follows it', () => {
    expect(dropRuleLead('From now on,')).toBe('From now on,');
  });
});

describe('appendRule keeps a rule sentence, not verbatim (#558)', () => {
  it('reads like the other rules, not the sentence as typed', () => {
    const out = appendRule(
      '',
      'From now on, job offers go to Job hunt.',
      'Job hunt',
      ON,
    );
    expect(out).toBe(
      "## Job hunt\n- Job offers go to Job hunt (owner's request, 2026-09-29)\n",
    );
  });
});
