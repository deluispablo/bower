/**
 * rules-original-ui (spec 2026-10-10-rules-original.md, TL-P4-53): the person's own text in the rules note, read once
 * through the note reader the note page uses (`parseNote`: front matter and Bower's region set aside), for the Bower
 * screen and the panel. Made-up data only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDrive } from '../drive/fake-drive';
import { driveError } from '../drive/drive-api';
import { seedFakeDrive } from '../fake/seed';
import { BowerError } from '../types';
import { DriveVault } from './drive-vault';
import { serializeRules } from './rules-format';

const BEGIN = '<!-- bower:ownership/2 begin rules-added -->';
const END = '<!-- bower:ownership/2 end rules-added -->';
const region = (eol: string): string =>
  ['## Rules added in Bower', BEGIN, '## Rules', '', '- Keep receipts together. <!-- since 2026-10-13 -->', '  *You wrote: "receipts together"*', END, ''].join(eol);
const PROSE = 'Alex keeps paper letters for a year.\n\n## Rules\n\n- Bills go in Money, by month.';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

/** A folder whose root Rules.md holds `contents`; the person's own file unless `managed` (Bower's mark kept). */
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

/** The read under test, missing on today's source: an assertion fails, never the suite's loading. */
function proseOf(vault: DriveVault): Promise<string> {
  const read: unknown = Reflect.get(vault, 'rulesProse');
  expect(typeof read, 'DriveVault.rulesProse').toBe('function');
  return (read as () => Promise<string>).call(vault);
}

describe('rules-original-ui: the person\'s own text in the rules note', () => {
  it('AC1 rules-original-prose: the person\'s text, front matter and Bower\'s region set aside, for LF, CRLF and a BOM', async () => {
    for (const eol of ['\n', '\r\n']) {
      for (const bom of ['', '﻿']) {
        const body = PROSE.replace(/\n/g, eol);
        // A BOM before front matter is not front matter to the note reader on any note page (ruling R4), so the
        // front-matter cases go without one.
        const front = bom ? '' : `---${eol}summary: mine${eol}contact: you@example.com${eol}---${eol}`;
        const label = `eol=${JSON.stringify(eol)} bom=${!!bom}`;
        const plain = await fixture(`${bom}${front}${body}${eol}`);
        expect.soft(await proseOf(plain.vault), `${label}, no region`).toBe(PROSE);
        const withRegion = await fixture(`${bom}${front}${body}${eol}${eol}${region(eol)}`);
        expect.soft(await proseOf(withRegion.vault), `${label}, with region`).toBe(PROSE);
      }
    }
  });

  it('AC1 rules-original-none: Bower\'s own rules note, a region with nothing around it, and blank text have no prose', async () => {
    const cases: Array<[string, string, boolean]> = [
      ['the template Bower starts with', serializeRules([]), true],
      ['Bower\'s note with rules', serializeRules([{ id: 'r1', text: 'Keep receipts together.', since: Date.UTC(2026, 9, 3) }]), true],
      ['only the region', `\n${region('\n')}`, false],
      ['spaces and blank lines, then the region', `   \n\n${region('\n')}`, false],
      ['front matter alone', '---\nsummary: mine\n---\n', false],
      ['an empty file', '', false],
    ];
    for (const [label, text, managed] of cases) {
      const { vault } = await fixture(text, managed);
      expect.soft(await proseOf(vault), label).toBe('');
    }
  });

  it('AC1 rules-original-same-reader: the prose is the text the note page shows for the rules note', async () => {
    const { vault } = await fixture(`---\nsummary: mine\n---\n${PROSE}\n\n${region('\n')}`);
    expect(await proseOf(vault)).toBe((await vault.note('Rules.md')).body.trim());
  });

  it('R5 rules-original-missing: with no rules note in the folder there is no prose and no error', async () => {
    const { drive, vault, id } = await fixture(PROSE);
    await drive.trash(id);
    await vault.refresh();
    expect(await proseOf(vault)).toBe('');
  });

  it('R6 rules-original-damaged: a region the person damaged shows no prose, as the rules list shows pending rules only', async () => {
    const { vault } = await fixture(`${PROSE}\n\n## Rules added in Bower\n${BEGIN}\n## Rules\n`);
    expect(await proseOf(vault)).toBe('');
    // The rules list keeps its own behaviour (rules-added-region R16): pending only, never an error.
    await expect(vault.rules()).resolves.toEqual([]);
  });

  it('R7 rules-original-read-error: a failed read is refused with one sentence, never shown as no prose', async () => {
    const { drive, vault, id } = await fixture(PROSE);
    const read = drive.readText.bind(drive);
    drive.readText = async (...a: Parameters<FakeDrive['readText']>) => {
      if (a[0] === id) throw driveError('offline');
      return read(...a);
    };
    await expect(proseOf(vault)).rejects.toBeInstanceOf(BowerError);
  });
});
