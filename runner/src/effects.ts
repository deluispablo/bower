/**
 * The real Drive effects (stub).
 */
import type { RunnerDrive } from './drive';
import type { Effects } from './spine/run';

export function driveEffects(_drive: RunnerDrive): Effects {
  return {
    apply: async () => ({ state: 'rejected', failure: { code: 'conflict', message: 'Not yet.' } }),
    observe: async () => null,
  };
}
