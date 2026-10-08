import { DriveVault } from '../vault/drive-vault';
import type { FakeDrive } from '../drive/fake-drive';

/**
 * Adds what the live folder had when Home took 45 s (TL-P4-10 addendum 2) to a seeded pretend Drive: a declared
 * pile of things, a score of leftover dispositions, a dozen changes, and questions about the things. All made up.
 */
export async function liveShape(drive: FakeDrive, root: string): Promise<void> {
  const hex = (n: number): string => n.toString(16).padStart(64, '0');
  const folderAt = async (path: string): Promise<string> => {
    const found = (await drive.listAll(root)).find((f) => f.folder && drive.pathOf(f.id, root) === path);
    if (found) return found.id;
    const cut = path.lastIndexOf('/');
    const parent = cut < 0 ? root : await folderAt(path.slice(0, cut));
    return (await drive.createFolder(parent, path.slice(cut + 1))).id;
  };
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), declarePiles: true });
  const pile = await vault.addPile({
    text: 'Papers from Alex',
    items: ['a', 'b', 'c', 'd'].map((n) => ({ name: `${n}.pdf`, kind: 'pdf' as const, origin: 'From this computer', body: new Blob([`%PDF ${n}`]) })),
  });
  await vault.settled();
  const piles = await folderAt('.bower/piles');
  for (let i = 0; i < 20; i++) await drive.createText(piles, `disposition-${hex(i)}.json`, '{}');
  for (let i = 0; i < 12; i++) await vault.addRequest(`Tidy shelf ${i}`);
  const things = (await vault.piles()).find((p) => p.id === pile.id)?.items ?? [];
  const asks = things.slice(0, 3).map((t, i) => ({ id: `q-ask-${t.id}`, text: `Is it from the viewing ${i}?`, yes: 'Yes', no: 'No', subject: t.id, askedAt: i }));
  const state = { id: 'q-state-1', text: 'Should Bower keep the flat notes together?', yes: 'Yes', no: 'No', askedAt: 9 };
  const bower = await folderAt('.bower');
  const q = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === '.bower/questions.json');
  const text = JSON.stringify({ v: 1, questions: [...asks, state] });
  if (q) await drive.writeText(q.id, text, q.modifiedTime);
  else await drive.createText(bower, 'questions.json', text);
}
