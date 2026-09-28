/**
 * Rule write-backs (#341) through the same exported Drive function the app
 * calls, over the demo's in-memory Drive (`src/demo/`): hermetic, no
 * network. Alex's `Rules.md` is given a few rules in the new shape first.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getText,
  httpDriveClient,
  listVault,
  SaveError,
  setDriveClient,
} from '../src/drive.js';
import type { DriveClient, DriveFile } from '../src/drive.js';
import { createDemo } from '../src/demo/index.js';
import { ROOT_ID } from '../src/demo/vault.js';
import { allRules, parseRules, RuleError } from '../src/rules.js';
import type { RuleEdit, RuleRef } from '../src/rules.js';
import { runKeepRule, runRuleEdit } from '../src/vault-store.js';

const RULES = [
  '# Rules',
  '',
  '## Finance',
  '',
  "- Receipts go to Finance, named by shop and date (owner's request, 2026-09-26)",
  '- ~~Never archive Finance~~ (paused 2026-09-27)',
  '',
].join('\n');

let drive: DriveClient;

beforeEach(async () => {
  drive = createDemo().drive;
  setDriveClient(drive);
  await drive.updateFileText((await rulesFile()).id, RULES);
});

afterEach(() => {
  setDriveClient(httpDriveClient);
});

async function rulesFile(): Promise<DriveFile> {
  const file = (await listVault(ROOT_ID)).find((f) => f.path === 'Rules.md');
  if (file === undefined) throw new Error('Rules.md missing');
  return file;
}

function refTo(md: string, text: string): RuleRef {
  const rule = allRules(parseRules(md)).find((r) => r.text === text);
  if (rule === undefined) throw new Error(`no rule "${text}"`);
  return { line: rule.line, raw: rule.raw };
}

async function edit(e: RuleEdit): ReturnType<typeof runRuleEdit> {
  return runRuleEdit({
    rulesFile: await rulesFile(),
    edit: e,
    on: '2026-09-29',
  });
}

describe('runRuleEdit', () => {
  it('pauses a rule in Drive and returns the file as saved', async () => {
    const rule = refTo(RULES, 'Receipts go to Finance, named by shop and date');
    const saved = await edit({ kind: 'pause', rule });

    const text = await getText((await rulesFile()).id);
    expect(saved?.text).toBe(text);
    expect(text).toContain(
      '- ~~Receipts go to Finance, named by shop and date~~ (said 2026-09-26, paused 2026-09-29)\n',
    );
    expect(parseRules(text).groups[0]?.paused).toBe(2);
  });

  it('writes nothing on a retry that changes nothing', async () => {
    const before = await rulesFile();
    const rule = refTo(RULES, 'Never archive Finance');
    expect(await edit({ kind: 'pause', rule })).toBeNull();
    expect((await rulesFile()).modifiedTime).toBe(before.modifiedTime);
  });

  it('refuses a rule that is no longer in the file, writing nothing', async () => {
    const rule = refTo(RULES, 'Never archive Finance');
    await edit({ kind: 'remove', rule });
    const after = await getText((await rulesFile()).id);

    await expect(edit({ kind: 'resume', rule })).rejects.toBeInstanceOf(
      RuleError,
    );
    expect(await getText((await rulesFile()).id)).toBe(after);
  });

  it('refuses when the folder has no Rules.md', async () => {
    await expect(
      runRuleEdit({
        rulesFile: undefined,
        edit: { kind: 'remove', rule: { line: 4, raw: '- x' } },
        on: '2026-09-29',
      }),
    ).rejects.toMatchObject({ code: 'missing' });
  });

  it('is conflict-checked: a change made underneath is never overwritten', async () => {
    const stale = await rulesFile();
    const file = await rulesFile();
    const rule = refTo(RULES, 'Never archive Finance');
    // Someone else edits the file between the read and the save.
    const original = drive.getText.bind(drive);
    drive.getText = async (id: string): Promise<string> => {
      const text = await original(id);
      await drive.updateFileText(file.id, `${RULES}- Added elsewhere.\n`);
      drive.getText = original;
      return text;
    };
    await expect(
      runRuleEdit({
        rulesFile: stale,
        edit: { kind: 'resume', rule },
        on: '2026-09-29',
      }),
    ).rejects.toBeInstanceOf(SaveError);
    expect(await getText(file.id)).toContain('- Added elsewhere.');
  });
});

describe('runKeepRule', () => {
  it('appends a rule sentence under the topic it names, in Drive', async () => {
    const kept = await runKeepRule({
      folderId: ROOT_ID,
      rulesFile: await rulesFile(),
      sentence: 'Never archive Finance statements',
      on: '2026-09-29',
    });
    const text = await getText((await rulesFile()).id);
    expect(kept.topic).toBe('Finance');
    expect(kept.createdRules).toBe(false);
    expect(kept.rules?.text).toBe(text);
    expect(text).toContain(
      "- ~~Never archive Finance~~ (paused 2026-09-27)\n- Never archive Finance statements (owner's request, 2026-09-29)\n",
    );
  });

  it('writes nothing when the rule is already there', async () => {
    const before = await rulesFile();
    const kept = await runKeepRule({
      folderId: ROOT_ID,
      rulesFile: before,
      sentence: 'Receipts go to Finance, named by shop and date',
      on: '2026-09-29',
    });
    expect(kept.rules).toBeNull();
    expect((await rulesFile()).modifiedTime).toBe(before.modifiedTime);
  });

  it('creates Rules.md when the folder has none', async () => {
    const kept = await runKeepRule({
      folderId: ROOT_ID,
      rulesFile: undefined,
      sentence: 'Always file recipes under Cooking',
      on: '2026-09-29',
    });
    expect(kept.createdRules).toBe(true);
    expect(kept.topic).toBe('Cooking');
    expect(kept.rules?.text).toBe(
      "## Cooking\n- File recipes under Cooking (owner's request, 2026-09-29)\n",
    );
  });
});
