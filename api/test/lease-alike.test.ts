import { env as testEnv } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { LEASE_CASES } from '../../src/data/contracts/lease-cases.js';
import type { Env } from '../src/env.js';

const env = testEnv as unknown as Env;

describe('the Worker and the fake decide leases alike', () => {
  for (const c of LEASE_CASES) {
    it(`the Worker: ${c.name}`, async () => {
      const person = env.PERSON.get(env.PERSON.idFromName(`lease-alike-${crypto.randomUUID()}`));
      const start = 1_000_000_000_000;
      for (const s of c.steps) {
        expect(await person.session(s.place, s.action, s.gen ?? 0, start + s.at), `${s.action} by ${s.place} at ${s.at}`).toEqual({ active: s.active, epoch: s.epoch });
        if (s.holds) expect(await person.holdsLease(s.holds.place, s.holds.epoch)).toBe(s.holds.yes);
      }
    });
  }
});
