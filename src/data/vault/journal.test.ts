import { beforeEach, describe, expect, it } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { Journal } from './journal';

let drive: FakeDrive;
let root: string;
let journal: Journal;

beforeEach(async () => {
  localStorage.clear();
  let now = Date.parse('2026-10-04T10:00:00Z');
  drive = new FakeDrive({ clock: () => (now += 1000) });
  root = (await drive.createFolder('root', 'Bower')).id;
  const bower = (await drive.createFolder(root, '.bower')).id;
  const changes = (await drive.createFolder(bower, 'changes')).id;
  journal = new Journal(drive, { owner: async () => root, folder: async () => changes, files: async () => (await drive.listAll(changes)).filter((f) => !f.folder) }, 'device-a');
});

describe('the change journal', () => {
  it('record writes one file per change', async () => {
    await journal.record('move', 'Moved Lease draft to Areas', { path: 'Areas/Lease draft.pdf' });
    await journal.record('rule', 'New rule: "dentist goes in health"', { path: 'Rules.md', text: 'dentist goes in health' });
    const files = [...drive.dump(root).entries()].filter(([p]) => p.startsWith('.bower/changes/'));
    expect(files).toHaveLength(2);
    expect(files[0]?.[0]).toMatch(/^\.bower\/changes\/2026-10-04T\d\d-\d\d-\d\d\.\d{3}Z-[a-z0-9]{6}\.json$/);
    const rec = JSON.parse(files[1]?.[1] ?? '{}') as Record<string, unknown>;
    expect(rec).toMatchObject({ v: 1, kind: 'rule', text: 'dentist goes in health', device: 'device-a', path: 'Rules.md' });
  });

  it('list is oldest first and carries the extras', async () => {
    await journal.record('move', 'one');
    await journal.record('answer', 'two', { questionId: 'q1', text: 'yes' });
    const all = await journal.list();
    expect(all.map((r) => r.what)).toEqual(['one', 'two']);
    expect(all[1]).toMatchObject({ kind: 'answer', questionId: 'q1', text: 'yes' });
  });

  it('remove puts only that file in the Bin', async () => {
    const a = await journal.record('move', 'one');
    await journal.record('move', 'two');
    await journal.remove(a.id);
    expect((await journal.list()).map((r) => r.what)).toEqual(['two']);
  });

  it('a file that is not a journal record is skipped', async () => {
    const changes = await drive.listAll(root).then((all) => all.find((f) => f.name === 'changes'));
    await drive.createText(changes?.id ?? '', 'notes.txt', 'not json');
    await journal.record('move', 'one');
    expect((await journal.list()).map((r) => r.what)).toEqual(['one']);
  });
});

describe('when Drive does not answer', () => {
  it('outbox: a line that cannot be written now is kept and sent with the next one', async () => {
    const real = drive.createText.bind(drive);
    let down = true;
    drive.createText = async (parent, name, text, props) => {
      if (down) throw new TypeError('Failed to fetch');
      return real(parent, name, text, props);
    };
    await journal.record('move', 'one');
    expect((await journal.list()).map((r) => r.what)).toEqual(['one']);
    down = false;
    await journal.record('move', 'two');
    const files = [...drive.dump(root).keys()].filter((p) => p.startsWith('.bower/changes/'));
    expect(files).toHaveLength(2);
    expect((await journal.list()).map((r) => r.what)).toEqual(['one', 'two']);
  });

  it('a line written twice (its answer lost) shows once', async () => {
    const real = drive.createText.bind(drive);
    let lose = true;
    drive.createText = async (parent, name, text, props) => {
      const f = await real(parent, name, text, props);
      if (lose) {
        lose = false;
        throw new TypeError('Failed to fetch');
      }
      return f;
    };
    await journal.record('move', 'one');
    expect((await journal.list()).map((r) => r.what)).toEqual(['one']);
  });
});
