/**
 * The runner's providers (TL-P3-22 addendum): what a run plans from the admitted set it took (`RunProvider`, in the
 * shared spine). The scripted provider, with no model, and the Claude provider (`claude.ts`, TL-P4-01), which asks
 * headless Claude Code; `BOWER_PROVIDER` names one, and a name this runner does not know stops it before any call,
 * so a dispatch never runs with a provider it did not ask for.
 */
import type { RunProvider } from '../../src/data/spine/provider';
import type { ScriptedRead } from '../../src/data/spine/read';
import { listedPiles, scriptedProvider, type ScriptedRun } from '../../src/data/spine/scripted';
import { claudeProvider, type ClaudeSetup } from './claude';
import type { RunnerDrive } from './drive';

export const PROVIDERS = ['scripted', 'claude'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

/** The provider `BOWER_PROVIDER` names: scripted when unset; any other name throws, saying the names it knows. */
export function providerNamed(name: string | undefined): ProviderName {
  const wanted = name?.trim() || 'scripted';
  const known = PROVIDERS.find((p) => p === wanted);
  if (!known) throw new Error(`BOWER_PROVIDER "${wanted}" is not a provider this runner has; it has: ${PROVIDERS.join(', ')}.`);
  return known;
}

/** The scripted provider's reads over Drive v3: the plan's reads, and the inbox's piles from the listing. */
export function runnerScripted(drive: RunnerDrive): ScriptedRead {
  const reads = drive.planReads();
  return { ...reads, piles: (rootId) => listedPiles(reads, rootId), provenance: 'adapter-read' };
}

/** `claude` is the Claude provider's setup: the runner's environment (its credential, model and turn cap). */
export function providerFor(name: ProviderName, drive: RunnerDrive, run: ScriptedRun, claude: ClaudeSetup = { env: {} }): RunProvider {
  switch (name) {
    case 'scripted':
      return scriptedProvider(runnerScripted(drive), run);
    case 'claude':
      return claudeProvider(claude, run, runnerScripted(drive));
  }
}
