import { describe, expect, it } from 'vitest';
import { parseNote } from '../contracts/note-format';
import { FakeDrive } from '../drive/fake-drive';
import { fakeScripted } from '../fake/fake-runner';
import { seedFakeDrive } from '../fake/seed';
import { DriveVault } from '../vault/drive-vault';
import { planAdmission } from './plan';
import { fakeRead } from './read';
import { modelDecisions, planScripted, runKeys, type AuthoredNote } from './scripted';

const AT = Date.UTC(2026, 9, 7, 9);
const RUN = 'run-note-body';
const ADDRESS = 'bowerbirds.example/nests';
const SUMMARY = 'Alex takes a pottery class.';

async function planned(authored?: AuthoredNote) {
  const drive = new FakeDrive({ clock: () => 0 });
  const root = (await seedFakeDrive(drive, 'empty', AT)) ?? '';
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set(), device: 'DEVICE_A' });
  await vault.addPile({ text: '', items: [{ name: 'Bowerbirds', kind: 'link', origin: 'A link you pasted', url: `https://${ADDRESS}` }] });
  await vault.settled();
  const admission = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-note-body' });
  if (admission.kind !== 'manifest') throw new Error(`Not admitted: ${admission.cause}`);
  const taken = admission.manifest;
  const plan = await planScripted(fakeScripted(drive), root, { scope: 'all', allowWeb: false, runId: RUN,
    requestId: taken.id, requestedAt: taken.at, taken, mintKey: await runKeys(RUN),
    decisions: modelDecisions({ thing: () => ({ to: 'Resources', name: authored ? 'Bowerbirds.url' : 'Bowerbirds.md' }),
      words: () => null, note: () => authored ?? null }) });
  const name = authored?.name ?? 'Bowerbirds.md';
  const created = plan.manifest.operations.flatMap((op) => {
    const effect = op.effect;
    return effect.kind === 'create-text' && effect.name === name ? [effect.text] : [];
  });
  expect(created).toHaveLength(1);
  const text = created[0] ?? '';
  return { text, note: parseNote(`Resources/${name}`, text) };
}

describe('a note body adds to its summary', () => {
  it('F9-1: a saved link keeps its summary, Source and Timeline without a repeated body', async () => {
    const { note } = await planned();
    expect(note.summary).toBe(`Saved from ${ADDRESS}.`);
    expect(note.properties).toContainEqual(expect.objectContaining({ key: 'source', value: `https://${ADDRESS}` }));
    expect(note.timeline).toContainEqual(expect.objectContaining({ text: 'Saved by you, filed by Bower.', source: ADDRESS }));
    expect(note.body).toBe('');
  });

  it('F9-2: a model thing body equal after normalizedText is omitted', async () => {
    const { note } = await planned({ name: 'Pottery class.md', summary: SUMMARY, body: '  ALEX takes\n a pottery   class.  ' });
    expect(note.summary).toBe(SUMMARY);
    expect(note.body).toBe('');
  });

  it('F9-3: a body adding a sentence is kept byte for byte', async () => {
    const body = `${SUMMARY}\n\nBring  the blue apron.\nKeep\tthe glaze label.`;
    const { note, text } = await planned({ name: 'Pottery class.md', summary: SUMMARY, body });
    expect(note.body).toBe(body);
    expect(text).toContain(`\n${body}\n`);
  });
});
