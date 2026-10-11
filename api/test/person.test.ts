import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../src/env.js';
import type { Person } from '../src/person.js';
import * as schema from '../src/person-schema.js';
import { PERSON_TABLES, SCHEMA_VERSION } from '../src/person-schema.js';
import { hashTicket } from '../src/run-ticket.js';
import { pretendGitHub } from './github-support.js';
import { QUEUED_STALE_MS } from '../src/process.js';
import { MANIFEST } from './drive-v3.js';
import { farAhead, inWindow } from './time.js';

const people = (env as Pick<Env, 'PERSON'>).PERSON;
const personFor = (sub: string) => people.get(people.idFromName(sub));

/**
 * The going run's deadline after a migration from before v12. The migration arms it at the wall clock and the object's
 * real alarm may already have moved it to the run's own stale deadline: both are correct, so a test asserts the window
 * [read before the migration, `admittedAt` + the stale time], never one instant (docs/harness/defects/2026-10-08-deadlines-test-flake.md).
 */
async function expectRunDeadlineInWindow(alex: ReturnType<typeof personFor>, before: number, admittedAt: number): Promise<void> {
  const rows = await runInDurableObject(alex, (_i, state) => state.storage.sql.exec<{ at: number }>("SELECT at FROM deadlines WHERE kind = 'run'").toArray());
  expect(rows).toHaveLength(1);
  inWindow(rows[0]?.at, before, admittedAt + QUEUED_STALE_MS);
}

/**
 * Takes back schema step 11 (the dead schema it dropped, and the ticket's attempt named epoch again), for the tests
 * that rewind further. The v1 `control` columns come back at the end of the row, with their v1 types and checks.
 */
/** The tables of a person from before v12, which added `deadlines` (its moved rows: test/deadlines.test.ts). */
const TABLES_BEFORE_V12 = PERSON_TABLES.filter((t) => t !== 'deadlines');

/** Takes back schema step 14 (the run's dispatch deadline and version), for the tests that rewind further. */
function undoV14(sql: SqlStorage): void {
  sql.exec('ALTER TABLE runs DROP COLUMN deadline_at');
  sql.exec('ALTER TABLE runs DROP COLUMN version');
}

/** What step 14 gives a run kept from before it: no dispatch due, version 0. */
const keptRun = (r: Record<string, SqlStorageValue>): Record<string, SqlStorageValue> => ({ ...r, deadline_at: null, version: 0 });

/** Takes back schema steps 14 to 12 (the deadlines table), for the tests that rewind further. */
function undoV12(sql: SqlStorage): void {
  undoV14(sql);
  sql.exec('DROP TABLE deadlines');
}

function undoV11(sql: SqlStorage): void {
  undoV12(sql);
  sql.exec('ALTER TABLE run_ticket RENAME COLUMN attempt TO epoch');
  sql.exec('ALTER TABLE control ADD COLUMN head TEXT');
  sql.exec('ALTER TABLE control ADD COLUMN claim TEXT');
  sql.exec('ALTER TABLE control ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0 CHECK (epoch >= 0)');
  sql.exec(`CREATE TABLE admission (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_run_id TEXT,
    request_id TEXT
  )`);
}

/** Takes back schema steps 11 and 10 (the phase of an attempt's last report), for the tests that rewind further. */
function undoV10(sql: SqlStorage): void {
  undoV11(sql);
  sql.exec('ALTER TABLE run_ticket DROP COLUMN report_phase');
}

/** Takes back schema steps 10 and 9 (the run's admission manifest), for the tests that rewind further. */
function undoV9(sql: SqlStorage): void {
  undoV10(sql);
  sql.exec('ALTER TABLE runs DROP COLUMN manifest');
}

/** Takes back schema steps 9 and 8 (the runner wire's ticket columns), for the tests that rewind further. */
function undoV8(sql: SqlStorage): void {
  undoV9(sql);
  sql.exec('ALTER TABLE run_ticket DROP COLUMN expires_at');
  sql.exec('ALTER TABLE run_ticket DROP COLUMN report_seq');
}

/** Takes back schema steps 8 and 7 (the runs table), for the tests that rewind further. */
function undoV7(sql: SqlStorage): void {
  undoV8(sql);
  sql.exec('DROP TABLE IF EXISTS runs');
}

/** Takes back schema steps 7 and 6 (the lease columns and the leave table), for the tests that rewind further. */
function undoV6(sql: SqlStorage): void {
  undoV7(sql);
  sql.exec('DROP TABLE session_leave');
  sql.exec('ALTER TABLE session_lease DROP COLUMN beat_at');
  sql.exec('ALTER TABLE session_lease DROP COLUMN left_place');
}

/** What step 11 keeps of a control row read before it: the status revision (the other v1 columns were never used). */
function keptControl(rows: Record<string, SqlStorageValue>[] | undefined): Record<string, SqlStorageValue>[] {
  return (rows ?? []).map((c) => ({ id: c.id ?? null, status_revision: c.status_revision ?? null }));
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
      sql.exec('INSERT INTO control (id, status_revision) VALUES (1, ?)', 4);
      sql.exec(
        'INSERT INTO run_ticket (hash, run_id, attempt, retired) VALUES (?, ?, ?, 0)',
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
      quota: 1,
      control: 0,
      run_ticket: 0,
      account: 0,
      runs: 0,
      deadlines: 0,
    });
    // Alex's rows are still all there, untouched by Sam.
    const alexCounts = await runInDurableObject(alex, (_instance, state) =>
      Object.fromEntries(PERSON_TABLES.map((t) => [t, rowCount(state.storage.sql, t)])),
    );
    expect(alexCounts).toEqual({
      schema_version: 1,
      session_lease: 1,
      session_leave: 0,
      quota: 1,
      control: 1,
      run_ticket: 1,
      account: 1,
      runs: 0,
      deadlines: 0,
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

  it('schema v11 has no unused tables', async () => {
    const alex = personFor('sub-alex-schema-v11');
    const shape = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      const columns = (table: string): string[] =>
        sql.exec<{ name: string }>('SELECT name FROM pragma_table_info(?) ORDER BY cid', table).toArray().map((c) => c.name);
      return {
        tables: sql
          .exec<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%' ORDER BY name",
          )
          .toArray()
          .map((r) => r.name),
        control: columns('control'),
        runTicket: columns('run_ticket'),
      };
    });
    // The v1 admission table was never read or written (runs replaced it in v7), nor were control's head,
    // claim and epoch; a ticket's epoch is the attempt it was minted for, and is named so.
    expect(shape).toEqual({
      // v12 adds the deadlines table (TL-P4-14).
      tables: ['account', 'control', 'deadlines', 'quota', 'run_ticket', 'runs', 'schema_version', 'session_lease', 'session_leave'],
      control: ['id', 'status_revision'],
      runTicket: ['hash', 'run_id', 'attempt', 'retired', 'expires_at', 'report_seq', 'report_phase'],
    });
    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
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

describe('Delete me', () => {
  it('Delete me classes every table', async () => {
    const classes = (schema as unknown as Record<string, unknown>).TABLES_AT_DELETE as Record<string, 'personal' | 'kept'> | undefined;
    expect(classes, 'person-schema.ts says what Delete me does with each table').toBeDefined();
    const alex = personFor(`sub-alex-delete-${crypto.randomUUID()}`);
    const t0 = farAhead();
    // A row in every table: account and folder, the lease and a leave, a run (quota, revision, deadlines), a ticket
    // the alarm minted and its report, an answer waiting.
    await alex.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    await alex.setFolderId('FOLDER_ID');
    await alex.session('laptop', 'check', 0, t0);
    await alex.session('laptop', 'leave', 0, t0);
    await alex.session('phone', 'check', 0, t0);
    const admitted = await alex.admit({ accountEpoch: (await alex.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-1', now: t0, dailyLimit: 100, manifest: MANIFEST });
    if (!admitted.admitted) throw new Error('not admitted');
    const gh = pretendGitHub(env as Env);
    await runInDurableObject(alex, async (instance: Person) => {
      await instance.wake(t0, gh.access);
    });
    gh.restore();
    const ticket = gh.dispatched[0]?.ticket ?? '';
    expect(await alex.runnerReport(admitted.run.id, await hashTicket(ticket), { attempt: 1, seq: 1, phase: 'reading', total: 1 }, t0)).toMatchObject({ accepted: true });
    await alex.admit({ accountEpoch: (await alex.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'answer-1', subject: 'p-receipt', answer: true, now: t0, dailyLimit: 100, manifest: null });
    const tables = async (): Promise<Record<string, Record<string, SqlStorageValue>[]>> =>
      await runInDurableObject(alex, (_i, state) => {
        const sql = state.storage.sql;
        const names = sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").toArray();
        return Object.fromEntries(names.map(({ name }) => [name, sql.exec(`SELECT * FROM ${name}`).toArray()]));
      });
    const before = await tables();
    // Every table is classed, so a new one cannot be forgotten.
    expect(Object.keys(before).sort()).toEqual(Object.keys(classes ?? {}).sort());
    for (const [name, rows] of Object.entries(before)) expect(rows.length, `${name} has a row before Delete me`).toBeGreaterThan(0);

    await alex.forget();
    const after = await tables();
    for (const [name, kind] of Object.entries(classes ?? {})) if (kind === 'personal') expect(after[name], name).toEqual([]);
    expect(after.schema_version).toEqual(before.schema_version);
    // The ticket live at Delete me is kept until it expires, with nothing personal: no run id, no report.
    expect(after.run_ticket).toEqual([{ hash: await hashTicket(ticket), run_id: '', attempt: 1, retired: 1, expires_at: before.run_ticket?.[0]?.expires_at, report_seq: null, report_phase: null }]);
    expect(after.deadlines).toEqual([expect.objectContaining({ kind: 'gone', key: await hashTicket(ticket), at: before.run_ticket?.[0]?.expires_at })]);
    // The generation floor is the one value kept besides.
    const kv = await runInDurableObject(alex, (_i, state) => Array.from(state.storage.kv.list(), ([k]) => k));
    expect(kv).toEqual(['generationFloor']);
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
    expect(await alex.account()).toEqual({ email: 'you@example.com', name: 'Alex', generation: 0, accountEpoch: 0 });
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
      undoV7(sql);
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
    // Every value survives: the account, the folder, the claim, the token and the lease.
    expect(await alex.account()).toEqual({ email: 'you@example.com', name: 'Alex', generation: 0, accountEpoch: 0 });
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

  it('person storage migrates from v6 to v7 keeping every row', async () => {
    const alex = personFor('sub-alex-v6');
    await alex.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    expect(await alex.setFolderId('FOLDER_ID')).toBe(true);
    expect(await alex.session('laptop', 'check', 0, 1_000)).toEqual({ active: true, epoch: 1 });
    expect(await alex.session('phone', 'leave', 2, 1_000)).toEqual({ active: false, epoch: 1 });
    expect(await alex.countQuota('2026-10-07')).toBe(1);
    // Put the database back as P3-7 shipped it: no runs table, a version row of 6, and v6 rows in every table.
    const before = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      undoV7(sql);
      sql.exec('INSERT INTO admission (id, active_run_id, request_id) VALUES (1, ?, ?)', 'run-1', 'req-1');
      sql.exec('INSERT INTO control (id, head, status_revision, claim, epoch) VALUES (1, ?, ?, ?, ?)', 'head-1', 4, 'claim-1', 2);
      sql.exec('INSERT INTO run_ticket (hash, run_id, epoch, retired) VALUES (?, ?, ?, 0)', 'hash-1', 'run-1', 2);
      sql.exec('UPDATE schema_version SET version = 6 WHERE id = 1');
      return Object.fromEntries(
        TABLES_BEFORE_V12.filter((t) => t !== 'runs').map((t) => [t, sql.exec(`SELECT * FROM ${t}`).toArray()]),
      );
    });
    await evictDurableObject(alex);

    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    const after = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      return Object.fromEntries(
        TABLES_BEFORE_V12.map((t) => [
          t,
          // v8's ticket columns aside: the v7 → v8 test covers them. v11 names the ticket's epoch attempt.
          sql.exec(t === 'run_ticket' ? 'SELECT hash, run_id, attempt AS epoch, retired FROM run_ticket' : `SELECT * FROM ${t}`).toArray(),
        ]),
      );
    });
    // Every v6 row is there as it was (the version row aside), and the runs table starts empty. v11 dropped the
    // control columns nothing used, and the admission table, which are not in PERSON_TABLES.
    expect({ ...after, schema_version: undefined, runs: undefined }).toEqual({
      ...before,
      control: keptControl(before.control),
      schema_version: undefined,
      runs: undefined,
    });
    expect(before.control).toEqual([{ id: 1, head: 'head-1', status_revision: 4, claim: 'claim-1', epoch: 2 }]);
    expect(after.schema_version).toEqual([{ id: 1, version: SCHEMA_VERSION }]);
    expect(after.runs).toEqual([]);
    // The status revision carries on from the kept control row.
    expect((await alex.runStatus(2_000)).revision).toBe(4);
    // Admitted far ahead: its stale deadline is not due, so the real alarm never looks the run up on GitHub.
    const admitted = await alex.admit({ accountEpoch: (await alex.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-1', now: farAhead(), dailyLimit: 100, manifest: MANIFEST });
    expect(admitted).toMatchObject({ admitted: true, revision: 5 });
    expect(await alex.holdsLease('laptop', 1)).toBe(true);
  });

  it('person storage migrates from v7 to v8 keeping every row', async () => {
    const alex = personFor('sub-alex-v7');
    const t0 = farAhead();
    await alex.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    const admitted = await alex.admit({ accountEpoch: (await alex.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-1', now: t0, dailyLimit: 100, manifest: MANIFEST });
    expect(admitted).toMatchObject({ admitted: true });
    // Put the database back as P3-8 shipped it: no ticket columns, a version row of 7, a v1 ticket row.
    const before = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      undoV8(sql);
      sql.exec('INSERT INTO run_ticket (hash, run_id, epoch, retired) VALUES (?, ?, ?, 0)', 'hash-1', 'run-1', 2);
      sql.exec('UPDATE schema_version SET version = 7 WHERE id = 1');
      const rows = Object.fromEntries(TABLES_BEFORE_V12.map((t) => [t, sql.exec(`SELECT * FROM ${t}`).toArray()]));
      sql.exec('ALTER TABLE runs DROP COLUMN open_questions_snapshot');
      return rows;
    });
    await evictDurableObject(alex);

    const readAt = Date.now();
    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    await expectRunDeadlineInWindow(alex, readAt, t0);
    const after = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      return Object.fromEntries(TABLES_BEFORE_V12.map((t) => [t, sql.exec(`SELECT * FROM ${t}`).toArray()]));
    });
    // Every v7 row is there as it was; a ticket kept from before has no expiry, so it never works.
    expect({ ...after, schema_version: undefined, run_ticket: undefined, runs: undefined }).toEqual({
      ...before,
      control: keptControl(before.control),
      schema_version: undefined,
      run_ticket: undefined,
      runs: undefined,
    });
    expect(after.runs).toEqual((before.runs ?? []).map((r) => keptRun({ ...r, manifest: null })));
    expect(after.schema_version).toEqual([{ id: 1, version: SCHEMA_VERSION }]);
    expect(after.run_ticket).toEqual([{ hash: 'hash-1', run_id: 'run-1', attempt: 2, retired: 0, expires_at: 0, report_seq: null, report_phase: null }]);
    expect((await alex.runStatus(2_000)).revision).toBe(1);
  });

  it('person storage migrates from v8 to v9 keeping every run', async () => {
    const alex = personFor('sub-alex-v8');
    const t0 = farAhead();
    await alex.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    const admitted = await alex.admit({ accountEpoch: (await alex.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-1', now: t0, dailyLimit: 100, manifest: MANIFEST });
    expect(admitted).toMatchObject({ admitted: true });
    // Put the database back as P3-9 shipped it: runs with no manifest column, a version row of 8.
    const before = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      undoV9(sql);
      sql.exec('UPDATE schema_version SET version = 8 WHERE id = 1');
      const rows = Object.fromEntries(TABLES_BEFORE_V12.map((t) => [t, sql.exec(`SELECT * FROM ${t}`).toArray()]));
      sql.exec('ALTER TABLE runs DROP COLUMN open_questions_snapshot');
      return rows;
    });
    await evictDurableObject(alex);

    const readAt = Date.now();
    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    await expectRunDeadlineInWindow(alex, readAt, t0);
    const after = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      return Object.fromEntries(TABLES_BEFORE_V12.map((t) => [t, sql.exec(`SELECT * FROM ${t}`).toArray()]));
    });
    // Every v8 row is there as it was; a run admitted before has no manifest.
    expect({ ...after, schema_version: undefined, runs: undefined }).toEqual({
      ...before,
      control: keptControl(before.control),
      schema_version: undefined,
      runs: undefined,
    });
    expect(after.schema_version).toEqual([{ id: 1, version: SCHEMA_VERSION }]);
    expect(after.runs).toEqual((before.runs ?? []).map((r) => keptRun({ ...r, manifest: null })));
  });

  it('person storage migrates from v9 to v10 keeping every ticket', async () => {
    const alex = personFor('sub-alex-v9');
    await alex.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    // Put the database back as P3-12 shipped it: tickets with no report phase, a version row of 9.
    const before = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec('INSERT INTO run_ticket (hash, run_id, attempt, retired, expires_at, report_seq) VALUES (?, ?, ?, 0, 5, 3)', 'hash-1', 'run-1', 2);
      undoV10(sql);
      sql.exec('UPDATE schema_version SET version = 9 WHERE id = 1');
      const rows = sql.exec('SELECT hash, run_id, epoch, retired, expires_at, report_seq FROM run_ticket').toArray();
      sql.exec('ALTER TABLE runs DROP COLUMN open_questions_snapshot');
      return rows;
    });
    await evictDurableObject(alex);

    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    const after = await runInDurableObject(alex, (_instance, state) => state.storage.sql.exec('SELECT * FROM run_ticket').toArray());
    expect(after).toEqual(before.map(({ epoch, ...t }) => ({ ...t, attempt: epoch, report_phase: null })));
  });

  it('person storage migrates from v10 to v11 keeping every row', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(11);
    const alex = personFor('sub-alex-v10');
    const t0 = farAhead();
    await alex.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    expect(await alex.setFolderId('FOLDER_ID')).toBe(true);
    expect(await alex.session('laptop', 'check', 0, 1_000)).toEqual({ active: true, epoch: 1 });
    const admitted = await alex.admit({ accountEpoch: (await alex.account())?.accountEpoch ?? -1, scope: 'all', allowWeb: false, requestId: 'press-1', now: t0, dailyLimit: 100, manifest: MANIFEST });
    if (!('run' in admitted)) throw new Error('not admitted');
    const runId = admitted.run.id;
    // Put the database back as P3-12 left it (a version row of 10, attempt 2's ticket with its attempt named epoch,
    // the v1 admission table and control columns), with values in the dead schema too.
    const before = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      sql.exec('INSERT INTO run_ticket (hash, run_id, attempt, retired, expires_at) VALUES (?, ?, 2, 0, ?)', 'hash-2', runId, t0 + 3_600_000);
      undoV11(sql);
      sql.exec('UPDATE run_ticket SET report_seq = 3, report_phase = ?', 'reading');
      sql.exec('INSERT INTO admission (id, active_run_id, request_id) VALUES (1, ?, ?)', 'run-old', 'req-old');
      sql.exec('UPDATE control SET head = ?, claim = ?, epoch = 5 WHERE id = 1', 'head-1', 'claim-1');
      sql.exec('UPDATE schema_version SET version = 10 WHERE id = 1');
      const rows = Object.fromEntries(PERSON_TABLES.filter((t) => t !== 'deadlines').map((t) => [t, sql.exec(`SELECT * FROM ${t}`).toArray()]));
      sql.exec('ALTER TABLE runs DROP COLUMN open_questions_snapshot');
      return rows;
    });
    await evictDurableObject(alex);

    const readAt = Date.now();
    expect(await alex.schemaVersion()).toBe(SCHEMA_VERSION);
    await expectRunDeadlineInWindow(alex, readAt, t0);
    const after = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      return {
        rows: Object.fromEntries(PERSON_TABLES.map((t) => [t, sql.exec(`SELECT * FROM ${t}`).toArray()])),
        admission: sql.exec("SELECT name FROM sqlite_master WHERE name = 'admission'").toArray(),
      };
    });
    // Every v10 row is there with its values: control keeps its status revision, and each ticket's epoch is its attempt.
    expect(after.admission).toEqual([]);
    expect(after.rows).toEqual({
      ...before,
      schema_version: [{ id: 1, version: SCHEMA_VERSION }],
      // v12 moves the going run's deadline into its table (TL-P4-14).
      deadlines: [expect.objectContaining({ kind: 'run', key: runId })],
      control: keptControl(before.control),
      runs: (before.runs ?? []).map(keptRun),
      run_ticket: (before.run_ticket ?? []).map(({ epoch, ...t }) => ({ ...t, attempt: epoch })),
    });
    expect(after.rows.run_ticket).toMatchObject([{ run_id: runId, attempt: 2, retired: 0, report_seq: 3, report_phase: 'reading' }]);
    // The kept ticket still fences the run: attempt 2 is held, so the next dispatch is attempt 3.
    const gh = pretendGitHub(env as Env);
    try {
      await runInDurableObject(alex, async (instance: Person, state) => {
        state.storage.sql.exec('UPDATE runs SET deadline_at = ? WHERE id = ?', t0, runId);
        await instance.wake(t0 + QUEUED_STALE_MS, gh.access);
      });
      expect(gh.dispatched.map((d) => d.attempt)).toEqual([3]);
    } finally {
      gh.restore();
    }
    expect((await alex.runStatus(Date.now())).revision).toBe(before.control?.[0]?.status_revision);
  });

  it('Q1c v15: a pre-v15 Person migrates and keeps every run', async () => {
    const alex = personFor(`q1c-v14-${crypto.randomUUID()}`);
    await alex.signIn({ email: 'you@example.com', name: 'Alex', encRefreshToken: 'enc-token' });
    const before = await runInDurableObject(alex, (_instance, state) => {
      const sql = state.storage.sql;
      // At red HEAD this is already v14; once v15 lands, remove only its appended column.
      // Keep the shipped table and every constraint intact in both cases.
      if (sql.exec<{ name: string }>('PRAGMA table_info(runs)').toArray().some((c) => c.name === 'open_questions_snapshot')) {
        sql.exec('ALTER TABLE runs DROP COLUMN open_questions_snapshot');
      }
      const at = farAhead();
      for (const [id, phase] of [['Q1C_OLD_DONE', 'done'], ['Q1C_OLD_FAILED', 'failed'], ['Q1C_OLD_QUEUED', 'queued']] as const) {
        sql.exec(`INSERT INTO runs (id, request_id, scope, allow_web, phase, requested_at, phase_at, manifest, version)
          VALUES (?, ?, 'all', 0, ?, ?, ?, ?, 0)`, id, `${id}_PRESS`, phase, at, at, JSON.stringify(MANIFEST));
      }
      sql.exec('UPDATE schema_version SET version = 14 WHERE id = 1');
      return sql.exec('SELECT * FROM runs ORDER BY id').toArray();
    });
    expect(before).toHaveLength(3);
    await evictDurableObject(alex);
    expect(await alex.schemaVersion()).toBe(15);
    const after = await runInDurableObject(alex, (_instance, state) => ({
      columns: state.storage.sql.exec<{ name: string; type: string; notnull: number }>('PRAGMA table_info(runs)').toArray(),
      rows: state.storage.sql.exec('SELECT * FROM runs ORDER BY id').toArray(),
    }));
    expect(after.columns.find((c) => c.name === 'open_questions_snapshot')).toMatchObject({ type: 'TEXT', notnull: 0 });
    expect(after.rows).toEqual(before.map((r) => ({ ...r, open_questions_snapshot: null })));
  });
});
