import { describe, expect, it } from 'vitest';

import { KINDS, keyFactsFor, kindById, type Kind } from '../src/kinds.js';

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

describe('keyFactsFor', () => {
  const listingNote = {
    kind: 'rental-listing',
    rent: '£2150',
    rooms: '2 bed, 1 bath',
    available: '2026-11-01',
    bike_to_office: '14 min',
    fit: 72,
  };

  it('finds four facts for a full listing, labelled as board System-KeyFacts', () => {
    expect(keyFactsFor(kind('rental-listing'), listingNote)).toEqual([
      { value: '£2,150', label: 'a month', key: 'rent' },
      { value: '2 bed', label: '1 bath', key: 'rooms' },
      { value: '1 Nov', label: 'available', key: 'available' },
      { value: '14 min', label: 'bike to work', key: 'bike_to_office' },
    ]);
  });

  it('finds three facts for a job offer (board Flow-02-Earlier)', () => {
    const offer = { salary: 78000, office: "King's Cross", starts: '2026-08-01' };
    expect(keyFactsFor(kind('job-offer'), offer)).toEqual([
      { value: '£78,000', label: 'a year', key: 'salary' },
      { value: "King's Cross", label: 'office', key: 'office' },
      { value: '1 Aug', label: 'starts', key: 'starts' },
    ]);
  });

  it('finds two facts for an agreement, naming what the value covers', () => {
    const agreement = { covers: 'bike', value: '£1,200', ends: '2027-07' };
    expect(keyFactsFor(kind('contract'), agreement)).toEqual([
      { value: '£1,200', label: 'bike value', key: 'value' },
      { value: 'Jul 2027', label: 'ends', key: 'ends' },
    ]);
    expect(keyFactsFor(kind('contract'), { value: 1200 })[0]?.label).toBe('value');
  });

  it('finds one fact for a receipt, labelled with shop and date', () => {
    const receipt = { total: '£38.40', shop: 'Corner shop', date: '2026-03-14' };
    expect(keyFactsFor(kind('receipt'), receipt)).toEqual([
      { value: '£38.40', label: 'total at Corner shop, 14 Mar', key: 'total' },
    ]);
    expect(keyFactsFor(kind('receipt'), { total: 38.4, date: '2026-03-14' })[0]?.label).toBe(
      'total, 14 Mar',
    );
    expect(keyFactsFor(kind('receipt'), { total: 38.4 })[0]?.label).toBe('total');
  });

  it('skips a missing middle field and keeps the order', () => {
    const noRooms: Record<string, unknown> = { ...listingNote };
    delete noRooms.rooms;
    expect(keyFactsFor(kind('rental-listing'), noRooms).map((f) => f.key)).toEqual([
      'rent',
      'available',
      'bike_to_office',
    ]);
    expect(
      keyFactsFor(kind('rental-listing'), { ...listingNote, available: '', rooms: null }).map(
        (f) => f.key,
      ),
    ).toEqual(['rent', 'bike_to_office']);
  });

  it('never returns an empty value, and nothing when no key field is present', () => {
    for (const k of KINDS) {
      expect(keyFactsFor(k, {})).toEqual([]);
      const blanks = Object.fromEntries(k.keyFacts.map((key) => [key, '  ']));
      expect(keyFactsFor(k, blanks)).toEqual([]);
    }
    const facts = keyFactsFor(kind('rental-listing'), listingNote);
    expect(facts.every((f) => f.value !== '' && f.value !== '—')).toBe(true);
  });
});
