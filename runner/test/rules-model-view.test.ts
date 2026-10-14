import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { empty, folder, run, select, setup } from './b1-planning-support';
import { applyChanges } from '../../src/data/contracts/note-edit';

// rules-added-region-model (TL-P4-53 Q7): the model sees the person's rules prose first, then the rules added in
// Bower, as one projection bounded at today's 4,000 units with the rules' marked cut. No region: today's input.
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

const PROSE = 'My rules for Bower.\n\n## Rules\n\n- Garden club papers go to Projects / Garden club.\n';
/** A region's payload as the writer leaves it (`note-edit.ts` wordRules): its `## Rules` heading, a blank line, the rules. */
const RULE = '## Rules\n\n- Receipts go to Areas / Money / Receipts. <!-- since 2026-10-03 -->\n  *You wrote: "receipts in money"*\n';
/** Rules.md as the app writes it (`note-edit.ts` wordRules): the original bytes, then the marked region at the end. */
const withRegion = (prose: string, payload: string, eol = '\n', after = '') =>
  `${prose}${eol}## Rules added in Bower${eol}<!-- bower:ownership/2 begin rules-added -->${eol}${payload}<!-- bower:ownership/2 end rules-added -->${eol}${after}`;
/** What the projection shows: the person's prose byte for byte, then the region's rules under its heading. */
const shownAs = (prose: string, payload: string, eol = '\n') => `${prose}${prose ? eol : ''}## Rules added in Bower${eol}${payload}`;
const CUT = (n: number) => `[cut here: ${n} more characters of the rules not shown; the list may go on]`;

/** The `rules` value both model calls receive (selection and execution share one prepared input), or undefined. */
async function shown(rules: string | null, reply: Record<string, unknown> = empty) {
  const base = await setup({ folder: { ...folder, ...(rules === null ? {} : { 'Rules.md': rules }) } });
  const result = await run(base, [select(base, []), reply]);
  const values = result.frames.slice(0, 2).map((f) => f.value.rules as string | undefined);
  expect(values[0], 'selection and execution see the same rules').toBe(values[1]);
  return { rules: values[1], result, base };
}

it('AC1 guard: with no region the model sees the file as today (plain, legacy Bower-owned, invalid marks)', async () => {
  expect((await shown(PROSE)).rules).toBe(PROSE);
  const legacy = '---\nsummary: 1 rule Bower follows in every tidy-up.\nby: bower\nkind: Rules\n---\n\n## Rules\n\n- Receipts go to Areas / Money / Receipts.\n';
  expect((await shown(legacy)).rules).toBe(legacy);
  const broken = `${PROSE}\n## Rules added in Bower\n<!-- bower:ownership/2 begin rules-added -->\n${RULE}`;
  expect((await shown(broken)).rules, 'unreadable marks: the raw text, as today').toBe(broken);
  expect((await shown(null)).rules, 'no Rules.md: no rules key').toBeUndefined();
});

it('AC2 rules-model-region-second: prose first, then the rules added in Bower, without the region marks', async () => {
  expect((await shown(withRegion(PROSE, RULE))).rules).toBe(shownAs(PROSE, RULE));
});

it('AC2 rules-model-crlf: a CRLF file keeps its line ends in both parts', async () => {
  const prose = PROSE.replaceAll('\n', '\r\n');
  const rule = RULE.replaceAll('\n', '\r\n');
  expect((await shown(withRegion(prose, rule, '\r\n'))).rules).toBe(shownAs(prose, rule, '\r\n'));
});

it('AC2 rules-model-no-final-newline: prose without a final newline is shown byte for byte', async () => {
  const prose = PROSE.trimEnd();
  expect((await shown(withRegion(prose, RULE))).rules).toBe(shownAs(prose, RULE));
});

it('AC3 rules-model-empty-region: an empty region leaves the input byte-identical to the prose alone', async () => {
  const alone = (await shown(PROSE)).result.frames[1]?.call.input;
  const region = (await shown(withRegion(PROSE, ''))).result.frames[1]?.call.input;
  expect(region, 'the whole execution input is byte-identical').toBe(alone);
});

it('AC3 rules-model-heading-only-region: a region holding only its `## Rules` heading counts as empty (R11)', async () => {
  const alone = (await shown(PROSE)).result.frames[1]?.call.input;
  for (const payload of ['## Rules\n\n', '## Rules\n', '\n']) {
    expect((await shown(withRegion(PROSE, payload))).result.frames[1]?.call.input, JSON.stringify(payload)).toBe(alone);
  }
});

it('AC3 rules-model-add-then-remove: the writer\'s add then remove of the last rule restores the input byte for byte (R11)', async () => {
  const enc = (text: string) => new TextEncoder().encode(text);
  const added = applyChanges(enc(PROSE), [{ kind: 'rules-wording', add: [{ recordId: 'add-1', text: 'Receipts go to Areas / Money / Receipts.', yourWords: 'receipts in money', since: Date.UTC(2026, 9, 3) }], remove: [] }]);
  expect(added.ok, 'the writer adds the region').toBe(true);
  if (!added.ok) return;
  const removed = applyChanges(added.bytes, [{ kind: 'rules-wording', add: [], remove: [{ recordId: 'remove-1', text: 'Receipts go to Areas / Money / Receipts.', since: Date.UTC(2026, 9, 4) }] }]);
  expect(removed.ok, 'the writer removes the last rule').toBe(true);
  if (!removed.ok) return;
  expect(removed.text, 'the region stays, holding only its heading').toContain('<!-- bower:ownership/2 begin rules-added -->');
  const alone = (await shown(PROSE)).result.frames[1]?.call.input;
  expect((await shown(added.text)).rules, 'with the rule: prose, then the region').toBe(shownAs(PROSE, added.text.slice(added.text.indexOf('-->\n') + 4, added.text.lastIndexOf('<!-- bower:ownership/2 end'))));
  expect((await shown(removed.text)).result.frames[1]?.call.input, 'after the last remove: byte-identical to the prose alone').toBe(alone);
});

it('AC3 rules-model-both-empty: empty prose and an empty region show what an empty Rules.md shows', async () => {
  const empty = await shown('');
  const both = await shown(withRegion('', ''));
  expect(both.rules).toBe(empty.rules);
  expect(both.result.frames[1]?.call.input).toBe(empty.result.frames[1]?.call.input);
});

it('AC3 rules-model-empty-prose: with no prose the region\'s rules are shown alone under their heading', async () => {
  expect((await shown(withRegion('', RULE))).rules).toBe(shownAs('', RULE));
});

it('AC4 rules-model-trailing-prose: words the person typed after the region are prose, shown before the region', async () => {
  const after = 'A note I added later.\n';
  expect((await shown(withRegion(PROSE, RULE, '\n', after))).rules).toBe(shownAs(`${PROSE}${after}`, RULE));
});

it('AC5 rules-model-bound-exact: a projection of exactly 4,000 units is shown whole; 4,001 is cut within 4,000', async () => {
  const fill = (projected: number) => {
    const head = shownAs('', RULE).length + 1; // the prose's eol before the heading
    return `${'r'.repeat(projected - head - 1)}\n`;
  };
  for (const size of [4_000, 4_001]) {
    const prose = fill(size);
    const want = shownAs(prose, RULE);
    expect(want).toHaveLength(size);
    const { rules } = await shown(withRegion(prose, RULE));
    if (size === 4_000) expect(rules, 'exactly 4,000 units: whole, no cut (the raw file is longer)').toBe(want);
    else {
      expect(rules?.length).toBeLessThanOrEqual(4_000);
      const shownPart = rules?.slice(0, rules.indexOf('\n[cut here:')) ?? '';
      expect(want.startsWith(shownPart)).toBe(true);
      expect(rules?.endsWith(`\n${CUT(size - shownPart.length)}`), 'the rules-specific marker counts what the projection left out').toBe(true);
    }
  }
});

it('AC5 rules-model-cut-within-bound: the rules-specific marker fits inside the 4,000 units; exactly 4,000 is whole', async () => {
  expect((await shown('r'.repeat(4_000))).rules, 'exactly 4,000 units with no region: whole, as today').toBe('r'.repeat(4_000));
  for (const size of [4_001, 4_100, 12_000]) {
    const { rules } = await shown('r'.repeat(size));
    expect(rules?.length, `${size} units: the shown value, marker included, is within 4,000`).toBeLessThanOrEqual(4_000);
    const kept = rules?.indexOf('\n[cut here:') ?? -1;
    expect(rules?.slice(kept + 1)).toBe(CUT(size - kept));
  }
});

it('AC5 rules-model-original-first: a long original keeps its place; the region is cut, never the original\'s start', async () => {
  const prose = `${'- Keep garden notes together under Resources / Garden.\n'.repeat(80)}`;
  const { rules } = await shown(withRegion(prose, RULE));
  expect(rules?.startsWith(prose.slice(0, 3_000))).toBe(true);
  expect(rules).not.toContain('Receipts go to Areas');
  expect(rules).not.toContain('bower:ownership');
  expect(rules).toMatch(/\[cut here: \d+ more characters of the rules not shown; the list may go on\]$/);
});

it('AC6 guard rules-model-units: 4,000 two-byte characters are 4,000 units, shown whole', async () => {
  const prose = '\u00e9'.repeat(4_000);
  expect((await shown(prose)).rules).toBe(prose);
});

const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const SPROUT = '\u{1F331}';
/**
 * One two-unit character at every offset across the window where a 4,000- or 12,000-unit cut can fall, both parities:
 * whatever slack the marker leaves, one offset puts the cut between its two units (R12).
 */
async function sweep(window: [number, number], shownPart: (lead: number) => Promise<string | undefined>) {
  let straddled = 0;
  for (let lead = window[0]; lead <= window[1]; lead++) {
    const value = await shownPart(lead) ?? '';
    const kept = value.slice(0, value.indexOf('\n[cut here:'));
    expect(value, `lead ${lead}: a marked cut`).toContain('\n[cut here:');
    expect(LONE.test(value), `lead ${lead}: no half character`).toBe(false);
    if (kept.length === lead) straddled++;
  }
  expect(straddled, 'some offset put the cut inside the character, and the cut moved back before it').toBeGreaterThan(0);
}

it('AC6 rules-model-code-point-cut: the rules cut never splits a character made of two units (R5, R12)', async () => {
  await sweep([3_880, 3_960], async (lead) => (await shown(`${'a'.repeat(lead)}${SPROUT}${'b'.repeat(400)}\n`)).rules);
});

it('AC6 rules-model-code-point-cut-default-marker: a field with the generic marker never splits one either (R5, R12)', async () => {
  await sweep([11_880, 11_960], async (lead) => {
    const base = await setup({ folder: { ...folder }, inboxFiles: { 'Offer.txt': `${'a'.repeat(lead)}${SPROUT}${'b'.repeat(400)}\n` } });
    const result = await run(base, [select(base, []), empty]);
    const piles = result.frames[1]?.value.piles as Array<{ things: Array<{ text: string | null }> }> | undefined;
    return piles?.[0]?.things[0]?.text ?? undefined;
  });
});

function newProject(base: Awaited<ReturnType<typeof setup>>, basis: string) {
  return { ...empty, things: base.sources.filter((s) => s.name).map((s) => ({ fileId: s.itemId, to: 'Projects/Garden club', name: s.name, basis,
    note: { name: 'Garden club offer.md', summary: 'Alex received a remote developer offer.', body: 'Alex received a remote developer offer.' } })) };
}
async function basisCalls(rules: string, basis: string) {
  const base = await setup({ folder: { ...folder, 'Rules.md': rules } });
  const reply = newProject(base, basis);
  const selection = { items: base.sources.map((s) => ({ itemId: s.itemId, kind: 'unknown', destination: { parentId: base.id('Projects'), name: 'Garden club' }, wants: [] })), asks: [] };
  const result = await run(base, [selection, reply]);
  return result.frames.length;
}

it('AC7 rules-model-basis: a whole region rule is a basis; its heading, a mark line or a cut rule are not', async () => {
  const rules = withRegion(PROSE, RULE);
  expect(await basisCalls(rules, 'Garden club papers go to Projects / Garden club.'), 'a whole prose rule, as today').toBe(2);
  expect(await basisCalls(rules, '- Receipts go to Areas / Money / Receipts.'), 'a whole region rule is a shown line').toBe(2);
  expect(await basisCalls(rules, '## Rules added in Bower'), 'the generated heading is no rule').toBe(3);
  expect(await basisCalls(rules, 'Rules added in Bower'), 'nor its words').toBe(3);
  expect(await basisCalls(rules, '<!-- bower:ownership/2 begin rules-added -->'), 'a mark is not shown').toBe(3);
  const long = withRegion('- Keep garden notes together under Resources / Garden.\n'.repeat(80), RULE);
  expect(await basisCalls(long, 'Receipts go to Areas / Money / Receipts.'), 'a region rule the cut hid is no basis').toBe(3);
});
