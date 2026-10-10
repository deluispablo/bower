/** The timing line counts the Drive calls and bytes of each phase, and names the runner's region (c4-run-counts). */
import { describe, expect, it } from 'vitest';
import { countsOf, modelled } from './modelled';

describe('timing counts', () => {
  it('the timing line counts calls and bytes per phase and names the region', async () => {
    const run = await modelled(undefined, { BOWER_RUNNER_REGION: 'eastus' });
    expect(run.code).toBe(0);
    const { phases, region } = countsOf(run.timing);
    expect(region).toBe('eastus');
    expect(Object.keys(phases)).toEqual(['token', 'reads', 'model', 'apply', 'checkpoints', 'report', 'status', 'runner']);
    const sent = Object.values(phases);
    // TL-P4-41 addendum 9: this bootstrap counts the two real prefix reads before planning.
    expect(sent.reduce((n, p) => n + p.calls, 0)).toBe(90);
    expect(sent.every((p) => (p.calls === 0) === (p.bytes === 0))).toBe(true);
    // Addendum 4, round 3: the 10 bootstrap/check/fence/create calls are counted by timing itself.
    // Remove log name-check child listing, .bower parent fence and .bower/log.md create from apply.
    // Exact per-phase deltas over the control: reads +5, apply +5; other counts unchanged.
    expect(Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, v.calls])))
      .toEqual({ token: 0, reads: 22, model: 0, apply: 52, checkpoints: 4, report: 10, status: 0, runner: 2 });
    // Existing fields keep their names and order; the new ones come last.
    expect(run.timing).toMatch(/^timing: end=done total=\d+ start=\d+ token=\d+ reads=\d+ model=\d+ api=\d+ turns=\d+ in=\d+ out=\d+ apply=\d+ checkpoints=\d+\/\d+ report=\d+ status=\d+ drive=\S+ region=eastus$/);
  });

  it('without the variable the line says the region is unknown', async () => {
    const run = await modelled();
    expect(countsOf(run.timing).region).toBe('unknown');
  });
});
