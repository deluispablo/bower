/**
 * Deciding one of Bower's proposals (#199), through the same exported Drive
 * functions the app calls, over the demo's in-memory Drive (`src/demo/`):
 * hermetic, no network. Alex's demo folder has three open proposals and one
 * dismissed one in `Answers/Bower - Proposals.md` (`demo/fixture.ts`).
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
import {
  openProposals,
  parseProposals,
  PROPOSALS_PATH,
  ProposalError,
} from '../src/proposals.js';
import type { ProposalDecision } from '../src/proposals.js';
import { runProposalDecision } from '../src/vault-store.js';

const RULE =
  "- File every recipe under 3-Resources/Cooking with the tag cooking. (owner's request, 2026-09-27)";

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

async function textAt(path: string): Promise<string> {
  return getText((await mustFileAt(path)).id);
}

async function decide(
  id: string,
  decision: ProposalDecision,
): ReturnType<typeof runProposalDecision> {
  return runProposalDecision({
    folderId: ROOT_ID,
    proposalsFile: await mustFileAt(PROPOSALS_PATH),
    rulesFile: await fileAt('Rules.md'),
    id,
    decision,
    on: '2026-09-27',
  });
}

describe('runProposalDecision', () => {
  it('the demo folder has three open proposals', async () => {
    expect(
      openProposals(await textAt(PROPOSALS_PATH)).map((p) => p.id),
    ).toEqual([
      '2026-09-26-recipes',
      '2026-09-26-runs',
      '2026-09-28-bike-time',
    ]);
  });

  it('Accept writes the rule to Rules.md and marks the proposal accepted', async () => {
    const writes = await decide('2026-09-26-recipes', 'accepted');

    expect(writes.createdRules).toBe(false);
    const rules = await textAt('Rules.md');
    expect(rules).toContain(`## From Bower's suggestions\n\n${RULE}\n`);
    expect(writes.rules?.text).toBe(rules);

    const proposals = parseProposals(await textAt(PROPOSALS_PATH));
    expect(proposals.find((p) => p.id === '2026-09-26-recipes')).toMatchObject({
      status: 'accepted',
      decided: '2026-09-27',
    });
    expect(proposals.find((p) => p.id === '2026-09-26-runs')?.status).toBe(
      'open',
    );
  });

  it('Dismiss only marks the proposal: Rules.md is untouched', async () => {
    const rulesBefore = await textAt('Rules.md');

    const writes = await decide('2026-09-26-runs', 'dismissed');

    expect(writes.rules).toBeNull();
    expect(await textAt('Rules.md')).toBe(rulesBefore);
    const runs = parseProposals(await textAt(PROPOSALS_PATH)).find(
      (p) => p.id === '2026-09-26-runs',
    );
    expect(runs).toMatchObject({ status: 'dismissed', decided: '2026-09-27' });
  });

  it('creates Rules.md when the folder has none', async () => {
    const rules = await mustFileAt('Rules.md');
    await drive.deleteFile(rules.id);

    const writes = await decide('2026-09-26-recipes', 'accepted');

    expect(writes.createdRules).toBe(true);
    expect(await textAt('Rules.md')).toContain(RULE);
  });

  it('writes nothing for a proposal that is not there', async () => {
    const before = await textAt(PROPOSALS_PATH);
    const rulesBefore = await textAt('Rules.md');

    await expect(decide('no-such-id', 'accepted')).rejects.toBeInstanceOf(
      ProposalError,
    );
    expect(await textAt(PROPOSALS_PATH)).toBe(before);
    expect(await textAt('Rules.md')).toBe(rulesBefore);
  });

  it('a proposals file changed meanwhile is a conflict; accepting again adds the rule once', async () => {
    const proposalsId = (await mustFileAt(PROPOSALS_PATH)).id;
    let touched = false;
    // Bower writes the proposals file right after the app read it.
    setDriveClient({
      ...drive,
      getText: async (id: string): Promise<string> => {
        const text = await drive.getText(id);
        if (id === proposalsId && !touched) {
          touched = true;
          await drive.updateFileText(id, `${text}\n`);
        }
        return text;
      },
    });

    await expect(
      decide('2026-09-26-recipes', 'accepted'),
    ).rejects.toBeInstanceOf(SaveError);
    // The rule went first, so it is already safe.
    expect(await textAt('Rules.md')).toContain(RULE);
    expect(openProposals(await textAt(PROPOSALS_PATH))).toHaveLength(3);

    setDriveClient(drive);
    await decide('2026-09-26-recipes', 'accepted');
    const rules = await textAt('Rules.md');
    expect(rules.split(RULE)).toHaveLength(2);
    expect(
      openProposals(await textAt(PROPOSALS_PATH)).map((p) => p.id),
    ).toEqual(['2026-09-26-runs', '2026-09-28-bike-time']);
  });
});
