/**
 * qa6-demo-data (qa-6 Claude F4, designer 6; qa-4 Codex F3): Alex's made-up folder agrees with itself. The Ferrowick
 * offer has one salary in its note, in Job hunt and in the tidy-up report; a thing filed into a note that was already
 * there is not reported as a new note; and the line a tidy-up adds to Flat hunt does not count more flats than its
 * shortlist table holds.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUB_UPDATES, NOTES, SEEDS } from './fixture';
import { DemoWorld } from './world';

afterEach(() => vi.useRealTimers());

const FERROWICK = 'Projects/Job hunt/Applications/Industrial Designer, Ferrowick.md';
const FLAT_HUNT = 'Projects/Flat hunt/Flat hunt.md';
/** Amounts such as 54,000 or £66,000, by their digits. */
const amounts = (text: string): string[] => [...text.matchAll(/\d{1,3}(?:,\d{3})+/g)].map((m) => m[0]);

describe('qa6-demo-data: the demo agrees with itself', () => {
  it('AC1 qa6-demo-data-one-salary: the Ferrowick offer has one salary across its note and the Job hunt line', () => {
    const note = NOTES[FERROWICK];
    expect(note, 'positive control: the Ferrowick note is in the demo').toBeDefined();
    const salary = note?.properties?.find((p) => p.key === 'salary')?.value ?? '';
    const line = HUB_UPDATES.find((u) => u.path === 'Projects/Job hunt/Job hunt.md' && /ferrowick/i.test(u.what))?.what ?? '';
    expect(line, 'positive control: the tidy-up line about the offer').not.toBe('');
    const all = [...amounts(note?.summary ?? ''), ...amounts(salary), ...amounts(line)];
    expect(all.length, 'positive control: each says a salary').toBeGreaterThanOrEqual(3);
    expect(new Set(all)).toEqual(new Set([all[0]]));
  });

  it('AC2 qa6-demo-data-existing-not-new: a thing filed into a note already there does not list that note as new', async () => {
    expect(SEEDS.some((s) => s.path === FERROWICK), 'positive control: the note is in the folder before the tidy-up').toBe(true);
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { runs } = w.sources();
    try {
      await runs.start('all');
      await vi.runAllTimersAsync();
      const report = (await runs.current())?.report;
      expect(report?.filed.some((f) => f.note === FERROWICK), 'positive control: the offer was filed with its note').toBe(true);
      expect(report?.created.map((c) => c.path)).not.toContain(FERROWICK);
    } finally {
      w.dispose();
    }
  });

  it("AC3 qa6-demo-data-flat-count: Flat hunt's tidy-up line counts no more flats than its shortlist table", () => {
    const rows = (NOTES[FLAT_HUNT]?.body ?? '').split('\n').filter((l) => l.startsWith('| [['));
    expect(rows.length, 'positive control: the shortlist table').toBeGreaterThan(0);
    const ordinal: Record<string, number> = { second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };
    for (const u of HUB_UPDATES.filter((x) => x.path === FLAT_HUNT)) {
      for (const [word, n] of Object.entries(ordinal)) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(u.what)) expect(n, `"${u.what}" against ${rows.length} rows`).toBe(rows.length);
      }
    }
  });
});
