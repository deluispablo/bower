import { env as testEnv, runInDurableObject } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { Person } from '../src/person.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';
import { MANIFEST } from './drive-v3.js';

const env = testEnv as unknown as Env;
const API = 'https://app.example.com';
const HOUR = 3_600_000;
interface Card { id: string; text: string; yes: string; no: string; askedAt: number }
interface Reply { revision: number; run: { id: string; phase: string; phaseAt: number; questions?: Card[] } }
const card = (id = 'Q1C_QUESTION'): Card => ({ id, text: 'Where should Alex keep this?', yes: 'In projects',
  no: 'Keep here', askedAt: Date.UTC(2026, 9, 10, 12) });

beforeEach(async () => {
  for (const { name } of (await env.BOWER_KV.list()).keys) await env.BOWER_KV.delete(name);
});

async function aRun() {
  // Deadlines are ahead of the runtime, so only explicit wake calls run; no alarm/timer is awaited.
  const at = Date.now() + HOUR;
  const sub = `q1c-${crypto.randomUUID()}`;
  const p = env.PERSON.get(env.PERSON.idFromName(sub));
  await env.BOWER_KV.put(allowKey('you@example.com'), '1');
  const { generation } = await p.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'made-up-enc-token' });
  await p.pointFolder(generation, null, 'FOLDER_ID');
  const cookie = `${SESSION_COOKIE}=${await signSession({ sub, gen: generation }, env.SESSION_SECRET)}`;
  const admitted = await p.admit({ accountEpoch: (await p.account())?.accountEpoch ?? -1, scope: 'all',
    allowWeb: false, requestId: 'Q1C_PRESS', now: at, dailyLimit: 100, manifest: MANIFEST });
  expect(admitted.admitted).toBe(true);
  if (!admitted.admitted) throw new Error('Expected an admitted Q1c fixture run');
  const dispatched: Array<{ run_id: string; attempt: number; ticket: string }> = [];
  const github = { repo: env.GITHUB_REPO, apiOrigin: env.API_ORIGIN, token: 'made-up-token', fetchImpl: async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { client_payload: { run_id: string; attempt: number; ticket: string } };
      dispatched.push(body.client_payload);
      return new Response(null, { status: 204 });
    }
    return Response.json({ total_count: 0, workflow_runs: [] });
  } };
  await runInDurableObject(p, async (instance: Person) => { await instance.wake(at, github); });
  expect(dispatched).toHaveLength(1);
  const ticket = dispatched[0]?.ticket ?? '';
  const runId = admitted.run.id;
  const post = (seq: number, questions?: unknown, opts: { attempt?: number; ticket?: string; runId?: string; phase?: string } = {}) =>
    createApp().request(`${API}/runner/runs/${opts.runId ?? runId}/status`, { method: 'POST',
      headers: { authorization: `Bearer ${opts.ticket ?? ticket}`, 'content-type': 'application/json' },
      body: JSON.stringify({ attempt: opts.attempt ?? 1, seq, phase: opts.phase ?? 'writing',
        ...(questions === undefined ? {} : { questions }) }) }, env);
  const get = async (): Promise<Reply> => {
    const res = await createApp().request(`${API}/status`, { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    return await res.json() as Reply;
  };
  const read = async (response: Response): Promise<Reply> => { expect(response.status).toBe(200); return await response.json() as Reply; };
  // Positive control on every row: the old phase wire is still admitted through the production route.
  const legacy = await read(await post(1));
  expect((await get()).run).toMatchObject({ id: runId, phase: 'writing' });
  return { p, at, runId, ticket, post, get, read, legacy, github, dispatched };
}

describe('Q1c snapshots through createApp().request', () => {
  it('Q1c q1-status-seq-revision-recovery: contract 2 same-phase snapshots replace and raise revision without phaseAt', async () => {
    const { post, get, read, legacy } = await aRun();
    const first = await read(await post(2, [card()]));
    expect(first.run.phaseAt).toBe(legacy.run.phaseAt);
    expect(first.revision).toBe(legacy.revision + 1);
    expect(first.run.questions).toEqual([card()]);
    const unchanged = await read(await post(3, [card()]));
    expect(unchanged.revision).toBe(first.revision);
    const empty = await read(await post(4, []));
    expect(empty.run.questions).toEqual([]);
    expect(empty.revision).toBe(first.revision + 1);
    expect(empty.run.phaseAt).toBe(legacy.run.phaseAt);
    expect(await get()).toEqual(empty);
  });

  it('Q1c q1-status-seq-revision-recovery: duplicate seq and lost-response replay preserve the first asking', async () => {
    const { post, get, read } = await aRun();
    // Discard the response as a lost response would; use authenticated status to reconnect.
    expect((await post(2, [card()])).status).toBe(200);
    const kept = await get();
    const duplicate = await read(await post(2, [card('Q1C_SUBSTITUTED')]));
    expect(duplicate).toEqual(kept);
    expect(duplicate.run.questions).toEqual([card()]);
  });

  it.each(['seq', 'attempt', 'ticket', 'run'] as const)(
    'Q1c q1-status-seq-revision-recovery: %s fence cannot replace the durable snapshot', async (fence) => {
      const { post, get, read, runId } = await aRun();
      const kept = await read(await post(2, [card()]));
      const opts = fence === 'attempt' ? { attempt: 2 } : fence === 'ticket' ? { ticket: 'not-the-ticket' }
        : fence === 'run' ? { runId: `${runId.slice(0, 65)}OTHER` } : {};
      const refused = await post(fence === 'seq' ? 1 : 3, [card('Q1C_STALE')], opts);
      expect(refused.status).toBe(fence === 'ticket' || fence === 'run' ? 401 : 409);
      expect(await get()).toEqual(kept);
      expect((await get()).run.questions).toEqual([card()]);
    });

  it('Q1c q1-status-seq-revision-recovery: takeover fences the retired ticket and restarted Person retains the snapshot', async () => {
    const { p, at, post, get, read, github, dispatched } = await aRun();
    const kept = await read(await post(2, [card()]));
    const restarted = await runInDurableObject(p, (_instance, state) => new Person(state, env).runStatus(Date.now()));
    expect(restarted).toEqual(kept);
    await runInDurableObject(p, async (instance: Person) => { await instance.recover(at + 2 * HOUR, github); });
    await runInDurableObject(p, async (instance: Person) => { await instance.wake(at + 2 * HOUR, github); });
    const next = dispatched.find((d) => d.attempt === 2);
    expect(next).toBeDefined();
    expect((await post(3, [card('Q1C_OLD_TICKET')])).status).toBe(409);
    expect((await get()).run.questions).toEqual([card()]);
    const current = await read(await post(1, [card('Q1C_REPLACEMENT')], { attempt: 2, ticket: next?.ticket }));
    expect(current.run.questions).toEqual([card('Q1C_REPLACEMENT')]);
    expect(current.run.phaseAt).toBe(kept.run.phaseAt);
  });

  const invalid: Array<[string, unknown]> = [
    ['eleven questions', Array.from({ length: 11 }, (_, i) => card(`Q1C_${i}`))],
    ['non-array snapshot', { question: card() }],
    ['missing asking identity', [{ ...card(), askedAt: undefined }]],
    ['negative asking time', [{ ...card(), askedAt: -1 }]],
    ['empty question', [{ ...card(), text: ' ' }]],
    ['five public options', [{ ...card(), options: Array.from({ length: 5 }, (_, i) => ({ id: `Q1C_${i}`, label: 'Projects' })) }]],
    ['wrong id type', [{ ...card(), id: 17 }]],
    ['201-character question', [{ ...card(), text: 'x'.repeat(201) }]],
    ['41-character yes', [{ ...card(), yes: 'x'.repeat(41) }]],
    ['41-character no', [{ ...card(), no: 'x'.repeat(41) }]],
  ];
  it.each(invalid)('Q1c q1-status-seq-revision-recovery: contract 2 refuses %s without changing status', async (_why, payload) => {
    const { post, get, legacy } = await aRun();
    expect((await post(2, payload)).status).toBe(415);
    expect(await get()).toEqual(legacy);
  });

  it('Q1c fix 1: stored action payload is refused with two otherwise valid options', async () => {
    const { post, get, legacy } = await aRun();
    const payload = [{ ...card(), options: [{ id: 'Q1C_OPTION', label: 'Projects',
      action: { kind: 'file-to', folderId: 'FOLDER_ID' } }, { id: 'Q1C_OTHER_OPTION', label: 'Areas' }] }];
    expect((await post(2, payload)).status).toBe(415);
    expect(await get()).toEqual(legacy);
  });

  it('Q1c q1-status-seq-revision-recovery: contract 2 accepts ten bounded cards inside 64 KiB', async () => {
    const { post, read } = await aRun();
    const cards = Array.from({ length: 10 }, (_, i) => ({ ...card(`Q1C_${i}`), text: 'x'.repeat(200),
      yes: 'y'.repeat(40), no: 'n'.repeat(40) }));
    expect(new TextEncoder().encode(JSON.stringify(cards)).byteLength).toBeLessThan(64 * 1024);
    expect((await read(await post(2, cards))).run.questions).toEqual(cards);
  });

  it('Q1c q1-status-seq-revision-recovery: contract 2 keeps the entire request inside 64 KiB', async () => {
    const { runId, ticket, post, get, read } = await aRun();
    const kept = await read(await post(2, [card()]));
    const body = JSON.stringify({ attempt: 1, seq: 3, phase: 'writing', questions: [card()] });
    const over = body + ' '.repeat(64 * 1024 + 1 - new TextEncoder().encode(body).byteLength);
    const response = await createApp().request(`${API}/runner/runs/${runId}/status`, { method: 'POST',
      headers: { authorization: `Bearer ${ticket}`, 'content-type': 'application/json' }, body: over }, env);
    expect(response.status).toBe(413);
    expect(await get()).toEqual(kept);
    expect(kept.run.questions).toEqual([card()]);
  });

  it('Q1c q1-status-seq-revision-recovery: contract 4 public snapshot excludes action and uses the original status route', async () => {
    const { post, get, read } = await aRun();
    const publicCard = { ...card(), options: [{ id: 'Q1C_A', label: 'Projects' }, { id: 'Q1C_B', label: 'Areas' }] };
    expect((await read(await post(2, [publicCard]))).run.questions).toEqual([publicCard]);
    const text = JSON.stringify(await get());
    expect(text).not.toContain('file-to');
    expect(text).not.toContain('folderId');
    expect(text).not.toContain('action');
  });

  it('Q1c q1-status-seq-revision-recovery: shown state and public option identity survive reconnect', async () => {
    const { post, get, read } = await aRun();
    const shown = { ...card('q-state-NOTE_ID'), about: 'Projects/Made-up note.md',
      shown: { lines: ['Alex plans a made-up project.'], md5: 'a'.repeat(32), stamp: 'Q1C_STAMP' } };
    const option = { ...card('q-ask-PILE_ID'), options: [{ id: 'Q1C_A', label: 'Projects' },
      { id: 'Q1C_B', label: 'Areas' }] };
    const kept = await read(await post(2, [shown, option]));
    expect((await get()).run.questions).toEqual([shown, option]);
    expect(await get()).toEqual(kept);
  });

  it('Q1c q1-status-seq-revision-recovery: contract 5 an old status report leaves the additive snapshot in place', async () => {
    const { post, get, read } = await aRun();
    const kept = await read(await post(2, [card()]));
    const legacy = await read(await post(3));
    expect(legacy.run.questions).toEqual([card()]);
    expect(legacy.revision).toBe(kept.revision);
    expect(await get()).toEqual(legacy);
  });

  it('Q1c v15: a null snapshot means no live questions', async () => {
    const { p, runId, post, get, read } = await aRun();
    // First admit a nonnull snapshot: null must remove a previously published asking.
    expect((await read(await post(2, [card('Q1C_LIVE')]))).run.questions).toEqual([card('Q1C_LIVE')]);
    await runInDurableObject(p, (_instance, state) => {
      state.storage.sql.exec('UPDATE runs SET open_questions_snapshot = NULL WHERE id = ?', runId);
      state.storage.sql.exec('UPDATE control SET status_revision = status_revision + 1 WHERE id = 1');
    });
    const restarted = await runInDurableObject(p, (_instance, state) => new Person(state, env).runStatus(Date.now()));
    expect(restarted.run).not.toHaveProperty('questions');
    expect((await get()).run).not.toHaveProperty('questions');
  });

});
