import { evictDurableObject, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Env } from '../src/env.js';
import { PERSON_TABLES, SCHEMA_VERSION } from '../src/person-schema.js';

const people = (env as Pick<Env, 'PERSON'>).PERSON;
const personFor = (sub: string) => people.get(people.idFromName(sub));

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
    });

    // Sam's first call sees a fresh counter, and none of Alex's rows.
    expect(await sam.countQuota('2026-10-06')).toBe(1);
    const samCounts = await runInDurableObject(sam, (_instance, state) =>
      Object.fromEntries(PERSON_TABLES.map((t) => [t, rowCount(state.storage.sql, t)])),
    );
    expect(samCounts).toEqual({
      schema_version: 1,
      session_lease: 0,
      admission: 0,
      quota: 1,
      control: 0,
      run_ticket: 0,
    });
    // Alex's rows are still all there, untouched by Sam.
    const alexCounts = await runInDurableObject(alex, (_instance, state) =>
      Object.fromEntries(PERSON_TABLES.map((t) => [t, rowCount(state.storage.sql, t)])),
    );
    expect(alexCounts).toEqual({
      schema_version: 1,
      session_lease: 1,
      admission: 1,
      quota: 1,
      control: 1,
      run_ticket: 1,
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
});
