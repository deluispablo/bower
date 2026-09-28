import { describe, expect, it } from 'vitest';

import { labelFor, startsRun } from '../src/components/process-button.js';

describe('labelFor', () => {
  it('idle and done: "Tidy up", with no count (the card carries it)', () => {
    expect(labelFor('idle')).toBe('Tidy up');
    expect(labelFor('done')).toBe('Tidy up');
  });

  it('starting, queued and running: "Tidying up…"', () => {
    expect(labelFor('starting')).toBe('Tidying up…');
    expect(labelFor('queued')).toBe('Tidying up…');
    expect(labelFor('running')).toBe('Tidying up…');
  });

  it('failed and stale: "Try again"; quota: "Limit reached"', () => {
    expect(labelFor('failed')).toBe('Try again');
    expect(labelFor('stale')).toBe('Try again');
    expect(labelFor('quota')).toBe('Limit reached');
  });
});

describe('startsRun', () => {
  it('starts a run when idle, done or after a failure', () => {
    expect(startsRun('idle')).toBe(true);
    expect(startsRun('done')).toBe(true);
    expect(startsRun('failed')).toBe(true);
    expect(startsRun('stale')).toBe(true);
  });

  it('reopens the sheet instead while starting, during a run, and once the limit is reached', () => {
    // #505: a tap while starting must not reopen the confirmation for a
    // run that is already on its way.
    expect(startsRun('starting')).toBe(false);
    expect(startsRun('queued')).toBe(false);
    expect(startsRun('running')).toBe(false);
    expect(startsRun('quota')).toBe(false);
  });
});
