import { afterEach, expect, it, vi } from 'vitest';
import { PREFIX_BYTES } from '../../src/data/drive/drive-api';
import { emptyManifest } from '../../src/data/spine/scripted';
import { RunnerDrive } from '../src/drive';
import { refreshPlanning, withMaintenance } from '../src/index';
import { RunnerToken } from '../src/token';
import { API, RUN_ID, TICKET, driveV3, fixedDrive } from './drive-v3';

afterEach(() => vi.restoreAllMocks());

it('AC1: skipping an incomplete map logs a fixed sentence without a Drive path or note title', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const fake = fixedDrive();
  const root = await fake.createFolder('root', 'Made-up folder');
  await fake.createFolder(root.id, '.bower');
  const projects = await fake.createFolder(root.id, 'Projects');
  const folder = await fake.createFolder(projects.id, 'Secret plan for Alex');
  const title = 'Private journey';
  const text = `---\nbower_format: ownership/2\nby: bower\ntype: moc\nsummary: ${title}\n---\n`
    + ['current', 'personal', 'timeline', 'bower-note', 'moc-overview', 'moc-figures', 'moc-members'].map((region) =>
      `<!-- bower:ownership/2 begin ${region} -->\n`
      + (region === 'personal' ? `# ${title}\n${'Made-up detail.\n'.repeat(PREFIX_BYTES)}\n` : '')
      + `<!-- bower:ownership/2 end ${region} -->\n`).join('');
  const note = await fake.createText(folder.id, 'Trip.md', text);
  const wire = driveV3(fake);
  wire.folderId = root.id;
  const token = new RunnerToken({ api: API, runId: RUN_ID, ticket: TICKET, fetch: wire.fetch, now: () => wire.now });
  const drive = new RunnerDrive({ token, attempt: 1, fetch: wire.fetch });
  const prepared = await refreshPlanning(drive, root.id);
  expect(prepared.snapshot[note.id]).toMatchObject({ owner: 'bower', type: 'moc', incomplete: true });
  expect(prepared.snapshot[note.id]?.moc).toBeUndefined();
  const manifest = await emptyManifest(root.id, {
    scope: 'all', allowWeb: false, runId: RUN_ID, requestId: 'log-path', requestedAt: Date.UTC(2026, 9, 7),
  });

  await withMaintenance(drive, manifest, [], prepared);

  expect(log).toHaveBeenCalled();
  const output = [...log.mock.calls, ...info.mock.calls].flat().map(String).join('\n');
  for (const privateText of ['Projects', 'Secret plan for Alex', 'Trip', title]) {
    expect.soft(output).not.toContain(privateText);
  }
  expect(log.mock.calls).toEqual([
    ['Skipped a note because its prefix has incomplete regions and this run does not need its full text.'],
  ]);
});
