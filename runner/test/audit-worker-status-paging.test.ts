/**
 * The Worker's Drive transport pages on its own (audit-worker-status, finding 1): Worker reads that overlap must not
 * change the page size the runner's listings get. The Worker's reads are held inside the pretend Drive until two are
 * in flight, then finished in the order that left a shared page size changed (the first to start, first to end).
 */
import { describe, expect, it, vi } from 'vitest';
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

describe('Worker transport paging', () => {
  it('overlapping Worker reads leave the runner paging by two', async () => {
    const w = await realWorld();
    const lease = (await (await w.api.browser(`${ORIGIN}/session`, { method: 'POST', headers: json, body: JSON.stringify({ place: 'tab-1', action: 'check', gen: 0 }) })).json()) as { epoch: number };
    const press = (): Promise<Response> =>
      w.api.browser(`${ORIGIN}/process`, {
        method: 'POST',
        headers: { ...json, 'x-bower-place': 'tab-1', 'x-bower-epoch': String(lease.epoch) },
        body: JSON.stringify({ scope: 'all', allowWeb: false, requestId: crypto.randomUUID() }),
      });

    const listAll = w.drive.listAll.bind(w.drive);
    const held: Array<() => void> = [];
    let holding = true;
    vi.spyOn(w.drive, 'listAll').mockImplementation(async (root) => {
      if (holding) await new Promise<void>((release) => held.push(release));
      return await listAll(root);
    });

    const reads = [press(), press()];
    await vi.waitFor(() => expect(held.length).toBeGreaterThanOrEqual(2));
    holding = false;
    for (const release of held) release();
    await Promise.all(reads);

    // The run's own listings now: each page the runner is given holds two entries (the folder has more than two).
    const pages: number[] = [];
    await w.runJob(0, async (url, _init, next) => {
      const res = await next();
      if (url.pathname === '/drive/v3/files' && url.searchParams.has('pageSize')) pages.push(((await res.clone().json()) as { files: unknown[] }).files.length);
      return res;
    });
    expect(pages.length).toBeGreaterThan(0);
    expect(Math.max(...pages)).toBe(2);
  });
});
