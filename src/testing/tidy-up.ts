/**
 * For tests: one tidy-up run to its end on the fake stack's only path, contract
 * B (TL-P2-38). It is planned by `planRun`, admitted to a run service over the
 * same pretend Drive, and read back from the view the service published. It
 * stands in for the legacy runner the tests used to call directly; a plan that
 * is refused rejects, as the Worker's process does.
 */
import type { FakeDrive } from '@/data/drive/fake-drive';
import type { Manifest, ManifestV2 } from '@/data/contracts/run-manifest';
import { planRun } from '@/data/fake/fake-runner';
import type { AuthoredState } from '@/data/spine/scripted';
import { FakeRunService, type FakeRunServiceOptions } from '@/data/fake/fake-run-service';
import type { RunReport } from '@/data/types';
import { SYSTEM, isRunnerFile } from '@/data/vault/layout';

export type TidyUpResult = ({ phase: 'done'; report: RunReport } | { phase: 'failed'; failure: string }) & { manifest: Manifest | ManifestV2 };

export interface TidyUpOptions {
  /** Fails the run in its writing phase, before any effect (the fail-run situation). */
  failAt?: 'writing';
  hooks?: FakeRunServiceOptions['hooks'];
  /** The person lets Bower look things up on the web in this tidy-up (Settings); off by default. */
  allowWeb?: boolean;
  /** The Current states the scripted reply updates (a situation's, as the pretend Worker passes them); none by default. */
  states?: readonly AuthoredState[];
}

export async function tidyUp(drive: FakeDrive, rootId: string, scope: 'all' | 'instructions' = 'all', opts: TidyUpOptions = {}): Promise<TidyUpResult> {
  const runs = new FakeRunService({ drive, scale: 'instant', ...(opts.hooks ? { hooks: opts.hooks } : {}) });
  const binding = { account: 'you@example.com', rootId };
  const { runId, requestId } = runs.ids();
  const plan = await planRun(drive, rootId, { scope, allowWeb: !!opts.allowWeb, runId, requestId, requestedAt: Date.now(), ...(opts.states ? { states: opts.states } : {}) });
  await runs.admit(binding, plan.manifest, opts.failAt ? { failAt: opts.failAt } : {});
  for (let i = 0; i < 20; i++) {
    await runs.settled();
    const run = await runs.status(binding);
    if (run?.phase === 'failed') return { phase: 'failed', failure: run.failure ?? '', manifest: plan.manifest };
    if (run?.phase !== 'done') continue;
    await runs.settled();
    const text = drive.dump(rootId).get(SYSTEM.lastRun);
    const view: unknown = text === undefined ? null : JSON.parse(text);
    if (!isRunnerFile(SYSTEM.lastRun, view) || view.run.id !== run.id || !view.run.report) throw new Error('The run is done but its report was not published.');
    return { phase: 'done', report: view.run.report, manifest: plan.manifest };
  }
  throw new Error('The tidy-up did not finish.');
}
