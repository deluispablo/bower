/** brain-10: the rules both model calls read are the effective rules, this run's admitted rule lines included (made-up data only). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { serializeRules } from '../../src/data/contracts/rules-format';
import { SYSTEM } from '../../src/data/vault/layout';
import { AT } from './corpus-run';
import { folder, manifest, note, report, run, select, setup, type Base } from './b1-planning-support';

const INVOICE_RULE = 'Invoices always go to Areas/Finance.';
const FINANCE = 'Areas/Finance';
const SENTENCE = 'The effective rules include the admitted additions and removals for this run. Apply this complete set when selecting and filing. If the set is incomplete, do not infer that no rule applies.';
const CUT = /\n\[cut here: \d+ more characters of the rules not shown; the list may go on\]$/;
/** Rules.md as Bower writes it, with these rules in order. */
const rulesMd = (...texts: string[]) => serializeRules(texts.map((text, i) => ({ id: `rule-${i + 1}`, text, since: Date.UTC(2026, 9, 3) })));
const filler = (n: number) => Array.from({ length: n }, (_, i) => `Garden club papers ${i + 1} go to Projects / Garden club.`);

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

/** A folder with a Finance area, `rules` as Rules.md (none when null), one invoice in the inbox and `journal` rule lines. */
async function invoiceFolder(rules: string | null, journal: Array<{ kind: 'rule'; text: string }> = []) {
  return setup({ folder: { ...folder, [`${FINANCE}/Finance.md`]: note('Alex keeps finance records.'), ...(rules === null ? {} : { 'Rules.md': rules }) },
    inbox: [{ line: '', files: ['Invoice.txt'] }], inboxFiles: { 'Invoice.txt': 'Invoice INV-001 from Example Supplies, due 20 October 2026.\n' }, journal });
}
/** The admission after these journal lines are written, as the app writes them. */
async function admittedWith(base: Base, lines: Array<Record<string, string>>): Promise<AdmissionManifest> {
  const changes = base.id(SYSTEM.changes);
  for (const [i, line] of lines.entries()) await base.drive.createText(changes, `${line.id}.json`, `${JSON.stringify({ v: 1, device: 'device-1', at: AT - 30_000 + i, ...line })}\n`);
  const got = await planAdmission(fakeRead(base.drive), base.root, { scope: 'all', clock: () => AT, newId: () => 'rules-admission' });
  expect(got.kind).toBe('manifest');
  return got.kind === 'manifest' ? got.manifest : base.admission;
}
const fileInvoice = (base: Base) => ({ kind: 'tidy-intent', v: 1, things: base.sources.filter((s) => s.name).map((s) => ({ fileId: s.itemId, to: FINANCE, name: s.name,
  note: { name: 'Invoice INV-001.md', summary: 'Invoice INV-001 from Example Supplies.', body: 'Invoice INV-001 from Example Supplies, due 20 October 2026.' } })) });
/** One run filing the invoice in Finance: the rules each call read (selection, execution), the report and the operations. */
async function filed(base: Base, options: Parameters<typeof run>[2] = {}) {
  const result = await run(base, [select(base, [], FINANCE), fileInvoice(base)], options);
  const rules = result.frames.slice(0, 2).map((f) => f.value.rules as string | undefined);
  const ops = manifest(result).operations as Array<{ effect: { kind: string; name?: string; changes?: Array<{ kind: string }> } }>;
  const rulesWrite = ops.some(({ effect: e }) => e.changes?.some((c) => c.kind === 'rules-wording') || (e.kind === 'create-text' && e.name === 'Rules.md'));
  const waiting = (JSON.parse(Object.entries(result.after).find(([p]) => /\/manifest-[^/]+\.json$/.test(p))?.[1] ?? '{}') as { waiting?: Array<{ name: string }> }).waiting ?? [];
  return { result, rules, report: report(result) as ReturnType<typeof report> & { rulesWorded?: number }, rulesWrite, waiting, frames: result.frames };
}

describe('brain-10 AC1 same-run invoice rule reaches both phases', () => {
  it('an admitted rule line is in the rules selection and execution read, and the run files under it', async () => {
    const got = await filed(await invoiceFolder(rulesMd('Receipts go to Areas / Money / Receipts.'), [{ kind: 'rule', text: 'invoices always go to Areas/Finance' }]));
    expect(got.rules[0], 'selection reads the admitted rule').toContain(`- ${INVOICE_RULE}`);
    expect(got.rules[1], 'execution reads the same rules').toBe(got.rules[0]);
    expect(got.rules[0], 'the rules already there stay').toContain('- Receipts go to Areas / Money / Receipts.');
    expect(got.frames[0]?.prompt).toContain(SENTENCE);
    expect(got.report.filed).toHaveLength(1);
    expect(got.report.rulesWorded).toBe(1);
  });
  it('with no Rules.md yet, the admitted rule is read as the Rules.md the run makes', async () => {
    const got = await filed(await invoiceFolder(null, [{ kind: 'rule', text: 'invoices always go to Areas/Finance' }]));
    expect(got.rules[0]).toContain(`- ${INVOICE_RULE}`);
    expect(got.rules[1]).toBe(got.rules[0]);
    expect(got.rulesWrite).toBe(true);
    expect(got.report.filed).toHaveLength(1);
  });
});

describe('brain-10 AC2 removal and undo use existing order', () => {
  it('an admitted removal takes the rule out of what both calls read', async () => {
    const base = await invoiceFolder(rulesMd(INVOICE_RULE, 'Receipts go to Areas / Money / Receipts.'));
    const admission = await admittedWith(base, [{ id: 'change-remove-1', kind: 'rule', what: `Removed the rule "${INVOICE_RULE}"`, path: 'Rules.md', removes: INVOICE_RULE }]);
    const got = await filed(base, { admission });
    expect(got.rules[0]).not.toContain(INVOICE_RULE);
    expect(got.rules[0]).toContain('- Receipts go to Areas / Money / Receipts.');
    expect(got.rules[1]).toBe(got.rules[0]);
  });
  it('a rule and its undo cancel: the rules read are Rules.md as it is', async () => {
    const base = await invoiceFolder(rulesMd('Receipts go to Areas / Money / Receipts.'));
    const admission = await admittedWith(base, [
      { id: 'change-add-1', kind: 'rule', what: 'New rule', path: 'Rules.md', text: 'invoices always go to Areas/Finance' },
      { id: 'change-undo-1', kind: 'rule', what: 'Removed the rule', path: 'Rules.md', removes: 'invoices always go to Areas/Finance', undoes: 'change-add-1' }]);
    const got = await filed(base, { admission });
    expect(got.rules).toEqual([rulesMd('Receipts go to Areas / Money / Receipts.'), rulesMd('Receipts go to Areas / Money / Receipts.')]);
  });
  it('a removal and its undo cancel: the rule stays in what both calls read', async () => {
    const base = await invoiceFolder(rulesMd(INVOICE_RULE));
    const admission = await admittedWith(base, [
      { id: 'change-remove-1', kind: 'rule', what: 'Removed the rule', path: 'Rules.md', removes: INVOICE_RULE },
      { id: 'change-undo-1', kind: 'rule', what: 'New rule', path: 'Rules.md', text: INVOICE_RULE, undoes: 'change-remove-1' }]);
    const got = await filed(base, { admission });
    expect(got.rules).toEqual([rulesMd(INVOICE_RULE), rulesMd(INVOICE_RULE)]);
    expect(got.report.filed).toHaveLength(1);
  });
  it('a rule line written after admission changes neither the rules read nor the plan', async () => {
    const base = await invoiceFolder(rulesMd('Receipts go to Areas / Money / Receipts.'));
    await base.drive.createText(base.id(SYSTEM.changes), 'change-late-1.json',
      `${JSON.stringify({ v: 1, id: 'change-late-1', device: 'device-1', at: AT + 1_000, kind: 'rule', what: 'New rule', path: 'Rules.md', text: 'invoices always go to Areas/Finance' })}\n`);
    const got = await filed(base);
    expect(got.rules).toEqual([rulesMd('Receipts go to Areas / Money / Receipts.'), rulesMd('Receipts go to Areas / Money / Receipts.')]);
    expect(got.rulesWrite).toBe(false);
    expect(got.report.filed).toHaveLength(1);
  });
});

describe('brain-10 AC3 rule beyond old prefix is not silently ignored', () => {
  it('a rule after character 4,000 is supplied to both calls', async () => {
    const text = rulesMd(...filler(100), INVOICE_RULE);
    expect(text.indexOf(INVOICE_RULE)).toBeGreaterThan(4_000);
    const got = await filed(await invoiceFolder(text));
    expect(got.rules[0]).toBe(text);
    expect(got.rules[1]).toBe(text);
    expect(got.report.filed).toHaveLength(1);
  });
  it('rules past their bound are cut, and routing waits visibly instead of filing', async () => {
    const text = rulesMd(...filler(260), INVOICE_RULE);
    const got = await filed(await invoiceFolder(text));
    expect(got.rules[0]).toMatch(CUT);
    expect(got.rules[0]).not.toContain(INVOICE_RULE);
    expect(got.result.code).toBe(0);
    expect(got.report.filed, 'nothing is filed as though no rule existed').toEqual([]);
    expect(got.waiting.map((w) => w.name)).toEqual(['Invoice.txt']);
    expect(Object.values(got.result.pathsById)).toContain('Inbox/Invoice.txt');
  });
});

describe('brain-10 AC4 failed rule persistence holds dependent routing', () => {
  it('a Rules.md changed during the run takes no rule write, and the invoice waits instead of being reported filed', async () => {
    const base = await invoiceFolder(rulesMd('Receipts go to Areas / Money / Receipts.'), [{ kind: 'rule', text: 'invoices always go to Areas/Finance' }]);
    const changed = `${rulesMd('Receipts go to Areas / Money / Receipts.')}- Scans go to Resources.\n`;
    const got = await filed(base, { beforeReply: async (turn) => {
      if (turn !== 2) return;
      const id = base.id('Rules.md');
      await base.drive.writeText(id, changed, (await base.drive.get(id)).modifiedTime);
    } });
    expect(got.result.code).toBe(0);
    expect(got.report.filed, 'not reported filed under the unsaved rule').toEqual([]);
    expect(got.rulesWrite, 'no rule write over the changed file').toBe(false);
    expect(got.report.rulesWorded).toBeUndefined();
    expect(got.result.after['Rules.md']).toBe(changed);
    expect(got.rules[1], 'the call read the rule').toContain(`- ${INVOICE_RULE}`);
    expect(got.waiting.map((w) => w.name)).toEqual(['Invoice.txt']);
    expect(Object.values(got.result.pathsById)).toContain('Inbox/Invoice.txt');
  });
});

describe('brain-10 normal use: rules with no change this run are read and followed as before', () => {
  const rules = rulesMd('Tax papers for 2026 go to Areas/Finance.', 'Step 3: scans dated 2026-10-20 go to Resources.', INVOICE_RULE);
  it('no rule line: the rules read are Rules.md as it is, and the invoice is filed', async () => {
    const got = await filed(await invoiceFolder(rules));
    expect(got.rules).toEqual([rules, rules]);
    expect(got.report.filed).toHaveLength(1);
    expect(got.waiting).toEqual([]);
  });
  it('a rule line already in Rules.md: nothing changes, and the invoice is filed', async () => {
    const got = await filed(await invoiceFolder(rules, [{ kind: 'rule', text: INVOICE_RULE }]));
    expect(got.rules).toEqual([rules, rules]);
    expect(got.report.filed).toHaveLength(1);
    expect(got.waiting).toEqual([]);
  });
});
