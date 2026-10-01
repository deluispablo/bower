/** Who filed a file and when (#905, R-API-3). */

import { describe, expect, it } from 'vitest';

import { filedBy, filedHistory, withHistory } from '../src/file-origin.js';

const NOW = new Date(2026, 8, 30, 9, 0);
const YESTERDAY = new Date(2026, 8, 29, 7, 30).toISOString();
const EARLIER = new Date(2026, 8, 20, 12, 0).toISOString();

const pdf = { name: 'Passport copy.pdf', mimeType: 'application/pdf' };
const note = { name: 'CV insights.md', mimeType: 'text/markdown' };

describe('filedBy', () => {
  it('says Bower filed an original yesterday, as it is', () => {
    const facts = filedBy(
      { ...pdf, filedAt: YESTERDAY, createdTime: EARLIER },
      'filed',
      NOW,
    );
    expect(facts).toEqual({
      by: 'bower',
      at: YESTERDAY,
      line: 'filed by Bower yesterday',
      about: 'yesterday, by Bower, as it is',
    });
  });

  it('leaves "as it is" off a note Bower wrote', () => {
    const facts = filedBy({ ...note, createdTime: YESTERDAY }, 'asked', NOW);
    expect(facts.line).toBe('filed by Bower yesterday');
    expect(facts.about).toBe('yesterday, by Bower');
  });

  it('says the person added their own file', () => {
    const facts = filedBy({ ...pdf, createdTime: EARLIER }, 'yours', NOW);
    expect(facts.line).toBe('added by you 20 Sep');
    expect(facts.about).toBe('20 Sep, by you');
  });

  it('falls back to "added <when>" from the created time with no origin', () => {
    const facts = filedBy(
      { ...pdf, createdTime: EARLIER, modifiedTime: YESTERDAY },
      null,
      NOW,
    );
    expect(facts).toEqual({
      by: null,
      at: EARLIER,
      line: 'added 20 Sep',
      about: '20 Sep',
    });
  });

  it('uses the last change when Drive gave no created time', () => {
    expect(filedBy({ ...pdf, modifiedTime: YESTERDAY }, null, NOW).line).toBe(
      'added yesterday',
    );
  });
});

describe('filedHistory and withHistory (#922, real run history)', () => {
  const pdfAt = {
    ...pdf,
    path: '3-Resources/Documents/Passport copy.pdf',
    createdTime: EARLIER,
    modifiedTime: EARLIER,
  };
  // A run reported before report v2: what it processed, never where to.
  const v1 = {
    state: 'done',
    finishedAt: EARLIER,
    items: [{ path: '0-Inbox/Passport copy.pdf' }],
  };
  // Report v2: each item says where it ended up.
  const v2 = {
    state: 'done',
    finishedAt: YESTERDAY,
    items: [
      {
        path: '0-Inbox/Passport copy.pdf',
        to: '3-Resources/Documents/Passport copy.pdf',
      },
    ],
  };

  it('a v2 run history says Bower filed the file when that run ended', () => {
    const history = filedHistory([v2, v1]);
    const { file, origin } = withHistory(pdfAt, null, history);
    const facts = filedBy(file, origin, NOW);
    expect(facts.line).toBe('filed by Bower yesterday');
    expect(facts.about).toBe('yesterday, by Bower, as it is');
  });

  it('a v1 run history names no destination: "added <created>"', () => {
    const history = filedHistory([v1]);
    expect(history.size).toBe(0);
    const { file, origin } = withHistory(pdfAt, null, history);
    expect(filedBy(file, origin, NOW)).toEqual({
      by: null,
      at: EARLIER,
      line: 'added 20 Sep',
      about: '20 Sep',
    });
  });

  it('keeps the newest run, skips failed ones, and never overrides "yours"', () => {
    const older = { ...v2, finishedAt: EARLIER };
    const failed = { ...v2, state: 'failed', finishedAt: NOW.toISOString() };
    const history = filedHistory([older, failed, v2]);
    expect(history.get(pdfAt.path)).toBe(YESTERDAY);
    const mine = withHistory(pdfAt, 'yours', history);
    expect(filedBy(mine.file, mine.origin, NOW).line).toBe(
      'added by you 20 Sep',
    );
  });
});
