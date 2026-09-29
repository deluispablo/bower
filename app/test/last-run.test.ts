import { describe, expect, it } from 'vitest';

import { parseLastRun } from '../src/last-run.js';

const DONE_JSON = JSON.stringify({
  state: 'done',
  kind: 'ingest',
  runId: 'run-1',
  finishedAt: '2026-09-28T12:00:00Z',
  sentence: 'Tidied up 3 things.',
  processed: 3,
  quarantined: 0,
  refused: 0,
});

const FAILED_JSON = JSON.stringify({
  state: 'failed',
  kind: 'ingest',
  runId: 'run-2',
  finishedAt: '2026-09-28T12:05:00Z',
  sentence: 'The tidy-up took too long and was stopped.',
  processed: 0,
  quarantined: 1,
  refused: 2,
  reason: 'timeout',
});

describe('parseLastRun (#564)', () => {
  it('parses a done outcome, no reason field', () => {
    expect(parseLastRun(DONE_JSON)).toEqual({
      state: 'done',
      kind: 'ingest',
      runId: 'run-1',
      finishedAt: '2026-09-28T12:00:00Z',
      sentence: 'Tidied up 3 things.',
      processed: 3,
      quarantined: 0,
      refused: 0,
    });
  });

  it('parses a failed outcome with a known reason', () => {
    expect(parseLastRun(FAILED_JSON)).toEqual({
      state: 'failed',
      kind: 'ingest',
      runId: 'run-2',
      finishedAt: '2026-09-28T12:05:00Z',
      sentence: 'The tidy-up took too long and was stopped.',
      processed: 0,
      quarantined: 1,
      refused: 2,
      reason: 'timeout',
    });
  });

  it('a failed outcome with an unrecognised reason reads as unknown', () => {
    const json = JSON.stringify({
      state: 'failed',
      kind: 'ingest',
      runId: 'run-3',
      finishedAt: '2026-09-28T12:05:00Z',
      sentence: 'Something went wrong before Bower could finish.',
      processed: 0,
      quarantined: 0,
      refused: 0,
      reason: 'a_future_reason_this_app_does_not_know',
    });
    expect(parseLastRun(json)?.reason).toBe('unknown');
  });

  it('a failed outcome with no reason field reads as unknown', () => {
    const withoutReason = JSON.parse(FAILED_JSON) as Record<string, unknown>;
    delete withoutReason.reason;
    expect(parseLastRun(JSON.stringify(withoutReason))?.reason).toBe('unknown');
  });

  it('malformed JSON is null', () => {
    expect(parseLastRun('{not json')).toBeNull();
  });

  it('JSON that is not an object is null', () => {
    expect(parseLastRun('"done"')).toBeNull();
    expect(parseLastRun('42')).toBeNull();
    expect(parseLastRun('null')).toBeNull();
  });

  it('a state other than done/failed is null', () => {
    const json = JSON.stringify({
      ...JSON.parse(DONE_JSON),
      state: 'running',
    });
    expect(parseLastRun(json)).toBeNull();
  });

  it.each(['kind', 'runId', 'finishedAt', 'sentence'])(
    'a missing %s is null',
    (field) => {
      const data = JSON.parse(DONE_JSON) as Record<string, unknown>;
      delete data[field];
      expect(parseLastRun(JSON.stringify(data))).toBeNull();
    },
  );

  it.each(['processed', 'quarantined', 'refused'])(
    'a non-numeric %s is null',
    (field) => {
      const data = JSON.parse(DONE_JSON) as Record<string, unknown>;
      data[field] = 'three';
      expect(parseLastRun(JSON.stringify(data))).toBeNull();
    },
  );

  it('a negative count is null', () => {
    const data = JSON.parse(DONE_JSON) as Record<string, unknown>;
    data.processed = -1;
    expect(parseLastRun(JSON.stringify(data))).toBeNull();
  });

  it('a non-integer count is null', () => {
    const data = JSON.parse(DONE_JSON) as Record<string, unknown>;
    data.processed = 1.5;
    expect(parseLastRun(JSON.stringify(data))).toBeNull();
  });

  it('an empty sentence is null', () => {
    const data = JSON.parse(DONE_JSON) as Record<string, unknown>;
    data.sentence = '';
    expect(parseLastRun(JSON.stringify(data))).toBeNull();
  });
});

describe('parseLastRun report fields (#743, R-RUNNER-2)', () => {
  const base = JSON.parse(DONE_JSON) as Record<string, unknown>;

  it('reads created, updated and left', () => {
    const parsed = parseLastRun(
      JSON.stringify({
        ...base,
        created: ['3-Resources/A.md', '', 7],
        updated: [
          { path: '2-Areas/B.md', what: 'Added a date' },
          { path: 'C.md' },
          { what: 'no path' },
        ],
        left: ['0-Inbox/D.pdf'],
      }),
    );
    expect(parsed?.created).toEqual(['3-Resources/A.md']);
    expect(parsed?.updated).toEqual([
      { path: '2-Areas/B.md', what: 'Added a date' },
      { path: 'C.md' },
    ]);
    expect(parsed?.left).toEqual(['0-Inbox/D.pdf']);
  });

  it('leaves them absent from an older runner', () => {
    const parsed = parseLastRun(DONE_JSON);
    expect(parsed).not.toHaveProperty('created');
    expect(parsed).not.toHaveProperty('updated');
    expect(parsed).not.toHaveProperty('left');
  });
});
