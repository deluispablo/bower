/**
 * The Worker run in-process for the real-adapter suites (P3-18): its Hono app (`createApp`) answers through
 * `app.request`, as Hono documents for tests (https://hono.dev/docs/guides/testing), with an `Env` whose person
 * objects are the real `Person` class over an in-memory SQLite database (Node's `node:sqlite`) that offers the
 * Durable Object storage calls `Person` makes: `sql.exec`, `transactionSync`, the synchronous `kv`, `deleteAll` and
 * the alarm (https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/). An RPC call to a stub awaits
 * the method and hands back a structured clone, as the Workers RPC does.
 *
 * Loaded at run time by `runner/test/real-world.ts`, in Node: the importing suite mocks `cloudflare:workers` with a
 * `DurableObject` base class that keeps `ctx` and `env`. Fixture secrets only, the same as `vitest.config.ts`.
 */
import { encrypt, importEncryptionKey } from '../src/crypto.js';
import type { Env } from '../src/env.js';
import { createApp } from '../src/index.js';
import { Person } from '../src/person.js';
import { SESSION_COOKIE, signSession } from '../src/session.js';
import { allowKey } from '../src/store.js';
import type { ApiHost, ApiOptions, Fetch } from '../../runner/test/real-world-types.js';

/** What `node:sqlite` gives that this file uses (Node's own types are not in the Worker's type check). */
interface SqliteStatement {
  columns(): unknown[];
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): { changes: number | bigint };
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}
interface NodeBuiltins {
  getBuiltinModule(id: 'node:sqlite'): { DatabaseSync: new (path: string) => SqliteDatabase };
  getBuiltinModule(id: 'node:crypto'): {
    createHash(algorithm: string): { update(text: string): { digest(encoding: 'hex'): string } };
    timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  };
}
const node = (globalThis as unknown as { process: NodeBuiltins }).process;

/** The bytes of a buffer or a view of one. */
const bytesOf = (v: ArrayBuffer | ArrayBufferView): Uint8Array => (ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : new Uint8Array(v));

/**
 * Workers' `crypto.subtle.timingSafeEqual` (a Workers extension, not in Node:
 * https://developers.cloudflare.com/workers/runtime-apis/web-crypto/#timingsafeequal), from Node's
 * `crypto.timingSafeEqual`, which likewise throws on lengths that differ.
 */
function withTimingSafeEqual(): void {
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: unknown };
  if (typeof subtle.timingSafeEqual === 'function') return;
  const equal = node.getBuiltinModule('node:crypto').timingSafeEqual;
  Object.defineProperty(subtle, 'timingSafeEqual', { value: (a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean => equal(bytesOf(a), bytesOf(b)) });
}

const EMAIL = 'you@example.com';
const SUB = 'google-sub-alex';
const KV_TABLE = '_kv';
/** How many rounds of due alarms one call may fire before the harness calls it a loop. */
const ALARM_ROUNDS = 5;

class Cursor {
  constructor(
    private readonly rows: Record<string, unknown>[],
    readonly rowsWritten: number,
  ) {}
  get rowsRead(): number {
    return this.rows.length;
  }
  get columnNames(): string[] {
    return Object.keys(this.rows[0] ?? {});
  }
  toArray(): Record<string, unknown>[] {
    return this.rows;
  }
  one(): Record<string, unknown> {
    if (this.rows.length !== 1) throw new Error(`Expected exactly one result from SQL query, but got ${this.rows.length}.`);
    return this.rows[0] as Record<string, unknown>;
  }
  *raw(): IterableIterator<unknown[]> {
    for (const row of this.rows) yield Object.values(row);
  }
  [Symbol.iterator](): Iterator<Record<string, unknown>> {
    return this.rows[Symbol.iterator]();
  }
}

/** One person object's storage. */
class Storage {
  private readonly db: SqliteDatabase;
  private depth = 0;
  alarm: number | null = null;

  constructor() {
    this.db = new (node.getBuiltinModule('node:sqlite').DatabaseSync)(':memory:');
    this.kvTable();
  }

  private kvTable(): void {
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${KV_TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  }

  readonly sql = {
    exec: (query: string, ...bindings: unknown[]): Cursor => {
      const statement = this.db.prepare(query);
      const params = bindings.map((b) => (typeof b === 'boolean' ? Number(b) : b));
      if (statement.columns().length > 0) {
        const rows = statement.all(...params).map((row) => ({ ...row }));
        const written = /^\s*(SELECT|WITH)\b/i.test(query) ? 0 : Number(this.db.prepare('SELECT changes() AS n').all()[0]?.n ?? 0);
        return new Cursor(rows, written);
      }
      return new Cursor([], Number(statement.run(...params).changes));
    },
  };

  readonly kv = {
    get: <T>(key: string): T | undefined => {
      const row = this.db.prepare(`SELECT value FROM ${KV_TABLE} WHERE key = ?`).all(key)[0];
      return row === undefined ? undefined : (JSON.parse(String(row.value)) as T);
    },
    put: (key: string, value: unknown): void => {
      this.db.prepare(`INSERT INTO ${KV_TABLE} (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(key, JSON.stringify(value));
    },
    delete: (key: string): boolean => Number(this.db.prepare(`DELETE FROM ${KV_TABLE} WHERE key = ?`).run(key).changes) > 0,
  };

  transactionSync<T>(fn: () => T): T {
    const name = `t${++this.depth}`;
    this.db.exec(`SAVEPOINT ${name}`);
    try {
      const out = fn();
      this.db.exec(`RELEASE ${name}`);
      return out;
    } catch (e) {
      this.db.exec(`ROLLBACK TO ${name}`);
      this.db.exec(`RELEASE ${name}`);
      throw e;
    } finally {
      this.depth--;
    }
  }

  async deleteAll(): Promise<void> {
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
    for (const t of tables) this.db.exec(`DROP TABLE "${String(t.name)}"`);
    this.kvTable();
    this.alarm = null;
  }

  async setAlarm(at: number | Date): Promise<void> {
    this.alarm = typeof at === 'number' ? at : at.getTime();
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }
}

interface Instance {
  person: Person;
  storage: Storage;
}

/** An RPC stub: every method is awaited and its answer cloned, as the Workers RPC does. */
function stubOf(person: Person): unknown {
  return new Proxy(person, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]): Promise<unknown> => structuredClone(await Reflect.apply(value, target, args));
    },
  });
}

export async function startApi(opts: ApiOptions): Promise<ApiHost> {
  withTimingSafeEqual();
  const instances = new Map<string, Instance>();
  const kvStore = new Map<string, string>();
  const idOf = (hex: string): { toString(): string; equals(o: { toString(): string }): boolean } => ({
    toString: () => hex,
    equals: (o) => o.toString() === hex,
  });
  const instance = (hex: string): Instance => {
    let found = instances.get(hex);
    if (!found) {
      const storage = new Storage();
      const ctx = {
        id: idOf(hex),
        storage,
        blockConcurrencyWhile: async <T>(fn: () => Promise<T>): Promise<T> => await fn(),
        waitUntil: (): void => undefined,
      };
      found = { storage, person: new Person(ctx as unknown as DurableObjectState, env) };
      instances.set(hex, found);
    }
    return found;
  };
  const PERSON = {
    idFromName: (name: string) => idOf(node.getBuiltinModule('node:crypto').createHash('sha256').update(name).digest('hex')),
    idFromString: (hex: string) => {
      if (!/^[0-9a-f]{64}$/.test(hex)) throw new TypeError('Invalid Durable Object ID');
      return idOf(hex);
    },
    get: (id: { toString(): string }) => stubOf(instance(id.toString()).person),
  };
  const BOWER_KV = {
    get: async (key: string): Promise<string | null> => kvStore.get(key) ?? null,
    put: async (key: string, value: string): Promise<void> => void kvStore.set(key, value),
    delete: async (key: string): Promise<void> => void kvStore.delete(key),
  };
  // The Worker fails closed without its rate-limit bindings; an accepting double stands in for Cloudflare's.
  const accepting = { limit: async () => ({ success: true }) } satisfies RateLimit;
  const env = {
    BOWER_KV,
    AUTH_RATE_LIMIT: accepting,
    DRIVE_RATE_LIMIT: accepting,
    VAULT_RATE_LIMIT: accepting,
    PERSON,
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    SESSION_SECRET: 'test-session-secret-at-least-32-bytes-long',
    // base64 of 32 zero bytes: a fixture, not a real key.
    TOKEN_ENC_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    GITHUB_TOKEN: 'test-github-token',
    APP_ORIGIN: opts.origin,
    API_ORIGIN: opts.origin,
    APP_VERSION: '0.1.0',
    GITHUB_REPO: 'OWNER/REPO',
    DAILY_RUN_LIMIT: '100',
    TEMPLATE_FOLDER_NAME: 'Bower',
  } as unknown as Env;
  const app = createApp({ fetchImpl: (input, init) => opts.outside(input, init) });
  const executionCtx = { waitUntil: (): void => undefined, passThroughOnException: (): void => undefined, props: {} };
  const urlOf = (input: string | URL | Request): string => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const github = { repo: env.GITHUB_REPO, apiOrigin: env.API_ORIGIN, token: env.GITHUB_TOKEN, fetchImpl: (input: string, init?: RequestInit) => opts.outside(input, init) };
  /**
   * The runtime fires a due alarm at once (https://developers.cloudflare.com/durable-objects/api/alarms/): after each
   * call, every person object's alarm due by the wall clock runs, as admission's dispatch and a run end's wake need.
   * A later deadline waits for `fireAlarm`. Bounded: an alarm set again for now, round after round, fails the test.
   */
  const fireDue = async (): Promise<void> => {
    for (let round = 0; round < ALARM_ROUNDS; round++) {
      const due = [...instances.values()].filter((i) => i.storage.alarm !== null && i.storage.alarm <= Date.now());
      if (due.length === 0) return;
      for (const { storage, person } of due) {
        const at = storage.alarm ?? 0;
        storage.alarm = null;
        await person.wake(at, github);
      }
    }
    if ([...instances.values()].some((i) => i.storage.alarm !== null && i.storage.alarm <= Date.now())) {
      throw new Error(`an alarm was still due after ${ALARM_ROUNDS} rounds: it keeps setting itself for now`);
    }
  };
  const call: Fetch = async (input, init = {}) => {
    const res = await app.request(urlOf(input), init, env, executionCtx as unknown as ExecutionContext);
    await fireDue();
    return res;
  };
  /** A browser with its own cookie jar: the session cookie it holds goes with every call, as `credentials: 'include'`. */
  const browserWith = (jar: { cookie: string | null }): Fetch => async (input, init = {}) => {
    const headers = new Headers(init.headers);
    if (jar.cookie !== null) headers.set('cookie', jar.cookie);
    const method = (init.method ?? 'GET').toUpperCase();
    // A browser sends its origin with every request that is not a GET or HEAD.
    if (method !== 'GET' && method !== 'HEAD') headers.set('origin', opts.origin);
    const res = await call(input, { ...init, headers });
    const set = res.headers.get('set-cookie');
    if (set?.startsWith(`${SESSION_COOKIE}=`)) {
      const pair = set.split(';')[0] ?? '';
      jar.cookie = /max-age=0\b/i.test(set) || pair === `${SESSION_COOKIE}=` ? null : pair;
    }
    return res;
  };
  const jar: { cookie: string | null } = { cookie: null };
  const browser = browserWith(jar);
  /** A new session for Alex at the account's current generation, as a sign-in on a device gives. */
  const session = async (): Promise<string> =>
    `${SESSION_COOKIE}=${await signSession({ sub: SUB, gen: alex().account()?.generation ?? 0 }, env.SESSION_SECRET)}`;
  const alex = (): Person => instance(PERSON.idFromName(SUB).toString()).person;
  const host: ApiHost = {
    browser,
    fetch: call,
    signIn: async (folderId) => {
      await BOWER_KV.put(allowKey(EMAIL), '1');
      const enc = await encrypt('test-refresh-token', await importEncryptionKey(env.TOKEN_ENC_KEY));
      const { generation } = alex().signIn({ email: EMAIL, name: 'Alex', encRefreshToken: enc });
      alex().pointFolder(generation, alex().folderId(), folderId);
      jar.cookie = await session();
    },
    otherDevice: async () => browserWith({ cookie: await session() }),
    alarmAt: () => instance(PERSON.idFromName(SUB).toString()).storage.alarm,
    fireAlarm: async () => {
      const { storage, person } = instance(PERSON.idFromName(SUB).toString());
      const at = storage.alarm;
      if (at === null) return false;
      // The runtime clears an alarm as it delivers it.
      storage.alarm = null;
      await person.wake(at, github);
      return true;
    },
  };
  return host;
}
