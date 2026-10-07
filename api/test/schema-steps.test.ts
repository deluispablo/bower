import { describe, expect, it } from 'vitest';

import { migrate, SCHEMA_VERSION } from '../src/person-schema.js';

/**
 * Shipped person schema steps are append-only (TL-P3-24): a person object already at version n has run
 * steps 1 to n, so changing one of them would leave old and new objects with different tables. Each step's
 * SHA-256 is pinned here. Appending a step means adding its hash at the end; changing a shipped one fails.
 */
const SHIPPED: readonly string[] = [];

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
