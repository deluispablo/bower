import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MaintenanceNote } from '../../src/data/contracts/run-manifest';
import { loadCase } from '../src/corpus';
import * as maintenance from '../src/index';
import { renderHealth } from '../src/lint';
import { empty, pacing } from './b23-hot-observe';
import { AT, replySequence, runOnDrive, seedCase } from './corpus-run';
import { fixedDrive } from './drive-v3';

const GARDEN = 'Resources/Gardening';
const note = (path: string): MaintenanceNote => ({
  path, version: '1', summary: `Alex keeps details about ${path}.`,
  coverage: { kind: 'prefix', bytes: 100 }, owner: 'bower', lint: { links: [], tags: 0, summary: true },
});
const health = (notes: MaintenanceNote[], originals: { path: string; after: string | null }[]): string[] =>
  renderHealth(Object.fromEntries(notes.map((n, i) => [String(i), n])),
    [...notes.map((n) => n.path), ...originals.map((original) => original.path)],
    Object.fromEntries(notes.map((n, i) => [String(i), { path: n.path }])), undefined, originals).split('\n');

describe('prod1-health-names', () => {
  it.each(['jpg', 'pdf', 'url'])('original_findings_use_readable_labels: unlinked %s', (ext) => {
    const path = `${GARDEN}/Seed guide.${ext}`;
    const lines = health([note(`${GARDEN}/Gardening.md`)], [{ path, after: path }]);
    expect(lines.filter((line) => line.startsWith('- Not linked'))).toEqual([
      `- Not linked: no note links to [[${path}|Seed guide]].`,
    ]);
  });

  it.each(['jpg', 'pdf', 'url'])('original_findings_use_readable_labels: binned %s', (ext) => {
    const path = `${GARDEN}/Seed guide.${ext}`;
    const lines = health([note(`${GARDEN}/Gardening.md`)], [{ path, after: null }]);
    expect.soft(lines.filter((line) => line.startsWith('- Binned'))).toEqual(['- Binned: Seed guide was moved to the Bin.']);
    expect(lines.join('\n')).not.toContain(`[[${path}`);
  });

  it('readable_labels_preserve_distinct_link_targets', () => {
    const paths = [`${GARDEN}/Mint.jpg`, 'Areas/Plants/Mint.pdf'];
    const lines = health([note(`${GARDEN}/Gardening.md`), note('Areas/Plants/Plants.md')], paths.map((path) => ({ path, after: path })));
    expect(lines.filter((line) => line.startsWith('- Not linked'))).toEqual([
      `- Not linked: no note links to [[${GARDEN}/Mint.jpg|Mint]].`,
      '- Not linked: no note links to [[Areas/Plants/Mint.pdf|Mint]].',
    ]);
  });

  it('original_alias_survives_duplicate_note_titles', () => {
    const path = `${GARDEN}/Mint.pdf`;
    const lines = health([note('Projects/Mint.md'), note(`${GARDEN}/Mint.md`)], [{ path, after: path }]);
    expect.soft(lines).toContain(`- Not linked: no note links to [[${path}|Mint]].`);
    expect(lines).toContain(`- Duplicate name: [[Projects/Mint]] and [[${GARDEN}/Mint]] share the name Mint, so a link to Mint may open either.`);
  });

  it.each(['jpg', 'pdf', 'url'])('moved_and_renamed_original_uses_destination: %s', (ext) => {
    const path = `${GARDEN}/Seed guide.${ext}`;
    const after = `Areas/Plants/Growing mint.${ext}`;
    const lines = health([note('Areas/Plants/Plants.md')], [{ path, after }]);
    expect.soft(lines.filter((line) => line.startsWith('- Not linked'))).toEqual([
      `- Not linked: no note links to [[${after}|Growing mint]].`,
    ]);
    expect(lines.join('\n')).not.toContain(`[[${path}`);
  });

  describe('settled originals through main', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AT);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('moved_and_renamed_original_keeps_file_identity_in_health', async () => {
      const path = `${GARDEN}/Seed photo.jpg`;
      const destination = 'Areas/Photos';
      const name = 'Mint leaves.jpg';
      const c = await loadCase(resolve(import.meta.dirname, '../../testing/corpus/c17-b8-report-only-grammar'));
      c.folder[path] = 'made-up image bytes';
      c.folder[`${destination}/Photos.md`] = '---\nsummary: Alex keeps photos.\nby: bower\n---\n';
      const drive = fixedDrive();
      const root = await seedCase(drive, c);
      const listing = await drive.listAll(root);
      const file = listing.find((f) => drive.pathOf(f.id, root) === path);
      const parent = listing.find((f) => drive.pathOf(f.id, root) === destination);
      if (!file || !parent) throw new Error('Fixture original and destination are missing');
      const before = { fileId: file.id, name: file.name, parents: file.parents, folder: false, modifiedTime: file.modifiedTime };
      const maintain = maintenance.withMaintenance;
      // Main validates and applies the deterministic move before rendering health from its outcome.
      vi.spyOn(maintenance, 'withMaintenance').mockImplementation((drive, manifest, ...rest) => maintain(drive, {
        ...manifest, capture: { ...manifest.capture, places: [...manifest.capture.places, { path, file: before },
          { path: destination, file: { fileId: parent.id, name: parent.name, parents: parent.parents, folder: true, modifiedTime: parent.modifiedTime } }] },
        operations: [...manifest.operations, { operationId: 'original-move-rename', ordinal: manifest.operations.length, dependsOn: [],
          effect: { kind: 'move', before, parent: { fileId: parent.id }, name, properties: {} } }],
      }, ...rest));
      const run = await runOnDrive(c, drive, root, { claude: replySequence([empty]), pacing }, 1);
      expect(run.code).toBe(0);
      expect(run.after[path]).toBeUndefined();
      expect(run.after[`${destination}/${name}`]).toBe('made-up image bytes');
      expect(run.pathsById[file.id]).toBe(`${destination}/${name}`);
      const report = run.after['Bower health.md'] ?? '';
      expect.soft(report.split('\n')).toContain(`- Not linked: no note links to [[${destination}/${name}|Mint leaves]].`);
      expect(report).not.toContain(`[[${path}`);
    });
  });
});
