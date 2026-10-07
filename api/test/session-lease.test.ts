import { env as testEnv } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';

import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { LEASE_TTL_MS } from '../src/session-lease.js';
import { allowKey } from '../src/store.js';

const env = testEnv as unknown as Env;
const kv = env.BOWER_KV;
const APP = 'https://app.example.com';
const EMAIL = 'you@example.com';

beforeEach(async () => {
  for (const { name } of (await kv.list()).keys) await kv.delete(name);
});

const person = (sub: string) => env.PERSON.get(env.PERSON.idFromName(sub));

async function someone(): Promise<{ sub: string; cookie: string }> {
  const sub = `lease-sub-${crypto.randomUUID()}`;
  await kv.put(allowKey(EMAIL), '1');
  const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
  const { generation } = await person(sub).signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
  const token = await signSession({ sub, gen: generation }, env.SESSION_SECRET);
  return { sub, cookie: `${SESSION_COOKIE}=${token}` };
}

async function send(cookie: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return await createApp().request(
    `${APP}/session`,
    {
      method: 'POST',
      headers: { cookie, origin: APP, 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    env,
  );
}

const reply = async (r: Response) => {
  expect(r.status).toBe(200);
  return (await r.json()) as { active: boolean; epoch: number };
};

describe('POST /session', () => {
  it('the session lease follows the contract', async () => {
    const { sub, cookie } = await someone();
    // Over HTTP: the first check grants it; another place is told no until it takes it.
    expect(await reply(await send(cookie, { place: 'laptop', action: 'check', gen: 0 }))).toEqual({ active: true, epoch: 1 });
    expect(await reply(await send(cookie, { place: 'laptop', action: 'check', gen: 0 }))).toEqual({ active: true, epoch: 1 });
    expect(await reply(await send(cookie, { place: 'phone', action: 'check' }))).toEqual({ active: false, epoch: 1 });
    expect(await reply(await send(cookie, { place: 'phone', action: 'take', gen: 0 }))).toEqual({ active: true, epoch: 2 });
    expect(await reply(await send(cookie, { place: 'laptop', action: 'check', gen: 0 }))).toEqual({ active: false, epoch: 2 });
    // Leave by the holder frees it and keeps the epoch; a leave by another place changes nothing.
    expect(await reply(await send(cookie, { place: 'laptop', action: 'leave', gen: 0 }))).toEqual({ active: false, epoch: 2 });
    expect(await reply(await send(cookie, { place: 'phone', action: 'leave', gen: 1 }))).toEqual({ active: false, epoch: 2 });
    // Leave then check by the same place, nobody in between: the same epoch comes back.
    expect(await reply(await send(cookie, { place: 'phone', action: 'check', gen: 1 }))).toEqual({ active: true, epoch: 2 });

    // Time, through the person object (the route passes Date.now()).
    const p = person(sub);
    const t0 = 1_000_000;
    expect(await p.session('phone', 'check', 1, t0)).toEqual({ active: true, epoch: 2 });
    // Expired, nobody in between: the holder renews with the same epoch (TL-P2-25).
    expect(await p.session('phone', 'check', 1, t0 + LEASE_TTL_MS + 1)).toEqual({ active: true, epoch: 2 });
    // Live: another place is told no.
    expect(await p.session('tablet', 'check', 0, t0 + LEASE_TTL_MS + 2)).toEqual({ active: false, epoch: 2 });
    // Expired, then another place checks: granted with epoch + 1, and the old holder has lost it.
    const later = t0 + 2 * LEASE_TTL_MS + 2;
    expect(await p.session('tablet', 'check', 0, later)).toEqual({ active: true, epoch: 3 });
    expect(await p.session('phone', 'check', 1, later + 1)).toEqual({ active: false, epoch: 3 });
    expect(await p.holdsLease('phone', 2)).toBe(false);
    expect(await p.holdsLease('tablet', 3)).toBe(true);
    // A leave and then a check by another place: granted with epoch + 1.
    expect(await p.session('tablet', 'leave', 0, later + 2)).toEqual({ active: false, epoch: 3 });
    expect(await p.session('phone', 'check', 1, later + 3)).toEqual({ active: true, epoch: 4 });
  });

  it("a check started before the place's latest leave is discarded", async () => {
    const { sub, cookie } = await someone();
    expect(await reply(await send(cookie, { place: 'laptop', action: 'check', gen: 0 }))).toEqual({ active: true, epoch: 1 });
    expect(await reply(await send(cookie, { place: 'laptop', action: 'leave', gen: 1 }))).toEqual({ active: false, epoch: 1 });
    // A check sent before that leave arrives late: it grants and renews nothing.
    expect(await reply(await send(cookie, { place: 'laptop', action: 'check', gen: 0 }))).toEqual({ active: false, epoch: 1 });
    // A missing gen counts as 0: discarded too.
    expect(await reply(await send(cookie, { place: 'laptop', action: 'check' }))).toEqual({ active: false, epoch: 1 });
    expect(await person(sub).holdsLease('laptop', 1)).toBe(false);
    // Another place is still free to have it; the discarded check never took it.
    expect(await reply(await send(cookie, { place: 'phone', action: 'check', gen: 0 }))).toEqual({ active: true, epoch: 2 });
    // A stale check from the place that left, while another holds it, answers the current state.
    expect(await reply(await send(cookie, { place: 'laptop', action: 'check', gen: 0 }))).toEqual({ active: false, epoch: 2 });
    // A check at the leave's generation is heard: the live lease belongs to the phone.
    expect(await reply(await send(cookie, { place: 'laptop', action: 'check', gen: 1 }))).toEqual({ active: false, epoch: 2 });
    // The holder leaves: a check begun before its leave is discarded, one after takes it back with the same epoch.
    expect(await reply(await send(cookie, { place: 'phone', action: 'leave', gen: 3 }))).toEqual({ active: false, epoch: 2 });
    expect(await reply(await send(cookie, { place: 'phone', action: 'check', gen: 2 }))).toEqual({ active: false, epoch: 2 });
    expect(await reply(await send(cookie, { place: 'phone', action: 'check', gen: 3 }))).toEqual({ active: true, epoch: 2 });
    // An older leave arriving late never lowers the generation.
    expect(await reply(await send(cookie, { place: 'laptop', action: 'leave', gen: 0 }))).toEqual({ active: false, epoch: 2 });
    expect(await reply(await send(cookie, { place: 'laptop', action: 'check', gen: 0 }))).toEqual({ active: false, epoch: 2 });
  });

  it('a session body that fails validation answers 415', async () => {
    const { cookie } = await someone();
    const bad: unknown[] = [
      'not json',
      [],
      { action: 'check' },
      { place: '', action: 'check' },
      { place: 'x'.repeat(65), action: 'check' },
      { place: 'has space', action: 'check' },
      { place: 'laptop', action: 'grab' },
      { place: 'laptop', action: 'check', gen: -1 },
      { place: 'laptop', action: 'check', gen: 1.5 },
      { place: 'laptop', action: 'check', gen: '1' },
      { place: 'laptop', action: 'check', gen: Number.MAX_SAFE_INTEGER + 1 },
    ];
    for (const body of bad) {
      const r = await send(cookie, body);
      expect(r.status, JSON.stringify(body)).toBe(415);
      expect(((await r.json()) as { error: { code: string } }).error.code).toBe('unsupported-media-type');
    }
    expect((await send(cookie, { place: 'laptop', action: 'check' }, { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await send(cookie, { place: 'A-z_09', action: 'check' })).status).toBe(200);
  });

  it('session needs a session and the app origin', async () => {
    const none = await createApp().request(`${APP}/session`, { method: 'POST', headers: { origin: APP, 'content-type': 'application/json' }, body: '{"place":"a","action":"check"}' }, env);
    expect(none.status).toBe(401);
    const { cookie } = await someone();
    const wrong = await send(cookie, { place: 'a', action: 'check' }, { origin: 'https://evil.example.com' });
    expect(wrong.status).toBe(403);
  });
});
