import { afterEach, describe, expect, it, vi } from 'vitest';
import { findNode } from '../tree';
import { DemoWorld } from './world';

afterEach(() => vi.useRealTimers());

describe('the demo world', () => {
  it('walks the real phases and files the inbox', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { runs, vault } = w.sources();
    const seen: string[] = [];
    runs.subscribe(() => void runs.current().then((r) => r && seen.push(r.phase)));
    const before = (await vault.piles()).reduce((s, p) => s + p.items.length, 0);
    const r = await runs.start('all');
    expect(r.phase).toBe('queued');
    await vi.runAllTimersAsync();
    const done = await runs.current();
    expect(done?.phase).toBe('done');
    expect(done?.total).toBe(before);
    expect(done?.report?.filed).toHaveLength(before);
    expect(await vault.piles()).toEqual([]);
    expect(seen).toContain('writing');
    const tree = await vault.tree();
    expect(findNode(tree, 'Areas/Money/Receipts/2026-10/Taxi.pdf')).not.toBeNull();
    w.dispose();
  });

  it('refuses a tidy-up with nothing waiting', async () => {
    const w = new DemoWorld({ scenario: 'empty', scale: 'instant' });
    await expect(w.sources().runs.start('all')).rejects.toThrow(/Nothing/);
  });

  it('fails a run in the fail-run scenario and moves nothing', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'fail-run', scale: 'demo', latency: 0 });
    const { runs, vault } = w.sources();
    await runs.start('all');
    await vi.runAllTimersAsync();
    const r = await runs.current();
    expect(r?.phase).toBe('failed');
    expect((await vault.piles()).length).toBeGreaterThan(0);
  });

  it('comes back with a finished run that has not been seen', async () => {
    const w = new DemoWorld({ scenario: 'back', scale: 'instant' });
    const r = await w.sources().runs.current();
    expect(r?.phase).toBe('done');
    expect(r?.seen).toBe(false);
    expect(r?.report?.filed.length).toBeGreaterThan(5);
  });
});
