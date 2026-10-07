/**
 * Report sequences for the ordered-status contract (worker contract, "Runner wire"; TL-P3-23). The same sequences run
 * on the real Worker (`api/test/runner.test.ts`) and on the fake (`ledger-contract.test.ts`), so both must give the same
 * answers, visible runs and revisions. Types only: the Worker's test imports this file.
 */

export type ReportPhase = 'queued' | 'reading' | 'writing' | 'saving' | 'done' | 'failed';

export interface ReportBody {
  attempt: number;
  seq: number;
  phase: ReportPhase;
  total?: number;
  failure?: string;
}

/** What a step must answer: 200 or a 409 (`stale-report`, `stale-attempt`), the visible run after it, and whether the revision rose. */
export interface Expected {
  status: 200 | 409;
  code?: 'stale-report' | 'stale-attempt';
  phase: ReportPhase;
  total?: number;
  failure?: string;
  /** 1 when the visible run changed (the revision rose by one); 0 when it did not. */
  bump: 0 | 1;
}

export type Step = { takeover: number } | { send: ReportBody; expect: Expected };

export interface Sequence {
  name: string;
  steps: readonly Step[];
}

const ok = (phase: ReportPhase, bump: 0 | 1, more: { total?: number; failure?: string } = {}): Expected => ({ status: 200, phase, bump, ...more });
const late = (phase: ReportPhase, total?: number): Expected => ({ status: 409, code: 'stale-report', phase, bump: 0, ...(total === undefined ? {} : { total }) });
const r = (attempt: number, seq: number, phase: ReportPhase, more: { total?: number; failure?: string } = {}): ReportBody => ({ attempt, seq, phase, ...more });

export const SEQUENCES: readonly Sequence[] = [
  {
    name: 'out of order within one attempt',
    steps: [
      { send: r(1, 1, 'reading', { total: 3 }), expect: ok('reading', 1, { total: 3 }) },
      { send: r(1, 3, 'writing'), expect: ok('writing', 1, { total: 3 }) },
      { send: r(1, 2, 'saving'), expect: late('writing', 3) },
      { send: r(1, 4, 'reading'), expect: late('writing', 3) },
      { send: r(1, 5, 'queued'), expect: late('writing', 3) },
      { send: r(1, 4, 'saving'), expect: ok('saving', 1, { total: 3 }) },
    ],
  },
  {
    name: 'duplicates and reports that show nothing new',
    steps: [
      { send: r(1, 1, 'reading', { total: 3 }), expect: ok('reading', 1, { total: 3 }) },
      { send: r(1, 1, 'reading', { total: 3 }), expect: ok('reading', 0, { total: 3 }) },
      { send: r(1, 2, 'reading'), expect: ok('reading', 0, { total: 3 }) },
      { send: r(1, 3, 'reading', { total: 3 }), expect: ok('reading', 0, { total: 3 }) },
      { send: r(1, 4, 'reading', { total: 5 }), expect: ok('reading', 1, { total: 5 }) },
      { send: r(1, 2, 'writing'), expect: late('reading', 5) },
    ],
  },
  {
    name: 'a later attempt starts behind the run',
    steps: [
      { send: r(1, 1, 'reading', { total: 2 }), expect: ok('reading', 1, { total: 2 }) },
      { send: r(1, 2, 'writing'), expect: ok('writing', 1, { total: 2 }) },
      { send: r(1, 3, 'saving'), expect: ok('saving', 1, { total: 2 }) },
      { takeover: 2 },
      // The polish case: attempt 2 begins with writing after attempt 1 reached saving.
      { send: r(2, 1, 'writing'), expect: ok('saving', 0, { total: 2 }) },
      { send: r(2, 1, 'writing'), expect: ok('saving', 0, { total: 2 }) },
      { send: r(2, 2, 'reading'), expect: late('saving', 2) },
      { send: r(2, 3, 'writing'), expect: ok('saving', 0, { total: 2 }) },
      { send: r(2, 2, 'writing'), expect: late('saving', 2) },
      { send: r(1, 4, 'done'), expect: { status: 409, code: 'stale-attempt', phase: 'saving', total: 2, bump: 0 } },
      { send: r(2, 4, 'saving'), expect: ok('saving', 0, { total: 2 }) },
      { send: r(2, 5, 'done'), expect: ok('done', 1, { total: 2 }) },
      { send: r(2, 5, 'done'), expect: ok('done', 0, { total: 2 }) },
    ],
  },
  {
    name: 'a later attempt starts at the very beginning',
    steps: [
      { send: r(1, 1, 'writing', { total: 4 }), expect: ok('writing', 1, { total: 4 }) },
      { takeover: 2 },
      { send: r(2, 1, 'queued'), expect: ok('writing', 0, { total: 4 }) },
      { send: r(2, 2, 'reading', { total: 9 }), expect: ok('writing', 0, { total: 4 }) },
      { send: r(2, 3, 'writing'), expect: ok('writing', 0, { total: 4 }) },
      { send: r(2, 4, 'saving'), expect: ok('saving', 1, { total: 4 }) },
    ],
  },
  {
    name: 'a later attempt fails the run',
    steps: [
      { send: r(1, 1, 'saving', { total: 2 }), expect: ok('saving', 1, { total: 2 }) },
      { takeover: 2 },
      { send: r(2, 1, 'writing'), expect: ok('saving', 0, { total: 2 }) },
      { send: r(2, 2, 'failed', { failure: 'Something went wrong.' }), expect: ok('failed', 1, { total: 2, failure: 'Something went wrong.' }) },
    ],
  },
];
