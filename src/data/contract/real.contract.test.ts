// @vitest-environment node
/**
 * The vault contract and the app-side failure cases on the real adapters (P3-18): `makeLiveSources` with
 * `WorkerHttp` over the Worker's app run in-process and `DriveHttp` over a replayed Drive v3, and each tidy-up run
 * by the runner's `main` over the same transports (`runner/test/real-world.ts`). No network.
 *
 * Node's environment with jsdom set up by hand (Vitest's own jsdom environment), because the Worker's modules
 * import `cloudflare:workers`, which only a Node-side transform lets this suite mock.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { builtinEnvironments } from 'vitest/runtime';
import { DriveHttp } from '../drive/drive-http';
import { makeLiveSources, type LiveSources } from '../live';
import { WorkerHttp } from '../worker/worker-http';
import type { RealWorld } from '../../../runner/test/real-world-types';
import { describeVaultContract } from './vault-contract';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(
      readonly ctx: unknown,
      readonly env: unknown,
    ) {}
  },
}));

beforeAll(async () => {
  await builtinEnvironments.jsdom.setup(globalThis, { jsdom: { url: 'https://app.example.com/' } });
});

async function world(): Promise<RealWorld> {
  const at = new URL('../../../runner/test/real-world.ts', import.meta.url).pathname;
  const { realWorld } = (await import(/* @vite-ignore */ at)) as { realWorld(): Promise<RealWorld> };
  return await realWorld();
}

/**
 * The app as `choose.ts` builds it for `?source=real`, on this world's transports, opened as the app shell opens it:
 * the place starts once someone is signed in. One tab (`tab-1`): a page opened again is a reload of it. The upload
 * queue stays off (no IndexedDB here); pile files are sent straight, as before P3.
 */
async function app(w: RealWorld): Promise<LiveSources> {
  const worker = new WorkerHttp(w.origin, w.api.browser as typeof fetch);
  const live = makeLiveSources({
    worker,
    driveLinks: true,
    declarePiles: true,
    drive: new DriveHttp({ token: (fresh) => worker.driveToken(fresh), fetch: w.driveFetch as typeof fetch }),
    place: { world: 'real', place: 'tab-1', reload: () => undefined },
  });
  if (await live.session.current()) expect(await live.place?.start()).toBe('active');
  return live;
}

/** Asks the Worker until the run ends, as the app does. */
async function ended(live: LiveSources): Promise<NonNullable<Awaited<ReturnType<LiveSources['runs']['current']>>>> {
  for (let i = 0; i < 200; i++) {
    const r = await live.runs.current();
    if (r && (r.phase === 'done' || r.phase === 'failed')) return r;
    await new Promise((res) => setTimeout(res, 5));
  }
  throw new Error('the tidy-up never ended');
}

describeVaultContract('real adapters', async () => {
  localStorage.clear();
  const w = await world();
  const live = await app(w);
  return {
    sources: live,
    dispose: () => live.dispose(),
    settle: () => live.vault.settled(),
    tidyUp: async (during) => {
      await live.runs.start('all');
      await during?.();
      await live.vault.settled();
      await w.runPending();
      return await ended(live);
    },
  };
});

/** What an uninterrupted tidy-up leaves in a fresh world: the effects a case must end with, once each. */
async function straight(): Promise<string[]> {
  localStorage.clear();
  const w = await world();
  const live = await app(w);
  try {
    const before = await w.paths();
    await live.runs.start('all');
    await w.runPending();
    expect((await ended(live)).phase).toBe('done');
    const after = await w.paths();
    expect(after).not.toEqual(before);
    return after;
  } finally {
    live.dispose();
  }
}

describe('real adapters: failure cases in the app', () => {
  let open: LiveSources[] = [];
  afterEach(() => {
    for (const s of open) s.dispose();
    open = [];
  });
  const start = async (w: RealWorld): Promise<LiveSources> => {
    const s = await app(w);
    open.push(s);
    return s;
  };

  it('revoked auth: Google answers invalid_grant, so the person is signed out and nothing is written', async () => {
    localStorage.clear();
    const w = await world();
    const live = await start(w);
    const phone = new WorkerHttp(w.origin, (await w.api.otherDevice()) as typeof fetch);
    expect((await live.session.current())?.name).toBe('Alex');
    expect((await phone.me())?.user.name).toBe('Alex');
    await live.vault.tree();
    const before = await w.drive.snapshot();
    const writes = w.driveWrites().length;
    w.revokeGoogle();
    await expect(live.vault.move('Resources/Cooking/Lemon tart.md', 'Areas')).rejects.toMatchObject({ code: 'auth' });
    expect(await live.session.current()).toBeNull();
    expect(w.driveWrites()).toHaveLength(writes);
    expect(await w.drive.snapshot()).toBe(before);
    // Every device is signed out: the Worker retired Alex's sessions with the refused grant, not only this cookie.
    expect(await phone.me()).toBeNull();
    expect(await (await start(w)).session.current()).toBeNull();
  });

  it('browser close mid-run: the app goes away, and the runner plus the alarm finish', async () => {
    const want = await straight();
    localStorage.clear();
    const w = await world();
    const first = await start(w);
    const piles = (await first.vault.piles()).length;
    expect(piles).toBeGreaterThan(0);
    await first.runs.start('all');
    // The page closes as the run starts; nothing of the app is left to ask or to finish anything.
    first.dispose();
    // Attempt 1 is cut once its changes are made and it said `saving` (staging's cancel at 13:40:00Z).
    let cut = false;
    const code = await w.runJob(0, async (url, init, next) => {
      if (cut) throw new TypeError('The job was cancelled.');
      const res = await next();
      if (url.pathname.endsWith('/status') && JSON.parse(String(init.body)).phase === 'saving') cut = true;
      return res;
    });
    expect(code).toBe(0);
    // The alarm set at admission (the queued deadline) finds the run moved on and waits for its `saving` deadline.
    expect(await w.api.fireAlarm()).toBe(true);
    expect(w.dispatched).toHaveLength(1);
    // There it finds attempt 1's job completed with no report, and redispatches once.
    expect(await w.api.fireAlarm()).toBe(true);
    expect(w.dispatched.map((d) => d.attempt)).toEqual([1, 2]);
    expect(await w.runJob(1)).toBe(0);
    const later = await start(w);
    const run = await ended(later);
    expect(run.phase).toBe('done');
    expect(await later.vault.piles()).toEqual([]);
    expect(await later.vault.changes()).toEqual([]);
    expect(await w.paths()).toEqual(want);
    // The alarm still set fires on an ended run: it sends nothing and clears itself.
    expect(await w.api.fireAlarm()).toBe(true);
    expect(w.dispatched).toHaveLength(2);
    expect(w.api.alarmAt()).toBeNull();
    expect((await later.runs.current())?.phase).toBe('done');
  });
});
