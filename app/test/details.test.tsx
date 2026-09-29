// @vitest-environment jsdom

import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Details } from '../src/components/details.js';
import { keyFactsFor, kindById } from '../src/kinds.js';
import type { Kind } from '../src/kinds.js';
import { noteMetaFrom } from '../src/note-meta.js';
import { currentToast, dismissToast } from '../src/toast-store.js';

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
const writeText = vi.fn<(text: string) => Promise<void>>();

function mount(fields: Record<string, unknown>): void {
  render(h(Details, { kind: KIND, meta: noteMetaFrom(fields) }), host);
}

async function click(selector: string): Promise<void> {
  await act(() => {
    host.querySelector<HTMLButtonElement>(selector)?.click();
  });
}

function titles(): (string | null)[] {
  return [...host.querySelectorAll('.details-group-title')].map(
    (node) => node.textContent,
  );
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  writeText.mockReset();
  writeText.mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  render(null, host);
  host.remove();
  dismissToast();
});

describe('Details (issue #603)', () => {
  it('is collapsed by default with the count in its row', () => {
    mount(SAMPLE);
    const toggle = host.querySelector('.details-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.textContent).toBe(
      'Details· rental listing · 4 read by Bower',
    );
    expect(host.querySelector('.details-body')).toBeNull();
  });

  it('shows groups, values, origin squares and chips when open', async () => {
    mount(SAMPLE);
    await click('.details-toggle');
    expect(
      host.querySelector('.details-toggle')?.getAttribute('aria-expanded'),
    ).toBe('true');
    expect(titles()).toEqual([
      'The place',
      'Money',
      'Terms and dates',
      'For you',
      'Not in the listing',
    ]);
    const text = host.textContent ?? '';
    expect(text).toContain('14 Arlington Road, London NW1');
    expect(text).toContain('£2,150');
    expect(text).toContain('1 Nov');
    expect(text).toContain(
      '14 minutes, from your offer letter and Cycle to Work agreement',
    );
    expect(
      [...host.querySelectorAll('.origin-square')].map((node) =>
        node.getAttribute('data-origin'),
      ),
    ).toEqual(['file', 'file', 'file', 'notes']);
    expect(
      [...host.querySelectorAll('.details-chip')].map(
        (node) => node.textContent,
      ),
    ).toEqual(['Pets', 'Parking', 'Council tax']);
    expect(host.querySelector('.details-ask')?.textContent).toBe(
      'Ask the agent: copy these three as questions',
    );
  });

  it('copies one question per chip and shows a toast', async () => {
    mount(SAMPLE);
    await click('.details-toggle');
    await click('.details-ask');
    expect(writeText).toHaveBeenCalledTimes(1);
    const lines = (writeText.mock.calls[0]?.[0] ?? '').split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('What is the pets for this rental listing?');
    expect(lines[2]).toContain('council tax');
    expect(currentToast()?.message).toBe('Copied three questions');
  });

  it('puts a field a rule added under "More", never in key facts', async () => {
    const fields = { ...SAMPLE, pet_policy: 'Cats allowed' };
    mount(fields);
    await click('.details-toggle');
    expect(titles()).toContain('More');
    expect(host.textContent).toContain('Pet policy');
    expect(host.textContent).toContain('Cats allowed');
    const facts = keyFactsFor(KIND, fields);
    expect(facts.map((fact) => fact.key)).not.toContain('pet_policy');
    expect(facts.map((fact) => fact.value)).not.toContain('Cats allowed');
  });

  it('never lists bookkeeping keys under "More"', async () => {
    mount({ ...SAMPLE, status: 'to view', original: '[[Listing.pdf]]' });
    await click('.details-toggle');
    expect(titles()).not.toContain('More');
  });
});

describe('Details notes and bookkeeping (issue #705)', () => {
  it('writes a value with its companion note and hides bookkeeping keys', async () => {
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
    await click('.details-toggle');
    const text = host.textContent ?? '';
    expect(text).toContain('14 min, from your offer letter');
    expect(text).toContain('72 of 100: cheap, close');
    expect(text).toContain('No pets');
    expect(text).not.toContain('stray');
    expect(text).not.toContain('2026-09-29');
  });
});
