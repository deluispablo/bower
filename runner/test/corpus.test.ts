import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORPUS_CAPABILITIES, loadCorpus, score } from '../src/corpus';
import { runScripted } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../harness/corpus');

describe('the capability corpus', () => {
  it('every corpus capability has at least two cases', async () => {
    const cases = await loadCorpus(ROOT);
    for (const capability of CORPUS_CAPABILITIES) {
      const own = cases.filter((c) => c.capability === capability);
      expect({ capability, cases: own.length >= 2 }).toEqual({ capability, cases: true });
      // Each case names its inputs, its structural outcomes and its rubric.
      for (const c of own) {
        expect({ id: c.id, rubric: c.rubric.trim().length > 20, expected: Object.keys(c.expected).length > 0 }).toEqual({ id: c.id, rubric: true, expected: true });
        expect(['scripted', 'model']).toContain(c.covers);
      }
    }
    // The scripted provider covers at least one case of each capability from C04 to C11.
    for (const capability of CORPUS_CAPABILITIES.filter((c) => c >= 'C04' && c <= 'C11')) {
      expect({ capability, scripted: cases.some((c) => c.capability === capability && c.covers === 'scripted') }).toEqual({ capability, scripted: true });
    }
  });

  it('the corpus scorer passes on the scripted provider outputs', async () => {
    const scripted = (await loadCorpus(ROOT)).filter((c) => c.covers === 'scripted');
    expect(scripted.length).toBeGreaterThanOrEqual(10);
    for (const c of scripted) {
      const run = await runScripted(c);
      expect({ id: c.id, code: run.code }).toEqual({ id: c.id, code: 0 });
      expect({ id: c.id, ...score({ expected: c.expected, before: c.folder, after: run.after, lastRun: run.lastRun }) }).toEqual({ id: c.id, pass: true, unmet: [] });
    }
  });

  it('the corpus scorer fails when an expected file is missing', async () => {
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
    expect(c).toBeDefined();
    if (!c) return;
    const run = await runScripted(c);
    const asRun = { expected: c.expected, before: c.folder, lastRun: run.lastRun };
    expect(score({ ...asRun, after: run.after }).pass).toBe(true);

    const gone = c.expected.files?.present?.[0] ?? '';
    expect(gone).not.toBe('');
    const { [gone]: _removed, ...without } = run.after;
    const missing = score({ ...asRun, after: without });
    expect(missing.pass).toBe(false);
    expect(missing.unmet).toContain(`missing file: ${gone}`);

    // A changed file, a missing Timeline line and a link that no longer resolves are each named too.
    const edited = score({ ...asRun, after: { ...run.after, 'Projects/Flat hunt/Flat hunt.md': '---\nby: bower\n---\n\n## Timeline\n' } });
    expect(edited.pass).toBe(false);
    expect(edited.unmet.some((l) => l.includes('Flat hunt.md'))).toBe(true);
  });
});
