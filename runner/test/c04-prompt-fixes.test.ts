/**
 * Prompt fixes from the live offer-and-flat runs (TL-P4-08 addendum 5, `c04-prompt-fixes`): a number the model writes
 * must be in its sources, a raw file name is replaced by a plain one, the kinds table describes an area and names no
 * ready-made folder, and the offer-and-flat rubric accepts the photo ask and any money area. No live call.
 */
import { phaseAwareClaude } from './b1-planning-support';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClaudeCall, ClaudeSpawn } from '../src/claude';
import { loadCorpus, score, type LoadedCase } from '../src/corpus';
import { dataOf, promptOf, runScripted, runWithClaude, splitPrompt } from './corpus-run';

const ROOT = resolve(import.meta.dirname, '../../testing/corpus');

afterEach(() => vi.restoreAllMocks());

interface Context { piles: Array<{ pileId: string; words: string; things: Array<{ fileId: string; name: string }> }> }
const contextOf = (input: string): Context => dataOf<Context>(input);
const envelope = (result: unknown): string => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, duration_api_ms: 900, num_turns: 1, result: JSON.stringify(result), usage: { input_tokens: 10, output_tokens: 10 } });

async function offerAndFlat(): Promise<LoadedCase> {
  const c = (await loadCorpus(ROOT)).find((x) => x.id === 'c04-offer-and-flat');
  if (!c) throw new Error('no corpus case c04-offer-and-flat');
  return c;
}

type Id = (name: string) => string;
interface Overrides { body?: string; summary?: string; offerName?: string; line?: string; payslipName?: string }

/** A reply that files the pile; `with` changes the offer's note, its name, a Timeline line or the payslip's name. */
function reply(id: Id, over: Overrides = {}): unknown {
  return {
    kind: 'tidy-intent',
    v: 1,
    things: [
      { fileId: id('Offer_letter_final(2).pdf'), to: 'Projects/Job hunt', name: over.offerName ?? 'Offer, Industrial Designer, Ferrowick.pdf', note: { name: 'Industrial Designer, Ferrowick.md', summary: over.summary ?? 'An offer from Ferrowick.', body: over.body ?? 'Industrial designer, fully remote, 42,000 a year, start 2 November.' } },
      { fileId: id('listing-88213.example.url'), to: 'Projects/Flat hunt', name: 'Flat 9, Wrenfield Road.md' },
      { fileId: id('IMG_2301.jpg'), to: 'Projects/Flat hunt', name: 'Wrenfield Road, kitchen.jpg' },
      { fileId: id('Payslip_Aug.pdf'), to: 'Resources/Pay', name: over.payslipName ?? 'Payslip August.pdf', note: { name: 'Payslip, August.md', summary: 'A payslip for August.', body: 'Payslip for August.' } },
    ],
    ...(over.line ? { lines: [{ note: 'Projects/Job hunt/Job hunt.md', text: over.line, cites: id('Offer_letter_final(2).pdf') }] } : {}),
  };
}

/** The array observes execution validation; the helper separately answers selection. */
function answering(replies: Array<(id: Id) => unknown>, calls: ClaudeCall[] = []): ClaudeSpawn {
  return phaseAwareClaude(async (call, _step, attempt, phase) => {
    if (phase === 'execution') calls.push({ ...call, input: promptOf(call) });
    const ids = new Map(contextOf(call.input).piles.flatMap((p) => p.things).map((t) => [t.name, t.fileId]));
    const make = replies[phase === 'selection' ? replies.length - 1 : Math.min(attempt, replies.length - 1)] ?? ((): unknown => '');
    return { code: 0, stderr: '', cut: null, stdout: envelope(make((name) => ids.get(name) ?? `no ${name}`)) };
  });
}

describe('c04 prompt fixes (TL-P4-08 addendum 5)', () => {
  it('a number not found in its sources is refused and retried once', async () => {
    const c = await offerAndFlat();
    // The run-3 miss: "the 30-minute commute limit" is in no input. Refused for the number, then the pile is filed.
    const calls: ClaudeCall[] = [];
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = await runWithClaude(c, answering([(id) => reply(id, { body: 'Fully remote, 42,000 a year. Keep to the 30-minute commute limit.' }), (id) => reply(id)], calls));
    expect(calls).toHaveLength(2);
    expect(calls[1]?.input).toMatch(/Your reply was refused: .*"30".*Reply again/);
    expect(errors.mock.calls.map((a) => a.map(String).join(' ')).some((l) => l.includes('(numbers)') && /asking once more/.test(l))).toBe(true);
    expect({ code: run.code, filed: 'Projects/Flat hunt/Wrenfield Road, kitchen.jpg' in run.after }).toEqual({ code: 0, filed: true });

    // A second ungrounded number holds the one pile it is in (plan-partial); with no other pile to file, the run ends and nothing is filed.
    const twice = await runWithClaude(c, answering([(id) => reply(id, { summary: 'A 30-day notice.' })]));
    expect('Projects/Job hunt/Offer, Industrial Designer, Ferrowick.pdf' in twice.after).toBe(false);

    // Numbers in the thing's text (42,000 as 42000, "2 November" as a date), the pile's words and a shown note pass; so does a Timeline line.
    for (const over of [
      { body: 'Salary 42000 a year, start on 2 November.' },
      { body: 'Salary 42,000 a year.\nRemote.\nStart 2 November.' },
      { summary: 'Offer from Ferrowick, 2 November start.', line: 'Offer of 42,000 a year, dated after the 2026-09-28 start of the hunt.' },
    ] satisfies Overrides[]) {
      const ok: ClaudeCall[] = [];
      const passed = await runWithClaude(c, answering([(id) => reply(id, over)], ok));
      expect({ over, calls: ok.length, code: passed.code }).toEqual({ over, calls: 1, code: 0 });
    }
    // A line citing the offer with a figure the offer does not have is refused too.
    const bad: ClaudeCall[] = [];
    await runWithClaude(c, answering([(id) => reply(id, { line: 'Offer scored 7 out of 10 against your CV.' }), (id) => reply(id)], bad));
    expect(bad).toHaveLength(2);
  });

  it('a raw file name is replaced by a plain name', async () => {
    const c = await offerAndFlat();
    const calls: ClaudeCall[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The run-1 miss: the offer kept as "Offer_letter_final(2).pdf". The prompt states the rule, and a name that keeps it is refused once.
    const run = await runWithClaude(c, answering([(id) => reply(id, { offerName: 'Offer_letter_final(2).pdf' }), (id) => reply(id)], calls));
    const prompt = calls[0]?.input ?? '';
    expect(prompt).toMatch(/underscores/);
    expect(prompt).toMatch(/copy\s+number such as "\(2\)"/);
    expect(prompt).toMatch(/"final"/);
    expect(prompt).toMatch(/IMG_1234, DSC_0012, scan0001/);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.input).toMatch(/Your reply was refused: .*name.*Reply again/);
    expect({ code: run.code, plain: 'Projects/Job hunt/Offer, Industrial Designer, Ferrowick.pdf' in run.after, raw: Object.keys(run.after).some((p) => /Offer_letter/.test(p)) }).toEqual({ code: 0, plain: true, raw: false });
    // Plain names that only look like raw ones pass at once.
    for (const name of ['Final offer.pdf', 'Quarter-final tickets.pdf', 'Tax return (2025).pdf', 'Photo 1 of the offer.pdf']) {
      const plain: ClaudeCall[] = [];
      await runWithClaude(c, answering([(id) => reply(id, { offerName: name })], plain));
      expect({ name, calls: plain.length, why: plain[1]?.input.match(/refused: [^\n]*/)?.[0] }).toEqual({ name, calls: 1, why: undefined });
    }
    // More raw shapes: "_final", "-final", "final(2)" as a token.
    for (const name of ['Offer-final.pdf', 'Offer final(2).pdf', 'Offer FINAL.pdf', 'Offer_final.pdf']) {
      const raw: ClaudeCall[] = [];
      await runWithClaude(c, answering([(id) => reply(id, { offerName: name }), (id) => reply(id)], raw));
      expect({ name, calls: raw.length }).toEqual({ name, calls: 2 });
    }
    // A camera id and a scanner id are raw too.
    for (const name of ['IMG_2301.jpg', 'DSC0012.jpg', 'scan0001.jpg']) {
      const raw: ClaudeCall[] = [];
      await runWithClaude(c, answering([(id) => ({ ...(reply(id) as object), things: (reply(id) as { things: Array<Record<string, unknown>> }).things.map((t) => (t.fileId === id('IMG_2301.jpg') ? { ...t, name } : t)) }), (id) => reply(id)], raw));
      expect({ name, calls: raw.length }).toEqual({ name, calls: 2 });
    }
  });

  it('the prompt holds no corpus answer name', async () => {
    const c = await offerAndFlat();
    const calls: ClaudeCall[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await runWithClaude(c, answering([(id) => reply(id)], calls));
    const prompt = splitPrompt(calls[0]?.input ?? '').instructions;
    // Every place a case expects something to land (not the inbox, not Bower's own files): its stem, and each capitalised word of a stem written with a wildcard.
    const paths = (v: unknown): string[] => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(paths) : []);
    const stems = new Set<string>();
    for (const dir of readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      let expected: unknown;
      try { expected = JSON.parse(readFileSync(resolve(ROOT, dir.name, 'expected.json'), 'utf8')); } catch { continue; }
      for (const path of paths(expected).filter((p) => /^(Projects|Areas|Resources|Archive)\//.test(p))) {
        const stem = basename(path).replace(/\.[A-Za-z0-9]{1,5}$/, '');
        if (!stem.includes('*')) { if (stem.length > 3) stems.add(stem); continue; }
        for (const word of stem.split('*').filter((w) => /^[A-Z][a-z]{3,}/.test(w))) stems.add(word);
      }
    }
    expect(stems.size).toBeGreaterThan(5);
    expect([...stems].filter((s) => prompt.includes(s))).toEqual([]);
  });

  it('the kinds table names no ready-made folder', async () => {
    const c = await offerAndFlat();
    const calls: ClaudeCall[] = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await runWithClaude(c, answering([(id) => reply(id)], calls));
    const prompt = calls[0]?.input ?? '';
    const table = prompt.slice(prompt.indexOf('Kinds of document'), prompt.indexOf('A kind not listed'));
    expect(table.length).toBeGreaterThan(100);
    expect(table).toMatch(/payslip: the person's money area/);
    // No folder a model could copy: not "Areas, money", not the pay and tax example, not the hunts' names.
    for (const folder of [/Areas,/, /Areas\//, /pay and tax/i, /job hunt/i, /flat hunt/i, /Projects,/, /Resources,/]) expect({ folder: String(folder), found: folder.test(table) }).toEqual({ folder: String(folder), found: false });
    // The responsibility example is a phrase, not the name of a folder the table describes.
    expect(prompt).not.toMatch(/such as\s+"pay and tax records"/);
  });

  it('the offer-and-flat rubric accepts the photo ask and a money area', async () => {
    const c = await offerAndFlat();
    const run = await runScripted(c);
    const base = { expected: c.expected, before: c.folder, lastRun: run.lastRun };
    expect(score({ ...base, after: run.after })).toEqual({ pass: true, unmet: [] });

    const photo = Object.keys(run.after).find((p) => p.endsWith('kitchen.jpg')) ?? '';
    const payslip = Object.keys(run.after).find((p) => /ayslip/.test(p)) ?? '';
    expect([photo, payslip].every(Boolean)).toBe(true);
    const move = (after: Record<string, string>, from: string, to: string): Record<string, string> => {
      const { [from]: text, ...rest } = after;
      return { ...rest, [to]: text ?? '' };
    };
    const report = (lastRun: unknown, change: (r: Record<string, unknown>) => void): unknown => {
      const copy = JSON.parse(JSON.stringify(lastRun)) as { run: { report: Record<string, unknown> } };
      change(copy.run.report);
      return copy;
    };

    // The unread photo whose name says nothing is asked about: it stays in the inbox, one question, the rest filed.
    const asked = report(run.lastRun, (r) => {
      r.filed = (r.filed as unknown[]).slice(1);
      r.questions = [{ id: 'q-ask-f-4', text: 'Is the kitchen photo from the Wrenfield Road viewing?', yes: 'Yes', no: 'No', askedAt: 0 }];
    });
    expect(score({ ...base, lastRun: asked, after: move(run.after, photo, 'Inbox/Job offer and a flat near it/IMG_2301.jpg') })).toEqual({ pass: true, unmet: [] });

    // Any Area named for money, pay or finance takes the payslip; the listing note needs no address.
    for (const area of ['Areas/Pay and tax records', 'Areas/Finance', 'Areas/Money/Payslips', 'Areas/Pay']) {
      expect({ area, ...score({ ...base, after: move(run.after, payslip, `${area}/Payslip August.pdf`) }) }).toEqual({ area, pass: true, unmet: [] });
    }
    // Beyond money, pay or finance is refused: a tax or salary area is not named for it.
    for (const area of ['Areas/Taxes', 'Areas/Salary', 'Areas/Income']) expect({ area, pass: score({ ...base, after: move(run.after, payslip, `${area}/Payslip August.pdf`) }).pass }).toEqual({ area, pass: false });
    // Still refused: the payslip in a project, or the offer filed under the flat hunt.
    expect(score({ ...base, after: move(run.after, payslip, 'Projects/Job hunt/Payslip August.pdf') }).pass).toBe(false);
    const offer = Object.keys(run.after).find((p) => p.endsWith('Ferrowick.pdf')) ?? '';
    expect(score({ ...base, after: move(run.after, offer, 'Projects/Flat hunt/Offer.pdf') }).pass).toBe(false);
  });
});
