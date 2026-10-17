/**
 * sec-hardening L4 (rulings 2-4, 8, 9): the runner's logs never carry text taken from a note, the model's words, the plan
 * or claude's stderr. Each log is driven by a marker in one of them; the marker never reaches `console.error`. No live call.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { format } from 'node:util';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { timelineLine } from '../../src/data/contracts/timeline-line';
import type { ClaudeExit, ClaudeSpawn } from '../src/claude';
import { loadCorpus, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply } from './b1-planning-support';
import { frameOf, replySequence, runWithClaude } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
/** The marker: a made-up name no fixture holds, capitalized so the line checks read it as a name. */
const MARKER = 'Zanzibarquux';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const printed = (): string => vi.mocked(console.error).mock.calls.map((args) => format(...args)).join('\n');
const failed = (stderr: string): ClaudeExit => ({ code: 1, stderr, cut: null, stdout: '' });

async function offerAndFlat(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
  if (!c) throw new Error('no corpus case c04-offer-and-flat');
  return c;
}
const OFFER = { fileId: '$file:Offer_letter_final(2).pdf', to: 'Projects/Job hunt', name: 'Offer, Industrial Designer, Ferrowick.pdf',
  note: { name: 'Industrial Designer, Ferrowick.md', summary: 'An offer from Ferrowick.', body: 'Industrial designer, fully remote.' } };
const filed = (offer: Record<string, unknown> = {}) => ({ kind: 'tidy-intent', v: 1, things: [{ ...OFFER, ...offer },
  { fileId: '$file:listing-88213.example.url', to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' },
  { fileId: '$file:IMG_2301.jpg', to: 'Projects/Flat hunt', name: 'Wrenfield Road, kitchen.jpg' },
  { fileId: '$file:Payslip_Aug.pdf', to: 'Resources/Pay', name: 'Payslip August.pdf', note: { name: 'Payslip, August.md', summary: 'A payslip for August.', body: 'Payslip for August.' } }] });

/** About me and its ledger with fourteen long facts about you (budget 400), so a fifteenth makes the section due. */
const HABIT = (n: number) => `I keep garden habit ${n}: I water the beds slowly at dawn, check the soil by hand, and write down what grew so I can plan the rows with care.`;
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const region = (heading: string, r: string, lines = '') => `<!-- bower:ownership/2 begin ${r} -->\n### ${heading}\n${lines}<!-- bower:ownership/2 end ${r} -->\n`;
const HABITS = Array.from({ length: 14 }, (_, i) => i + 1);
const habitsCase = async (): Promise<LoadedCase> => ({ ...await offerAndFlat(), id: 'sec-hardening', inbox: [{ line: `Remember this: ${HABIT(15)}`, files: [] }], inboxFiles: {}, inboxBinary: {},
  folder: {
    '.bower/observations.jsonl': HABITS.map((n) => JSON.stringify({ v: 1, kind: 'observation', eventId: `event-habit-${n}`, factId: `habit-${n}`, date: '2026-10-06',
      section: 'about-you', text: HABIT(n), category: 'biography', source: { fileId: `words-habit-${n}`, sha256: sha(`${HABIT(n)}\n`) },
      origin: { kind: 'words', runId: 'history-run', captureId: sha('history'), pileId: `pile-habit-${n}` } })).join('\n') + '\n',
    'About me.md': '---\nsummary: What Bower knows about you. Change it whenever you like.\n---\n\n## My words\n\nI keep my own notes here.\n\n## What Bower has learned\n'
      + region('About you', 'about-you', HABITS.map((n) => `${timelineLine({ date: '2026-10-06', text: HABIT(n), source: 'Your words' })}\n`).join(''))
      + region("What you're working on", 'about-working-on') + region('How you like things', 'about-preferences'),
  } });
const remembered = { kind: 'tidy-intent', v: 1, things: [], observations: [{ source: { pileId: 'p-1' }, section: 'about-you', category: 'biography', text: HABIT(15) }] };
type Frame = { consolidation?: { facts: Array<{ n: number; text: string }> }; judge?: { lines: Array<{ n: number }> } };
/** The run's consolidation and judge calls answered by `consolidate` and `judge`: by default each fact cut short, every line supported. */
function consolidating(o: { consolidate?: (facts: Array<{ n: number; text: string }>) => ClaudeExit; judge?: (n: number) => { supported: boolean; reason: string } }): ClaudeSpawn {
  const plan = replySequence([remembered]);
  return phaseAwareClaude(async (call) => {
    const frame = frameOf<Frame>(call);
    if (frame.consolidation) return (o.consolidate ?? ((facts) => reply({ lines: facts.map((f) => ({ text: `${f.text.split(',')[0]?.replace(/\.$/, '')}.`, facts: [f.n], form: 'current' })) })))(frame.consolidation.facts);
    if (frame.judge) return reply({ verdicts: frame.judge.lines.map((l) => ({ n: l.n, ...(o.judge ?? (() => ({ supported: true, reason: 'Made-up reason: it follows.' })))(l.n) })) });
    return plan(call);
  }, undefined, true);
}

it.each<[string, () => Promise<{ c: LoadedCase; spawn: ClaudeSpawn }>, RegExp]>([
  // :2509 and :2220: a reason that quotes a name the model gives, refused twice.
  ['a thing name the model gives, refused twice', async () => ({ c: await offerAndFlat(), spawn: replySequence([filed({ name: `${MARKER}_final(2).pdf` })]) }),
    /was refused \(rawName\): .*asking once more/],
  ['a note name the model gives, refused twice (the note it names is in the folder)', async () => {
    const c = await offerAndFlat();
    const name = `${MARKER} offer.md`;
    return { c: { ...c, folder: { ...c.folder, [`Projects/Job hunt/${name}`]: '---\nsummary: An offer.\nby: bower\n---\n# Offer\n\n## Timeline\n' } },
      spawn: replySequence([filed({ note: { ...OFFER.note, name } })]) };
  }, /was refused \(noteName\): .*asking once more/],
  // :2220: claude's stderr on a failed planning call.
  ['claude\'s stderr on a failed plan call', async () => ({ c: await offerAndFlat(), spawn: phaseAwareClaude(() => failed(`Made-up failure near ${MARKER}.`)) }),
    /plan for run .* is refused: exit 1, no JSON result/],
  // :2549: a consolidation line the checks refuse, holding a name its facts do not.
  ['a consolidation line the checks refuse', async () => ({ c: await habitsCase(), spawn: consolidating({ consolidate: (facts) => reply({ lines: facts.map((f) => ({
    text: f.n === 1 ? `I keep garden habit 1 near ${MARKER}.` : `${f.text.split(',')[0]?.replace(/\.$/, '')}.`, facts: [f.n], form: 'current' })) }) }) }),
    /refuses line 1 \(a number, date or name no cited fact holds\)/],
  // :2564: the judge's reason.
  ['the judge\'s reason', async () => ({ c: await habitsCase(), spawn: consolidating({ judge: (n) => ({ supported: n !== 2, reason: `Made-up reason quoting ${MARKER}.` }) }) }),
    /drops line 2, which the judge rejects/],
  // :2526 and :2220: a consolidation call that fails with the marker on claude's stderr, or throws with it.
  ['claude\'s stderr on a failed consolidation call', async () => ({ c: await habitsCase(), spawn: consolidating({ consolidate: () => failed(`Made-up failure near ${MARKER}.`) }) }),
    /consolidation of run .* is skipped/],
  ['an error thrown on a consolidation call', async () => ({ c: await habitsCase(), spawn: consolidating({ consolidate: () => { throw new Error(`Made-up throw near ${MARKER}.`); } }) }),
    /consolidation of run .* is skipped/],
])('L4 sec-hardening-logs: %s is logged with no text from a note, the model or claude', async (_name, setup, logged) => {
  const { c, spawn } = await setup();
  await runWithClaude(c, spawn);
  expect(printed(), 'the refusal is logged').toMatch(logged);
  expect(printed(), 'no note, model or claude text is logged').not.toContain(MARKER);
});
