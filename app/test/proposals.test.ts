import { describe, expect, it } from 'vitest';

import fixtureRaw from './fixtures/proposals.md?raw';
import rulesTemplate from '../../vault-template/Rules.md?raw';
import {
  ACCEPTED_HEADING,
  applyDecision,
  openProposals,
  parseProposals,
  plainText,
  ProposalError,
  rulesWithAccepted,
} from '../src/proposals.js';

const FIXTURE = fixtureRaw.replace(/\r\n/g, '\n');
const RULES = rulesTemplate.replace(/\r\n/g, '\n');

describe('parseProposals', () => {
  it('reads every well-formed section of the fixture, in file order', () => {
    const proposals = parseProposals(FIXTURE);
    expect(proposals.map((p) => p.id)).toEqual([
      '2026-09-20-invoices',
      '2026-09-22-race-results',
      '2026-09-18-garden-tag',
    ]);
    expect(proposals[0]).toEqual({
      id: '2026-09-20-invoices',
      kind: 'rule',
      title: 'Invoices go to Money',
      text: 'File invoices under 2-Areas/Money with the tag finance.',
      evidence:
        'Three invoices filed there by hand: [[Boiler service invoice]], [[Broadband bill]], [[Paint receipt]].',
      status: 'open',
      created: '2026-09-20',
    });
  });

  it('takes fields without a leading dash and a missing status as open', () => {
    const race = parseProposals(FIXTURE)[1];
    expect(race?.kind).toBe('workflow');
    expect(race?.status).toBe('open');
  });

  it('keeps the decided date of a decided proposal', () => {
    const garden = parseProposals(FIXTURE)[2];
    expect(garden?.status).toBe('dismissed');
    expect(garden?.decided).toBe('2026-09-19');
  });

  it('lists only the open ones', () => {
    expect(openProposals(FIXTURE).map((p) => p.title)).toEqual([
      'Invoices go to Money',
      'A workflow for race results',
    ]);
  });

  it('finds nothing in an empty file or one with only a title', () => {
    expect(parseProposals('')).toEqual([]);
    expect(parseProposals('# Bower - Proposals\n\nNothing yet.\n')).toEqual([]);
  });

  it('ignores headings inside a code block', () => {
    const md =
      '```markdown\n## Example\n- id: x\n- kind: rule\n- text: t\n```\n';
    expect(parseProposals(md)).toEqual([]);
  });
});

describe('applyDecision', () => {
  it('accepting rewrites the status line and adds the date, nothing else', () => {
    const next = applyDecision(
      FIXTURE,
      '2026-09-20-invoices',
      'accepted',
      '2026-09-27',
    );
    expect(next).toBe(
      FIXTURE.replace(
        '- status: open\n- created: 2026-09-20',
        '- status: accepted\n- decided: 2026-09-27\n- created: 2026-09-20',
      ),
    );
    expect(parseProposals(next)[0]?.status).toBe('accepted');
    expect(openProposals(next).map((p) => p.id)).toEqual([
      '2026-09-22-race-results',
    ]);
  });

  it('dismissing a section with no status line adds one, in its own style', () => {
    const next = applyDecision(
      FIXTURE,
      '2026-09-22-race-results',
      'dismissed',
      '2026-09-27',
    );
    expect(next).toBe(
      FIXTURE.replace(
        'created: 2026-09-22\n',
        'created: 2026-09-22\nstatus: dismissed\ndecided: 2026-09-27\n',
      ),
    );
  });

  it('deciding again the same way changes nothing', () => {
    const once = applyDecision(
      FIXTURE,
      '2026-09-20-invoices',
      'accepted',
      '2026-09-27',
    );
    expect(
      applyDecision(once, '2026-09-20-invoices', 'accepted', '2026-09-28'),
    ).toBe(once);
  });

  it('refuses a proposal decided the other way, or one that is not there', () => {
    expect(() =>
      applyDecision(FIXTURE, '2026-09-18-garden-tag', 'accepted', '2026-09-27'),
    ).toThrow(ProposalError);
    expect(() =>
      applyDecision(FIXTURE, 'no-such-id', 'dismissed', '2026-09-27'),
    ).toThrow(ProposalError);
  });
});

describe('rulesWithAccepted', () => {
  const invoices = parseProposals(FIXTURE)[0];
  if (invoices === undefined) throw new Error('fixture changed');

  it('appends the rule under its own heading, created at the end', () => {
    const next = rulesWithAccepted(RULES, invoices, '2026-09-27');
    expect(next).toBe(
      `${RULES.replace(/\s+$/, '')}\n\n${ACCEPTED_HEADING}\n\n` +
        '- File invoices under 2-Areas/Money with the tag finance. (accepted suggestion, 2026-09-27)\n',
    );
  });

  it('adds a second rule to the same section, before any later one', () => {
    const race = parseProposals(FIXTURE)[1];
    if (race === undefined) throw new Error('fixture changed');
    const once = `${rulesWithAccepted(RULES, invoices, '2026-09-27')}\n## Later\n- Mine.\n`;
    const twice = rulesWithAccepted(once, race, '2026-09-28');
    expect(twice).toContain(
      '(accepted suggestion, 2026-09-27)\n- For a race result, record the date, distance and time in [[Running log]] and link it from [[Half Marathon]]. (accepted suggestion, 2026-09-28)\n',
    );
    expect(twice.endsWith('## Later\n- Mine.\n')).toBe(true);
  });

  it('never adds the same rule twice', () => {
    const once = rulesWithAccepted(RULES, invoices, '2026-09-27');
    expect(rulesWithAccepted(once, invoices, '2026-09-28')).toBe(once);
  });

  it('starts an empty file with the section alone', () => {
    expect(rulesWithAccepted('', invoices, '2026-09-27')).toBe(
      `${ACCEPTED_HEADING}\n\n- File invoices under 2-Areas/Money with the tag finance. (accepted suggestion, 2026-09-27)\n`,
    );
  });
});

describe('plainText', () => {
  it('shows wikilinks as their plain names', () => {
    expect(
      plainText('See [[Running log]] and [[Half Marathon|the race]].'),
    ).toBe('See Running log and the race.');
  });
});
