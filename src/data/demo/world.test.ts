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

import { NOTES } from './notes';
import { SEEDS } from './fixture';

describe('the demo folder', () => {
  it('every wikilink in a note points at a note that exists', () => {
    const names = new Set(SEEDS.map((x) => x.path).filter((p) => p.endsWith('.md')).map((p) => p.slice(p.lastIndexOf('/') + 1, -3).toLowerCase()));
    const texts = Object.values(NOTES).flatMap((n) => [n.body, n.summary, ...n.currentState, ...n.timeline.map((t) => t.text), n.bowerNote?.text ?? '']);
    const broken = texts.flatMap((t) => [...t.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1] ?? '')).filter((l) => !names.has(l.toLowerCase()));
    expect(broken).toEqual([]);
  });

  it('ticks a task in a note and writes it in the journal', async () => {
    const w = new DemoWorld({ scenario: 'default', scale: 'instant' });
    const { vault } = w.sources();
    const path = 'Areas/Visa & Immigration/Visa checklist.md';
    await vault.toggleTask(path, 4);
    expect((await vault.note(path)).body).toContain('- [x] Police certificate');
    const j = await vault.changes();
    expect(j.at(-1)?.what).toBe('Ticked "Police certificate" in Visa checklist');
  });

  it('keeps a typed rule as pending until a run words it', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { vault, runs } = w.sources();
    await vault.addRule('anything from the dentist goes in health');
    expect((await vault.rules())[0]?.pending).toBe(true);
    expect((await vault.note('Rules.md')).body).toContain('Waiting for the next tidy-up');
    await runs.start('instructions');
    await vi.runAllTimersAsync();
    const r = (await vault.rules())[0];
    expect(r?.pending).toBe(false);
    expect(r?.text).toMatch(/^Letters, reminders and invoices from the dentist/);
    expect(r?.yourWords).toBe('anything from the dentist goes in health');
    expect(await vault.changes()).toEqual([]);
  });
});
