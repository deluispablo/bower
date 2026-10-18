// @vitest-environment jsdom
/** A note that links to another note is not unconnected (qa-prod-2 F4): an orphan has no note links in or out, as Obsidian counts. */
import { describe, expect, it } from 'vitest';
import type { MaintenanceNote } from '../../src/data/contracts/run-manifest';
import { lintFacts } from '../../src/data/contracts/note-format';
import { FakeDrive } from '../../src/data/drive/fake-drive';
import { fakeScripted } from '../../src/data/fake/fake-runner';
import { seedFakeDrive } from '../../src/data/fake/seed';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { modelDecisions, planScripted, runKeys } from '../../src/data/spine/scripted';
import { DriveVault } from '../../src/data/vault/drive-vault';
import { renderHealth } from '../src/lint';

const HUB = 'Areas/Health/Health.md';
const LEAF = 'Areas/Health/Dentist visit.md';
const note = (path: string, links: string[] = [], lint = true): MaintenanceNote => ({
  path, version: '1', summary: `Alex keeps details about ${path}.`, coverage: { kind: 'prefix', bytes: 100 }, owner: 'bower',
  ...(lint ? { lint: { links, tags: 0, summary: true } } : {}),
});
const health = (notes: MaintenanceNote[]): string =>
  renderHealth(Object.fromEntries(notes.map((n, i) => [String(i), n])), notes.map((n) => n.path),
    Object.fromEntries(notes.map((n, i) => [String(i), { path: n.path }])));
const orphans = (report: string): string[] => report.split('\n').filter((l) => l.startsWith('- Nothing links to'));

describe('qa-prod-2-F4', () => {
  it.each([['Health'], ['Areas/Health/Health'], ['Health'], ['Health#Timeline']])(
    'AC1 new_note_linking_its_hub_is_not_listed: %s', (target) => {
    expect(orphans(health([note(HUB), note(LEAF, [target])]))).toEqual([]);
  });

  it.each([
    ['only itself', ['Dentist visit']], ['only a web address', ['https://example.com']], ['only a missing note', ['Missing note']],
  ])('AC2 note_with_no_links_still_listed (guard): %s', (_label, links) => {
    expect(orphans(health([note(HUB), note(LEAF, links)]))).toEqual(['- Nothing links to [[Areas/Health/Dentist visit|Dentist visit]].']);
  });

  it('AC2 chain: a leaf linking an unlinked note is connected, and so is its target', () => {
    expect(orphans(health([note(HUB), note('Areas/Health/A.md', ['B']), note('Areas/Health/B.md')]))).toEqual([]);
  });

  it('AC2 About me and a hub with no links stay exempt (guard)', () => {
    expect(orphans(health([note('About me.md'), note(HUB)]))).toEqual([]);
  });

  it('AC2 partial coverage claims nothing (guard)', () => {
    expect(orphans(health([note(HUB), note(LEAF, ['Missing note']), note('Areas/Health/Waiting.md', [], false)]))).toEqual([]);
  });

  describe('AC3 filed_saved_link_shortcut_not_listed (guard)', () => {
    const AT = Date.UTC(2026, 9, 7, 9);
    const URL = 'https://service.example/booking/?month=April#details';
    async function filed(taken: string[]) {
      const drive = new FakeDrive({ clock: () => 0 });
      const root = (await seedFakeDrive(drive, 'empty', AT)) ?? '';
      const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), device: 'DEVICE_A', declarePiles: true });
      await vault.addPile({ text: 'Check before booking the April service', items: [{ name: 'April service', kind: 'link', origin: 'Pasted', url: URL }] });
      await vault.settled();
      const files = await drive.listAll(root);
      const resources = files.find((f) => drive.pathOf(f.id, root) === 'Resources')?.id ?? '';
      for (const name of taken) await drive.createText(resources, name, 'Already here');
      const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-f4' });
      if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
      const m = admission.manifest;
      const place = { to: 'Resources', name: 'April service.md' };
      const plan = await planScripted(fakeScripted(drive), root, { scope: 'all', allowWeb: false, runId: 'run-f4', requestId: m.id, requestedAt: m.at,
        taken: m, mintKey: await runKeys('run-f4'), decisions: modelDecisions({ thing: () => place, words: () => place, note: () => null }) });
      const ops = plan.manifest.operations.map((op) => op.effect as { kind: string; name?: string; text?: string });
      return { text: ops.find((e) => e.kind === 'create-text' && e.text?.includes('summary:'))?.text ?? '',
        shortcut: ops.find((e) => e.kind === 'move' && e.name?.endsWith('.url'))?.name ?? '' };
    }

    it.each([[[], 'April service.url'], [['April service.url'], 'April service (2).url']])('taken %j', async (taken, name) => {
      const { text, shortcut } = await filed(taken);
      expect(shortcut).toBe(name);
      const path = 'Resources/April service.md';
      const saved = { ...note(path), lint: lintFacts(path, text) ?? undefined };
      const report = renderHealth({ n: saved }, [path, `Resources/${shortcut}`], { n: { path } }, undefined,
        [{ path: `Resources/${shortcut}`, after: `Resources/${shortcut}` }]);
      expect(report.split('\n').filter((l) => l.startsWith('- Not linked'))).toEqual([]);
    });
  });
});
