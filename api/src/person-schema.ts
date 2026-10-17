/**
 * The storage schema of one person's Durable Object (`Person`, person.ts).
 *
 * SQLite-backed Durable Object storage (`ctx.storage.sql`, Cloudflare
 * "SQLite-backed Durable Object Storage"): one private database per person,
 * created on first use. A single `schema_version` row records how far the
 * steps below have run; a later entry adds a step and bumps
 * `SCHEMA_VERSION`, never edits a step that has shipped.
 */
import { RUN_PHASES } from '../../src/data/contracts/run-phases.js';

/** The run phases as a SQL list (the same text the step always had). */
const PHASES_SQL = RUN_PHASES.map((p) => `'${p}'`).join(', ');


export const SCHEMA_VERSION = 15;

/**
 * What Delete me (`Person.forget`) does with each table: a `personal` one is emptied; a `kept` one keeps only what
 * outlives the person, nothing personal: the schema version, and the run tickets live at Delete me (hash, attempt and
 * expiry, with no run id or report) and their `gone` deadlines, until they expire. A new table must be classed here.
 */
export const TABLES_AT_DELETE = {
  schema_version: 'kept',
  session_lease: 'personal',
  session_leave: 'personal',
  quota: 'personal',
  control: 'personal',
  run_ticket: 'kept',
  account: 'personal',
  runs: 'personal',
  deadlines: 'kept',
} as const satisfies Record<string, 'personal' | 'kept'>;

/** Every table the schema owns, for tests and checks. */
export const PERSON_TABLES = Object.keys(TABLES_AT_DELETE) as (keyof typeof TABLES_AT_DELETE)[];

/** Step n brings the schema from version n - 1 to n. One statement per string. */
const STEPS: readonly (readonly string[])[] = [
  [
    // The one window that may act for the person (worker contract, POST /session).
    `CREATE TABLE session_lease (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      place TEXT NOT NULL,
      epoch INTEGER NOT NULL CHECK (epoch >= 0)
    )`,
    // One active run, and the requestId that admitted it (idempotent retries).
    `CREATE TABLE admission (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_run_id TEXT,
      request_id TEXT
    )`,
    // An atomic counter per window (for example a day).
    `CREATE TABLE quota (
      window TEXT PRIMARY KEY,
      counter INTEGER NOT NULL CHECK (counter >= 0)
    )`,
    // The control row: head, monotonic status revision, runner claim, epoch.
    `CREATE TABLE control (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      head TEXT,
      status_revision INTEGER NOT NULL DEFAULT 0 CHECK (status_revision >= 0),
      claim TEXT,
      epoch INTEGER NOT NULL DEFAULT 0 CHECK (epoch >= 0)
    )`,
    // Runner tickets, kept by hash only, retired rather than deleted.
    `CREATE TABLE run_ticket (
      hash TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      epoch INTEGER NOT NULL CHECK (epoch >= 0),
      retired INTEGER NOT NULL DEFAULT 0 CHECK (retired IN (0, 1))
    )`,
  ],
  [
    // Who the person is (from their ID token), their encrypted refresh token (crypto.ts
    // envelope, never plain) and the session generation that sign-out bumps.
    `CREATE TABLE account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      enc_refresh_token TEXT,
      session_generation INTEGER NOT NULL DEFAULT 0 CHECK (session_generation >= 0)
    )`,
  ],
  [
    // The pointer to the person's Bower folder (an id only, never its content), and the
    // short-lived Drive access token minted from the refresh token, kept until it nears expiry.
    'ALTER TABLE account ADD COLUMN folder_id TEXT',
    'ALTER TABLE account ADD COLUMN access_token TEXT',
    'ALTER TABLE account ADD COLUMN access_expires_at INTEGER',
  ],
  [
    // Whether the pointed folder holds the whole template (calls skip the fill once it does).
    'ALTER TABLE account ADD COLUMN folder_complete INTEGER NOT NULL DEFAULT 0 CHECK (folder_complete IN (0, 1))',
    // The folder id reserved with Drive's files.generateIds before creating it, kept until
    // the folder is complete: a retry creates that same id (Drive refuses a second one).
    'ALTER TABLE account ADD COLUMN pending_folder_id TEXT',
    // The claim that lets one POST /vault at a time work on the folder, and when it lapses.
    'ALTER TABLE account ADD COLUMN vault_claim TEXT',
    'ALTER TABLE account ADD COLUMN vault_claim_until INTEGER',
  ],
  [
    // The ids reserved (files.generateIds) for the template's folders and files, as JSON
    // {"folderId": ..., "ids": {path: id}}, kept until the folder is complete: a fill that
    // resumes after its claim lapsed creates the same ids, and Drive refuses a second file.
    'ALTER TABLE account ADD COLUMN pending_template_ids TEXT',
  ],
  [
    // The lease as POST /session keeps it (worker contract, "One active session"; TL-P3-14).
    // Columns are added rather than the table rebuilt, so every v5 row stays as it is: `place`
    // stays NOT NULL and holds '' while nobody has the lease (a real place is 1 to 64 characters).
    // When the holder last checked (epoch ms): 3 minutes after it, the lease is free for others.
    'ALTER TABLE session_lease ADD COLUMN beat_at INTEGER NOT NULL DEFAULT 0',
    // The place that let the lease go, while nobody else has had it since (it gets the same epoch back).
    'ALTER TABLE session_lease ADD COLUMN left_place TEXT',
    // Each place's latest leave generation, in its own table keyed by place (places are many and
    // short-lived): a check sent with an older one began before that leave and is discarded.
    // `left_at` lets old rows go (session-lease.ts).
    `CREATE TABLE session_leave (
      place TEXT PRIMARY KEY,
      gen INTEGER NOT NULL CHECK (gen >= 0),
      left_at INTEGER NOT NULL
    )`,
  ],
  [
    // The person's runs (worker contract, POST /process and RunWire; TL-P3-15), keyed by run id. Each is
    // bound to the requestId that admitted it, so a repeat of that request answers the same run. `seq`
    // orders them (the newest is the current one). Only the last RUNS_KEPT are kept (person.ts): a run
    // is a few numbers, its report lives in the person's folder. Every write here raises
    // `control.status_revision`. The v1 `admission` table stays as it was, unused.
    `CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL UNIQUE,
      request_id TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL CHECK (scope IN ('all', 'instructions')),
      allow_web INTEGER NOT NULL CHECK (allow_web IN (0, 1)),
      phase TEXT NOT NULL CHECK (phase IN (${PHASES_SQL})),
      requested_at INTEGER NOT NULL,
      phase_at INTEGER NOT NULL,
      finished_at INTEGER,
      total INTEGER CHECK (total >= 0),
      failure TEXT
    )`,
  ],
  [
    // The runner wire (worker contract, "Runner wire"; TL-P3-18) on the v1 `run_ticket` table: `epoch` holds
    // the attempt the ticket was minted for. One ticket per run (`Person.mintTicket` replaces it), when it stops
    // working (epoch ms; a row kept from before this step has 0, so it never works), and the last report
    // `seq` the runner sent with it (null before the first). Rows already there stay as they are.
    'ALTER TABLE run_ticket ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE run_ticket ADD COLUMN report_seq INTEGER',
  ],
  [
    // What the run was admitted to take (TL-P3-21): the admission manifest as JSON (`src/data/spine/admission.ts`),
    // item ids with their names, parents and modifiedTimes, and the piles' declarations; never note content. The
    // token route hands it to the runner. A run kept from before this step has none (null).
    'ALTER TABLE runs ADD COLUMN manifest TEXT',
  ],
  [
    // The phase of the last report an attempt sent with its ticket (null before the first): a later attempt may
    // report a phase behind the run's, which is kept without moving the run, so its own order needs its own mark.
    'ALTER TABLE run_ticket ADD COLUMN report_phase TEXT',
  ],
  [
    // Dead schema goes (TL-P4-14): the v1 `admission` table, never read or written (the v7 `runs` table took its
    // place), and the `control` columns nothing used (only `status_revision` is). In place, so every kept row and
    // value stays: SQLite's ALTER TABLE DROP COLUMN and RENAME COLUMN (https://www.sqlite.org/lang_altertable.html).
    'DROP TABLE admission',
    'ALTER TABLE control DROP COLUMN head',
    'ALTER TABLE control DROP COLUMN claim',
    'ALTER TABLE control DROP COLUMN epoch',
    // A ticket's `epoch` was always the attempt it was minted for (v8), and is named so; its values are kept.
    'ALTER TABLE run_ticket RENAME COLUMN epoch TO attempt',
  ],
  [
    // Every deadline the person object waits for (TL-P4-14), on its one alarm: `run` (the current run's stale or
    // recheck deadline, keyed by its id), `answers` (the waiting answers' wake) and `gone` (a ticket kept after
    // Delete me, keyed by its SHA-256, until it expires). The alarm is set to the earliest (`Person.rearm`). The
    // deadlines a person object kept before this step are moved in when it starts (`Person.moveDeadlines`).
    `CREATE TABLE deadlines (
      kind TEXT NOT NULL CHECK (kind IN ('run', 'answers', 'gone')),
      key TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (kind, key)
    )`,
  ],
  [
    // How many times in a row a deadline's handler threw (TL-P4-14 addendum 2): the alarm backs off and, after the
    // last attempt, the deadline fails (`Person.wake`). Rows kept from v12 start at 0; setting a deadline again
    // starts it over.
    'ALTER TABLE deadlines ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)',
  ],
  [
    // Only the alarm dispatches (TL-P4-14 stage 2): admission sets `deadline_at` (when the alarm sends the run's next
    // attempt; null when none is due) and the alarm claims it by compare-and-set on `version`, so a dispatch is sent
    // once however many alarms run. Runs kept from v13 have none due (their dispatch was sent by the press).
    'ALTER TABLE runs ADD COLUMN deadline_at INTEGER',
    'ALTER TABLE runs ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0)',
  ],
  ['ALTER TABLE runs ADD COLUMN open_questions_snapshot TEXT'],
];

/** The version recorded in this database, 0 when it is new. */
export function readSchemaVersion(sql: SqlStorage): number {
  const row = sql
    .exec<{ version: number }>('SELECT version FROM schema_version WHERE id = 1')
    .toArray()[0];
  return row?.version ?? 0;
}

/**
 * Brings the database up to `SCHEMA_VERSION`, and returns the version it was
 * at (0 when new). Call inside `storage.transactionSync`, so a failed step
 * leaves the previous version whole. A database from a newer build is
 * refused, never downgraded.
 */
export function migrate(sql: SqlStorage): number {
  sql.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    )`,
  );
  const current = readSchemaVersion(sql);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `person storage is at schema version ${current}, newer than this build's ${SCHEMA_VERSION}`,
    );
  }
  for (let version = current + 1; version <= SCHEMA_VERSION; version += 1) {
    for (const statement of STEPS[version - 1] ?? []) sql.exec(statement);
  }
  if (current !== SCHEMA_VERSION) {
    sql.exec(
      `INSERT INTO schema_version (id, version) VALUES (1, ?)
       ON CONFLICT (id) DO UPDATE SET version = excluded.version`,
      SCHEMA_VERSION,
    );
  }
  return current;
}
