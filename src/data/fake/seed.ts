/**
 * Fills a FakeDrive with Alex's Bower folder for a scenario: the demo's own
 * state, written out as files, so the fake stack starts exactly where the
 * demo does. Notes go through the note format; other files get a made-up
 * line of text; Bower's bookkeeping goes to `.bower/`.
 */
import type { FakeDrive } from '../drive/fake-drive';
import { DemoWorld } from '../demo/world';
import type { Scenario } from '../demo/scenario';
import { PILE_NOTE } from '../piles';
import type { TreeNode } from '../types';
import { serializeNote } from '../vault/note-format';
import { BOWER_FOLDER, PROP, SYSTEM, type LastRunFile, type QuestionsFile, type RequestsFile, type SuggestionsFile } from '../vault/layout';

/** Scenarios that differ only in how the app is reached seed like the default. */
const SAME_AS_DEFAULT: Scenario[] = ['signed-out', 'fail-run', 'slow', 'offline', 'running'];

export async function seedFakeDrive(drive: FakeDrive, scenario: Scenario, now: number): Promise<string | null> {
  if (scenario === 'first') return null;
  const world = new DemoWorld({ scenario: SAME_AS_DEFAULT.includes(scenario) ? 'default' : scenario, scale: 'instant', latency: 0, now });
  try {
    const { vault, runs } = world.sources();
    const root = (await drive.createFolder('root', BOWER_FOLDER)).id;
    const ids = new Map<string, string>([['', root]]);
    const folderId = async (path: string): Promise<string> => {
      const known = ids.get(path);
      if (known) return known;
      const cut = path.lastIndexOf('/');
      const parent = await folderId(cut < 0 ? '' : path.slice(0, cut));
      const id = (await drive.createFolder(parent, path.slice(cut + 1))).id;
      ids.set(path, id);
      return id;
    };
    const pileNotes = new Map((await vault.piles()).filter((p) => p.path && p.text).map((p) => [`${p.path}/${PILE_NOTE}`, p.text]));

    const write = async (n: TreeNode): Promise<void> => {
      const cut = n.path.lastIndexOf('/');
      const parentPath = cut < 0 ? '' : n.path.slice(0, cut);
      let id: string;
      if (n.type === 'folder') {
        id = await folderId(n.path);
      } else {
        const props: Record<string, string> = {};
        if (n.byBower) props[PROP.by] = 'bower';
        if (n.isNew) props[PROP.isNew] = '1';
        const text = pileNotes.get(n.path) ?? (n.kind === 'note' ? serializeNote({ ...(await vault.note(n.path)), byBower: !!n.byBower }) : n.kind === 'link' ? `[InternetShortcut]\nURL=https://${n.name.replace(/\.url$/, '')}\n` : `A made-up ${n.kind ?? 'file'} for the demo.\n`);
        id = (await drive.createText(await folderId(parentPath), n.name, text, Object.keys(props).length ? props : undefined)).id;
      }
      drive.setTimes(id, n.created, n.modified);
      for (const c of n.children ?? []) await write(c);
    };
    for (const n of await vault.tree()) await write(n);

    const sys = await folderId(SYSTEM.dir);
    await folderId(SYSTEM.changes);
    const json = (name: string, body: unknown): Promise<unknown> => drive.createText(sys, name, `${JSON.stringify(body, null, 2)}\n`);
    await json('questions.json', { v: 1, questions: await vault.questions() } satisfies QuestionsFile);
    await json('suggestions.json', { v: 1, suggestions: await vault.suggestions() } satisfies SuggestionsFile);
    await json('requests.json', { v: 1, done: {} } satisfies RequestsFile);
    await json('hashes.json', { v: 1, hashes: {} });
    const run = await runs.current();
    if (run) {
      const { seen: _seen, ...rest } = run;
      await json('last-run.json', { v: 1, run: rest } satisfies LastRunFile);
    }
    return root;
  } finally {
    world.dispose();
  }
}
