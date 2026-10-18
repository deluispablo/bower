import { expect, it } from 'vitest';
import type { RunReport, RunState } from '@/data/types';
import { notesUpdated, runDetail } from './run-words';

const P = 'Areas/Home/Chores checklist.md';
const HEALTH = 'Areas/Health/Health.md';
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });
const done = (scope: RunState['scope'], report: RunReport): RunState =>
  ({ id: 'r', scope, phase: 'done', requestedAt: 1000, phaseAt: 2000, finishedAt: 2000, seen: false, report });

it('request_document_counts_one_new_note', () => {
  const rep = { ...empty(), created: [{ path: P, what: 'checklist' }], updated: [{ path: HEALTH, what: 'line' }] };
  expect(runDetail(done('instructions', rep))).toBe('1 new note made and 1 note brought up to date.');
});

it('created_and_updated_same_path_counts_once', () => {
  const rep = { ...empty(), created: [{ path: P, what: 'checklist' }], updated: [{ path: P, what: 'checklist' }] };
  expect(runDetail(done('instructions', rep))).toBe('1 new note made.');
  expect(notesUpdated(rep)).toBe(0);
});

it.each(['all', 'instructions'] as const)('only new notes, plural, scope %s', (scope) => {
  const rep = { ...empty(), created: [{ path: P, what: 'a' }, { path: 'Areas/Home/Shopping.md', what: 'b' }] };
  const said = runDetail(done(scope, rep));
  expect(said).not.toBe('Everything has its place.');
  expect(said).toBe('2 new notes made.');
});

it('the same new note listed twice counts once', () => {
  const rep = { ...empty(), created: [{ path: P, what: 'a' }, { path: P, what: 'b' }] };
  expect(runDetail(done('instructions', rep))).toBe('1 new note made.');
});

it('new note, updated note and a question', () => {
  const rep = { ...empty(), created: [{ path: P, what: 'a' }], updated: [{ path: HEALTH, what: 'b' }],
    questions: [{ id: 'q', text: 't', yes: 'y', no: 'n', askedAt: 0 }] };
  expect(runDetail(done('instructions', rep))).toBe('1 new note made, 1 note brought up to date and 1 new question for you.');
});
