import { describe, expect, it } from 'vitest';

import { migrate, SCHEMA_VERSION } from '../src/person-schema.js';

/**
 * Shipped person schema steps are append-only (TL-P3-24): a person object already at version n has run
 * steps 1 to n, so changing one of them would leave old and new objects with different tables. Each step's
 * SHA-256 is pinned here. Appending a step means adding its hash at the end; changing a shipped one fails.
 */
const SHIPPED: readonly string[] = [
  '231c35e559ce6858a5fe8180251faf4857a59243ddbf56b50fe04cb4f21b9a26', // 1: lease, admission, quota, control, run_ticket
  'f497153aee1941258b183b9b52d392c3b5a1edd563d18b1fc7557cc10e963544', // 2: account
  '777a36288229d7a3f7a9110be595f5ec1c0c6c33d0916ed9a11aab3436701aaa', // 3: folder pointer, access token
  '83b32e71b7cfa199d3230bdb90af48e78114568fc166d5d1ac794036fe8d5841', // 4: folder fill claim
  '52f8e42becb517ba326f1152322d00f44a65861a320a7a70221c9d810a8dd585', // 5: reserved template ids
  '2d8150cce7839a917571af6d93b971673fded5d0b66cd8457cbbc2e8079a66fb', // 6: session lease beat and leave
  '8bdc7b638bd31cb1d283e114aa811caeaafe71e2e7a41859cd925fc548796e54', // 7: runs
  'c25824c0a29b7fb09296b7a5a38491bcdeeaf28200b3fb4817252e9e22f0cbb4', // 8: runner ticket expiry and report seq
  '5a808d58e22843ac85679a9aaa1c2266d61e62588008171fc66db87aec0198f4', // 9: admission manifest
  '57176deac8fffcf05cbb607fb1a5787436538f67190f29fefa5e2900a756f989', // 10: ticket report phase
  '9fbb521c0a6358d0ebe4aaae29c9adf8132bfe17bda36d2b4a2868a76c74d112', // 11: dead schema dropped, ticket epoch named attempt
  'f165fd3557d2ff5f29d095b926c6abe9b93232fe9649593ea580eed034388885', // 12: deadlines
  '968095f857dd5d1e72f4233c1e27c7b27cad9f555a8542401e83bd5d03964721', // 13: deadline attempts
  'bb88bb4aa32bfbbc233a61499b04642febee41bff10b9ee28c7b3d075388f7a5', // 14: run dispatch deadline and version
  'd7fda87dff33915a0039de7b54bf893b61751588eb64155e5b0adc11e62b0917', // 15: open-questions snapshot
];

/** The statements `migrate` runs on a database recorded at `current`, without its own schema_version bookkeeping. */
function statementsFrom(current: number): string[] {
  const ran: string[] = [];
  const sql = {
    exec(query: string) {
      if (query.startsWith('SELECT version FROM schema_version')) {
        return { toArray: () => (current > 0 ? [{ version: current }] : []) };
      }
      if (!/^\s*(CREATE TABLE IF NOT EXISTS schema_version|INSERT INTO schema_version)/.test(query)) ran.push(query);
      return { toArray: () => [] };
    },
  };
  migrate(sql as unknown as SqlStorage);
  return ran;
}

/** Step n's statements: what a database at n - 1 runs, less what one at n runs. */
function step(version: number): string[] {
  const before = statementsFrom(version - 1);
  const after = statementsFrom(version);
  return before.slice(0, before.length - after.length);
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('person schema steps', () => {
  it('shipped person schema steps never change', async () => {
    const hashes: string[] = [];
    for (let version = 1; version <= SCHEMA_VERSION; version += 1) {
      const statements = step(version);
      expect(statements.length, `step ${version}`).toBeGreaterThan(0);
      hashes.push(await sha256(JSON.stringify(statements)));
    }
    // Every shipped step is still what it was, in the same place.
    expect(hashes.slice(0, SHIPPED.length)).toEqual(SHIPPED);
    // A new step is pinned when it is added, so it can never change afterwards either.
    expect(hashes.length, 'a step was appended without pinning its hash in SHIPPED').toBe(SHIPPED.length);
  });
});
