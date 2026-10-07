/**
 * The old template's Rules.md in a folder that already exists (TL-P3-28 point 1). The app calls `POST /vault` only
 * when the person has no folder, so its repair never reaches an existing one: the runner repairs it before it plans,
 * only when the file is byte-for-byte the old template, fenced and still as seen. These folders are seeded straight
 * onto the Drive fake (`real-world.ts`), never through `POST /vault`; the run is the real adapters' scripted run.
 */
import { describe, expect, it, vi } from 'vitest';
import { OLD_RULES_TEMPLATE, RULES_TEMPLATE, parseRules } from '../../src/data/contracts/rules-format';
import { PROP } from '../../src/data/vault/layout';
import { ORIGIN, realWorld } from './real-world';
import type { Hop, RealWorld } from './real-world-types';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));

const json = { 'content-type': 'application/json' };

/** A folder whose Rules.md holds `text` with no app properties, and a rule typed in the app waiting in the journal. */
async function folderWith(text: string): Promise<{ w: RealWorld; rulesId: string }> {
  const w = await realWorld();
  const all = await w.drive.listAll(w.rootId);
  const rules = all.find((f) => f.name === 'Rules.md' && !f.folder && f.parents.includes(w.rootId));
  const changes = all.find((f) => f.name === 'changes' && f.folder);
  expect(rules).toBeDefined();
  expect(changes).toBeDefined();
  const written = await w.drive.writeText(rules?.id ?? '', text, rules?.modifiedTime ?? '');
  const keys = Object.keys(written.appProperties ?? {});
  if (keys.length) await w.drive.update(written.id, { appProperties: Object.fromEntries(keys.map((k) => [k, null])) });
  const line = { v: 1, id: 'change-rule-1', device: 'laptop', at: Date.now() - 1000, what: 'A rule', kind: 'rule', text: 'receipts go to money' };
  await w.drive.createText(changes?.id ?? '', 'change-rule-1.json', `${JSON.stringify(line)}\n`);
  return { w, rulesId: rules?.id ?? '' };
}

/** One instructions run, dispatched by the app and run by the runner's `main`; its exit code. */
async function runOnce(w: RealWorld, hop?: Hop): Promise<number> {
  const lease = (await (await w.api.browser(`${ORIGIN}/session`, { method: 'POST', headers: json, body: JSON.stringify({ place: 'tab-1', action: 'check', gen: 0 }) })).json()) as { epoch: number };
  const res = await w.api.browser(`${ORIGIN}/process`, {
    method: 'POST',
    headers: { ...json, 'x-bower-place': 'tab-1', 'x-bower-epoch': String(lease.epoch) },
    body: JSON.stringify({ scope: 'instructions', allowWeb: false, requestId: crypto.randomUUID() }),
  });
  expect(res.status).toBe(200);
  return await w.runJob(0, hop);
}

describe('real adapters: the old template Rules.md in an existing folder', () => {
  it('an existing folder with the old template Rules.md is repaired at plan time and the rule is worded', async () => {
    const { w, rulesId } = await folderWith(OLD_RULES_TEMPLATE);
    expect((await w.drive.get(rulesId)).appProperties?.[PROP.by]).toBeUndefined();

    expect(await runOnce(w)).toBe(0);

    const file = await w.drive.get(rulesId);
    expect(file.appProperties?.[PROP.by]).toBe(RULES_TEMPLATE.appProperties[PROP.by]);
    const worded = parseRules(await w.drive.readText(rulesId));
    expect(worded).toHaveLength(1);
    expect(worded[0]?.yourWords).toBe('receipts go to money');
    expect(worded[0]?.text).toMatch(/receipts go to money/i);
  });

  it('a Rules.md that is not the old template is never touched by the runner', async () => {
    // Edited by the person: the old text with one more line.
    {
      const edited = `${OLD_RULES_TEMPLATE}\n- Receipts go to Money.\n`;
      const { w, rulesId } = await folderWith(edited);
      const before = await w.drive.get(rulesId);
      expect(await runOnce(w)).toBe(0);
      const after = await w.drive.get(rulesId);
      expect(await w.drive.readText(rulesId)).toBe(edited);
      expect(after.modifiedTime).toBe(before.modifiedTime);
      expect(after.appProperties).toBeUndefined();
    }
    // Changed by the person between the runner's read of the old text and its write.
    {
      const { w, rulesId } = await folderWith(OLD_RULES_TEMPLATE);
      const theirs = `${OLD_RULES_TEMPLATE}\n- Typed on another device.\n`;
      let changed = false;
      const hop: Hop = async (url, init, next) => {
        const res = await next();
        const read = (init.method ?? 'GET').toUpperCase() === 'GET' && url.pathname.endsWith(`/files/${rulesId}`) && url.searchParams.get('alt') === 'media';
        if (read && !changed) {
          changed = true;
          const now = await w.drive.get(rulesId);
          await w.drive.writeText(rulesId, theirs, now.modifiedTime);
        }
        return res;
      };
      expect(await runOnce(w, hop)).toBe(0);
      expect(changed).toBe(true);
      expect(await w.drive.readText(rulesId)).toBe(theirs);
      expect((await w.drive.get(rulesId)).appProperties).toBeUndefined();
    }
    // Two files of the name in the folder: neither is the one to repair.
    {
      const { w, rulesId } = await folderWith(OLD_RULES_TEMPLATE);
      const twin = await w.drive.createText(w.rootId, 'Rules.md', OLD_RULES_TEMPLATE);
      const before = [await w.drive.get(rulesId), await w.drive.get(twin.id)];
      expect(await runOnce(w)).toBe(0);
      for (const b of before) {
        const after = await w.drive.get(b.id);
        expect(await w.drive.readText(b.id)).toBe(OLD_RULES_TEMPLATE);
        expect(after.modifiedTime).toBe(b.modifiedTime);
        expect(after.appProperties).toBeUndefined();
      }
    }
  });
});
