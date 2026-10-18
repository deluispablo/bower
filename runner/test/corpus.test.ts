import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORPUS_CAPABILITIES, loadCase, loadCorpus, score, timelineOf, type Expected, type LoadedCase } from '../src/corpus';
import { groundsOf, ungrounded } from '../src/claude';
import { runScripted } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');

function assertNoBenchmarkSeed(meta: Pick<LoadedCase, 'id' | 'folderFrom'>): void {
  expect(meta.folderFrom, meta.id).toBeUndefined();
}

async function assertScriptedCases(scripted: LoadedCase[]): Promise<void> {
  for (const c of scripted) {
    const run = await runScripted(c);
    expect({ id: c.id, code: run.code }).toEqual({ id: c.id, code: 0 });
    expect({ id: c.id, ...run.score }).toEqual({ id: c.id, pass: true, unmet: [] });
  }
}

describe('the capability corpus', () => {
  it('corpus-delete-revision-undo AC1: weaker revision and undo cases are absent', async () => {
    const ids = (await loadCorpus(ROOT)).map((c) => c.id);
    for (const id of ['c08-revise-comparison', 'c13-undo-protects-edit', 'c13-undo-whole-run']) {
      expect.soft(existsSync(join(ROOT, id)), id).toBe(false);
      expect.soft(ids, id).not.toContain(id);
    }
    for (const id of ['c08-revise-keeps-personal-text', 'c13-manifest-move-and-create',
      'c13-manifest-partial-edited-note', 'c13-manifest-state-with-personal-edit']) {
      expect(ids, id).toContain(id);
      expect((await loadCase(join(ROOT, id))).id).toBe(id);
    }
  });

  it('corpus-delete-bench-resources AC1: original-app seed directory is absent', () => {
    for (const name of ['_bench-vault/3-Resources', '_bench-vault']) {
      const path = join(ROOT, name);
      expect.soft(existsSync(path), path).toBe(false);
    }
  });

  it('corpus-delete-bench-resources AC2: corpus has no benchmark seed escape hatch', async () => {
    for (const c of await loadCorpus(ROOT)) assertNoBenchmarkSeed(c);
  });

  it('the benchmark seed guard accepts historical source provenance', async () => {
    const receipt = await loadCase(join(ROOT, 'c04-hardware-receipt'));
    expect(() => assertNoBenchmarkSeed(receipt)).not.toThrow();
  });

  it('corpus-delete-bench-areas AC1: legacy areas and root documents are absent', () => {
    for (const name of ['2-Areas', '2-Areas/Home/Home insurance policy 2026.pdf', 'README.md', 'About-Me.md', 'Rules.md', 'index.md', 'log.md']) {
      const path = join(ROOT, '_bench-vault', name);
      expect.soft(existsSync(path), path).toBe(false);
    }
  });

  it('corpus-delete-bench-areas AC2: current cases load without legacy root context', async () => {
    const cases = await loadCorpus(ROOT);
    const dirs = (await readdir(ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, 'case.json')))
      .map((entry) => entry.name).sort();
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.map((c) => c.id).sort()).toEqual(dirs);
    for (const c of cases) {
      expect(c.dir, c.id).toBe(join(ROOT, c.id));
      assertNoBenchmarkSeed(c);
    }
    for (const id of ['c11-saltmere-question', 'c15-more-context-bounded', 'c15-scanned-letter']) {
      const c = cases.find((c) => c.id === id);
      expect(c?.folder, id).toEqual({});
      expect(c?.folderBinary, id).toEqual({});
    }
  });

  it('corpus-delete-bench-projects AC1: legacy project and auxiliary trees are absent', async () => {
    for (const name of ['1-Projects', '4-Archives', 'Clippings', 'Answers', '0-Inbox']) {
      const path = join(ROOT, '_bench-vault', name);
      expect.soft(existsSync(path), path).toBe(false);
    }
    const cases = await loadCorpus(ROOT);
    const dirs = (await readdir(ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, 'case.json')))
      .map((entry) => entry.name).sort();
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.map((c) => c.id).sort()).toEqual(dirs);
  });

  it('corpus-delete-bench-projects AC2: no surviving case uses the detached benchmark seed', async () => {
    for (const c of await loadCorpus(ROOT)) assertNoBenchmarkSeed(c);
  });

  it('the benchmark seed guard rejects synthetic metadata and identifies the case', async () => {
    const seed = await loadCase(join(ROOT, 'c09-closest-flat'));
    for (const folderFrom of ['_bench-vault', '../../original-app/folder']) {
      expect(() => assertNoBenchmarkSeed({ ...seed, folderFrom })).toThrow(seed.id);
    }
  });

  it('corpus-delete-bench-cases AC1: benchmark cases and external checkout dependency are absent', async () => {
    const ids = (await loadCorpus(ROOT)).map((c) => c.id);
    for (const id of ['bench-1-job-offer-clipping', 'bench-2-text-pdf', 'bench-3-receipt-pdf', 'bench-4-scanned-pdf', 'bench-5-question-about-filed-pdf']) {
      expect.soft(existsSync(join(ROOT, id)), id).toBe(false);
      expect.soft(ids, id).not.toContain(id);
    }
  });

  it('corpus-delete-overlaps AC2: redundant cases disappear without weakening capability coverage', async () => {
    const ids = (await loadCorpus(ROOT)).map((c) => c.id);
    for (const id of ['c05-conflicting-fact-kept', 'c06-offer-and-listing-linked', 'c07-rent-disagrees']) {
      expect.soft(existsSync(join(ROOT, id)), id).toBe(false);
      expect.soft(ids, id).not.toContain(id);
    }
  });

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
    await assertScriptedCases(scripted);
  }, 60_000); // shortcut: every scripted case runs through main in this one test, over 5 s on CI's 2-core runners; split per case if it nears a minute

  it.each<[string, Expected]>([
    ['runs', { runs: [{ report: { questionsExactly: 1 } }] }],
    ['protectedRanges', { protectedRanges: [{ path: 'Missing.md', range: { frontMatter: true } }] }],
    ['properties', { properties: [{ path: 'Missing.md', absent: ['by'] }] }],
    ['questionSubjects', { report: { questionSubjects: [{ kind: 'state', note: 'Missing.md' }] } }],
  ])('the scripted corpus loop rejects an unmet %s expectation', async (_field, expected) => {
    const seed = await loadCase(join(ROOT, 'c09-closest-flat'));
    await expect(assertScriptedCases([{ ...seed, expected }])).rejects.toThrow();
  });

  it('the corpus scorer fails when an expected file is missing', async () => {
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
    expect(c).toBeDefined();
    if (!c) return;
    const run = await runScripted(c);
    const asRun = { expected: c.expected, before: c.folder, lastRun: run.lastRun };
    expect(score({ ...asRun, after: run.after }).pass).toBe(true);

    // The rubric names files by pattern (the model picks names): the first one the run made.
    const want = c.expected.files?.present?.[0] ?? '';
    const gone = want.includes('*') ? Object.keys(run.after).find((p) => new RegExp(`^${want.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(p)) ?? '' : want;
    expect(gone).not.toBe('');
    const { [gone]: _removed, ...without } = run.after;
    const missing = score({ ...asRun, after: without });
    expect(missing.pass).toBe(false);
    expect(missing.unmet.length).toBeGreaterThan(0);
    expect(missing.unmet.some((l) => l.startsWith('missing file: '))).toBe(true);

    // A changed file, a missing Timeline line and a link that no longer resolves are each named too.
    const edited = score({ ...asRun, after: { ...run.after, 'Projects/Flat hunt/Flat hunt.md': '---\nby: bower\n---\n\n## Timeline\n' } });
    expect(edited.pass).toBe(false);
    expect(edited.unmet.some((l) => l.includes('Flat hunt.md'))).toBe(true);
  });

  it('the corpus scorer names every kind of unmet expectation', () => {
    const before = { 'A.md': 'one\n', 'B.md': 'two\n' };
    const after = { 'A.md': 'changed\n', 'N.md': '---\nby: bower\n---\n\n[[Nowhere]]\n\n## Timeline\n- 2026-10-07 · One line.\n', 'Inbox/x.pdf': 'x' };
    const lastRun = { v: 1, run: { report: { filed: [{}], created: [{ path: 'N.md' }], updated: [], setAside: [], questions: [{ id: 'q1' }, { id: 'q2' }], requests: ['a'], rulesWorded: 0, yourChanges: 0 } } };
    const unmet = (expected: Parameters<typeof score>[0]['expected'], run: unknown = lastRun): string[] => score({ expected, before, after, lastRun: run }).unmet;
    expect(unmet({ files: { present: ['Z.md'] } })).toEqual(['missing file: Z.md']);
    expect(unmet({ files: { present: ['Inbox/*.pdf'], absent: ['Inbox/*'] } })).toEqual(['file should not exist: Inbox/x.pdf']);
    expect(unmet({ unchanged: ['A.md', 'B.md'] })).toEqual(['file changed: A.md', 'missing file: B.md (expected unchanged)']);
    expect(unmet({ notes: [{ path: 'Q.md' }] })).toEqual(['missing note: Q.md']);
    expect(unmet({ notes: [{ path: 'N.md', contains: ['Absent'], excludes: ['Nowhere'], timeline: ['Other line'], timelineCount: 2, timelineMin: 3 }] })).toEqual([
      'N.md: lacks "Absent"',
      'N.md: has "Nowhere"',
      'N.md: no Timeline line with "Other line"',
      'N.md: 1 Timeline lines, expected 2',
      'N.md: 1 Timeline lines, expected at least 3',
    ]);
    expect(unmet({ linksResolve: true })).toEqual(['N.md: link [[Nowhere]] does not resolve']);
    expect(unmet({ report: { filed: 2, setAside: 1, created: ['M.md'], updated: ['A.md'], questions: ['q1'], requests: ['b'], rulesWorded: 1, yourChanges: 1 } })).toEqual([
      'report.filed: 1, expected 2',
      'report.setAside: 0, expected 1',
      'report.created: [N.md], expected [M.md]',
      'report.updated: [], expected [A.md]',
      'report.questions: [q1, q2], expected [q1]',
      'report.requests: ["a"], expected ["b"]',
      'report.rulesWorded: 0, expected 1',
      'report.yourChanges: 0, expected 1',
    ]);
    expect(unmet({ report: { createdAtLeast: 2, updatedAtLeast: 1, questionsAtMost: 1 } })).toEqual(['report.created: 1, expected at least 2', 'report.updated: 0, expected at least 1', 'report.questions: 2, expected at most 1']);
    expect(unmet({ report: { filed: 1 } }, null)).toEqual(['report: no last-run.json report']);
    expect(unmet({ files: { present: ['N.md'] }, report: { filed: 1 } })).toEqual([]);
  });

  it('the C04 scorer accepts its rubric placements and refuses others', async () => {
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-garden-newsletter');
    expect(c).toBeDefined();
    if (!c) return;
    const note = (link: string): string => `---\nby: bower\n---\n${link}\n18 October, 8 November, 7 December, 31 January\n`;
    const lastRun = { v: 1, run: { report: { filed: [{}], created: [{ path: 'x.md' }], updated: [], setAside: [], questions: [], requests: [], rulesWorded: 0, yourChanges: 0 } } };
    const at = (folder: string, link = ''): { pass: boolean; unmet: string[] } => {
      const after = { ...c.folder, [`${folder}/Community garden newsletter, autumn.pdf`]: 'pdf', [`${folder}/Community garden newsletter, autumn.md`]: note(link) };
      return score({ expected: c.expected, before: c.folder, after, lastRun });
    };
    expect(at('Resources')).toEqual({ pass: true, unmet: [] });
    expect(at('Resources/Gardening')).toEqual({ pass: true, unmet: [] });
    expect(at('Areas/Home', 'See [[Garden plot]].')).toEqual({ pass: true, unmet: [] });
    // Areas/Home without the plot note linked, a new Area, and a Project are each refused.
    expect(at('Areas/Home').pass).toBe(false);
    const area = at('Areas/Community garden');
    expect(area.pass).toBe(false);
    expect(area.unmet.some((l) => l.includes('Areas/Community garden/'))).toBe(true);
    expect(at('Projects/Garden', 'See [[Garden plot]].').pass).toBe(false);
  });

  it('the C04 scorer matches the exact link target, from the newsletter note or from the plot note', async () => {
    const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-garden-newsletter');
    if (!c) throw new Error('the C04 case is missing');
    const lastRun = { v: 1, run: { report: { filed: [{}], created: [{ path: 'x.md' }], updated: [], setAside: [], questions: [], requests: [], rulesWorded: 0, yourChanges: 0 } } };
    const dates = '18 October, 8 November, 7 December, 31 January';
    const run = (newsletter: string, plot?: string): { pass: boolean; unmet: string[] } => {
      const after: Record<string, string> = {
        ...c.folder,
        'Areas/Home/Community garden newsletter, autumn.pdf': 'pdf',
        'Areas/Home/Community garden newsletter, autumn.md': `---\nby: bower\n---\n${newsletter}\n${dates}\n`,
      };
      if (plot !== undefined) after['Areas/Home/Garden plot.md'] = plot;
      return score({ expected: c.expected, before: c.folder, after, lastRun });
    };
    // A longer name that only starts the same is another note.
    expect(run('See [[Garden plot 2]].').pass).toBe(false);
    expect(run('See [[Garden plot|my plot]].', undefined).pass).toBe(true);
    expect(run('See [[Garden plot#Timeline]].', undefined).pass).toBe(true);
    // The plot note's own Timeline line citing the newsletter is a link too (what the prompt's "lines" write).
    const cited = '---\nby: bower\n---\n## Timeline\n- 2026-10-07 · Autumn dates ([[Community garden newsletter, autumn]]).\n';
    expect(run('Dates only.', cited)).toEqual({ pass: true, unmet: [] });
    // A link from the plot note to something else is not one.
    expect(run('Dates only.', '---\nby: bower\n---\nSee [[Garden plot]] and [[Other]].\n').pass).toBe(false);
  });
});

describe('the corpus expectations are grounded', () => {
  it('every expected number is grounded in its case', async () => {
    const bad: Array<{ id: string; number: string; in: string }> = [];
    for (const c of await loadCorpus(ROOT)) {
      const words = c.inbox.map((p) => p.line).join('\n');
      const own = [words, c.title, ...Object.keys(c.folder), ...Object.values(c.folder), ...Object.keys(c.folderBinary), ...Object.keys(c.inboxFiles), ...Object.values(c.inboxFiles), ...Object.keys(c.inboxBinary), ...c.journal.map((j) => JSON.stringify(j)), ...c.questions.map((q) => JSON.stringify(q))].join('\n');
      const ground = groundsOf(own);
      // The text a run authors: Timeline lines and note content. Paths, report ids and the app's own date stamp are not facts.
      const authored = (c.expected.notes ?? []).flatMap((n) => [...(n.timeline ?? []), ...(n.contains ?? [])]).map((t) => t.replace(/<!--[^>]*-->/g, ' '));
      for (const s of authored) {
        const n = ungrounded(s, ground);
        if (n) bad.push({ id: c.id, number: n, in: s });
      }
    }
    expect(bad).toEqual([]);
  });

  it('the corpus reads a note Timeline through the one parser', () => {
    // Legacy: the person's own "## Timeline" heading in the body is theirs; the last one is Bower's (as every reader reads it).
    const legacy = "---\nsummary: S\nby: bower\n---\n\n## Timeline\n- mine · not Bower's\n\nwords\n\n## Timeline\n- 1 Oct · one\n- 2 Oct · two · [[Source]]\n\n## Bower's note\n- not a Timeline line\n";
    expect(timelineOf(legacy)).toEqual(['- 1 Oct · one', '- 2 Oct · two · [[Source]]']);
    expect(timelineOf(legacy.replace(/\n/g, '\r\n'))).toEqual(['- 1 Oct · one', '- 2 Oct · two · [[Source]]']);
    // v2: a heading inside the person's text is theirs; the framed Timeline is Bower's.
    const mark = (kind: string, owner: string): string => `<!-- bower:ownership/2 ${kind} ${owner} -->\n`;
    const v2 = `---\nbower_format: ownership/2\n---\n${mark('begin', 'current')}${mark('end', 'current')}${mark('begin', 'personal')}## Timeline\n- mine · not Bower's\n${mark('end', 'personal')}`
      + `${mark('begin', 'timeline')}## Timeline\n- 3 Oct · three\n${mark('end', 'timeline')}${mark('begin', 'bower-note')}${mark('end', 'bower-note')}`;
    expect(timelineOf(v2)).toEqual(['- 3 Oct · three']);
    // No Timeline, a plain note and a note that cannot be read have no lines.
    expect(timelineOf('---\nsummary: S\n---\nwords\n')).toEqual([]);
    expect(timelineOf('## Timeline\n- 1 Oct · plain\n')).toEqual([]);
  });
});
