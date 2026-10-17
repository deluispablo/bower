/** B10 through production main: a long text read whole reaches the planner through one cited synopsis (TL-P4-52 B10). */
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import type { ClaudeCall, ClaudeExit, ClaudeSpawn } from '../src/claude';
import { VaultIndex } from '../../src/data/vault/vault-index';
import { loadCase, type LoadedCase } from '../src/corpus';
import { phaseAwareClaude, reply, report } from './b1-planning-support';
import { AT, redispatchCase, runOnDrive, seedCase, type CaseRun } from './corpus-run';
import { fixedDrive } from './drive-v3';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(AT);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');
const TAIL = 'c17-b10-complete-tail';
const GUIDE = 'Seed order guide.txt';
const HUB = 'Resources/Gardening/Gardening.md';
type Part = { n: number; text: string };
type SynopsisInput = { name: string; words: number; parts: Part[] };
type Frame = Record<string, unknown> & { synopsis?: SynopsisInput; selection?: unknown; sources?: Array<{ itemId: string; candidates?: Array<{ id: string; path?: string }> }>;
  piles?: Array<{ pileId: string; things: Array<{ fileId: string; name: string; text?: string | null }> }> };
type Call = { phase: 'synopsis' | 'selection' | 'execution'; call: ClaudeCall; frame: Frame };
const isExit = (v: unknown): v is ClaudeExit => typeof v === 'object' && v !== null && 'stdout' in v && 'cut' in v;
type Script = {
  synopsis?: (s: SynopsisInput, call: ClaudeCall) => unknown;
  execution?: (frame: Frame, attempt: number) => unknown;
  selection?: (frame: Frame, call: ClaudeCall) => void;
  /** Notes (by path) the selection reply asks for, among each source's candidates. */
  wants?: string[];
  /** Fields merged into every selection item (a kind, a destination, notes by id). */
  pick?: Record<string, unknown>;
};

/** `n` whitespace-separated words, a line break every 12, no blank line. */
const words = (n: number, seed = 'Alex sows seed rows near the shed today.'): string => {
  const tokens = seed.split(' ');
  return Array.from({ length: n }, (_, i) => tokens[i % tokens.length] + ((i + 1) % 12 === 0 ? '\n' : ' ')).join('').trimEnd() + '\n';
};
/** `n` copies of `token`, a line break every 12: exactly `n * (token.length + 1)` characters. */
const fill = (n: number, token: string): string => Array.from({ length: n }, (_, i) => token + ((i + 1) % 12 === 0 ? '\n' : ' ')).join('').trimEnd() + '\n';
/** A one-font text PDF, one entry per page, each page's lines drawn one under another. */
function pdfPages(pages: string[][]): Uint8Array {
  const body = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = pages.map((lines) => {
    const stream = `BT\n/F1 8 Tf\n9 TL\n30 820 Td\n${lines.map((l) => `(${l}) Tj T*`).join('\n')}\nET\n`;
    body.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    body.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${body.length} 0 R >>`);
    return `${body.length} 0 R`;
  });
  body[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  const at: number[] = [];
  let out = '%PDF-1.4\n';
  for (const [i, o] of body.entries()) { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${body.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${body.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
/** A page of `lines` lines of 50 one-letter words: 99 characters and 50 words a line. */
const letterPage = (lines: number): string[] => Array.from({ length: lines }, () => 'a b c d e f g h i j '.repeat(5).trimEnd());
async function loaded(id = TAIL, inbox?: Record<string, string>, folder: Record<string, string> = {}, binary: Record<string, Uint8Array> = {}): Promise<LoadedCase> {
  const c = await loadCase(resolve(ROOT, id));
  if (inbox) {
    c.inbox = [{ line: 'File these with Gardening.', files: [...Object.keys(inbox), ...Object.keys(binary)] }];
    c.inboxFiles = { ...inbox }; c.inboxBinary = { ...binary };
  }
  Object.assign(c.folder, folder);
  return c;
}
/** The case's own execution reply, `$file:` names bound to this run's shown things. */
const caseReply = (frame: Frame, value: unknown): unknown => {
  const ids = new Map((frame.piles ?? []).flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
  return JSON.parse(JSON.stringify(value), (_k, v: unknown) => typeof v === 'string' && v.startsWith('$file:') ? ids.get(v.slice(6)) ?? v : v) as unknown;
};
const TAIL_REPLY = { kind: 'tidy-intent', v: 1, things: [{ fileId: `$file:${GUIDE}`, to: 'Resources/Gardening', name: GUIDE,
  note: { name: 'Seed order guide.md', summary: 'The seed order guide requires a reply by 20 October 2026.',
    body: 'The guide compares paper labels and reusable trays. Reply by 20 October 2026. Collection is at Wren Hall in Saltmere.\n\nSee also [[Resources/Gardening/Gardening]]: the garden it belongs to.' } }] };
/** A note that states only what the opening says: true whatever the planner was shown. */
const plain = (frame: Frame): unknown => ({ kind: 'tidy-intent', v: 1, things: (frame.piles ?? []).flatMap((p) => p.things).map((t) => ({
  fileId: t.fileId, to: 'Resources/Gardening', name: t.name,
  ...(t.name.endsWith('.md') ? {} : { note: { name: t.name.replace(/\.[^.]+$/, ' introduction.md'), summary: 'The opening compares paper labels and reusable trays.',
    body: 'The opening compares paper labels and reusable trays.\n\nSee also [[Resources/Gardening/Gardening]]: the garden it belongs to.' } }) })) });
const last = (s: SynopsisInput): number => s.parts.at(-1)?.n ?? 1;
const partWith = (s: SynopsisInput, phrase: string): number => s.parts.find((p) => p.text.includes(phrase))?.n ?? 0;
const VALID = (s: SynopsisInput) => ({ statements: [{ text: 'The guide compares paper labels and reusable trays.', parts: [1] },
  { text: 'Reply by 20 October 2026; collection is at Wren Hall in Saltmere.', parts: [partWith(s, 'Final terms') || last(s)] }] });

async function press(c: LoadedCase, script: Script, o: { around?: (f: typeof globalThis.fetch) => typeof globalThis.fetch; drive?: ReturnType<typeof fixedDrive>; root?: string; n?: number } = {}) {
  const drive = o.drive ?? fixedDrive();
  const root = o.root ?? await seedCase(drive, c);
  const n = o.n ?? 1;
  const a = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT + n, newId: () => `b10-${n}` });
  if (a.kind !== 'manifest') throw new Error(`Not admitted: ${a.cause}`);
  const admission: AdmissionManifest = a.manifest;
  const gardening = (await drive.listAll(root)).find((f) => f.folder && f.name === 'Gardening')?.id ?? '';
  const calls: Call[] = [];
  const spawn: ClaudeSpawn = phaseAwareClaude(async (call, _step, attempt, phase): Promise<ClaudeExit> => {
    const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Frame;
    if (frame.synopsis) {
      calls.push({ phase: 'synopsis', call, frame });
      const value = script.synopsis ? script.synopsis(frame.synopsis, call) : VALID(frame.synopsis);
      return isExit(value) ? value : reply(value);
    }
    calls.push({ phase, call, frame });
    if (phase === 'selection') {
      script.selection?.(frame, call);
      return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: gardening,
        wants: (s.candidates ?? []).filter((n) => script.wants?.includes(n.path ?? '')).map((n) => n.id), ...script.pick })), asks: [] });
    }
    return reply(caseReply(frame, script.execution ? script.execution(frame, attempt) : plain(frame)));
  }, () => ({ drive, root, admission }), true);
  const run = await runOnDrive(c, drive, root, { claude: spawn, admission, pacing: { baseMs: 0, sleep: async () => {} },
    answerStart: { scope: 'all', requestId: `b10-run-${n}` }, ...(o.around ? { around: o.around } : {}) }, n);
  return { ...run, calls, drive, root };
}
const phases = (r: { calls: Call[] }): string[] => r.calls.map((c) => c.phase);
const synopses = (r: { calls: Call[] }): Call[] => r.calls.filter((c) => c.phase === 'synopsis');
const shownText = (r: { calls: Call[] }, name: string, at: Call['phase'] = 'selection'): string => String((r.calls.find((c) => c.phase === at)?.frame.piles ?? [])
  .flatMap((p) => p.things).find((t) => t.name === name)?.text ?? '');
const modelOf = (call: ClaudeCall): string => call.args[call.args.indexOf('--model') + 1] ?? '';
const errors = (): string => vi.mocked(console.error).mock.calls.flat().map(String).join('\n');
const phase = (r: CaseRun) => r.wire?.statuses.at(-1)?.phase;
const url = (input: RequestInfo | URL): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

describe('B10 a long text reaches the planner through one cited synopsis', () => {
  it('AC3 b10-synopsis-called: a complete text over 3,000 words gets one synopsis call, read whole, before the planner, which sees the synopsis', async () => {
    const c = await loaded();
    const original = c.inboxFiles[GUIDE] ?? '';
    const downloads: string[] = [];
    const r = await press(c, { execution: () => TAIL_REPLY }, { around: (next) => async (input, init) => {
      const u = url(input);
      if (u.searchParams.get('alt') === 'media' && !new Headers(init?.headers).get('Range')) downloads.push(u.pathname.split('/').at(-1) ?? '');
      return next(input, init);
    } });
    expect(phases(r), 'one synopsis call, then selection and execution').toEqual(['synopsis', 'selection', 'execution']);
    const guideId = Object.entries(r.pathsById).find(([, p]) => p.endsWith(GUIDE))?.[0] ?? '';
    expect(downloads.filter((id) => id === guideId), 'one download and one extraction serve the planner and the synopsis').toHaveLength(1);
    const input = synopses(r)[0]?.frame.synopsis;
    expect(input?.name).toBe(GUIDE);
    expect(input?.words, 'whitespace-separated words of the whole text').toBe(original.trim().split(/\s+/).length);
    expect(input?.parts.map((p) => p.n), 'parts are numbered from 1').toEqual(input?.parts.map((_, i) => i + 1));
    for (const p of input?.parts ?? []) expect(original, 'each part is the original\'s own text').toContain(p.text);
    expect(input?.parts.map((p) => p.text).join(''), 'the final terms are read').toContain('reply by 20 October 2026');
    expect((input?.parts ?? []).map((p) => p.text).join('').replace(/\s+/g, ''), 'the parts, in order, are the whole text: none left out, none twice').toBe(original.replace(/\s+/g, ''));
    const shown = shownText(r, GUIDE);
    expect(shown, 'the planner sees the synopsis, labelled').toMatch(/^Bower's synopsis of the whole text \(3,231 words, read whole\):\n- The guide compares paper labels and reusable trays\.\n- Reply by 20 October 2026; collection is at Wren Hall in Saltmere\.\n?$/);
    expect(shown).not.toContain('[cut here');
    expect(shownText(r, GUIDE, 'execution'), 'selection and execution see the same synopsis').toBe(shown);
    expect(phase(r)).toBe('done');
    expect(report(r).filed).toHaveLength(1);
    expect(r.after['Resources/Gardening/Seed order guide.md']).toContain('Reply by 20 October 2026');
    expect(r.after['Resources/Gardening/Seed order guide.txt'], 'the original moves with its bytes').toBe(original);
    expect(r.after[HUB], 'Alex\'s own words stay').toContain('Alex wants to keep the path clear in Saltmere.');
  });

  it('AC3 b10-synopsis-threshold-at (guard): exactly 3,000 words keeps the ordinary path, with no synopsis call', async () => {
    const r = await press(await loaded(TAIL, { 'Sowing notes.txt': words(3000) }), {});
    expect(phases(r)).toEqual(['selection', 'execution']);
    expect(shownText(r, 'Sowing notes.txt'), 'shown as far as its share allows').toContain('[cut here');
  });

  it('AC3 b10-synopsis-threshold-over: 3,001 words of complete text get one synopsis call', async () => {
    const r = await press(await loaded(TAIL, { 'Sowing notes.txt': words(3001) }), { synopsis: () => ({ statements: [{ text: 'Alex sows seed rows near the shed.', parts: [1] }] }) });
    expect(phases(r)).toEqual(['synopsis', 'selection', 'execution']);
    expect(synopses(r)[0]?.frame.synopsis?.words).toBe(3001);
  });

  const BLOCKS = {
    noBreak: 'abcdefghij'.repeat(450),
    exact: `${'k'.repeat(1000)}\n${'m'.repeat(999)}`,
    over: `${'n'.repeat(1500)}\n${'p'.repeat(501)}`,
    overNoBreak: 'q'.repeat(2001),
  };
  const filler = Array.from({ length: 16 }, () => fill(200, 'sow').trimEnd());
  const SPLIT = [...filler.slice(0, 8), BLOCKS.noBreak, BLOCKS.exact, BLOCKS.over, BLOCKS.overNoBreak, ...filler.slice(8)];
  const EXPECTED_PARTS = [...filler.slice(0, 8), 'abcdefghij'.repeat(200), 'abcdefghij'.repeat(200), 'abcdefghij'.repeat(50), BLOCKS.exact, 'n'.repeat(1500), 'p'.repeat(501), 'q'.repeat(2000), 'q', ...filler.slice(8)];
  const SEPARATORS = ['\n\n', '\n \t\n', '\n\n\n\n'];
  const joined = (eol: string): string => SPLIT.map((b, i) => (i ? SEPARATORS[i % 3] : '') + b).join('').replace(/\n/g, eol) + eol;
  it.each([['LF', '\n'], ['CRLF', '\r\n']])('AC3 b10-synopsis-parts: %s text splits on blank lines and at 2,000 characters, at the last line break before it, else at 2,000', async (_name, eol) => {
    const r = await press(await loaded(TAIL, { 'Sowing log.txt': joined(eol) }), { synopsis: () => ({ statements: [{ text: 'Alex sows rows.', parts: [1] }] }) });
    const parts = synopses(r)[0]?.frame.synopsis?.parts ?? [];
    expect(parts.map((p) => p.text), 'blank lines (spaces and tabs too) end a part; CRLF reads as LF; no empty part; a block over 2,000 splits').toEqual(EXPECTED_PARTS);
    expect(parts.map((p) => p.n)).toEqual(EXPECTED_PARTS.map((_, i) => i + 1));
  });

  it('AC3 b10-synopsis-partial-pdf (guard): a PDF with pages not read gets no synopsis, even under 3,000 words', async () => {
    const r = await press(await loaded('c17-b10-partial-pdf'), {});
    expect(phases(r)).toEqual(['selection', 'execution']);
    expect(shownText(r, 'Garden handbook.pdf')).toContain('[2 pages not read]');
  });

  it('AC3 b10-synopsis-partial-pdf-long (guard): a PDF read past 3,000 words with a page not read gets no synopsis', async () => {
    const r = await press(await loaded(TAIL, {}, {}, { 'Letters.pdf': pdfPages([letterPage(70), letterPage(70), letterPage(70)]) }), {});
    expect(phases(r)).toEqual(['selection', 'execution']);
    expect(shownText(r, 'Letters.pdf'), 'its read pages hold 7,000 words; one page is not read').toMatch(/\[1 pages? not read\]/);
  });

  it('AC3 b10-synopsis-pdf-over-share (guard): a PDF whose last page takes it past its 12,000 characters is cut, never a synopsis, though every page was read', async () => {
    const r = await press(await loaded(TAIL, {}, {}, { 'Letters.pdf': pdfPages([letterPage(70), letterPage(70)]) }), {});
    expect(phases(r)).toEqual(['selection', 'execution']);
    expect(shownText(r, 'Letters.pdf')).toContain('[cut here');
  });

  it('AC3 b10-synopsis-complete-pdf: a PDF read whole, over 3,000 words and within 12,000 characters, gets one synopsis', async () => {
    const r = await press(await loaded(TAIL, {}, {}, { 'Letters.pdf': pdfPages([letterPage(64)]) }), { synopsis: () => ({ statements: [{ text: 'Alex lists the letters a to j.', parts: [1] }] }) });
    expect(synopses(r).map((x) => x.frame.synopsis?.name)).toEqual(['Letters.pdf']);
    expect(synopses(r)[0]?.frame.synopsis?.words).toBe(3200);
  });

  it('AC3 b10-synopsis-shared-pool-partial (guard): five long guides whose whole texts do not fit their shares of the 48,000 characters are shown in part, with no synopsis', async () => {
    const r = await press(await loaded('c17-b10-shared-budget'), {});
    expect(phases(r)).toEqual(['selection', 'execution']);
    for (const name of ['A', 'B', 'C', 'D', 'E']) expect(shownText(r, `Garden guide ${name}.txt`)).toContain('[cut here');
  });

  it('AC3 b10-synopsis-only-admitted (guard): a long note the planner asks for is a note, never a synopsis input', async () => {
    const c = await loaded();
    const hub = `${c.folder[HUB] ?? ''}\n${words(3500, 'Alex logs tray labels in the hub each week.')}`;
    c.folder[HUB] = hub;
    const r = await press(c, { wants: [HUB], synopsis: () => ({ statements: [{ text: 'The guide compares paper labels and reusable trays.', parts: [1] }] }), execution: () => TAIL_REPLY });
    const asked = (r.calls.find((x) => x.phase === 'selection')?.frame.sources ?? []).flatMap((s) => s.candidates ?? []).filter((n) => n.path === HUB);
    expect(asked, 'the hub is a candidate the reply asks for').not.toHaveLength(0);
    expect(synopses(r).map((x) => x.frame.synopsis?.name), 'no synopsis for a note').not.toContain('Gardening.md');
    for (const x of synopses(r)) expect(x.call.input).not.toContain('Alex logs tray labels in the hub');
  });

  it('AC3 b10-synopsis-pool: two long texts that fit their shares get a synopsis each; a short text is shown whole; all within 48,000 characters', async () => {
    const long = words(3200, 'Alex labels paper trays for the plot today.');
    const r = await press(await loaded(TAIL, { 'Long A.txt': long, 'Long B.txt': long.replace(/today/g, 'tonight'), 'Short.txt': 'Alex keeps a short note about trays.\n' }),
      { synopsis: () => ({ statements: [{ text: 'Alex labels paper trays.', parts: [1] }] }) });
    expect(synopses(r).map((s) => s.frame.synopsis?.name).sort()).toEqual(['Long A.txt', 'Long B.txt']);
    expect(shownText(r, 'Short.txt'), 'the short text is whole').toBe('Alex keeps a short note about trays.\n');
    const read = synopses(r).reduce((n, s) => n + (s.frame.synopsis?.parts ?? []).reduce((m, p) => m + p.text.length, 0), 0);
    const piles = (r.calls.find((x) => x.phase === 'selection')?.frame.piles ?? []);
    const words2 = piles.reduce((n, p) => n + String((p as { words?: string }).words ?? '').length, 0);
    expect(read + words2 + shownText(r, 'Short.txt').length, 'synopsis input shares the run\'s 48,000 source characters').toBeLessThanOrEqual(48_000);
  });

  it('AC4 b10-synopsis-isolated: the synopsis call sees only the document, on the cheaper tier, with the planner\'s isolation', async () => {
    const c = await loaded(TAIL, undefined, { 'Rules.md': '# Rules\n\n- RULES_MARKER: receipts go to Money.\n', 'About me.md': '# About me\n\nABOUT_MARKER Alex likes tidy trays.\n' });
    const r = await press(c, { execution: () => TAIL_REPLY });
    const [s] = synopses(r);
    expect(s, 'one synopsis call').toBeDefined();
    const selection = r.calls.find((x) => x.phase === 'selection');
    for (const marker of ['RULES_MARKER', 'ABOUT_MARKER', 'Alex wants to keep the path clear', '# Index']) expect(s?.call.input, `no ${marker} in the synopsis input`).not.toContain(marker);
    expect(modelOf(s?.call as ClaudeCall), 'the cheap summarizer tier').toMatch(/haiku/i);
    expect(modelOf(s?.call as ClaudeCall)).not.toBe(modelOf(selection?.call as ClaudeCall));
    const without = (call: ClaudeCall | undefined) => (call?.args ?? []).filter((_, i, all) => all[i - 1] !== '--model');
    expect(without(s?.call), 'the same isolated, tool-less arguments').toEqual(without(selection?.call));
  });

  it('AC4 b10-synopsis-budget: the synopsis spends the run\'s one model time; when it is spent the planner never starts and the pile waits', async () => {
    let timeout = 0;
    const r = await press(await loaded(), { synopsis: (s, call) => {
      timeout = call.timeoutMs;
      vi.advanceTimersByTime(call.timeoutMs);
      return VALID(s);
    } });
    expect(timeout, 'the synopsis call waits at most the run\'s remaining model time').toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(720_000);
    expect(phases(r), 'no planner call after the shared time is spent').toEqual(['synopsis']);
    expect(phase(r)).toBe('done');
    expect(Object.keys(r.after).some((p) => p.startsWith('Inbox/') && p.endsWith(GUIDE)), 'the guide waits for the next run').toBe(true);
  });

  /** One statement of exactly 1,000 characters and 100 words, with no figure. */
  const THOUSAND = `${'abcdefghi '.repeat(99)}abcdefghij`;
  const REFUSED: Array<[string, string, string, (s: SynopsisInput) => unknown]> = [
    ['an unknown key', 'synopsisKeys', 'a synopsis that is not {"statements": [{"text", "parts"}]} with at least one statement', (s) => ({ ...VALID(s), note: 'extra' })],
    ['no statement', 'synopsisKeys', 'a synopsis that is not {"statements": [{"text", "parts"}]} with at least one statement', () => ({ statements: [] })],
    ['a statement without parts', 'synopsisKeys', 'a synopsis that is not {"statements": [{"text", "parts"}]} with at least one statement', () => ({ statements: [{ text: 'Paper labels help.' }] })],
    ['over 1,000 words', 'synopsisSize', 'a synopsis over 1,000 words or 4,000 characters', () => ({ statements: Array.from({ length: 101 }, () => ({ text: 'Paper labels help gardeners sort trays before planting young seeds.', parts: [1] })) })],
    ['over 4,000 characters', 'synopsisSize', 'a synopsis over 1,000 words or 4,000 characters', () => ({ statements: Array.from({ length: 9 }, () => ({ text: 'Paperlabelshelp '.repeat(28).trim(), parts: [1] })) })],
    ['a line break', 'synopsisLine', 'a statement that is not one plain line', () => ({ statements: [{ text: 'Paper labels\nhelp gardeners.', parts: [1] }] })],
    ['one word over 1,000, in short words under 4,000 characters', 'synopsisSize', 'a synopsis over 1,000 words or 4,000 characters', () => ({ statements: Array.from({ length: 11 }, () => ({ text: Array.from({ length: 91 }, () => 'ab').join(' '), parts: [1] })) })],
    ['one character over 4,000', 'synopsisSize', 'a synopsis over 1,000 words or 4,000 characters', () => ({ statements: [...Array.from({ length: 3 }, () => ({ text: THOUSAND, parts: [1] })), { text: `${THOUSAND}k`, parts: [1] }] })],
    ['an empty statement', 'synopsisLine', 'a statement that is not one plain line', () => ({ statements: [{ text: '', parts: [1] }] })],
    ['a statement of spaces only', 'synopsisLine', 'a statement that is not one plain line', () => ({ statements: [{ text: ' \u00a0 ', parts: [1] }] })],
    ['a carriage return', 'synopsisLine', 'a statement that is not one plain line', () => ({ statements: [{ text: 'Paper labels\rhelp gardeners.', parts: [1] }] })],
    ['a line separator', 'synopsisLine', 'a statement that is not one plain line', () => ({ statements: [{ text: 'Paper labels\u2028help gardeners.', parts: [1] }] })],
    ['a tab', 'synopsisLine', 'a statement that is not one plain line', () => ({ statements: [{ text: 'Paper labels\thelp gardeners.', parts: [1] }] })],
    ['a control character', 'synopsisLine', 'a statement that is not one plain line', () => ({ statements: [{ text: 'Paper labels\u0007 help gardeners.', parts: [1] }] })],
    ['an empty part list', 'synopsisCite', 'a statement citing no part, more than 3 parts or a part the text does not have', () => ({ statements: [{ text: 'Paper labels help.', parts: [] }] })],
    ['a part cited twice', 'synopsisCite', 'a statement citing no part, more than 3 parts or a part the text does not have', () => ({ statements: [{ text: 'Paper labels help.', parts: [1, 1] }] })],
    ['a fractional part', 'synopsisCite', 'a statement citing no part, more than 3 parts or a part the text does not have', () => ({ statements: [{ text: 'Paper labels help.', parts: [1.5] }] })],
    ['part zero', 'synopsisCite', 'a statement citing no part, more than 3 parts or a part the text does not have', () => ({ statements: [{ text: 'Paper labels help.', parts: [0] }] })],
    ['a number only in a part it does not cite', 'synopsisNumber', 'a number that is in none of the parts it cites', () => ({ statements: [{ text: 'Reply by 20 October 2026.', parts: [1] }] })],
    ['a part the text does not have', 'synopsisCite', 'a statement citing no part, more than 3 parts or a part the text does not have', (s) => ({ statements: [{ text: 'Paper labels help.', parts: [last(s) + 1] }] })],
    ['more than 3 parts', 'synopsisCite', 'a statement citing no part, more than 3 parts or a part the text does not have', () => ({ statements: [{ text: 'Paper labels help.', parts: [1, 2, 3, 4] }] })],
    ['a number its parts do not hold', 'synopsisNumber', 'a number that is in none of the parts it cites', (s) => ({ statements: [{ text: 'Reply by 23 October 2026.', parts: [partWith(s, 'Final terms') || last(s)] }] })],
  ];
  it.each(REFUSED)('AC5 b10-synopsis-refusals: %s is refused once (%s), never retried, and the planner sees the part that fits', async (_name, kind, why, bad) => {
    const r = await press(await loaded(), { synopsis: bad });
    expect(phases(r), 'one synopsis call, no retry').toEqual(['synopsis', 'selection', 'execution']);
    expect(errors(), 'refused with its own kind and reason').toContain(`The synopsis of a long text was refused (${kind}): ${why}; the planner sees the part that fits.`);
    expect(shownText(r, GUIDE), 'honestly limited: the prefix as today').toContain('[cut here');
    expect(shownText(r, GUIDE, 'execution'), 'both phases see the same prefix').toBe(shownText(r, GUIDE));
    expect(phase(r)).toBe('done');
    expect(report(r).filed).toHaveLength(1);
  });

  const LONG = Array.from({ length: 101 }, () => ({ text: 'Paper labels help gardeners sort trays before planting young seeds.', parts: [1] }));
  const FIRST: Array<[string, string, (s: SynopsisInput) => unknown]> = [
    ['a broken line and an ungrounded number in one statement', 'synopsisLine', (s) => ({ statements: [{ text: 'Reply by\n23 October 2026.', parts: [partWith(s, 'Final terms') || last(s)] }] })],
    ['an ungrounded number, then a broken line in a later statement', 'synopsisLine', (s) => ({ statements: [{ text: 'Reply by 23 October 2026.', parts: [partWith(s, 'Final terms') || last(s)] }, { text: 'Paper labels\nhelp.', parts: [1] }] })],
    ['an unknown key and a broken line', 'synopsisKeys', () => ({ statements: [{ text: 'Paper labels\nhelp.', parts: [1] }], note: 'extra' })],
    ['an oversize reply ending in an empty statement', 'synopsisLine', () => ({ statements: [...LONG, { text: '', parts: [1] }] })],
    ['an oversize reply and a part the text does not have', 'synopsisSize', (s) => ({ statements: [...LONG, { text: 'Paper labels help.', parts: [last(s) + 1] }] })],
    ['an ungrounded number, then a part the text does not have', 'synopsisCite', (s) => ({ statements: [{ text: 'Reply by 23 October 2026.', parts: [1] }, { text: 'Paper labels help.', parts: [last(s) + 1] }] })],
  ];
  it.each(FIRST)('AC5 b10-synopsis-first-fault: %s is refused for the first fault across the whole reply (%s), in keys, line, size, part, number order', async (_name, kind, bad) => {
    await press(await loaded(), { synopsis: bad });
    const refusals = [...errors().matchAll(/The synopsis of a long text was refused \((\w+)\)/g)].map((m) => m[1]);
    expect(refusals, 'one refusal, for the first fault').toEqual([kind]);
  });

  const ACCEPTED: Array<[string, () => unknown, string]> = [
    ['exactly 1,000 words, under 4,000 characters', () => ({ statements: Array.from({ length: 10 }, () => ({ text: Array.from({ length: 100 }, () => 'ab').join(' '), parts: [1] })) }), 'ab ab ab'],
    ['exactly 4,000 characters, under 1,000 words', () => ({ statements: Array.from({ length: 4 }, () => ({ text: THOUSAND, parts: [1] })) }), 'abcdefghij'],
    ['spaces around a statement, trimmed', () => ({ statements: [{ text: '  The guide compares paper labels and reusable trays.  ', parts: [1] }] }), '- The guide compares paper labels and reusable trays.'],
    ['Markdown characters, which are plain text', () => ({ statements: [{ text: '**Paper** labels, `trays` and _seeds_ # [compared](here) > all.', parts: [1] }] }), '- **Paper** labels, `trays` and _seeds_ # [compared](here) > all.'],
  ];
  it.each(ACCEPTED)('AC5 b10-synopsis-accepted: %s is a synopsis the planner sees', async (_name, good, seen) => {
    const r = await press(await loaded(), { synopsis: good });
    expect(shownText(r, GUIDE), 'shown as the synopsis').toMatch(/^Bower's synopsis of the whole text/);
    expect(shownText(r, GUIDE)).toContain(seen);
    expect(errors()).not.toContain('The synopsis of a long text was refused');
  });

  const UNMADE: Array<[string, ClaudeExit]> = [
    ['a failed call', { code: 1, stderr: 'Made-up failed call.', cut: null, stdout: '' }],
    ['a call cut for time', { code: null, stderr: '', cut: 'time', stdout: '' }],
    ['a reply that is not JSON', { ...reply({}), stdout: JSON.stringify({ ...(JSON.parse(reply({}).stdout) as object), result: 'Made-up words, not JSON.' }) }],
  ];
  it.each(UNMADE)('AC5 b10-synopsis-failed-call: %s is not retried; the planner sees the part that fits and the run goes on', async (_name, exit) => {
    const r = await press(await loaded(), { synopsis: () => exit });
    expect(phases(r)).toEqual(['synopsis', 'selection', 'execution']);
    expect(errors(), 'logged as not made').toContain('The synopsis of a long text was not made: ');
    expect(errors()).not.toContain('The synopsis of a long text was refused');
    expect(shownText(r, GUIDE)).toContain('[cut here');
    expect(phase(r)).toBe('done');
  });

  it('AC5 b10-synopsis-thrown-call: a synopsis call that throws, with model time left, is not retried; the planner sees the part that fits', async () => {
    const r = await press(await loaded(), { synopsis: () => { throw new Error('Made-up spawn failure.'); } });
    expect(phases(r)).toEqual(['synopsis', 'selection', 'execution']);
    expect(errors(), 'logged as not made').toContain('The synopsis of a long text was not made: ');
    expect(shownText(r, GUIDE)).toContain('[cut here');
    expect(phase(r)).toBe('done');
  });

  it('AC4 b10-synopsis-spent-before-next: when one synopsis spends the model time, the next is never asked; the pile waits and nothing is logged as not made', async () => {
    const c = await loaded(TAIL, { 'Long A.txt': fill(3100, 'abc'), 'Long B.txt': fill(3200, 'abd') });
    const r = await press(c, { synopsis: (_s, call) => { vi.advanceTimersByTime(call.timeoutMs); return { statements: [{ text: 'Alex labels trays.', parts: [1] }] }; } });
    expect(phases(r), 'one synopsis, then nothing: running out of time is never swallowed').toEqual(['synopsis']);
    expect(errors()).not.toContain('The synopsis of a long text was not made');
    expect(phase(r)).toBe('done');
    expect(Object.keys(r.after).filter((p) => p.startsWith('Inbox/') && /Long [AB]\.txt$/.test(p)), 'both wait for the next run').toHaveLength(2);
  });

  it('AC3 b10-synopsis-pool-mixed: synopses run in shown order; a failed one is cut to its share and frees nothing for a text that did not fit', async () => {
    // B 9,900, A 14,000 and C 25,200 characters: B and A fit; C gets what is left and does not fit; A's failure gives it nothing back.
    const docs = { 'Long A.txt': fill(3500, 'abc'), 'Long B.txt': fill(3300, 'ab'), 'Long C.txt': fill(3150, 'abcdefg') };
    const r = await press(await loaded(TAIL, docs), { synopsis: (s) => s.name === 'Long A.txt' ? { code: 1, stderr: 'Made-up failed call.', cut: null, stdout: '' } : { statements: [{ text: 'Alex labels trays.', parts: [1] }] } });
    const order = (r.calls.find((x) => x.phase === 'selection')?.frame.piles ?? []).flatMap((p) => p.things).map((t) => t.name).filter((n) => n !== 'Long C.txt');
    expect(synopses(r).map((x) => x.frame.synopsis?.name), 'one synopsis each for A and B, in shown order').toEqual(order);
    expect(order).toHaveLength(2);
    expect(shownText(r, 'Long B.txt')).toMatch(/^Bower's synopsis of the whole text \(3,300 words, read whole\):/);
    expect(shownText(r, 'Long A.txt'), 'the failed one: the part that fits, as today').toContain('[cut here');
    expect(shownText(r, 'Long A.txt').length).toBeLessThanOrEqual(12_200);
    expect(shownText(r, 'Long C.txt'), 'C did not fit and gets no synopsis after A fails').toContain('[cut here');
    expect(phase(r)).toBe('done');
  });

  it('AC6 b10-synopsis-grounded-in-original: a figure from the original\'s tail that the synopsis left out is grounded by the original', async () => {
    const r = await press(await loaded(), { synopsis: () => ({ statements: [{ text: 'The guide compares paper labels and reusable trays.', parts: [1] }] }), execution: () => TAIL_REPLY });
    expect(phase(r), 'the reply\'s 20 October is in the original text').toBe('done');
    expect(report(r).filed).toHaveLength(1);
    expect(errors()).not.toContain('a number that is in none of its sources');
    expect(phases(r)).toEqual(['synopsis', 'selection', 'execution']);
  });

  it('AC6 b10-synopsis-profile-original-only: a long CV\'s offered and stored profile sentences come only from its original sentences, never from the synopsis', async () => {
    const PROFILE = 'Areas/Career/Career profile.md';
    const SPAN = 'Achievement: shipped an offline map editor.';
    const SYNOPSIS = 'Alex delivered a map editor that works without a connection.';
    const c = await loaded('c17-b56-cv-profile', { 'Alex CV.txt': `${SPAN}\nExperience: built map tools at Ferrowick in 2026.\n${words(3100, 'Alex labels paper trays for the plot today.')}` });
    const drive = fixedDrive();
    const root = await seedCase(drive, c);
    const ix = VaultIndex.build(root, await drive.listAll(root));
    const id = (path: string): string => ix.idOf(path) ?? '';
    await drive.update(id(PROFILE), { appProperties: { profile: 'cv' } });
    await drive.createText(id('.bower'), 'type-table.json', JSON.stringify({ v: 1, rows: [{ id: 'cv', match: ['cv'], template: 'source', properties: {}, table: [], profile: { template: 'profile' } }] }));
    const note = { name: 'Alex CV.md', summary: SPAN, body: `${SPAN} [[Areas/Career/Career profile]] [[Areas/Career/Career]]`, typeRow: 'cv' };
    const r = await press(c, {
      synopsis: () => ({ statements: [{ text: SYNOPSIS, parts: [1] }] }),
      pick: { kind: 'cv', destination: { parentId: id('Areas/Career'), name: 'Originals' }, wants: [id(PROFILE), id('Areas/Career/Career.md')] },
      execution: (frame) => caseReply(frame, { kind: 'tidy-intent', v: 1, things: [{ fileId: '$file:Alex CV.txt', to: 'Areas/Career/Originals', name: 'Alex CV.txt', basis: 'Areas/Career/Career.md', note,
        profile: [{ source: '$file:Alex CV.txt', sentence: 1 }] }] }),
    }, { drive, root });
    const original = c.inboxFiles['Alex CV.txt'] ?? '';
    expect(synopses(r), 'the CV got a synopsis that differs from it').toHaveLength(1);
    expect(shownText(r, 'Alex CV.txt', 'execution')).toContain(SYNOPSIS);
    const offered = ((r.calls.find((x) => x.phase === 'execution')?.frame.piles ?? []).flatMap((p) => p.things).find((t) => t.name === 'Alex CV.txt') as { sentences?: Array<{ text: string }> } | undefined)?.sentences ?? [];
    expect(offered[0]?.text, 'sentence 1 is the original\'s first sentence').toBe(SPAN);
    for (const { text } of offered) { expect(original, 'an offered sentence is the original\'s').toContain(text); expect(text).not.toContain(SYNOPSIS); }
    expect(errors()).not.toContain('profile');
    expect(r.after[PROFILE], 'the stored profile holds the original sentence').toContain(`${SPAN} [[Alex CV]]`);
    expect(r.after[PROFILE]).not.toContain(SYNOPSIS);
  });

  it('AC6 b10-synopsis-fabricated (guard): a figure in neither the original nor anything shown is refused as today', async () => {
    const made = JSON.parse(JSON.stringify(TAIL_REPLY).replace(/20 October/g, '23 October')) as unknown;
    const r = await press(await loaded(), { execution: () => made });
    expect(errors()).toContain('a number that is in none of its sources: "23"');
    expect(report(r).filed).toHaveLength(0);
  });

  const TWO = { 'Long A.txt': `${words(3100)}\nFinal terms for A: reply by 14 March 2027.\n`, 'Long B.txt': `${words(3150, 'Alex labels paper trays for the plot today.')}\nFinal terms for B: reply by 23 May 2027.\n` };
  const CLAIMS: Array<[string, RegExp, (doc: string) => string]> = [
    ['a figure only in the other document', /a number that is in none of its sources: "23"/, () => 'Reply by 23 May.'],
    ['a figure only in the synopsis label', /a number that is in none of its sources: "3,?\d{3}"/, (doc) => `The guide runs to ${doc.trim().split(/\s+/).length.toLocaleString('en-US')} words.`],
  ];
  it.each(CLAIMS)('AC6 b10-synopsis-own-original (guard): with two long documents, %s is refused; each note is grounded in its own original only', async (_name, refused, claim) => {
    const r = await press(await loaded(TAIL, TWO), { synopsis: () => ({ statements: [{ text: 'Alex sows seed rows near the shed.', parts: [1] }] }),
      execution: (frame, attempt) => {
        const value = plain(frame) as { things: Array<{ name: string; note?: { body: string } }> };
        if (!attempt) for (const t of value.things) if (t.name === 'Long A.txt' && t.note) t.note.body = `${claim(TWO['Long A.txt'])}\n\nSee also [[Resources/Gardening/Gardening]]: the garden it belongs to.`;
        return value;
      } });
    expect(errors()).toMatch(refused);
    expect(phase(r)).toBe('done');
  });

  it('AC6 b10-synopsis-links-shown-only (guard): a web link only in the unshown original is still refused in a note body; only the number check reads the whole original', async () => {
    const doc = `${words(3100)}\nThe order form is at https://example.com/seed-order-form for Alex.\n`;
    const r = await press(await loaded(TAIL, { 'Long A.txt': doc }), { synopsis: () => ({ statements: [{ text: 'Alex sows seed rows near the shed.', parts: [1] }] }),
      execution: (frame, attempt) => {
        const value = plain(frame) as { things: Array<{ note?: { body: string } }> };
        if (!attempt) for (const t of value.things) if (t.note) t.note.body = 'Order at https://example.com/seed-order-form.\n\nSee also [[Resources/Gardening/Gardening]]: the garden it belongs to.';
        return value;
      } });
    expect(errors()).toContain('(noteWeb)');
    expect(phase(r)).toBe('done');
  });

  it('AC7 b10-synopsis-personal-markdown: a long personal Markdown file is summarised for the planner only; it moves with its exact bytes and gets no note', async () => {
    const c = await loaded('c17-b10-personal-original');
    const original = c.inboxFiles['Field diary.md'] ?? '';
    const withNote = (frame: Frame) => ({ kind: 'tidy-intent', v: 1, things: (frame.piles ?? []).flatMap((p) => p.things).map((t) => ({ fileId: t.fileId, to: 'Resources/Gardening', name: t.name,
      note: { name: 'Field diary summary.md', summary: 'Alex keeps a field diary.', body: 'Alex keeps a field diary.' } })) });
    const r = await press(c, { synopsis: () => ({ statements: [{ text: 'Alex describes labels and tape beside the garden.', parts: [1] }] }),
      execution: (frame, attempt) => attempt ? plain(frame) : withNote(frame) });
    expect(synopses(r), 'one synopsis call for the planner').toHaveLength(1);
    expect(errors(), 'a note for the diary is refused as today').toContain('(noteForNote)');
    expect(r.after['Resources/Gardening/Field diary.md'], 'the diary moves with every byte (CRLF, spaces, emoji)').toBe(original);
    expect(r.after['Resources/Gardening/Field diary summary.md']).toBeUndefined();
    expect(r.after['About me.md']).toBe(c.folder['About me.md']);
    expect(r.after['Rules.md']).toBe(c.folder['Rules.md']);
  });

  it('AC8 b10-synopsis-crash-before-plan: a crash before the plan is saved makes the synopsis again on redispatch, with no preparation checkpoint', async () => {
    const c = await loaded();
    let crash = true;
    const first = await press(c, { synopsis: (s) => VALID(s), selection: () => { if (crash) { crash = false; throw new Error('Made-up crash before the plan.'); } }, execution: () => TAIL_REPLY });
    expect(synopses(first), 'the first attempt made its synopsis').toHaveLength(1);
    const calls: string[] = [];
    const gardening = (await first.drive.listAll(first.root)).find((f) => f.folder && f.name === 'Gardening')?.id ?? '';
    const again: ClaudeSpawn = phaseAwareClaude(async (call, _s, _a, ph) => {
      const frame = JSON.parse(call.input.split('\n').at(-1) ?? '{}') as Frame;
      if (frame.synopsis) { calls.push('synopsis'); return reply(VALID(frame.synopsis)); }
      calls.push(ph);
      if (ph === 'selection') return reply({ items: (frame.sources ?? []).map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: gardening, wants: [] })), asks: [] });
      return reply(caseReply(frame, TAIL_REPLY));
    }, () => ({ drive: first.drive, root: first.root, admission: first.dispatch?.admission ?? null }), true);
    const resumed = await redispatchCase(c, first, 2, { claude: again, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(calls, 'the redispatch prepares again').toEqual(['synopsis', 'selection', 'execution']);
    expect(phase(resumed)).toBe('done');
  });

  it('AC8 b10-synopsis-crash-after-plan (guard): a lost answer after the plan is saved completes on redispatch with no model or synopsis call', async () => {
    const c = await loaded();
    let lost = false;
    const first = await press(c, {}, { around: (next) => async (input, init) => {
      if (lost && url(input).origin === 'https://www.googleapis.com') throw new TypeError('Made-up connection still lost.');
      const response = await next(input, init);
      if (init?.method === 'PATCH' && url(input).searchParams.has('addParents')) { lost = response.ok; throw new TypeError('Made-up lost answer after the move.'); }
      return response;
    } });
    expect(lost, 'main reached the move').toBe(true);
    const model = vi.fn<ClaudeSpawn>(async () => { throw new Error('A redispatch must not call a model.'); });
    const resumed = await redispatchCase(c, first, 2, { claude: model, pacing: { baseMs: 0, sleep: async () => {} } });
    expect(phase(resumed)).toBe('done');
    expect(model).not.toHaveBeenCalled();
  });
});
