/** F10-region R3: a self-hosted runner names itself on the timing line; an explicit region wins; anything else is unknown. */
import { describe, expect, it } from 'vitest';
import { countsOf, modelled } from './modelled';

describe('qa-live-claude-F10-region', () => {
  it.each([
    [{ RUNNER_ENVIRONMENT: 'self-hosted' }, 'self-hosted'],
    [{ RUNNER_ENVIRONMENT: 'self-hosted', BOWER_RUNNER_REGION: 'eastus' }, 'eastus'],
    [{ RUNNER_ENVIRONMENT: 'github-hosted' }, 'unknown'],
    [{}, 'unknown'],
  ])('%j logs region=%s', async (env, region) => {
    const run = await modelled(undefined, env);
    expect(run.code).toBe(0);
    expect(countsOf(run.timing).region).toBe(region);
  });
});
