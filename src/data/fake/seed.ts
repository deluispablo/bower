/**
 * Fills a FakeDrive with Alex's Bower folder for a scenario: the demo's own
 * state, written out as files, so the fake stack starts exactly where the
 * demo does. Notes go through the note format; other files get a made-up
 * line of text; Bower's bookkeeping goes to `.bower/`.
 */
import type { FakeDrive } from '../drive/fake-drive';
import { DemoWorld } from '../demo/world';
import { CAR_RENEWAL } from '../demo/fixture';
import type { Scenario } from '../demo/scenario';
import { PILE_NOTE, safeInboxName } from '../piles';
import type { TreeNode } from '../types';
import { serializeNote } from '../vault/note-format';
import { serializeRules } from '../vault/rules-format';
import { BOWER_FOLDER, PROP, SYSTEM, type HashesFile, type LastRunFile, type QuestionsFile, type RequestsFile, type SuggestionsFile } from '../vault/layout';
import { sha256 } from '../vault/hashes';

/** The made-up content of a file that is not a note: one line, different for each file. */
export function madeUp(name: string, kind: string | undefined): string {
  return `A made-up ${kind ?? 'file'} for the demo: ${name}.\n`;
}

/** Scenarios that differ only in how the app is reached seed like the default. */
const SAME_AS_DEFAULT: Scenario[] = ['signed-out', 'fail-run', 'start-fails', 'slow', 'offline', 'running', 'gone-answers', 'write-it'];

/**
 * What the seed made: the folder's root, and each inbox thing's file id by its fixture key (the demo item id, `i1`,
 * `s1-0`…), so a situation cites a thing by the id it was given, never by its name (TL-P4-19 addendum 20).
 */
export interface Seeded {
  root: string;
  keys: ReadonlyMap<string, string>;
}

/** The pretend Drive's root, seeded; see `seedFixture` for the fixture keys. */
export async function seedFakeDrive(drive: FakeDrive, scenario: Scenario, now: number): Promise<string | null> {
  return (await seedFixture(drive, scenario, now))?.root ?? null;
}

export async function seedFixture(drive: FakeDrive, scenario: Scenario, now: number): Promise<Seeded | null> {
  if (scenario === 'first') return null;
  const world = new DemoWorld({ scenario: SAME_AS_DEFAULT.includes(scenario) ? 'default' : scenario, scale: 'instant', latency: 0, now });
  // The write-it situation's news lines cite what they are from: Car's, the renewal pile's notice.
  if (scenario === 'write-it') world.addSample(CAR_RENEWAL);
  try {
    const keys = new Map<string, string>();
    const itemKeys = new Map<string, string>();
    const { vault, runs } = world.sources();
    const root = (await drive.createFolder('root', BOWER_FOLDER)).id;
    const ids = new Map<string, string>([['', root]]);
    // Piles keep the demo's ids (p1, p2…), so an address like /pile/p1 opens the same pile.
    const pileFolders = new Map<string, string>();
    const folderId = async (path: string): Promise<string> => {
      const known = ids.get(path);
      if (known) return known;
      const cut = path.lastIndexOf('/');
      const parent = await folderId(cut < 0 ? '' : path.slice(0, cut));
      const pile = pileFolders.get(path);
      const id = (await drive.createFolder(parent, path.slice(cut + 1), pile ? { [PROP.pile]: pile } : undefined)).id;
      ids.set(path, id);
      return id;
    };
    const piles = await vault.piles();
    const pileNotes = new Map(piles.filter((p) => p.path && p.text).map((p) => [`${p.path}/${PILE_NOTE}`, p.text]));
    // Each inbox file keeps the name it was added under and where it came from.
    const inboxProps = new Map<string, Record<string, string>>();
    for (const p of piles) {
      if (!p.path) continue;
      const lone = !p.path.slice('Inbox/'.length).includes('/') && p.items.length === 1 && !p.text && p.path !== 'Inbox';
      const taken = new Set<string>();
      for (const it of p.items) {
        const base = safeInboxName(it);
        const dot = base.lastIndexOf('.');
        let name = base;
        for (let n = 2; taken.has(name.toLowerCase()); n++) name = dot > 0 ? `${base.slice(0, dot)} (${n})${base.slice(dot)}` : `${base} (${n})`;
        taken.add(name.toLowerCase());
        itemKeys.set(lone ? p.path : `${p.path}/${name}`, it.id);
        inboxProps.set(lone ? p.path : `${p.path}/${name}`, { [PROP.asAdded]: it.name, [PROP.origin]: it.origin, [PROP.kind]: it.kind, ...(lone ? { [PROP.pile]: p.id } : {}) });
      }
      if (!lone) pileFolders.set(p.path, p.id);
    }
    const rulesText = serializeRules(await vault.rules());
    const hashes: Record<string, string> = {};

    const write = async (n: TreeNode): Promise<void> => {
      const cut = n.path.lastIndexOf('/');
      const parentPath = cut < 0 ? '' : n.path.slice(0, cut);
      let id: string;
      if (n.type === 'folder') {
        id = await folderId(n.path);
      } else {
        const props: Record<string, string> = { ...inboxProps.get(n.path) };
        if (n.byBower) props[PROP.by] = 'bower';
        if (n.isNew) props[PROP.isNew] = '1';
        const text = n.path === 'Rules.md' ? rulesText : pileNotes.get(n.path) ?? (n.kind === 'note' ? serializeNote({ ...(await vault.note(n.path)), byBower: !!n.byBower }) : n.kind === 'link' ? `[InternetShortcut]\nURL=https://${n.name.replace(/\.url$/, '')}\n` : madeUp(n.name, n.kind));
        id = (await drive.createText(await folderId(parentPath), n.name, text, Object.keys(props).length ? props : undefined)).id;
        const key = itemKeys.get(n.path);
        if (key !== undefined) keys.set(key, id);
        if (n.kind !== 'note' && !n.path.startsWith('Inbox/')) hashes[await sha256(new Blob([text]))] = n.path;
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
    await json('requests.json', { v: 1, done: [] } satisfies RequestsFile);
    await json('hashes.json', { v: 1, hashes } satisfies HashesFile);
    const run = await runs.current();
    if (run) {
      const { seen: _seen, ...rest } = run;
      await json('last-run.json', { v: 1, run: rest } satisfies LastRunFile);
    }
    return { root, keys };
  } finally {
    world.dispose();
  }
}
