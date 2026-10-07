/**
 * The scripted provider (stub).
 */
import type { Manifest, ManifestV2 } from '../contracts/run-manifest';
import type { HubUpdate } from '../demo/fixture';
import type { AdmissionManifest } from './admission';
import type { RunProvider } from './provider';
import type { ScriptedRead } from './read';

export type RunPlan = { path: 'b'; manifest: Manifest | ManifestV2 };

export interface PlanOptions {
  scope: 'all' | 'instructions';
  allowWeb: boolean;
  runId: string;
  requestId: string;
  requestedAt: number;
  updates?: readonly HubUpdate[];
  taken?: AdmissionManifest;
  mintKey?: (kind: string) => string;
}

export async function planScripted(_read: ScriptedRead, rootId: string, opts: PlanOptions): Promise<RunPlan> {
  const manifest: Manifest = {
    v: 1, kind: 'run-manifest', scope: { rootId }, runId: opts.runId, requestId: opts.requestId, runScope: opts.scope, allowWeb: opts.allowWeb, requestedAt: opts.requestedAt,
    captureId: '', capture: { piles: [], members: [], journal: [], places: [] }, operations: [], reportPlan: [],
  };
  return { path: 'b', manifest };
}

export async function runKeys(_runId: string): Promise<(kind: string) => string> {
  return (kind) => kind;
}

export interface ScriptedRun {
  rootId: string;
  runId: string;
  allowWeb: boolean;
}

export function scriptedProvider(read: ScriptedRead, run: ScriptedRun): RunProvider {
  return async ({ taken }) => {
    const plan = await planScripted(read, run.rootId, { scope: taken.scope, allowWeb: run.allowWeb, runId: run.runId, requestId: taken.id, requestedAt: taken.at, taken });
    return { ...plan.manifest, operations: [] };
  };
}
