/** Who filed a file and when (#905, R-API-3). */

import { describe, expect, it } from 'vitest';

import { filedBy } from '../src/file-origin.js';

const NOW = new Date(2026, 8, 30, 9, 0);
const YESTERDAY = new Date(2026, 8, 29, 7, 30).toISOString();
const EARLIER = new Date(2026, 8, 20, 12, 0).toISOString();

const pdf = { name: 'Passport copy.pdf', mimeType: 'application/pdf' };
const note = { name: 'CV insights.md', mimeType: 'text/markdown' };

describe('filedBy', () => {
  it('says Bower filed an original yesterday, as it is', () => {
    const facts = filedBy({ ...pdf, filedAt: YESTERDAY, createdTime: EARLIER }, 'filed', NOW);
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
