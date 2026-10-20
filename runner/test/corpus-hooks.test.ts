/**
 * Registered setups (corpus-live-hooks): what a case needs beyond its files (properties, a model fault, a Drive fault and
 * its recovery) is registered once in the driver (`CORPUS_SETUPS`) and applied by the one execution path, to a scripted
 * run (`runWithSetup`) and to a live run (`runLive`) alike, so a fault case is never run as its happy path.
 */
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ClaudeSpawn } from '../src/claude';
import { CORPUS_EXECUTION, loadCase } from '../src/corpus';
import { reply } from './b1-planning-support';
import { AT, CORPUS_SETUPS, caseReplies, lastJson, perPress, runLive, runWithSetup } from './corpus-run';

const CORPUS = resolve(import.meta.dirname, '../../testing/corpus');
const PROFILE = 'Areas/Career/Career profile.md';
const pacing = { baseMs: 0, sleep: async (): Promise<void> => undefined };
const clean = { pass: true, unmet: [] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it('corpus-live-hooks AC1: registered lifecycle actions use real app operations', async () => {
  const c = await loadCase(join(CORPUS, 'c17-b56-cv-profile'));
  const run = await runWithSetup(c, caseReplies(c.id), pacing);
  expect(run.start?.props[PROFILE], 'the registered properties are seeded with the case').toEqual({ by: 'bower', profile: 'cv' });
  expect(run.score, 'the case scores clean under its setup').toEqual(clean);
});

it('corpus-live-hooks AC2: C12 fault and admission setups are reproducible', async () => {
  // A refused group: the bench receipts get no valid reply in press 1 and wait untouched; press 2 files them.
  const group = await loadCase(join(CORPUS, 'c12-group-waits'));
  const waits = await runWithSetup(group, caseReplies(group.id), pacing);
  expect(waits.score, 'the refused group waits, then is filed: both presses score clean').toEqual(clean);
  // A lost response: the filing lands, its answer and then Drive are lost; the same run is redispatched with no model call.
  const lost = await loadCase(join(CORPUS, 'c12-tool-interruption-recovery'));
  const model = perPress(caseReplies(lost.id));
  const recovered = await runWithSetup(lost, model.claude, pacing);
  expect({ attempt: recovered.wire?.attempt, code: recovered.code }, 'the stopped run is redispatched and finishes').toEqual({ attempt: 2, code: 0 });
  expect(model.calls, 'recovery calls no model').toEqual([2]);
  expect(recovered.score, 'the case scores clean under its fault').toEqual(clean);
});

it('corpus-live-hooks AC3: B1 B4 and B8 recovery setups remain executable', async () => {
  // B1 live: a model double that selects nothing and plans nothing, as the case's one reply does.
  const b1 = await loadCase(join(CORPUS, 'b1-maintenance-crash-resume'));
  const calls: string[] = [];
  const spawn: ClaudeSpawn = async (call) => {
    const selection = lastJson<{ selection?: unknown }>(call.input).selection === undefined;
    calls.push(selection ? 'selection' : 'execution');
    return reply(selection ? { items: [], asks: [] } : { kind: 'tidy-intent', v: 1, things: [] });
  };
  const maintained = await runLive(b1, spawn, pacing);
  expect({ attempt: maintained.wire?.attempt, code: maintained.code }, 'the lost maintenance reply is recovered by redispatch').toEqual({ attempt: 2, code: 0 });
  expect(calls, 'recovery calls no model').toEqual(['selection', 'execution']);
  expect(maintained.score, 'B1 scores clean under its fault').toEqual(clean);
  // B8: the hub edit refused and the month file's response lost; the redispatch settles it.
  const b8 = await loadCase(join(CORPUS, 'c17-b8-settled-recovery'));
  const model = perPress(caseReplies(b8.id));
  const settled = await runWithSetup(b8, model.claude, pacing);
  expect({ attempt: settled.wire?.attempt, code: settled.code }, 'the lost log response is recovered by redispatch').toEqual({ attempt: 2, code: 0 });
  expect(model.calls, 'recovery calls no model').toEqual([2]);
  expect(settled.score, 'B8 scores clean only under its fault').toEqual(clean);
  // B4's archive order needs no setup: the case runs live from its own files (corpus-live-runtime AC2).
  expect(CORPUS_EXECUTION['c17-b4-gate-archive-first'], 'B4 has no setup to register').toMatchObject({ setup: null, live: true });
});

it('corpus-live-hooks AC4: missing setup prevents execution rather than falling back', async () => {
  const setups: Readonly<Record<string, unknown>> = CORPUS_SETUPS ?? {};
  expect(Object.keys(setups).sort(), 'the registered setups')
    .toEqual(['career-profile-property', 'filing-answer-lost', 'group-reply-refused', 'hub-edit-refused-log-lost', 'maintenance-reply-lost']);
  // Live-ready: not excluded, and no setup or a registered one; every registered setup is some case's.
  for (const [id, d] of Object.entries(CORPUS_EXECUTION)) expect({ id, live: d.live }).toEqual({ id, live: d.mode !== 'excluded' && (d.setup === null || d.setup in setups) });
  expect(Object.keys(setups).filter((s) => !Object.values(CORPUS_EXECUTION).some((d) => d.setup === s)), 'no setup without its case').toEqual([]);
  // A case whose setup is not registered is refused, live or scripted: nothing reaches the model.
  const spawn = vi.fn<ClaudeSpawn>(async () => { throw new Error('A refused case must not call the model.'); });
  for (const [id, setup] of [['c12-admission-waits', 'admission-estimate-2'], ['c12-model-failure-retry', 'model-call-fails']] as const) {
    const c = await loadCase(join(CORPUS, id));
    const refusal = `${id} needs its ${setup} setup, which is not registered.`;
    await expect(runLive(c, spawn), `${id} is refused live`).rejects.toThrow(refusal);
    await expect(runWithSetup(c, spawn), `${id} is refused with its setup`).rejects.toThrow(refusal);
  }
  expect(spawn, 'nothing reaches the model').not.toHaveBeenCalled();
});
