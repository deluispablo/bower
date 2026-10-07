/**
 * The storage schema of one person's Durable Object (`Person`, person.ts).
 *
 * SQLite-backed Durable Object storage (`ctx.storage.sql`, Cloudflare
 * "SQLite-backed Durable Object Storage"): one private database per person,
 * created on first use. A single `schema_version` row records how far the
 * steps below have run; a later entry adds a step and bumps
 * `SCHEMA_VERSION`, never edits a step that has shipped.
 */

export const SCHEMA_VERSION = 5;

/** Every table the schema owns, for tests and checks. */
export const PERSON_TABLES = [
  'schema_version',
  'session_lease',
  'admission',
  'quota',
  'control',
  'run_ticket',
  'account',
] as const;

export type PersonTable = (typeof PERSON_TABLES)[number];

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
];

/** The version recorded in this database, 0 when it is new. */
export function readSchemaVersion(sql: SqlStorage): number {
  const row = sql
    .exec<{ version: number }>('SELECT version FROM schema_version WHERE id = 1')
    .toArray()[0];
  return row?.version ?? 0;
}

/**
 * Brings the database up to `SCHEMA_VERSION`. Call inside
 * `storage.transactionSync`, so a failed step leaves the previous version
 * whole. A database from a newer build is refused, never downgraded.
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
  return SCHEMA_VERSION;
}
