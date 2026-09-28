import { describe, expect, it } from 'vitest';

import { KINDS, kindById, type Kind } from '../src/kinds.js';

function kind(id: string): Kind {
  const found = kindById(id);
  if (found === undefined) throw new Error(`no kind ${id}`);
  return found;
}

describe('KINDS', () => {
  it('lists the eight kinds in the order of board System-Kinds', () => {
    expect(KINDS.map((k) => k.name)).toEqual([
      'rental listing',
      'job offer',
      'bill or renewal',
      'receipt',
      'payslip',
      'contract or agreement',
      'booking or ticket',
      'recipe',
    ]);
  });

  it('has no kind for anything else', () => {
    expect(kindById('anything-else')).toBeUndefined();
    expect(kindById('')).toBeUndefined();
  });
});

describe('rental listing', () => {
  const listing = kind('rental-listing');
  const label = (key: string): string | undefined =>
    listing.fields.find((f) => f.key === key)?.label;

  it('groups its Details fields as board Phone-Note-Details-Open does', () => {
    const byGroup = listing.groups.map((group) => [
      group,
      listing.fields.filter((f) => f.group === group && f.key !== 'viewing').map((f) => f.label),
    ]);
    expect(byGroup).toEqual([
      ['The place', ['Address', 'Type', 'Rooms']],
      ['Money', ['Rent', 'Deposit', 'Against the area']],
      ['Terms and dates', ['Available', 'Lease', 'Listed']],
      ['For you', ['Bike to the office', 'Fit']],
    ]);
    expect(listing.notStatedLabel).toBe('Not in the listing');
    expect(listing.questionsLabel.replace('{n}', 'three')).toBe(
      'Ask the agent: copy these three as questions',
    );
  });

  it('marks the For you fields as coming from the person’s notes', () => {
    expect(listing.fields.filter((f) => f.forYou === true).map((f) => f.label)).toEqual([
      'Bike to the office',
      'Fit',
    ]);
  });

  it('has a Viewing date field in Terms and dates', () => {
    expect(listing.fields.find((f) => f.key === 'viewing')).toMatchObject({
      label: 'Viewing',
      type: 'date',
      group: 'Terms and dates',
    });
  });

  it('has the key facts of board System-KeyFacts, in order', () => {
    expect(listing.keyFacts.map((key) => listing.fields.find((f) => f.key === key)?.factLabel))
      .toEqual(['a month', '{rest}', 'available', 'bike to work']);
  });

  it('has the Compare columns of board Desktop-Compare', () => {
    const headers = listing.compareFields.map((key) => {
      const field = listing.fields.find((f) => f.key === key);
      return field?.compareLabel ?? field?.label;
    });
    expect([...headers, 'Status']).toEqual([
      'Rent a month',
      'Rooms',
      'Available',
      'Against the area',
      'Bike to the office',
      'Fit',
      'Status',
    ]);
    expect(label('fit')).toBe('Fit');
  });
});
