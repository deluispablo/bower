// @vitest-environment jsdom

import { h, render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import rulebook from '../../vault-template/CLAUDE.md?raw';
import { BOOKKEEPING_KEYS, Details } from '../src/components/details.js';
import { keyFactsFor, kindById } from '../src/kinds.js';
import type { Kind } from '../src/kinds.js';
import { noteMetaFrom } from '../src/note-meta.js';

const FOUND = kindById('rental-listing');
if (FOUND === undefined) throw new Error('rental-listing kind is missing');
const KIND: Kind = FOUND;

const SAMPLE: Record<string, unknown> = {
  kind: 'rental-listing',
  address: '14 Arlington Road, London NW1',
  rent: 2150,
  available: '2026-11-01',
  bike_to_office:
    '14 minutes, from your offer letter and Cycle to Work agreement',
  bower_origins: { bike_to_office: 'notes' },
  not_stated: ['pets', 'parking', 'council_tax'],
};

let host: HTMLElement;

function mount(fields: Record<string, unknown>): void {
  render(h(Details, { kind: KIND, meta: noteMetaFrom(fields) }), host);
}

function titles(): (string | null)[] {
  return [...host.querySelectorAll('.details-group-title')].map(
    (node) => node.textContent,
  );
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('Details (issue #603, #757)', () => {
  it('is always open: groups, values and origin squares only off the file', () => {
    mount(SAMPLE);
    expect(host.querySelector('.details-toggle')).toBeNull();
    expect(titles()).toEqual([
      'The place',
      'Money',
      'Terms and dates',
      'For you',
    ]);
    const text = host.textContent ?? '';
    expect(text).toContain('14 Arlington Road, London NW1');
    expect(text).toContain('£2,150');
    expect(text).toContain('1 Nov');
    expect(text).toContain(
      '14 minutes, from your offer letter and Cycle to Work agreement',
    );
    // A field from the file shows no square; one from your notes does.
    expect(
      [...host.querySelectorAll('.origin-square')].map((node) =>
        node.getAttribute('data-origin'),
      ),
    ).toEqual(['notes']);
  });

  it('puts a field a rule added under "More", never in key facts', () => {
    const fields = { ...SAMPLE, pet_policy: 'Cats allowed' };
    mount(fields);
    expect(titles()).toContain('More');
    expect(host.textContent).toContain('Pet policy');
    expect(host.textContent).toContain('Cats allowed');
    const facts = keyFactsFor(KIND, fields);
    expect(facts.map((fact) => fact.key)).not.toContain('pet_policy');
    expect(facts.map((fact) => fact.value)).not.toContain('Cats allowed');
  });

  it('never lists bookkeeping keys under "More"', () => {
    mount({ ...SAMPLE, status: 'to view', original: '[[Listing.pdf]]' });
    expect(titles()).not.toContain('More');
  });

  it('keeps the box, verdict and pile keys out of "More" (R-INS-8)', () => {
    mount({
      ...SAMPLE,
      bower_updated: '2026-09-29',
      bower_change: 'Your rule now asks for 70.',
      bower_before: 'Your rule asked for 80.',
      by: 'bower',
      pile_note: 'From the Flat hunt pile',
      facts: { rent: 2150 },
      score: 79,
      verdict: 'Apply first',
      made_for: '[[CV]]',
    });
    expect(titles()).not.toContain('More');
    const text = host.textContent ?? '';
    expect(text).not.toContain('Apply first');
    expect(text).not.toContain('Flat hunt pile');
  });

  it('keeps BOOKKEEPING_KEYS equal to the rulebook frontmatter keys (spec 7c item 10)', () => {
    const required = [
      'bower_updated',
      'bower_change',
      'bower_before',
      'by',
      'pile_note',
      'facts',
      'score',
      'verdict',
      'made_for',
    ];
    for (const key of required) expect(BOOKKEEPING_KEYS.has(key)).toBe(true);
    // Every `bower_*` key the rulebook names must be bookkeeping too.
    const named = new Set(rulebook.match(/\bbower_[a-z_]+\b/g) ?? []);
    // `bower_rules_version` is the rulebook's own version, not a note field.
    named.delete('bower_rules_version');
    for (const key of named) expect(BOOKKEEPING_KEYS.has(key)).toBe(true);
  });
});

describe('Details notes and bookkeeping (issue #705)', () => {
  it('writes a value with its companion note and hides bookkeeping keys', () => {
    mount({
      ...SAMPLE,
      bike_to_office: '14 min',
      bike_to_office_note: 'from your offer letter',
      fit: 72,
      fit_note: 'cheap, close',
      updated: '2026-09-29',
      date: '2026-09-29',
      type: 'Flat',
      extra_note: 'stray',
      pet_policy: 'No pets',
    });
    const text = host.textContent ?? '';
    expect(text).toContain('14 min, from your offer letter');
    expect(text).toContain('72 of 100: cheap, close');
    expect(text).toContain('No pets');
    expect(text).not.toContain('stray');
    expect(text).not.toContain('2026-09-29');
  });
});

describe('the apply link (issue #792)', () => {
  const FOUND_OFFER = kindById('job-offer');
  if (FOUND_OFFER === undefined) throw new Error('job-offer kind is missing');
  const OFFER: Kind = FOUND_OFFER;

  function rows(apply: unknown): string {
    render(
      h(Details, {
        kind: OFFER,
        meta: noteMetaFrom({
          kind: 'job-offer',
          role: 'Data Lead',
          apply_link: apply,
        }),
      }),
      host,
    );
    return host.textContent ?? '';
  }

  it('is left to the Apply button when it is a web address', () => {
    expect(rows('https://jobs.example.com/apply')).not.toContain('Apply link');
  });

  it('still shows as a row when it is not a web address', () => {
    expect(rows('ask the recruiter')).toContain('Apply link');
  });
});
