import { describe, expect, it } from 'vitest';
import { ReportLedger } from './fake-worker';
import { SEQUENCES } from './ordered-reports.fixture';
import type { RunWire } from '../worker/worker-api';

const queued: RunWire = { id: 'run-1', scope: 'all', phase: 'queued', requestedAt: 1, phaseAt: 1 };

describe('ordered status', () => {
  it('the fake and the Worker order reports the same way', () => {
    for (const sequence of SEQUENCES) {
      const ledger = new ReportLedger(queued);
      let revision = 1;
      sequence.steps.forEach((step, i) => {
        const where = `${sequence.name}, step ${i + 1}`;
        if ('takeover' in step) return ledger.takeover(step.takeover);
        const got = ledger.report(step.send);
        const want = step.expect;
        revision += want.bump;
        expect(got.status, where).toBe(want.status);
        expect('code' in got ? got.code : undefined, where).toBe(want.code);
        expect(got.reply.run.phase, where).toBe(want.phase);
        expect(got.reply.run.total, where).toBe(want.total);
        expect(got.reply.run.failure, where).toBe(want.failure);
        expect(got.reply.revision, where).toBe(revision);
      });
    }
  });
});
