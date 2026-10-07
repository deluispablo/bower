/**
 * A rule typed in the app (P3-22): its line in the journal is worded into Rules.md by the scripted run, on the
 * real adapters (`real-world.ts`: the Worker in-process, Drive v3 and GitHub replayed). Rules.md is the one a new
 * Bower folder gets: the bytes of `serializeRules([])` and the mark `by: bower`, so the file is Bower's to word.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseRules, serializeRules } from '../../src/data/contracts/rules-format';
import { PROP } from '../../src/data/vault/layout';
import { ORIGIN, realWorld } from './real-world';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));

const json = { 'content-type': 'application/json' };

describe('real adapters: a typed rule', () => {
  it('a typed rule is worded into Rules.md on the real adapter', async () => {
    const w = await realWorld();
    const all = await w.drive.listAll(w.rootId);
    const rules = all.find((f) => f.name === 'Rules.md' && !f.folder);
    const changes = all.find((f) => f.name === 'changes' && f.folder);
    if (!rules || !changes) throw new Error('the folder has no Rules.md or no journal');
    // A new folder's Rules.md, as the template makes it.
    await w.drive.writeText(rules.id, serializeRules([]), rules.modifiedTime);
    await w.drive.update(rules.id, { appProperties: { [PROP.by]: 'bower' } });
    // The rule alone, as the app journals it.
    const line = { v: 1, id: 'change-rule-1', device: 'laptop', at: Date.now() - 1000, what: 'A rule', kind: 'rule', text: 'receipts go to money' };
    await w.drive.createText(changes.id, 'change-rule-1.json', `${JSON.stringify(line)}\n`);

    const lease = (await (await w.api.browser(`${ORIGIN}/session`, { method: 'POST', headers: json, body: JSON.stringify({ place: 'tab-1', action: 'check', gen: 0 }) })).json()) as { epoch: number };
    const res = await w.api.browser(`${ORIGIN}/process`, {
      method: 'POST',
      headers: { ...json, 'x-bower-place': 'tab-1', 'x-bower-epoch': String(lease.epoch) },
      body: JSON.stringify({ scope: 'instructions', allowWeb: false, requestId: crypto.randomUUID() }),
    });
    expect(res.status).toBe(200);
    expect(await w.runJob(0)).toBe(0);

    const worded = parseRules(await w.drive.readText(rules.id));
    expect(worded).toHaveLength(1);
    expect(worded[0]?.yourWords).toBe('receipts go to money');
    expect(worded[0]?.text).toMatch(/receipts go to money/i);
  });
});
