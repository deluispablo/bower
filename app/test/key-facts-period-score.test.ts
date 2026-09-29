import { describe, expect, it } from 'vitest';

import {
  keyFactsFor,
  kindById,
  scoreTone,
  splitPeriod,
  type Kind,
} from '../src/kinds.js';

function kind(id: string): Kind {
  const found = kindById(id);
  if (found === undefined) throw new Error(`no kind ${id}`);
  return found;
}

function rentOf(rent: string): { value: string; label: string } | undefined {
  return keyFactsFor(kind('rental-listing'), {
    kind: 'rental-listing',
    rent,
  }).find((fact) => fact.key === 'rent');
}

describe('splitPeriod (R-KF-1)', () => {
  it('splits an amount from its period', () => {
    expect(splitPeriod('£340 a week')).toEqual({
      amount: '£340',
      period: 'a week',
    });
    expect(splitPeriod('AUD 350/week')).toEqual({
      amount: 'AUD 350',
      period: 'a week',
    });
    expect(splitPeriod('£1,450 pcm')).toEqual({
      amount: '£1,450',
      period: 'a month',
    });
    expect(splitPeriod('£72,000 per annum')).toEqual({
      amount: '£72,000',
      period: 'a year',
    });
    expect(splitPeriod('£90 per week')?.period).toBe('a week');
    expect(splitPeriod('£900 /month')?.period).toBe('a month');
    expect(splitPeriod('£340 pw')?.period).toBe('a week');
    expect(splitPeriod('£72,000 a year')?.period).toBe('a year');
  });

  it('is null when the value has no period', () => {
    expect(splitPeriod('£72,000')).toBeNull();
    expect(splitPeriod('Weekly')).toBeNull();
  });
});

describe('keyFactsFor periods (R-KF-1)', () => {
  it('shows the period as the label, not "a month"', () => {
    expect(rentOf('£340 a week')).toMatchObject({
      value: '£340',
      label: 'a week',
    });
    expect(rentOf('AUD 350/week')).toMatchObject({ label: 'a week' });
    expect(rentOf('£1,450 pcm')).toMatchObject({
      value: '£1,450',
      label: 'a month',
    });
  });

  it("uses the kind's label when the value has no period", () => {
    const fact = keyFactsFor(kind('job-offer'), { salary: '£72,000' }).find(
      (f) => f.key === 'salary',
    );
    expect(fact).toMatchObject({ value: '£72,000', label: 'a year' });
  });
});

describe('keyFactsFor score (R-KF-2)', () => {
  it('leads with a score pill, toned by the number', () => {
    const facts = keyFactsFor(kind('job-offer'), {
      salary: '£72,000',
      score: 79,
    });
    expect(facts[0]).toEqual({
      value: '79',
      label: 'your score',
      key: 'score',
      tone: 'good',
    });
    expect(facts.length).toBeLessThanOrEqual(4);
    expect(keyFactsFor(kind('job-offer'), { fit: '45' })[0]).toMatchObject({
      value: '45',
      tone: 'low',
    });
  });

  it('is green from 70, amber from 50, grey below', () => {
    expect(scoreTone(70)).toBe('good');
    expect(scoreTone(69)).toBe('fair');
    expect(scoreTone(50)).toBe('fair');
    expect(scoreTone(49)).toBe('low');
  });

  it('ignores a score outside 0 to 100 or not a number', () => {
    expect(keyFactsFor(kind('job-offer'), { score: 120 })).toEqual([]);
    expect(keyFactsFor(kind('job-offer'), { score: 'high' })).toEqual([]);
  });
});
