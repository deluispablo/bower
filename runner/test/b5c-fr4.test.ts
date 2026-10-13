import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseOwnership } from '../../src/data/contracts/ownership-format';
import { note, run, select, setup } from './b1-planning-support';
import { AT } from './corpus-run';
import { paging } from './drive-v3';

const CAREER = 'Areas/Career';
const PROFILE = `${CAREER}/Career profile.md`;
const CV = 'Alex CV.txt';
const FACT = 'Alex uses TypeScript.';
const ATTACK = 'Resources/Passport ID-884422';
const initialPaging = paging.size;

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT); paging.size = 1000;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { paging.size = initialPaging; vi.restoreAllMocks(); vi.useRealTimers(); });

async function execute(destination: string, contribute: boolean) {
  const b = await setup({ folder: {
    [`${CAREER}/Career.md`]: note('Career documents.', '## Timeline\n', true),
    [PROFILE]: note('Earlier career facts.',
      '## Current state\n<!-- bower:ownership/2 begin current -->\n- Earlier career facts.\n<!-- bower:ownership/2 end current -->\n'
      + '<!-- bower:ownership/2 begin personal -->\n## My notes\nAlex keeps these words.\n<!-- bower:ownership/2 end personal -->\n'
      + '<!-- bower:ownership/2 begin timeline -->\n## Timeline\n<!-- bower:ownership/2 end timeline -->\n'
      + "<!-- bower:ownership/2 begin bower-note -->\n## Bower's note\nEarlier CV saved.\n<!-- bower:ownership/2 end bower-note -->\n"
      + '<!-- bower:ownership/2 begin profile -->\nEarlier career facts.\n<!-- bower:ownership/2 end profile -->\n', true)
      .replace('summary:', 'bower_format: ownership/2\nsummary:'),
  }, inbox: [{ line: '', files: [CV] }], inboxFiles: { [CV]: FACT } });
  const profileId = b.id(PROFILE);
  await b.drive.update(profileId, { appProperties: { profile: 'cv' } });
  await b.drive.createText(b.id('.bower'), 'type-table.json', JSON.stringify({ v: 1, rows: [{
    id: 'cv', match: ['cv'], template: 'source', properties: {}, table: [], profile: { template: 'profile' },
  }] }));
  const selection = select(b, [], CAREER);
  for (const item of selection.items) {
    item.kind = 'cv';
    if (destination === ATTACK) item.destination = { parentId: b.id('Resources'), name: 'Passport ID-884422' };
  }
  const intent = { kind: 'tidy-intent', v: 1, things: b.sources.map((source) => ({
    fileId: source.itemId, to: destination, name: CV,
    note: { name: 'Alex document.md', summary: 'Career document.', body: FACT },
    ...(contribute ? { profile: [{ source: source.itemId, sentence: 1 }] } : {}),
  })) };
  const result = await run(b, [selection, intent]);
  expect(result.code, result.errors).toBe(0);
  expect(result.wire?.statuses.at(-1)?.phase).toBe('done');
  expect(result.frames, 'selection and execution complete without a refused plan').toHaveLength(2);
  const sourceId = b.sources[0]?.itemId ?? '';
  const filed = await b.drive.get(sourceId);
  expect(b.drive.pathOf(filed.id, b.root), 'the script-held source id lands in the selected destination')
    .toBe(`${destination}/${CV}`);
  expect(await b.drive.readText(sourceId), 'filing preserves identifier-free source evidence').toBe(FACT);
  const profiles = (await b.drive.listAll(b.root)).filter((file) => file.appProperties?.profile === 'cv');
  expect(profiles.map((file) => file.id), 'one property-bound profile remains the target').toEqual([profileId]);
  const context = result.frames[1]?.value as {
    piles: Array<{ things: Array<{ fileId: string; sentences?: Array<{ sentence: number; text: string }> }> }>;
  };
  expect(context.piles.flatMap((pile) => pile.things).find((thing) => thing.fileId === sourceId)?.sentences,
    'the safe source name and sentence pass the offered-set check').toEqual([{ sentence: 1, text: FACT }]);
  const text = await b.drive.readText(profileId);
  if (!contribute) expect(text, 'ordinary filing leaves the profile untouched').toBe(b.c.folder[PROFILE]);
  const bytes = new TextEncoder().encode(text);
  const ownership = parseOwnership(bytes);
  expect(ownership.status).toBe('v2');
  const span = ownership.status !== 'invalid' ? ownership.payloads?.profile : undefined;
  expect(span, 'main applies the existing ownership-region writer').toBeDefined();
  return { text, profile: new TextDecoder().decode(bytes.subarray(span?.start, span?.end)) };
}

it('b5c-fr4-new-destination control: ordinary filing preserves source and profile bytes', async () => {
  await execute(ATTACK, false);
});
it('b5c-fr4-new-destination', async () => {
  const { text, profile } = await execute(ATTACK, true);
  expect({ profile, destinationInProfile: text.includes(ATTACK), identifierInProfile: text.includes('ID-884422') },
    'pass 4: the citation contains only the safe source name, with no model destination text')
    .toEqual({ profile: `${FACT} [[Alex CV]]\n`, destinationInProfile: false, identifierInProfile: false });
});

it('b5c-fr4-existing-destination control: ordinary filing preserves source and profile bytes', async () => {
  await execute(CAREER, false);
});
it('b5c-fr4-existing-destination', async () => {
  const { profile } = await execute(CAREER, true);
  expect(profile, 'an existing destination also cites only the source name in the shortest-path format')
    .toBe(`${FACT} [[Alex CV]]\n`);
});
