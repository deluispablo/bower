import { describe, expect, it } from 'vitest';

import { bubbleFor, birdStateFor, greetingFor } from '../src/home.js';

function at(hour: number): Date {
  const date = new Date('2026-09-27T00:00:00');
  date.setHours(hour, 0, 0, 0);
  return date;
}

describe('greetingFor', () => {
  it('says good morning before noon', () => {
    expect(greetingFor(at(6))).toBe('Good morning');
    expect(greetingFor(at(11))).toBe('Good morning');
  });

  it('says good afternoon from noon to 6 pm', () => {
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(17))).toBe('Good afternoon');
  });

  it('says good evening from 6 pm', () => {
    expect(greetingFor(at(18))).toBe('Good evening');
    expect(greetingFor(at(23))).toBe('Good evening');
  });

  it('adds the name when there is one', () => {
    expect(greetingFor(at(9), 'Alex')).toBe('Good morning, Alex');
  });

  it('never invents a name: undefined or blank stays alone', () => {
    expect(greetingFor(at(9))).toBe('Good morning');
    expect(greetingFor(at(9), '')).toBe('Good morning');
    expect(greetingFor(at(9), '   ')).toBe('Good morning');
  });
});

describe('bubbleFor', () => {
  const allTidy = {
    offline: false,
    error: false,
    newHealthReport: false,
    pending: 0,
  };

  it('n pending', () => {
    expect(bubbleFor({ ...allTidy, pending: 3 })).toBe(
      '3 new things in your inbox. Shall I tidy up?',
    );
  });

  it('1 pending is singular', () => {
    expect(bubbleFor({ ...allTidy, pending: 1 })).toBe(
      '1 new thing in your inbox. Shall I tidy up?',
    );
  });

  it('0 pending, nothing new: all tidy', () => {
    expect(bubbleFor(allTidy)).toBe('All tidy.');
  });

  it('offline beats everything else', () => {
    expect(
      bubbleFor({
        offline: true,
        error: true,
        done: { processed: 2 },
        newHealthReport: true,
        pending: 3,
      }),
    ).toBe("No signal here. I'll keep an eye out.");
  });

  it('error loading beats a done run, a new report and pending', () => {
    expect(
      bubbleFor({
        offline: false,
        error: true,
        done: { processed: 2 },
        newHealthReport: true,
        pending: 3,
      }),
    ).toBe('Could not load your notes.');
  });

  it('done with counts beats a new report and pending', () => {
    expect(
      bubbleFor({
        offline: false,
        error: false,
        done: { processed: 3 },
        newHealthReport: true,
        pending: 5,
      }),
    ).toBe('All tidy. 3 things filed.');
  });

  it('done with one thing is singular', () => {
    expect(bubbleFor({ ...allTidy, done: { processed: 1 } })).toBe(
      'All tidy. 1 thing filed.',
    );
  });

  it('done with nothing processed', () => {
    expect(bubbleFor({ ...allTidy, done: { processed: 0 } })).toBe(
      'All tidy. Nothing new this time.',
    );
  });

  it('a new health report beats pending', () => {
    expect(bubbleFor({ ...allTidy, newHealthReport: true, pending: 4 })).toBe(
      "Sunday's health check is ready. Want to see it?",
    );
  });
});

describe('birdStateFor', () => {
  const settled = {
    offline: false,
    justDone: false,
    pending: 0,
    newHealthReport: false,
  };

  it('looks around by default, with something pending', () => {
    expect(birdStateFor({ ...settled, pending: 2 })).toBe('looking');
  });

  it('is asleep once nothing is pending and nothing is new', () => {
    expect(birdStateFor(settled)).toBe('asleep');
  });

  it('stays looking when a report is new even with nothing pending', () => {
    expect(birdStateFor({ ...settled, newHealthReport: true })).toBe('looking');
  });

  it('shows off right after a run finishes', () => {
    expect(birdStateFor({ ...settled, justDone: true })).toBe('showoff');
  });

  it('goes offline before anything else', () => {
    expect(
      birdStateFor({ ...settled, offline: true, justDone: true, pending: 3 }),
    ).toBe('offline');
  });
});
