import { describe, expect, it } from 'vitest';
import type { MaintenanceNote } from '../../src/data/contracts/run-manifest';
import { renderHealth } from '../src/lint';

/**
 * health-wording: Bower's health note in plain words. Each line shows notes by title: a link to the note's place with the
 * title as its text (Obsidian's `[[place|text]]`), and the place itself only when two notes share the title. The link
 * target stays the place, so a merge's link repair never takes the health note for a note linking the other one (R2).
 * Each line ends with its reason or next step. Made-up notes.
 */

const GARDEN = 'Resources/Gardening';
let version = 0;
const note = (path: string, extra: Partial<MaintenanceNote> = {}): MaintenanceNote => ({
  path, version: String(++version), summary: `Alex keeps this about ${path}.`, coverage: { kind: 'prefix', bytes: 100 }, owner: 'bower',
  lint: { links: ['Gardening'], tags: 1, summary: true }, ...extra,
});
/** The health note's finding lines, from notes keyed by id; every note stays where it was. */
const health = (notes: MaintenanceNote[], extraFiles: string[] = []): string[] => {
  const byId = Object.fromEntries(notes.map((n, i) => [`id${i}`, n]));
  const after = Object.fromEntries(notes.map((n, i) => [`id${i}`, { path: n.path }]));
  const files = [...notes.map((n) => n.path), ...extraFiles];
  return renderHealth(byId, files, after).split('\n').filter((line) => line.startsWith('- '));
};
/** How a line shows a note whose title is its own: its place as the target, its title as the text. */
const titled = (place: string): string => `[[${place}|${place.slice(place.lastIndexOf('/') + 1)}]]`;
const hub = note(`${GARDEN}/Gardening.md`, { lint: { links: ['Plot diary', 'Mint'], tags: 1, summary: true } });

describe('health-wording: the health note in plain words', () => {
  it('AC1 health-waiting: a note not checked this run is waiting, named by its title', () => {
    expect(health([hub, note(`${GARDEN}/Plot diary.md`, { lint: undefined })]))
      .toContain(`- Waiting: ${titled(`${GARDEN}/Plot diary`)}. Bower will check it next time.`);
  });

  it('AC2 health-titles: findings name notes by title; two notes with one title are named by their places', () => {
    const lines = health([
      hub,
      note(`${GARDEN}/Plot diary.md`, { lint: { links: ['Missing plan'], tags: 1, summary: true } }),
      note('Projects/Mint.md', { lint: { links: ['Gardening'], tags: 1, summary: true } }),
      note(`${GARDEN}/Mint.md`, { lint: { links: ['Gardening'], tags: 1, summary: true } }),
    ]);
    expect(lines).toContain(`- Broken link in ${titled(`${GARDEN}/Plot diary`)}: no note is called Missing plan.`);
    expect(lines).toContain(`- Duplicate name: [[Projects/Mint]] and [[${GARDEN}/Mint]] share the name Mint, so a link to Mint may open either.`);
    expect(lines.join('\n'), 'a unique title is never shown as its place').not.toContain(`[[${GARDEN}/Plot diary]]`);
  });

  it('AC3 health-lines: each finding ends with its reason or next step, in these words', () => {
    const lines = health([
      hub,
      note(`${GARDEN}/Bean rows.md`, { summary: 'Alex grows climbing crops.' }),
      note(`${GARDEN}/Pea rows.md`, { summary: 'alex grows climbing crops. ' }),
      note(`${GARDEN}/Bare.md`, { summary: '', lint: { links: ['Gardening'], tags: 1, summary: false } }),
      note(`${GARDEN}/Compost.md`, { summary: `Alex turns the compost ${'every week '.repeat(20)}and checks it.` }),
      note(`${GARDEN}/Seeds 2026-03-01.md`),
      note(`${GARDEN}/Tagged.md`, { lint: { links: ['Gardening'], tags: 5, summary: true } }),
    ]);
    expect(lines).toEqual(expect.arrayContaining([
      `- Duplicate summary: ${titled(`${GARDEN}/Bean rows`)} and ${titled(`${GARDEN}/Pea rows`)} have the same summary, so it does not tell them apart.`,
      `- Missing summary: ${titled(`${GARDEN}/Bare`)} has no summary, so nothing says what it is at a glance.`,
      `- Long summary: ${titled(`${GARDEN}/Compost`)} has a summary over 200 characters.`,
      `- Date in the name: ${titled(`${GARDEN}/Seeds 2026-03-01`)} has a date in its name; dates belong in the note's properties.`,
      `- Too many tags: ${titled(`${GARDEN}/Tagged`)} has 5; Bower keeps 3 at most.`,
    ]));
    // One finding is one line, and every line ends with a full stop after its reason.
    for (const line of lines) expect(line, line).toMatch(/^- [^\n]+\.$/);
  });

  it('AC4 health-nothing-links: a Bower note no other note links to says so in plain words', () => {
    const lines = health([hub, note(`${GARDEN}/Plot diary.md`), note(`${GARDEN}/Lonely.md`)]);
    expect(lines).toContain(`- Nothing links to ${titled(`${GARDEN}/Lonely`)}.`);
    expect(lines.join('\n')).not.toMatch(/orphan/i);
  });

  it('R5 health-unchanged: the front matter, the heading and the clean line stay as they are', () => {
    const text = renderHealth({ id0: hub, id1: note(`${GARDEN}/Plot diary.md`), id2: note(`${GARDEN}/Mint.md`) }, [hub.path, `${GARDEN}/Plot diary.md`, `${GARDEN}/Mint.md`],
      { id0: { path: hub.path }, id1: { path: `${GARDEN}/Plot diary.md` }, id2: { path: `${GARDEN}/Mint.md` } });
    expect(text).toBe('---\nsummary: What Bower found when it checked the links and names in your notes.\nby: bower\n---\n\n## Bower\'s note\nNo findings in the checked notes.\n');
  });
});
