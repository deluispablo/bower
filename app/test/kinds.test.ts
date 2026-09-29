import { describe, expect, it } from 'vitest';

import {
  KINDS,
  formatFieldValue,
  keyFactsFor,
  kindById,
  questionsLabelFor,
  statusLabel,
  type Kind,
  type KindField,
} from '../src/kinds.js';

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
      listing.fields
        .filter((f) => f.group === group && f.key !== 'viewing')
        .map((f) => f.label),
    ]);
    expect(byGroup).toEqual([
      ['The place', ['Address', 'Type', 'Highlight', 'Rooms']],
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
    expect(
      listing.fields.filter((f) => f.forYou === true).map((f) => f.label),
    ).toEqual(['Bike to the office', 'Fit']);
  });

  it('has a Viewing date field in Terms and dates', () => {
    expect(listing.fields.find((f) => f.key === 'viewing')).toMatchObject({
      label: 'Viewing',
      type: 'date',
      group: 'Terms and dates',
    });
  });

  it('has the key facts of board System-KeyFacts, in order', () => {
    expect(
      listing.keyFacts.map(
        (key) => listing.fields.find((f) => f.key === key)?.factLabel,
      ),
    ).toEqual(['a month', '{rest}', 'available', 'bike to work']);
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
    // The score pill leads (R-KF-2), so the fourth key field drops off.
    expect(keyFactsFor(kind('rental-listing'), listingNote)).toEqual([
      { value: '72', label: 'your score', key: 'fit', tone: 'good' },
      { value: '£2,150', label: 'a month', key: 'rent' },
      { value: '2 bed', label: '1 bath', key: 'rooms' },
      { value: '1 Nov', label: 'available', key: 'available' },
    ]);
  });

  it('finds three facts for a job offer (board Flow-02-Earlier)', () => {
    const offer = {
      salary: 78000,
      office: "King's Cross",
      starts: '2026-08-01',
    };
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
    expect(keyFactsFor(kind('contract'), { value: 1200 })[0]?.label).toBe(
      'value',
    );
  });

  it('finds one fact for a receipt, labelled with shop and date', () => {
    const receipt = {
      total: '£38.40',
      shop: 'Corner shop',
      date: '2026-03-14',
    };
    expect(keyFactsFor(kind('receipt'), receipt)).toEqual([
      { value: '£38.40', label: 'total at Corner shop, 14 Mar', key: 'total' },
    ]);
    expect(
      keyFactsFor(kind('receipt'), { total: 38.4, date: '2026-03-14' })[0]
        ?.label,
    ).toBe('total, 14 Mar');
    expect(keyFactsFor(kind('receipt'), { total: 38.4 })[0]?.label).toBe(
      'total',
    );
  });

  it('skips a missing middle field and keeps the order', () => {
    const noRooms: Record<string, unknown> = { ...listingNote };
    delete noRooms.rooms;
    expect(
      keyFactsFor(kind('rental-listing'), noRooms).map((f) => f.key),
    ).toEqual(['fit', 'rent', 'available', 'bike_to_office']);
    expect(
      keyFactsFor(kind('rental-listing'), {
        ...listingNote,
        available: '',
        rooms: null,
      }).map((f) => f.key),
    ).toEqual(['fit', 'rent', 'bike_to_office']);
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

describe('formatFieldValue', () => {
  const field = (type: KindField['type']): KindField => ({
    key: 'x',
    label: 'X',
    type,
    group: 'G',
  });

  it('shows money with its currency symbol and thousands separators', () => {
    const money = field('money');
    expect(formatFieldValue(money, 2150)).toBe('£2,150');
    expect(formatFieldValue(money, '£2150')).toBe('£2,150');
    expect(formatFieldValue(money, '£2,150')).toBe('£2,150');
    expect(formatFieldValue(money, 78000)).toBe('£78,000');
    expect(formatFieldValue(money, '£38.40')).toBe('£38.40');
    expect(formatFieldValue(money, 38.4)).toBe('£38.40');
    expect(formatFieldValue(money, 'EUR 1250000')).toBe('€1,250,000');
    expect(formatFieldValue(money, '99 USD')).toBe('$99');
    expect(formatFieldValue(money, 'about half')).toBe('about half');
  });

  it('shows dates as "1 Nov" for a day and "Jul 2027" for a month', () => {
    const date = field('date');
    expect(formatFieldValue(date, '2026-11-01')).toBe('1 Nov');
    expect(formatFieldValue(date, '2026-03-14')).toBe('14 Mar');
    expect(formatFieldValue(date, '2027-07')).toBe('Jul 2027');
    expect(formatFieldValue(date, new Date(Date.UTC(2026, 8, 24)))).toBe(
      '24 Sep',
    );
    expect(formatFieldValue(date, 'next spring')).toBe('next spring');
  });

  it('shows numbers plain and note links without brackets', () => {
    expect(formatFieldValue(field('number'), 72)).toBe('72');
    expect(formatFieldValue(field('number'), '4')).toBe('4');
    expect(formatFieldValue(field('note-link'), '[[Offer letter]]')).toBe(
      'Offer letter',
    );
    expect(formatFieldValue(field('text'), ['garden', 'second floor'])).toBe(
      'garden, second floor',
    );
  });

  it('shows nothing for a missing or blank value', () => {
    for (const type of [
      'text',
      'number',
      'money',
      'date',
      'link',
      'note-link',
    ] as const) {
      expect(formatFieldValue(field(type), undefined)).toBe('');
      expect(formatFieldValue(field(type), null)).toBe('');
      expect(formatFieldValue(field(type), '')).toBe('');
    }
  });
});

describe('every kind', () => {
  it.each(KINDS.map((k) => [k.name, k] as const))('%s is complete', (_, k) => {
    expect(k.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(k.plural).not.toBe('');
    expect(k.fields.length).toBeGreaterThanOrEqual(4);
    expect(k.fields.length).toBeLessThanOrEqual(13);
    expect(k.groups.length).toBeGreaterThanOrEqual(2);
    expect(k.groups.length).toBeLessThanOrEqual(4);
    expect(Array.isArray(k.statuses)).toBe(true);
    expect(['table', 'by-month', 'timeline', 'rarely']).toContain(k.compare);
    expect(k.questionsLabel).toContain('{n}');
    expect(k.notStatedLabel).toMatch(/^Not (in|on) the /);

    const keys = k.fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of k.fields) {
      expect(f.key).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(k.groups).toContain(f.group);
      if (f.forYou === true) expect(f.group).toBe('For you');
    }
    for (const group of k.groups) {
      expect(k.fields.some((f) => f.group === group)).toBe(true);
    }

    expect(k.keyFacts.length).toBeGreaterThanOrEqual(1);
    expect(k.keyFacts.length).toBeLessThanOrEqual(4);
    for (const key of [...k.keyFacts, ...k.compareFields])
      expect(keys).toContain(key);
    for (const key of k.keyFacts) {
      const f = k.fields.find((candidate) => candidate.key === key);
      const label = f?.factLabel ?? f?.label.toLowerCase() ?? '';
      if (!label.includes('{')) expect(label.length).toBeLessThanOrEqual(14);
    }
    expect(k.compareFields.length > 0).toBe(k.compare === 'table');
  });

  it('has the owner’s status lists (spec §9 Q2)', () => {
    expect(kind('rental-listing').statuses).toEqual([
      'new',
      'to view',
      'viewed',
      'applied',
      'rejected',
    ]);
    expect(kind('job-offer').statuses).toEqual([
      'new',
      'applied',
      'interview',
      'offer',
      'declined',
    ]);
    expect(kind('bill').statuses).toEqual(['active', 'to renew', 'cancelled']);
  });

  it('uses Compare as board System-Kinds says', () => {
    expect(Object.fromEntries(KINDS.map((k) => [k.id, k.compare]))).toEqual({
      'rental-listing': 'table',
      'job-offer': 'table',
      bill: 'table',
      receipt: 'by-month',
      payslip: 'table',
      contract: 'rarely',
      booking: 'timeline',
      recipe: 'table',
    });
  });
});

describe('questionsLabelFor', () => {
  it('writes the count as a number word', () => {
    expect(questionsLabelFor(kind('rental-listing'), 3)).toBe(
      'Ask the agent: copy these three as questions',
    );
    expect(questionsLabelFor(kind('rental-listing'), 1)).toBe(
      'Ask the agent: copy this one as a question',
    );
    expect(questionsLabelFor(kind('job-offer'), 12)).toBe(
      'Ask the employer: copy these 12 as questions',
    );
  });
});

describe('statusLabel', () => {
  const listing = kind('rental-listing');

  it('reads "Viewing <weekday>" for a listing to view with a viewing date', () => {
    expect(
      statusLabel(listing, { status: 'to view', viewing: '2026-10-03' }),
    ).toBe('Viewing Sat');
    expect(statusLabel(listing, { status: 'to view' })).toBe('To view');
    expect(
      statusLabel(listing, { status: 'viewed', viewing: '2026-10-03' }),
    ).toBe('Viewed');
  });

  it('capitalises the status and is empty without one', () => {
    expect(statusLabel(listing, { status: 'new' })).toBe('New');
    expect(statusLabel(kind('bill'), { status: 'to renew' })).toBe('To renew');
    expect(statusLabel(listing, {})).toBe('');
  });
});
