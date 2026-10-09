import { askId, pairQuestionId, stateQuestionId } from '../contracts/questions';
import type { FakeDrive } from '../drive/fake-drive';
import { DriveVault } from '../vault/drive-vault';
import { SYSTEM } from '../vault/layout';

/**
 * The gone-answers situation (TL-P4-19 addendum 10): three yes answers wait for the next tidy-up, and what each was
 * about has gone since: the other note of a pair and a note whose Current state you changed went to the Bin, and a
 * photo left the inbox. A tidy-up answers each with a row under its result; the pair's shows on the note that stays
 * too. Made up, on Alex's folder, through the app's own answers, Bin and inbox.
 */
export async function goneAnswers(drive: FakeDrive, root: string): Promise<void> {
  const STAYS = 'Projects/Flat hunt/Flat 7, Cobble Row.md';
  const OTHER = 'Projects/Flat hunt/Flat 2, 40 Tanners Walk.md';
  const STATE = 'Resources/Cooking/Weeknight curry.md';
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  const listed = await drive.listAll(root);
  const idAt = (path: string): string => listed.find((f) => drive.pathOf(f.id, root) === path)?.id ?? '';
  const pile = await vault.addPile({ text: 'Kitchen photo for the flat', items: [{ name: 'Kitchen photo.jpg', kind: 'image', origin: 'From this computer', body: new Blob(['A made-up photo of a kitchen.']) }] });
  await vault.settled();
  const added = (await vault.piles()).find((p) => p.id === pile.id);
  const thing = added?.items[0];
  const file = (await drive.listAll(root)).find((f) => drive.pathOf(f.id, root) === SYSTEM.questions);
  if (!thing || !added?.path || !file) throw new Error('The gone-answers situation could not be set up.');
  const questions = [
    { id: pairQuestionId(idAt(STAYS), idAt(OTHER)), text: 'Flat 7, Cobble Row and Flat 2, 40 Tanners Walk look like one flat. Keep one note?', yes: 'Yes, keep one', no: 'No, keep both', about: STAYS, askedAt: Date.now() },
    { id: askId(thing.id), text: 'Is the kitchen photo from the Cobble Row viewing?', yes: 'Yes', no: 'No', about: `${added.path}/${thing.name}`, subject: thing.id, askedAt: Date.now() },
    { id: stateQuestionId(idAt(STATE)), text: 'You changed the current state of Weeknight curry. Should Bower write its update there?', yes: 'Write it', no: 'Keep mine', about: STATE, state: 'changed', askedAt: Date.now() },
  ];
  await drive.writeText(file.id, `${JSON.stringify({ v: 1, questions }, null, 2)}\n`, file.modifiedTime);
  await vault.refresh();
  for (const q of questions) await vault.answer(q.id, true);
  await vault.trash(OTHER);
  await vault.trash(STATE);
  await vault.removePile(pile.id);
  await vault.settled();
  vault.dispose();
}
