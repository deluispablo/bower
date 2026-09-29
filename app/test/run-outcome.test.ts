import { describe, expect, it } from 'vitest';

import {
  cleanQuote,
  outcomeCounts,
  outcomeFromLastRun,
  outcomeFromRun,
  runSentence,
} from '../src/run-outcome.js';
import type { RunOutcome } from '../src/run-outcome.js';
import { buildLastRun, buildRun } from './fixtures/run-outcome-builders.js';

const NOW = Date.parse('2026-09-29T10:18:00.000Z');

describe('outcomeFromRun (R-RUN-1)', () => {
  it('reads a done run: filed, new, updated, nothing left', () => {
    const outcome = outcomeFromRun(buildRun('done'));
    expect(outcome).toMatchObject({
      state: 'done',
      filed: 2,
      created: 1,
      updated: 1,
      needsYou: 0,
      left: 0,
    });
    expect(outcome.items.map((item) => item.action)).toEqual([
      'filed',
      'filed',
      'new',
      'updated',
    ]);
    expect(outcome.items[0]).toMatchObject({
      title: 'Boiler receipt.pdf',
      to: '2-Areas/Home/Boiler receipt.pdf',
    });
    expect(outcome.items[3]).toMatchObject({
      title: 'Boiler',
      note: 'Added the next service date',
    });
  });

  it('counts updates on a run that filed nothing (the 1.11 case)', () => {
    const outcome = outcomeFromRun(
      buildRun('done', { items: [], processed: [], created: [] }),
    );
    expect(outcome).toMatchObject({ state: 'done', filed: 0, updated: 1 });
    expect(runSentence(outcome, { now: NOW })).toBe(
      'Done 12 min ago: 1 updated.',
    );
  });

  it('is partial when the run failed after writing notes (the 1.9 case)', () => {
    const outcome = outcomeFromRun(buildRun('partial'));
    expect(outcome).toMatchObject({
      state: 'partial',
      filed: 1,
      created: 1,
      updated: 1,
      left: 1,
      needsYou: 1,
      reason: 'timeout',
    });
  });

  it('is failed when it failed with nothing done', () => {
    const outcome = outcomeFromRun(buildRun('failed'));
    expect(outcome).toMatchObject({
      state: 'failed',
      filed: 0,
      created: 0,
      updated: 0,
      left: 1,
      reason: 'drive_unavailable',
    });
  });

  it('reads a stale Worker run with no reason as unknown', () => {
    const outcome = outcomeFromRun(buildRun('stale'));
    expect(outcome).toMatchObject({ state: 'failed', reason: 'unknown' });
  });

  it('reads a running run with its total and phase', () => {
    const outcome = outcomeFromRun(buildRun('running'));
    expect(outcome).toMatchObject({
      state: 'running',
      total: 2,
      phase: 'writing',
    });
    expect(outcome.finishedAt).toBeUndefined();
  });

  it('never turns the context note or instruction items into items or counts', () => {
    const outcome = outcomeFromRun(
      buildRun('done', {
        items: [
          {
            path: '0-Inbox/Bower - 2026-09-29 1000 Context.md',
            kind: 'context',
          },
          {
            path: '0-Inbox/Bower - 2026-09-29 1001 Note.md',
            kind: 'rule',
            to: '4-Archive/x.md',
          },
          { path: '0-Inbox/Q.md', kind: 'question' },
        ],
        created: ['0-Inbox/Bower - 2026-09-29 1000 Context.md'],
        updated: [],
      }),
    );
    expect(outcome).toMatchObject({ filed: 0, created: 0, updated: 0 });
    expect(outcome.items).toEqual([]);
  });

  it('counts set-aside files and what is left as needs you', () => {
    const outcome = outcomeFromRun(
      buildRun('done', {
        setAside: [{ path: '0-Inbox/Old.pages', reason: 'kept-not-read' }],
        left: ['0-Inbox/Lease.pdf'],
      }),
    );
    expect(outcome.needsYou).toBe(2);
    expect(outcome.items.filter((item) => item.action === 'needs')).toHaveLength(
      2,
    );
  });

  it('falls back to requestedAt when the run has no start', () => {
    const outcome = outcomeFromRun(buildRun('done', { startedAt: undefined }));
    expect(outcome.startedAt).toBe('2026-09-29T10:00:00.000Z');
  });

  it('keeps the quote clean', () => {
    const outcome = outcomeFromRun(
      buildRun('done', { added: ' I added bike times. ' }),
    );
    expect(outcome.quote).toBe('I added bike times');
  });
});

describe('outcomeFromLastRun (R-RUNNER-2)', () => {
  it('recovers a stale run in full', () => {
    const outcome = outcomeFromLastRun(buildLastRun('stale'));
    expect(outcome).toMatchObject({
      state: 'done',
      filed: 2,
      created: 1,
      updated: 1,
      needsYou: 0,
    });
    expect(outcome.items).toHaveLength(4);
    expect(outcome.startedAt).toBe(outcome.finishedAt);
  });

  it('is partial for a failed file that wrote notes', () => {
    const outcome = outcomeFromLastRun(buildLastRun('partial'));
    expect(outcome.state).toBe('partial');
    expect(outcome.left).toBe(1);
  });

  it('is failed for a failed file with nothing done', () => {
    expect(outcomeFromLastRun(buildLastRun('failed')).state).toBe('failed');
  });

  it('reads an older file with no report fields as zero counts', () => {
    const outcome = outcomeFromLastRun({
      state: 'done',
      kind: 'ingest',
      runId: 'run-1',
      finishedAt: '2026-09-29T10:06:00Z',
      sentence: 'Done',
      processed: 2,
      quarantined: 0,
      refused: 0,
    });
    expect(outcome).toMatchObject({
      state: 'done',
      filed: 0,
      created: 0,
      updated: 0,
    });
  });
});

describe('runSentence (R-RUN-2, R-RUN-6)', () => {
  const done = outcomeFromRun(
    buildRun('done', {
      setAside: [{ path: '0-Inbox/Old.pages', reason: 'kept-not-read' }],
    }),
  );

  it('RUN-S1: done, counts in order, zeros left out', () => {
    expect(runSentence(done, { now: NOW })).toBe(
      'Done 12 min ago: 2 filed · 1 new note · 1 updated · 1 needs you.',
    );
    const onlyNew = { ...done, filed: 0, updated: 0, needsYou: 0 };
    expect(runSentence(onlyNew, { now: NOW })).toBe(
      'Done 12 min ago: 1 new note.',
    );
  });

  it('RUN-S2: done, all zero', () => {
    const empty = outcomeFromRun(
      buildRun('done', { items: [], created: [], updated: [], left: [] }),
    );
    expect(runSentence(empty, { now: NOW })).toBe(
      'Nothing new: the inbox was empty.',
    );
  });

  it('RUN-S3: partial, in both voices', () => {
    const partial = outcomeFromRun(
      buildRun('partial', {
        created: ['a.md', 'b.md', 'c.md'],
        left: ['x', 'y', 'z', 'w', 'v'],
      }),
    );
    expect(runSentence(partial)).toBe(
      'I wrote 3 notes, then stopped before filing your 5 things.',
    );
    expect(runSentence(partial, { voice: 'third' })).toBe(
      'Bower wrote 3 notes, then stopped before filing your 5 things.',
    );
  });

  it('RUN-S3: partial without new notes names what it did', () => {
    const partial = outcomeFromRun(
      buildRun('partial', { created: [], left: ['0-Inbox/a.pdf'] }),
    );
    expect(runSentence(partial)).toBe(
      'I updated 1 note, then stopped before filing your 1 thing.',
    );
  });

  it('RUN-S4: failed, reason sentence and what is still in the inbox', () => {
    const failed = outcomeFromRun(buildRun('failed', { left: ['a', 'b'] }));
    expect(runSentence(failed)).toBe(
      'Google Drive stopped answering half way through copying things back. Nothing changed; your 2 things are still in the inbox.',
    );
    const one = outcomeFromRun(buildRun('failed', { left: ['a'] }));
    expect(runSentence(one)).toContain('your 1 thing is still in the inbox.');
    const unknown = outcomeFromRun(buildRun('stale'));
    expect(runSentence(unknown).endsWith(' Nothing changed.')).toBe(true);
  });

  it('RUN-S5: running', () => {
    const running = outcomeFromRun(buildRun('running', { total: 4 }));
    expect(runSentence(running)).toBe(
      'Tidying up 4 things. It takes a few minutes; you can keep adding.',
    );
    expect(runSentence(running, { voice: 'third' })).toBe(
      'Bower is tidying up 4 things. It takes a few minutes; you can keep adding.',
    );
  });

  it('RUN-S6: short form says "new", keeps every non-zero count', () => {
    expect(outcomeCounts(done, { short: true })).toBe(
      '2 filed · 1 new · 1 updated · 1 needs you',
    );
  });

  it('R-RUN-5: a partly done run reads "still in your inbox"', () => {
    const partial: RunOutcome = outcomeFromRun(
      buildRun('partial', {
        created: ['a.md', 'b.md', 'c.md'],
        items: [],
        updated: [],
        left: ['1', '2', '3', '4', '5'],
      }),
    );
    expect(outcomeCounts(partial)).toBe('3 new notes · 5 still in your inbox');
  });
});

describe('cleanQuote (R-RUN-3)', () => {
  it('trims and drops one trailing full stop', () => {
    expect(cleanQuote('  I added bike times to the flats.  ')).toBe(
      'I added bike times to the flats',
    );
  });

  it('caps at 200 characters', () => {
    expect(cleanQuote('x'.repeat(300))).toHaveLength(200);
  });

  it('gives nothing for missing or empty text', () => {
    expect(cleanQuote(undefined)).toBeUndefined();
    expect(cleanQuote(' . ')).toBeUndefined();
  });
});
