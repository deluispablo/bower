/** The card says each new folder once, at most two, then how many more (qa-live-claude-F9-folder FF-8..FF-11). */
import { describe, expect, it } from 'vitest';
import type { FiledItem, RunState } from '@/data/types';
import { landedSummary } from './run-words';

const row = (to: string, area?: string): FiledItem => ({ name: 'File.pdf', title: 'File', kind: 'pdf', to, ...(area ? { area } : {}) });
const card = (...rows: FiledItem[]): string => landedSummary({ id: 'r', scope: 'all', phase: 'done', requestedAt: 0, phaseAt: 1, finishedAt: 1, seen: false,
  report: { filed: rows, created: [], updated: [], setAside: [], questions: [] } } as RunState);

const HOME = row('Areas/Home', 'New area Home, for chores');
const GARDEN = row('Projects/Garden/Seeds', 'New folder Garden in Projects');
const POTTERY = row('Resources/Pottery class', 'New folder Pottery class in Resources');
const STATEMENTS = row('Areas/Money/Statements', 'New folder Statements in Money');

describe('the card says new folders once', () => {
  it('FF-8 F9F card-cap-plural: two are said, the rest are counted', () => {
    expect(card(HOME, GARDEN, GARDEN, POTTERY, STATEMENTS)).toBe(
      'Seeds got 2, Home got 1 and 2 other folders got the rest. New area Home, for chores. New folder Garden in Projects. 2 more new folders.');
  });

  it('FF-9 F9F card-cap-one: one more is said in the singular', () => {
    expect(card(HOME, GARDEN, GARDEN, POTTERY)).toBe(
      'Seeds got 2, Home got 1 and Pottery class got 1. New area Home, for chores. New folder Garden in Projects. 1 more new folder.');
  });

  it('FF-10 F9F card-dedupe: the same sentence on two rows is said once', () => {
    expect(card(GARDEN, GARDEN)).toBe('Seeds got 2. New folder Garden in Projects.');
  });

  it('FF-11 F9F card-legacy (guard): a stored report with one area row reads as before', () => {
    expect(card(row('Areas/Finance', 'New area Finance, for pay and tax records'))).toBe('Finance got 1. New area Finance, for pay and tax records.');
  });
});
