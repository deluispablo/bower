/**
 * qa6-run-words (qa-6 Claude F1; designer qa-6 notes 2, 3 and 9): the words of a finished run are true and plain.
 * A request that did nothing is never called done; the run's question count says they are new; no file name or web
 * address sits in a sentence; the phone's run chip does not repeat Home's result card.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUi } from '@/app/ui-store';
import { DataProvider } from '@/data/provider';
import { FakeDrive } from '@/data/drive/fake-drive';
import { seedFakeDrive } from '@/data/fake/seed';
import { DriveVault } from '@/data/vault/drive-vault';
import { DemoWorld } from '@/data/demo/world';
import type { RunReport, RunState } from '@/data/types';
import { loadingSources } from '@/testing/loading-sources';
import { tidyUp } from '@/testing/tidy-up';
import { RunChip } from './RunChip';
import { runDetail } from './run-words';

let drive: FakeDrive;
let root: string;
const vault = (): DriveVault => new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
const done = (scope: RunState['scope'], report: RunReport): RunState =>
  ({ id: 'r', scope, phase: 'done', requestedAt: 0, phaseAt: 1, finishedAt: 1, seen: false, report });
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
// A file's extension or a web address inside a row's sentence ("Ferrowick.pdf.", "listing-88213.example.").
const FILE_OR_ADDRESS = /[A-Za-z0-9]\.[A-Za-z][A-Za-z0-9]{1,7}\b/;
const NOTHING_FOUND_REQUEST = 'Add the tag shortlist to every note in Projects / Flat hunt';
const LOOKUP = 'Look up the council tax band for Flat 3';

beforeEach(async () => {
  vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  localStorage.clear();
  drive = new FakeDrive();
  root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useUi.setState({ tidyOpen: false, replayRunId: null });
});

describe('AC1 a request that did nothing is not called done', () => {
  it('AC1 qa6-run-words-nothing-found: only a "Bower didn\'t add the line" row: the sheet and What you asked do not say done', async () => {
    await vault().addRequest(NOTHING_FOUND_REQUEST);
    const out = await tidyUp(drive, root, 'instructions');
    if (out.phase !== 'done') throw new Error('the run failed');
    expect(out.report.leftAsWritten?.map((r) => r.why)).toEqual(["Bower didn't add the line: it found nothing about this note in what you added."]);
    expect(out.report.requests ?? []).not.toContain(NOTHING_FOUND_REQUEST);
    expect(runDetail(done('instructions', out.report))).not.toMatch(/\bdone\b/);
    expect((await vault().requests())[0]?.done).not.toMatch(/^Done/);
  });

  it('AC1 qa6-run-words-lookup-off: a lookup that looked nothing up is not called done on the sheet', async () => {
    await vault().addRequest(LOOKUP);
    const out = await tidyUp(drive, root, 'instructions');
    if (out.phase !== 'done') throw new Error('the run failed');
    expect((await vault().requests())[0]?.done).toBe('Bower did not look anything up. Web lookups are off in Settings.');
    expect(out.report.requests ?? []).not.toContain(LOOKUP);
    expect(runDetail(done('instructions', out.report))).not.toMatch(/\bdone\b/);
  });

  it('AC1 qa6-run-words-lookup-missing: a lookup with the web on whose note is gone looks nothing up and is not called done', async () => {
    // Removed in Drive, outside Bower: not one of the person's changes in Bower.
    const flat3 = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md');
    await drive.trash(flat3?.id ?? '');
    await vault().addRequest(LOOKUP);
    const out = await tidyUp(drive, root, 'instructions', { allowWeb: true });
    if (out.phase !== 'done') throw new Error('the run failed');
    expect((await vault().requests())[0]?.done).toBe('Bower did not look anything up.');
    expect(out.report.requests ?? []).not.toContain(LOOKUP);
    // qa7-refused-words: a request is never one of your changes read.
    expect(out.report.yourChanges ?? 0).toBe(0);
    expect(runDetail(done('instructions', out.report))).not.toMatch(/changes? of yours/);
  });

  it('AC1 qa6-run-words-lookup-demo: the demo, which looks nothing up, does not call a lookup done on the sheet', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { vault: demo, runs } = w.sources();
    await demo.addRequest(LOOKUP);
    await runs.start('instructions', { allowWeb: true });
    await vi.runAllTimersAsync();
    const run = await runs.current();
    w.dispose();
    expect(run?.report?.requests ?? []).not.toContain(LOOKUP);
    expect(run && runDetail(run)).not.toMatch(/\bdone\b/);
  });
});

it('AC2 qa6-run-words-new-questions: the run counts its own questions as new, beside the total of open ones', () => {
  const report = { ...empty(), questions: [{ id: 'q', text: 't', yes: 'y', no: 'n', askedAt: 0 }] };
  expect(runDetail(done('all', report))).toBe('1 new question for you.');
});

describe('AC3 no file name or web address inside a sentence', () => {
  it('AC3 qa6-run-words-rows-fake: the rows of a tidy-up over the pretend Drive name no file and no address', async () => {
    const out = await tidyUp(drive, root);
    if (out.phase !== 'done') throw new Error('the run failed');
    const said = [...out.report.created, ...out.report.updated].map((r) => r.what);
    expect(said.length).toBeGreaterThan(0);
    expect(said.filter((w) => FILE_OR_ADDRESS.test(w))).toEqual([]);
  });

  it('AC3 qa6-run-words-own-note-fake: a document\'s own note is named by its plain name; the note keeps its contents', async () => {
    const NOTE = 'Projects/Job hunt/Applications/Industrial Designer, Ferrowick.md';
    await vault().trash(NOTE);
    const out = await tidyUp(drive, root);
    if (out.phase !== 'done') throw new Error('the run failed');
    expect(out.report.created.filter((r) => r.path === NOTE).map((r) => r.what)).toEqual(['A note for Offer, Industrial Designer, Ferrowick.']);
    expect(drive.dump(root).get(NOTE)).toContain('Offer, Industrial Designer, Ferrowick.pdf');
  });

  it('AC3 qa6-run-words-rows-demo: the rows of a demo tidy-up name no file and no address', async () => {
    vi.useFakeTimers();
    const w = new DemoWorld({ scenario: 'default', scale: 'demo', latency: 0 });
    const { runs } = w.sources();
    await runs.start('all');
    await vi.runAllTimersAsync();
    const report = (await runs.current())?.report;
    w.dispose();
    const said = [...(report?.created ?? []), ...(report?.updated ?? [])].map((r) => r.what);
    expect(said.length).toBeGreaterThan(0);
    expect(said.filter((x) => FILE_OR_ADDRESS.test(x))).toEqual([]);
  });
});

describe('AC4 the phone run chip', () => {
  const filed = (): RunReport => ({ ...empty(), filed: [{ name: 'scan.pdf', title: 'Council tax bill', kind: 'pdf', to: 'Areas/Money' }] });
  async function chip(at: string): Promise<void> {
    const base = loadingSources();
    const run = done('all', filed());
    const sources = { ...base, runs: { ...base.runs, current: async () => run, subscribe: () => () => {} } };
    await act(async () => { render(<MemoryRouter initialEntries={[at]}><DataProvider sources={sources}><RunChip /></DataProvider></MemoryRouter>); });
  }

  it('AC4 qa6-run-words-chip-home: on Home, where the result card offers Watch what Bower did, the chip does not repeat it', async () => {
    await chip('/');
    expect(screen.queryByRole('button', { name: /filed/ })).toBeNull();
  });

  it('AC4 qa6-run-words-chip-words: elsewhere the chip says the whole action, not "Watch" alone', async () => {
    await chip('/files');
    expect(screen.getByRole('button', { name: '1 thing filed. Watch what Bower did' })).toBeVisible();
  });
});
