import { describe, expect, it } from 'vitest';

import fixtureRaw from './fixtures/rules.md?raw';
import rulesTemplate from '../../vault-template/Rules.md?raw';
import {
  allRules,
  applyRuleEdit,
  formatRule,
  parseRules,
  RULES_LINE_CAP,
  ruleBullet,
  RuleError,
  serialiseRules,
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

  it('pauses a rule: struck through, dated, only its own line', () => {
    const ref = refTo(SHAPED, receipts);
    const next = applyRuleEdit(SHAPED, { kind: 'pause', rule: ref }, ON);
    expect(next.split('\n')[ref.line]).toBe(
      `- ~~${receipts}~~ (paused 2026-09-29)`,
    );
    only(SHAPED, next, ref.line);
    expect(ruleAt(next, receipts).paused).toBe(true);
  });

  it('resumes a paused rule as the owner asking again', () => {
    const ref = refTo(SHAPED, archive);
    const next = applyRuleEdit(SHAPED, { kind: 'resume', rule: ref }, ON);
    expect(next.split('\n')[ref.line]).toBe(
      "- Never archive Finance (owner's request, 2026-09-29)",
    );
    only(SHAPED, next, ref.line);
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
