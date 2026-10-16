/** The timing line counts the Drive calls and bytes of each phase, and names the runner's region (c4-run-counts). */
// B8 measured delta: +5 apply calls (log folder fence/create, month listing/fence/create).
import { describe, expect, it } from 'vitest';
import { countsOf, modelled } from './modelled';
import { readTypeTable } from '../src/type-table';

describe('timing counts', () => {
  it('the timing line counts calls and bytes per phase and names the region', async () => {
    const run = await modelled(undefined, { BOWER_RUNNER_REGION: 'eastus' });
    expect(run.code).toBe(0);
    const { phases, region } = countsOf(run.timing);
    expect(region).toBe('eastus');
    expect(Object.keys(phases)).toEqual(['token', 'reads', 'model', 'apply', 'checkpoints', 'report', 'status', 'runner']);
    const sent = Object.values(phases);
    // TL-P4-42 addendum 5: questions.json media (+1 reads); hot name-check listing,
    // live .bower parent fence and multipart create (+3 apply).
    // TL-P4-47 addendum 8: first creation of the type table: listing, fence, create (+3).
    // B8b AC13 (R8): first creation of the health note: root listing, root fence, create (+3 apply).
    expect(sent.reduce((n, p) => n + p.calls, 0)).toBe(107);
    expect(sent.every((p) => (p.calls === 0) === (p.bytes === 0))).toBe(true);
    // Addendum 4, round 3: the 10 bootstrap/check/fence/create calls are counted by timing itself.
    // Remove log name-check child listing, .bower parent fence and .bower/log.md create from apply.
    // Exact per-phase deltas over the control: reads +5, apply +5; other counts unchanged.
    expect(Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, v.calls])))
      .toEqual({ token: 0, reads: 25, model: 0, apply: 66, checkpoints: 4, report: 10, status: 0, runner: 2 });
    // Existing fields keep their names and order; the new ones come last.
    expect(run.timing).toMatch(/^timing: end=done total=\d+ start=\d+ token=\d+ reads=\d+ model=\d+ api=\d+ turns=\d+ in=\d+ out=\d+ apply=\d+ checkpoints=\d+\/\d+ report=\d+ status=\d+ drive=\S+ region=eastus cache=0\/0$/);
  });

  it('reading the type table: one media read', async () => {
    const run = await modelled(async (drive, root) => {
      const sys = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === '.bower');
      if (!sys) throw new Error('The system folder is missing');
      await drive.createText(sys.id, 'type-table.json', JSON.stringify(readTypeTable(null).table));
    });
    expect(run.code).toBe(0);
    const { phases } = countsOf(run.timing);
    expect(Object.values(phases).reduce((n, p) => n + p.calls, 0)).toBe(105);
    expect(Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, v.calls])))
      .toEqual({ token: 0, reads: 26, model: 0, apply: 63, checkpoints: 4, report: 10, status: 0, runner: 2 });
  });

  it('without the variable the line says the region is unknown', async () => {
    const run = await modelled();
    expect(countsOf(run.timing).region).toBe('unknown');
  });
});
