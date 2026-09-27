/**
 * The rulebook update (#197) through the same exported Drive functions the
 * app calls, over the demo's in-memory Drive (`src/demo/`): hermetic, no
 * network. Alex's demo folder starts from `vault-template/`, so its
 * `CLAUDE.md` is already current; each test first puts an older one there.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import legacyRulebook from './fixtures/rulebook-v1.md?raw';
import {
  getText,
  httpDriveClient,
  listVault,
  setDriveClient,
  updateFileText,
} from '../src/drive.js';
import type { DriveClient, DriveFile } from '../src/drive.js';
import { createDemo } from '../src/demo/index.js';
import { ROOT_ID } from '../src/demo/vault.js';
import {
  TEMPLATE_RETIRED_LINES,
  TEMPLATE_RULEBOOK,
  TEMPLATE_RULES,
  TEMPLATE_RULES_VERSION,
} from '../src/rulebook-template.js';
import type { RulebookTemplate } from '../src/vault-store.js';
import { runRulesUpdate } from '../src/vault-store.js';

const TEMPLATE: RulebookTemplate = {
  text: TEMPLATE_RULEBOOK,
  rules: TEMPLATE_RULES,
  version: TEMPLATE_RULES_VERSION,
  retired: TEMPLATE_RETIRED_LINES,
};

const OWN =
  "- Invoices go to `2-Areas/Finance/` (owner's request, 2026-09-20).";
const V1_WITH_OWN = `${legacyRulebook.replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n${OWN}\n`;

let drive: DriveClient;

beforeEach(() => {
  drive = createDemo().drive;
  setDriveClient(drive);
});

afterEach(() => {
  setDriveClient(httpDriveClient);
});

async function fileAt(path: string): Promise<DriveFile | undefined> {
  return (await listVault(ROOT_ID)).find((f) => f.path === path);
}

async function mustFileAt(path: string): Promise<DriveFile> {
  const file = await fileAt(path);
  if (file === undefined) throw new Error(`${path} missing`);
  return file;
}

describe('runRulesUpdate', () => {
  it('moves the owner lines of a v1 rulebook to Rules.md and writes the template', async () => {
    const rulebook = await mustFileAt('CLAUDE.md');
    const rulesFile = await mustFileAt('Rules.md');
    await updateFileText(rulebook.id, V1_WITH_OWN);
    const rulesBefore = await getText(rulesFile.id);

    const writes = await runRulesUpdate({
      folderId: ROOT_ID,
      rulebook,
      rulesFile,
      template: TEMPLATE,
    });

    expect(writes.result).toEqual({
      from: 1,
      to: TEMPLATE_RULES_VERSION,
      moved: 1,
    });
    expect(await getText(rulebook.id)).toBe(TEMPLATE_RULEBOOK);
    expect(await getText(rulesFile.id)).toBe(
      `${rulesBefore.replace(/\n+$/, '')}\n\n${OWN}\n`,
    );
    expect(writes.rules?.text).toBe(await getText(rulesFile.id));
    expect(writes.createdRules).toBe(false);
  });

  it('moves additions outside the Rules section under the migrated heading', async () => {
    const rulebook = await mustFileAt('CLAUDE.md');
    const rulesFile = await mustFileAt('Rules.md');
    const tags =
      '`personal`, `career`, `finance`, `legal`, `health`, `home`, `travel`, `learning`, `hobby`';
    const recipes =
      '### Recipes\n1. One note per dish under `3-Resources/Cooking/`.';
    const old = V1_WITH_OWN.replace(
      tags,
      `${tags}, \`cooking\`, \`garden\``,
    ).replace('### Query\n', `${recipes}\n\n### Query\n`);
    await updateFileText(rulebook.id, old);
    const rulesBefore = await getText(rulesFile.id);

    const writes = await runRulesUpdate({
      folderId: ROOT_ID,
      rulebook,
      rulesFile,
      template: TEMPLATE,
    });

    expect(writes.result.moved).toBe(5);
    expect(await getText(rulesFile.id)).toBe(
      [
        rulesBefore.replace(/\n+$/, ''),
        '',
        OWN,
        '',
        '## Migrated from your old rulebook (v1)',
        '',
        '## Tags',
        `${tags}, \`cooking\`, \`garden\``,
        '',
        recipes,
        '',
      ].join('\n'),
    );
    expect(await getText(rulebook.id)).toBe(TEMPLATE_RULEBOOK);
  });

  it('creates Rules.md from the template when a v1 folder has none', async () => {
    const rulebook = await mustFileAt('CLAUDE.md');
    await updateFileText(rulebook.id, V1_WITH_OWN);
    await drive.deleteFile((await mustFileAt('Rules.md')).id);

    const writes = await runRulesUpdate({
      folderId: ROOT_ID,
      rulebook,
      rulesFile: undefined,
      template: TEMPLATE,
    });

    expect(writes.createdRules).toBe(true);
    const created = await mustFileAt('Rules.md');
    expect(await getText(created.id)).toBe(
      `${TEMPLATE_RULES.replace(/\n+$/, '')}\n\n${OWN}\n`,
    );
    expect(await getText(rulebook.id)).toBe(TEMPLATE_RULEBOOK);
  });

  it('writes nothing when the rulebook is already current', async () => {
    const rulebook = await mustFileAt('CLAUDE.md');
    const rulesFile = await mustFileAt('Rules.md');
    const spy = vi.spyOn(drive, 'updateFileText');

    const writes = await runRulesUpdate({
      folderId: ROOT_ID,
      rulebook,
      rulesFile,
      template: TEMPLATE,
    });

    expect(writes.result).toEqual({
      from: TEMPLATE_RULES_VERSION,
      to: TEMPLATE_RULES_VERSION,
      moved: 0,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the old rulebook on a conflict, and a retry adds the lines only once', async () => {
    const rulebook = await mustFileAt('CLAUDE.md');
    const rulesFile = await mustFileAt('Rules.md');
    await updateFileText(rulebook.id, V1_WITH_OWN);

    // The rulebook changes (another device, or a run) between the read and
    // its write: `modifiedTimeOf` answers something newer the second time
    // it is asked about CLAUDE.md.
    const real = drive.modifiedTimeOf.bind(drive);
    let asked = 0;
    setDriveClient({
      ...drive,
      modifiedTimeOf: async (id: string): Promise<string> => {
        if (id === rulebook.id && ++asked === 2) return 'changed';
        return real(id);
      },
    });
    await expect(
      runRulesUpdate({
        folderId: ROOT_ID,
        rulebook,
        rulesFile,
        template: TEMPLATE,
      }),
    ).rejects.toMatchObject({ name: 'SaveError', code: 'conflict' });
    expect(await getText(rulebook.id)).toBe(V1_WITH_OWN);
    const afterFailure = await getText(rulesFile.id);
    expect(afterFailure.endsWith(`\n${OWN}\n`)).toBe(true);

    setDriveClient(drive);
    await runRulesUpdate({
      folderId: ROOT_ID,
      rulebook,
      rulesFile: await mustFileAt('Rules.md'),
      template: TEMPLATE,
    });
    expect(await getText(rulesFile.id)).toBe(afterFailure);
    expect(await getText(rulebook.id)).toBe(TEMPLATE_RULEBOOK);
  });
});
