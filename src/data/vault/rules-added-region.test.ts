import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyChanges, EDIT_FILE_LIMIT } from '../contracts/note-edit';
import type { Change, RuleAdd } from '../contracts/run-manifest';
import { FakeDrive } from '../drive/fake-drive';
import { seedFakeDrive } from '../fake/seed';
import { BowerError } from '../types';
import { tidyUp } from '@/testing/tidy-up';
import { DriveVault } from './drive-vault';
import { parseOwnership } from './ownership-format';
import { parseRules, RULES_TEMPLATE } from './rules-format';

const withoutStamp = (props?: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(props ?? {}).filter(([key]) => key !== 'bowerOp'));

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const decode = (bytes: Uint8Array): string => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
const BEGIN = '<!-- bower:ownership/2 begin rules-added -->';
const END = '<!-- bower:ownership/2 end rules-added -->';
const text = 'Keep receipts together.';
const added: RuleAdd = { recordId: 'rule-alex-1', text, yourWords: 'receipts together', since: Date.UTC(2026, 9, 13) };
const word = (add: RuleAdd[] = [added], remove: string[] = []): Change => ({
  kind: 'rules-wording', add, remove: remove.map((text) => ({ recordId: 'remove-alex-1', text })),
});
const payload = `## Rules\n\n- ${text} <!-- since 2026-10-13 -->\n  *You wrote: "receipts together"*\n`;
const region = `## Rules added in Bower\n${BEGIN}\n${payload}${END}\n`;
const original = '---\nsummary: 1 rule Bower follows in every tidy-up.\ncontact: you@example.com\n---\nAlex keeps café and e\u0301.\n## Rules\n- Keep receipts together.\n';
const variants = ['\n', '\r\n'].flatMap((eol) => [false, true].flatMap((bom) => [false, true].map((final) => ({
  label: `${eol === '\n' ? 'LF' : 'CRLF'}, ${bom ? 'BOM' : 'no BOM'}, ${final ? 'final newline' : 'no final newline'}`,
  eol, prefix: `${bom ? '\ufeff' : ''}${(final ? original : original.slice(0, -1)).replace(/\n/g, eol)}`,
}))));

async function fixture(contents: string, managed = false) {
  const drive = new FakeDrive();
  const root = (await seedFakeDrive(drive, 'default', Date.now())) ?? '';
  const file = (await drive.listAll(root)).find((f) => f.name === 'Rules.md' && f.parents.includes(root));
  if (!file) throw new Error('Missing seeded Rules.md');
  await drive.writeText(file.id, contents, file.modifiedTime);
  if (!managed) await drive.update(file.id, { appProperties: Object.fromEntries(Object.keys(file.appProperties ?? {}).map((key) => [key, null])) });
  const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
  return { drive, root, vault, id: file.id };
}

// Read the public ownership payload, so these tests do not invent a second marker parser.
function regionRules(contents: string) {
  const bytes = encode(contents);
  const own = parseOwnership(bytes);
  const payloads = 'payloads' in own ? own.payloads as Readonly<Record<string, { start: number; end: number }>> | undefined : undefined;
  const span = payloads?.['rules-added'];
  expect.soft(own.status).not.toBe('invalid');
  expect.soft(span, 'rules-added ownership payload').toBeDefined();
  return span ? parseRules(decode(bytes.subarray(span.start, span.end))) : [];
}

beforeEach(() => {
  localStorage.clear();
  vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('rules-added-region', () => {
  it('R15 red: Drive-property-only ownership lists rules but refuses wording; an existing region keeps R9', async () => {
    for (const { prefix, eol, label } of variants) {
      for (const hasRegion of [false, true]) {
        const before = prefix + (hasRegion ? eol + region.replaceAll(text, 'Name scans by date.').replace(/\n/g, eol) : '');
        const { drive, root, vault, id } = await fixture(before);
        await drive.update(id, { appProperties: { by: 'bower' } });
        const expectedText = hasRegion ? 'Name scans by date.' : text;
        expect.soft(await vault.rules(), `${label}, region=${hasRegion}`).toEqual([expect.objectContaining({ text: expectedText })]);
        const pending = await vault.addRule('Keep invoices by month.');
        const metadata = await drive.get(id);
        const errors = vi.spyOn(console, 'error');
        try {
          expect((await tidyUp(drive, root)).phase).toBe('done');
          if (!hasRegion) {
            expect.soft(errors, `${label}: one diagnostic`).toHaveBeenCalledTimes(1);
            expect.soft(errors, `${label}: diagnostic details`).toHaveBeenCalledWith(expect.any(BowerError), expect.stringMatching(/\S/));
          }
        } finally {
          errors.mockRestore();
        }
        const after = await drive.readText(id);
        if (hasRegion) {
          expect.soft(after.slice(0, prefix.length), label).toBe(prefix);
          expect.soft(regionRules(after).map((r) => r.text), label).toEqual(['Keep invoices by month.', expectedText]);
        } else {
          expect.soft(await drive.readBytes(id), `${label}: no write`).toEqual(encode(before));
          expect.soft(await drive.get(id), `${label}: no metadata write`).toEqual(metadata);
        }
        expect.soft((await drive.get(id)).appProperties?.by, label).toBe('bower');
        await vault.refresh();
        expect.soft(await vault.rules(), label).toEqual([
          expect.objectContaining(hasRegion
            ? { text: 'Keep invoices by month.', yourWords: 'Keep invoices by month.' }
            : { id: pending.id, text: 'Keep invoices by month.', pending: true }),
          expect.objectContaining({ text: expectedText }),
        ]);
        expect.soft((await vault.rules()).some((r) => r.pending), label).toBe(!hasRegion);
        vault.dispose();
      }
    }
  });

  it('R16 red: damaged regions list only pending rules with one diagnostic, preserve consent and never write until readable', async () => {
    const consent = 'Keep invoices by month.';
    for (const { prefix, eol, label } of variants) {
      for (const damage of ['broken marks', 'unfinished trailing fence'] as const) {
        const readable = prefix + eol + region.replace(/\n/g, eol);
        const damaged = damage === 'broken marks' ? readable.replace(END, '<!-- bower:ownership/2 end rules-added')
          : readable + `${eol}\`\`\`md${eol}Personal unfinished fence.`;
        const { drive, root, vault, id } = await fixture(damaged);
        const before = await drive.get(id);
        const errors = vi.spyOn(console, 'error');
        try {
          expect.soft(await vault.rules(), `${label}, ${damage}: listing`).toEqual([]);
          const pending = await vault.addRule(consent).catch((error: unknown) => error);
          expect.soft(pending, `${label}, ${damage}: consent recorded`).toMatchObject({ text: consent, pending: true });
          expect.soft(await vault.changes(), `${label}, ${damage}: journal record`).toContainEqual(expect.objectContaining({ kind: 'rule', what: `New rule: "${consent}"`, path: 'Rules.md' }));
          expect.soft(await vault.rules(), `${label}, ${damage}: pending only`).toEqual([expect.objectContaining({ text: consent, pending: true })]);
          expect.soft(errors, `${label}, ${damage}: one diagnostic`).toHaveBeenCalledTimes(1);
          expect.soft(errors, `${label}, ${damage}: diagnostic details`).toHaveBeenCalledWith(expect.any(BowerError), expect.stringMatching(/\S/));
        } finally {
          errors.mockRestore();
        }
        expect((await tidyUp(drive, root)).phase).toBe('done');
        expect.soft(await drive.readBytes(id), `${label}, ${damage}: no write`).toEqual(encode(damaged));
        expect.soft(await drive.get(id), `${label}, ${damage}: no metadata write`).toEqual(before);
        await vault.refresh();
        expect.soft(await vault.rules(), `${label}, ${damage}: consent survives tidy-up`).toEqual([expect.objectContaining({ text: consent, pending: true })]);
        await drive.writeText(id, readable, (await drive.get(id)).modifiedTime);
        const inbox = (await drive.listAll(root)).find((f) => f.name === 'Inbox' && f.parents.includes(root));
        if (!inbox) throw new Error('Missing seeded Inbox');
        await drive.createText(inbox.id, 'Recovery receipt.txt', 'A made-up receipt for the recovery tidy-up.');
        expect((await tidyUp(drive, root)).phase).toBe('done');
        await vault.refresh();
        expect.soft(await vault.rules(), `${label}, ${damage}: next readable file applies consent`).toEqual([
          expect.objectContaining({ text: consent, yourWords: consent }),
          expect.objectContaining({ text, yourWords: 'receipts together' }),
        ]);
        expect.soft((await vault.rules()).some((r) => r.pending), `${label}, ${damage}: no pending rule after recovery`).toBe(false);
        vault.dispose();
      }
    }
  });

  it('R8 red: any second root Rules.md file blocks wording, but a folder does not', async () => {
    for (const kind of ['personal', 'bower', 'managed-first', 'folder'] as const) {
      const first = kind === 'managed-first' ? RULES_TEMPLATE.text : original;
      const { drive, root, vault, id } = await fixture(first, kind === 'managed-first');
      const twin = kind === 'folder' ? await drive.createFolder(root, 'Rules.md')
        : await drive.createText(root, 'Rules.md', kind === 'bower' ? RULES_TEMPLATE.text : original,
          kind === 'bower' ? RULES_TEMPLATE.appProperties : undefined);
      const before = await Promise.all([drive.get(id), drive.get(twin.id)]);
      const pending = await vault.addRule('scans by date');
      const errors = vi.spyOn(console, 'error');
      try {
        expect((await tidyUp(drive, root)).phase).toBe('done');
        if (kind !== 'folder') expect.soft(errors, kind).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Bower could not word some of your rules; they wait for the next tidy-up.' }), expect.any(String));
      } finally {
        errors.mockRestore();
      }
      if (kind === 'folder') {
        expect.soft(await drive.readText(id), kind).toContain('## Rules added in Bower');
        expect.soft((await vault.rules()).filter((r) => r.pending), kind).toEqual([]);
      } else {
        expect.soft(await drive.readText(id), kind).toBe(first);
        expect.soft(await drive.readText(twin.id), kind).toBe(kind === 'bower' ? RULES_TEMPLATE.text : original);
        expect.soft(await Promise.all([drive.get(id), drive.get(twin.id)]), kind).toEqual(before);
        expect.soft(await vault.rules(), kind).toContainEqual(expect.objectContaining({ id: pending.id, pending: true }));
      }
      vault.dispose();
    }
  });

  it('R9 red: region rules win over later prefix ownership and original bullets never dedupe', async () => {
    for (const ownership of ['personal', 'frontmatter', 'property'] as const) {
      const prefix = ownership === 'frontmatter' ? original.replace('contact:', 'by: bower\ncontact:') : original;
      const before = prefix + '\n' + region.replaceAll(text, 'Name scans by date.');
      const { drive, root, vault, id } = await fixture(before);
      if (ownership === 'property') await drive.update(id, { appProperties: { by: 'bower' } });
      expect.soft(await vault.rules(), ownership).toEqual([expect.objectContaining({ text: 'Name scans by date.' })]);
      const pending = await vault.addRule(text).catch((error: unknown) => error);
      expect.soft(pending, ownership).toMatchObject({ text, pending: true });
      const out = applyChanges(encode(before), [word()]);
      expect.soft(out.ok, ownership).toBe(true);
      if (out.ok) {
        expect(out.bytes.subarray(0, encode(prefix).length)).toEqual(encode(prefix));
        expect(regionRules(out.text).map((r) => r.text)).toEqual([text, 'Name scans by date.']);
      }
      expect((await tidyUp(drive, root)).phase).toBe('done');
      const after = await drive.readText(id);
      expect.soft(after.slice(0, prefix.length), ownership).toBe(prefix);
      expect.soft(regionRules(after).map((r) => r.text), ownership).toEqual([text, 'Name scans by date.']);
      vault.dispose();
    }
  });

  it('R10 red: unfinished fences and front matter keep all bytes and the rule pending without repair', async () => {
    for (const hostile of ['```md\nPersonal text.', '~~~\nPersonal text.', '---\nsummary: Personal text.']) {
      const { drive, root, vault, id } = await fixture(hostile);
      const before = await drive.get(id);
      const pending = await vault.addRule('scans by date');
      expect((await tidyUp(drive, root)).phase).toBe('done');
      expect(await drive.readBytes(id)).toEqual(encode(hostile));
      expect(await drive.get(id)).toEqual(before);
      expect(await vault.rules()).toContainEqual(expect.objectContaining({ id: pending.id, pending: true }));
      vault.dispose();
    }
  });

  it('R11 red: generic links rewrite prefix and suffix together with region-only wording', () => {
    for (const { prefix, eol, label } of variants) {
      const head = prefix + `${eol}Personal [[Old]].${eol}`;
      const tail = `${eol}Trailing [[Old]].${eol}- Personal bullet.`;
      const before = head + region.replace(/\n/g, eol) + tail;
      const link: Change = { kind: 'link-rewrite', recordIds: [], renames: [{ from: 'Old', to: 'New' }] };
      const linked = applyChanges(encode(before), [link]);
      expect.soft(linked.ok, `links alone: ${label}`).toBe(true);
      if (linked.ok) expect(linked.text).toBe(before.replaceAll('[[Old]]', '[[New]]'));
      const out = applyChanges(encode(before), [link, word([{ ...added, text: 'Name scans by date.' }], [text])]);
      expect.soft(out.ok, `combined: ${label}`).toBe(true);
      if (out.ok) {
        expect(out.bytes.subarray(0, encode(head).length)).toEqual(encode(head.replaceAll('[[Old]]', '[[New]]')));
        expect(out.bytes.subarray(-encode(tail).length)).toEqual(encode(tail.replaceAll('[[Old]]', '[[New]]')));
        expect(regionRules(out.text).map((r) => r.text)).toEqual(['Name scans by date.']);
      }
    }
  });

  it('R12 red: cancelling the first add and removal-only replay create no region', async () => {
    const { drive, root, vault, id } = await fixture(original);
    const pending = await vault.addRule('scans by date');
    await vault.removeRule(pending.id);
    const before = await drive.get(id);
    expect((await tidyUp(drive, root)).phase).toBe('done');
    expect(await drive.readBytes(id)).toEqual(encode(original));
    expect(await drive.get(id)).toEqual(before);
    expect.soft((await vault.rules()).filter((r) => r.pending)).toEqual([]);
    const replay = encode(original);
    expect(applyChanges(replay, [word([], [text])])).toMatchObject({ ok: false });
    expect(replay).toEqual(encode(original));
    vault.dispose();
  });

  it('AC1 red: a consenting add byte-appends a region, keeping summary and app properties', async () => {
    for (const { label, prefix } of variants) {
      const { drive, root, vault, id } = await fixture(prefix);
      const before = await drive.get(id);
      await vault.addRule('scans by date');
      const run = await tidyUp(drive, root);
      expect(run.phase).toBe('done');
      const after = await drive.readBytes(id);
      expect.soft(after.subarray(0, encode(prefix).length), label).toEqual(encode(prefix));
      expect.soft(decode(after), label).toContain('## Rules added in Bower');
      expect.soft(regionRules(decode(after)), label).toEqual([expect.objectContaining({ yourWords: 'scans by date' })]);
      // The bowerOp write stamp every update carries is exempt (spec R6).
      expect.soft(withoutStamp((await drive.get(id)).appProperties), label).toEqual(withoutStamp(before.appProperties));
      vault.dispose();
    }
  });

  it('AC2 red: second adds and pending removes touch only the region, never original bullets', () => {
    for (const { label, prefix, eol } of variants) {
      const before = prefix + eol + region.replace(/\n/g, eol);
      const second = { ...added, recordId: 'rule-alex-2', text: 'Name scans by date.', yourWords: 'scans by date', since: added.since + 1 };
      const out = applyChanges(encode(before), [word([second], [text])]);
      expect.soft(out.ok, label).toBe(true);
      if (!out.ok) continue;
      expect(out.bytes.subarray(0, encode(prefix).length)).toEqual(encode(prefix));
      expect(regionRules(out.text).map((r) => r.text)).toEqual([second.text]);
      const again = applyChanges(out.bytes, [word([], [text])]);
      expect(again).toEqual({ ok: false, reason: 'unchanged' });
    }
  });

  it('AC3 red: rules lists and dedupes only managed and pending rules, never original bullets', async () => {
    for (const { label, prefix, eol } of variants) {
      const plain = await fixture(prefix);
      expect.soft(await plain.vault.rules(), label).toEqual([]);
      const pending = await plain.vault.addRule(text).catch((error: unknown) => error);
      expect.soft(pending, label).toMatchObject({ text, pending: true });
      expect.soft(await plain.vault.rules(), label).toEqual([expect.objectContaining({ text, pending: true })]);
      plain.vault.dispose();
      const managed = await fixture(prefix + eol + region.replace(/\n/g, eol));
      await managed.vault.addRule('scans by date');
      expect.soft(await managed.vault.rules(), label).toEqual([
        expect.objectContaining({ text: 'scans by date', pending: true }),
        expect.objectContaining({ text, yourWords: 'receipts together' }),
      ]);
      managed.vault.dispose();
    }
  });

  it('AC4 red: a positive single-file add succeeds; eligible twins keep every byte and RULES_LEFT pending', async () => {
    const single = await fixture(original);
    await single.vault.addRule('scans by date');
    expect((await tidyUp(single.drive, single.root)).phase).toBe('done');
    expect.soft(await single.drive.readText(single.id), 'positive add excludes a not-bower false positive').toContain('## Rules added in Bower');
    expect.soft((await single.vault.rules()).filter((r) => r.pending), 'positive add is worded').toEqual([]);
    single.vault.dispose();

    const { drive, root, vault, id } = await fixture(original);
    const twin = await drive.createText(root, 'Rules.md', original);
    const before = await Promise.all([drive.get(id), drive.get(twin.id)]);
    const pending = await vault.addRule('scans by date');
    const errors = vi.spyOn(console, 'error');
    try {
      expect((await tidyUp(drive, root)).phase).toBe('done');
      for (const file of before) {
        expect(await drive.readText(file.id)).toBe(original);
        expect(await drive.get(file.id)).toEqual(file);
      }
      expect(await vault.rules()).toContainEqual(expect.objectContaining({ id: pending.id, pending: true }));
      expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'Bower could not word some of your rules; they wait for the next tidy-up.' }), expect.any(String));
    } finally {
      errors.mockRestore();
      vault.dispose();
    }
  });

  it('AC5 red: output over 1 MiB and invalid UTF-8 are refused; duplicate region and rule are unchanged', () => {
    expect(applyChanges(new Uint8Array([0xc3, 0x28]), [word()])).toEqual({ ok: false, reason: 'invalid-encoding' });
    const full = original + 'x'.repeat(EDIT_FILE_LIMIT - encode(original).length);
    expect.soft(applyChanges(encode(full), [word()]), 'input fits, appended output exceeds cap').toEqual({ ok: false, reason: 'too-large' });
    for (const { label, prefix, eol } of variants) {
      const before = prefix + eol + region.replace(/\n/g, eol);
      const bytes = encode(before);
      const copy = bytes.slice();
      expect.soft(applyChanges(bytes, [word()]), label).toEqual({ ok: false, reason: 'unchanged' });
      expect.soft(applyChanges(bytes, [word([])]), `no second region: ${label}`).toEqual({ ok: false, reason: 'unchanged' });
      expect(bytes).toEqual(copy);
    }
  });

  it('AC6 red: trailing personal bytes remain untouchable while rules stay listed and later adds edit the region', async () => {
    for (const { label, prefix, eol } of variants) {
      const tail = `${eol}Alex typed café after the region.${eol}## Rules${eol}- Personal trailing bullet.`;
      const before = prefix + eol + region.replace(/\n/g, eol) + tail;
      expect.soft(regionRules(before).map((r) => r.text), label).toEqual([text]);
      const out = applyChanges(encode(before), [word([{ ...added, text: 'Name scans by date.', yourWords: 'scans by date' }])]);
      expect.soft(out.ok, label).toBe(true);
      if (out.ok) {
        expect(out.bytes.subarray(0, encode(prefix).length)).toEqual(encode(prefix));
        expect(out.bytes.subarray(-encode(tail).length)).toEqual(encode(tail));
        expect(regionRules(out.text).map((r) => r.text)).toEqual(['Name scans by date.', text]);
      }
      const { vault } = await fixture(before);
      expect.soft(await vault.rules(), label).toEqual([expect.objectContaining({ text, yourWords: 'receipts together' })]);
      vault.dispose();
    }
  });

  it('AC7 control: Bower-owned and legacy managed Rules.md retain their grammar and summary update', async () => {
    for (const byProperty of [false, true]) {
      const { drive, root, vault, id } = await fixture(RULES_TEMPLATE.text, true);
      if (!byProperty) await drive.update(id, { appProperties: { by: null } });
      const before = (await drive.get(id)).appProperties;
      await vault.addRule('scans by date');
      expect((await tidyUp(drive, root)).phase).toBe('done');
      expect(parseRules(await drive.readText(id))).toEqual([expect.objectContaining({ yourWords: 'scans by date' })]);
      expect(await drive.readText(id)).toContain('summary: 1 rule Bower follows in every tidy-up.');
      expect(await drive.readText(id)).not.toContain('## Rules added in Bower');
      expect((await drive.get(id)).appProperties?.by).toBe(before?.by);
      vault.dispose();
    }
  });

  it('AC7 control: ownership/2 Rules.md stays unsupported', () => {
    const v2 = '---\nbower_format: ownership/2\nby: bower\n---\n' + ['current', 'personal', 'timeline', 'bower-note'].map((owner) =>
      `<!-- bower:ownership/2 begin ${owner} -->\n<!-- bower:ownership/2 end ${owner} -->\n`).join('');
    expect(parseOwnership(encode(v2)).status).toBe('v2');
    expect(applyChanges(encode(v2), [word()])).toEqual({ ok: false, reason: 'unsupported' });
  });
});
