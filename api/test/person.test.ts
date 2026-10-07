import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env.js';
import { PERSON_TABLES, SCHEMA_VERSION } from '../src/person-schema.js';

const people = (env as Pick<Env, 'PERSON'>).PERSON;
const personFor = (sub: string) => people.get(people.idFromName(sub));

/** Takes back schema step 6 (the lease columns and the leave table), for the tests that rewind further. */
function undoV6(sql: SqlStorage): void {
  sql.exec('DROP TABLE session_leave');
  sql.exec('ALTER TABLE session_lease DROP COLUMN beat_at');
  sql.exec('ALTER TABLE session_lease DROP COLUMN left_place');
}

function rowCount(sql: SqlStorage, table: string): number {
  return sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`).one().n;
}

describe('person object', () => {
  it("one person's calls run one at a time", async () => {
    const alex = personFor('sub-alex-concurrency');
    const calls = 25;
    const seen = await Promise.all(
      Array.from({ length: calls }, () => alex.countQuota('2026-10-06')),
    );
    // Every call saw the previous call's committed write: no update lost, no count repeated.
    expect([...seen].sort((a, b) => a - b)).toEqual(
      Array.from({ length: calls }, (_, i) => i + 1),
    );
    expect(await alex.countQuota('2026-10-06')).toBe(calls + 1);
    // Another window is its own counter.
    expect(await alex.countQuota('2026-10-07')).toBe(1);
  });

  it("two people never see each other's rows", async () => {
    const alex = personFor('sub-alex-rows');
    const sam = personFor('sub-sam-rows');
    expect(people.idFromName('sub-alex-rows').equals(people.idFromName('sub-sam-rows'))).toBe(false);

    expect(await alex.countQuota('2026-10-06')).toBe(1);
    expect(await alex.countQuota('2026-10-06')).toBe(2);
    await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec('INSERT INTO session_lease (id, place, epoch) VALUES (1, ?, ?)', 'place-a', 3);
      sql.exec('INSERT INTO admission (id, active_run_id, request_id) VALUES (1, ?, ?)', 'run-1', 'req-1');
      sql.exec(
        'INSERT INTO control (id, head, status_revision, claim, epoch) VALUES (1, ?, ?, ?, ?)',
        'head-1',
        4,
        'claim-1',
        2,
      );
      sql.exec(
        'INSERT INTO run_ticket (hash, run_id, epoch, retired) VALUES (?, ?, ?, 0)',
        'hash-1',
        'run-1',
        2,
      );
      sql.exec('INSERT INTO account (id, email, name, enc_refresh_token) VALUES (1, ?, ?, ?)', 'you@example.com', 'Alex', 'v1.a.b');
    });

    // Sam's first call sees a fresh counter, and none of Alex's rows.
    expect(await sam.countQuota('2026-10-06')).toBe(1);
    const samCounts = await runInDurableObject(sam, (_instance, state) =>
      Object.fromEntries(PERSON_TABLES.map((t) => [t, rowCount(state.storage.sql, t)])),
    );
    expect(samCounts).toEqual({
      schema_version: 1,
      session_lease: 0,
      session_leave: 0,
      admission: 0,
      quota: 1,
      control: 0,
      run_ticket: 0,
      account: 0,
    });
    // Alex's rows are still all there, untouched by Sam.
    const alexCounts = await runInDurableObject(alex, (_instance, state) =>
      Object.fromEntries(PERSON_TABLES.map((t) => [t, rowCount(state.storage.sql, t)])),
    );
    expect(alexCounts).toEqual({
      schema_version: 1,
      session_lease: 1,
      session_leave: 0,
      admission: 1,
      quota: 1,
      control: 1,
      run_ticket: 1,
      account: 1,
    });
    expect(await alex.countQuota('2026-10-06')).toBe(3);
  });

  it('the schema is created on first use, at the current version, once', async () => {
    const alex = personFor('sub-alex-schema');
    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    const tables = await runInDurableObject(alex, (_instance, state) =>
      state.storage.sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%' ORDER BY name",
        )
        .toArray()
        .map((r) => r.name),
    );
    expect(tables).toEqual([...PERSON_TABLES].sort());

    // A restarted object keeps its rows and its single version row.
    expect(await alex.countQuota('2026-10-06')).toBe(1);
    await evictDurableObject(alex);
    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    expect(await alex.countQuota('2026-10-06')).toBe(2);
    const versionRows = await runInDurableObject(alex, (_instance, state) =>
      rowCount(state.storage.sql, 'schema_version'),
    );
    expect(versionRows).toBe(1);
  });

  it('a person object refuses storage from a newer build', async () => {
    const alex = personFor('sub-alex-newer');
    expect(await alex.countQuota('2026-10-06')).toBe(1);
    const newer = SCHEMA_VERSION + 1;
    await runInDurableObject(alex, (_instance, state) => {
      state.storage.sql.exec('UPDATE schema_version SET version = ? WHERE id = 1', newer);
    });
    await evictDurableObject(alex);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(alex.schemaVersion()).rejects.toThrow();
      await expect(alex.countQuota('2026-10-06')).rejects.toThrow();
    } finally {
      log.mockRestore();
    }
    // Nothing was downgraded: a restart still refuses (a downgrade would let it start), and no call wrote.
    const again = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await expect(alex.countQuota('2026-10-06')).rejects.toThrow();
      await expect(runInDurableObject(alex, () => 1)).rejects.toThrow(/newer than this build/);
    } finally {
      again.mockRestore();
    }
  });
});

describe('person storage migration', () => {
  it('a version 1 person migrates to the current version on start, keeps its rows and gains the account table', async () => {
    const alex = personFor('sub-alex-v1');
    expect(await alex.countQuota('2026-10-06')).toBe(1);
    // Put the database back as P3-3 shipped it: no account table, a version row of 1.
    await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      undoV6(sql);
      sql.exec('DROP TABLE account');
      sql.exec('UPDATE schema_version SET version = 1 WHERE id = 1');
    });
    await evictDurableObject(alex);

    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    expect(await alex.countQuota('2026-10-06')).toBe(2);
    const after = await runInDurableObject(alex, (_instance, state) => ({
      counts: Object.fromEntries(PERSON_TABLES.map((t) => [t, rowCount(state.storage.sql, t)])),
      version: state.storage.sql.exec<{ version: number }>('SELECT version FROM schema_version WHERE id = 1').one().version,
    }));
    expect(after.version).toBe(SCHEMA_VERSION);
    expect(after.counts.account).toBe(0);
    expect(after.counts.quota).toBe(1);
    expect(await alex.account()).toBeNull();
  });

  it('a version 2 person migrates to the current version, keeps its account and gains an empty folder pointer', async () => {
    const alex = personFor('sub-alex-v2');
    await alex.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    // Put the database back as P3-4 shipped it: no pointer or token columns, a version row of 2.
    await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      undoV6(sql);
      for (const column of ['folder_id', 'access_token', 'access_expires_at', 'folder_complete', 'pending_folder_id', 'vault_claim', 'vault_claim_until', 'pending_template_ids']) {
        sql.exec(`ALTER TABLE account DROP COLUMN ${column}`);
      }
      sql.exec('UPDATE schema_version SET version = 2 WHERE id = 1');
    });
    await evictDurableObject(alex);

    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    expect(await alex.account()).toEqual({ email: 'you@example.com', name: 'Alex', generation: 0 });
    expect(await alex.vaultState()).toEqual({ folderId: null, complete: false, pending: null, templateIds: null });
    expect(await alex.encryptedRefreshToken()).toBe('enc-token');
    expect(await alex.folderId()).toBeNull();
    expect(await alex.setFolderId('FOLDER_ID')).toBe(true);
    expect(await alex.folderId()).toBe('FOLDER_ID');
  });

  it('person storage migrates from v5 to v6 keeping every row', async () => {
    const alex = personFor('sub-alex-v5');
    await alex.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    expect(await alex.setFolderId('FOLDER_ID')).toBe(true);
    expect(await alex.claimVault('call-1', 1_000, 61_000)).toBe(true);
    await alex.cacheDriveToken({ accessToken: 'access-1', expiresAt: 9_999_999_999_999 });
    // Put the database back as P3-6 shipped it: the v5 lease table (place, epoch) and a version row of 5.
    await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec('DROP TABLE IF EXISTS session_leave');
      sql.exec('DROP TABLE session_lease');
      sql.exec(`CREATE TABLE session_lease (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        place TEXT NOT NULL,
        epoch INTEGER NOT NULL CHECK (epoch >= 0)
      )`);
      sql.exec('INSERT INTO session_lease (id, place, epoch) VALUES (1, ?, ?)', 'laptop', 7);
      sql.exec('UPDATE schema_version SET version = 5 WHERE id = 1');
    });
    await evictDurableObject(alex);

    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(6);
    // Every value survives: the account, the folder, the claim, the token and the lease.
    expect(await alex.account()).toEqual({ email: 'you@example.com', name: 'Alex', generation: 0 });
    expect(await alex.encryptedRefreshToken()).toBe('enc-token');
    expect(await alex.folderId()).toBe('FOLDER_ID');
    expect(await alex.cachedDriveToken(0)).toEqual({ accessToken: 'access-1', expiresAt: 9_999_999_999_999 });
    expect(await alex.claimVault('call-2', 2_000, 62_000)).toBe(false);
    const kept = await runInDurableObject(alex, (_instance, state) => ({
      claim: state.storage.sql.exec<{ vault_claim: string; vault_claim_until: number }>('SELECT vault_claim, vault_claim_until FROM account WHERE id = 1').one(),
      leaves: rowCount(state.storage.sql, 'session_leave'),
    }));
    expect(kept).toEqual({ claim: { vault_claim: 'call-1', vault_claim_until: 61_000 }, leaves: 0 });
    // The lease kept its holder and epoch: the holder's epoch still holds, and its check renews it.
    expect(await alex.holdsLease('laptop', 7)).toBe(true);
    expect(await alex.session('laptop', 'check', 0, 5_000)).toEqual({ active: true, epoch: 7 });
    expect(await alex.session('phone', 'check', 0, 5_001)).toEqual({ active: false, epoch: 7 });
  });
});
