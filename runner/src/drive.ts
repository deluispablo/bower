/**
 * The runner's fenced Drive: the fake's `FencedDrive` on real Drive, built on
 * the app's `DriveHttp` with Node's `fetch` and the run ticket's token route
 * (TL-P3-19).
 *
 * Two checks guard every write, and both are PRECHECKS, NOT COMPARE-AND-SWAP
 * (ARCHITECTURE, "Safety at the actual storage boundary"):
 *
 * - Still as seen: right before each write, the target (or, for a create, its
 *   folder) is read again and compared with what this run read (`SeenFiles`).
 *   Drive v3 has no conditional write on files, so another client can still
 *   change the file in the window between that read and the write; the
 *   window is kept short (writes go one at a time) but it is not closed.
 * - Attempt: at each write batch (`batch()`) and again right before each
 *   fenced write, the token route is asked again and its `attempt` must equal
 *   this runner's (TL-P3-23). An old attempt woken after a takeover sends no
 *   write; only a takeover inside the window between that read and the write
 *   itself can still let one land (a precheck, not a lock), and that attempt's
 *   next status report is refused (409 `stale-attempt`).
 *
 * A created file is confirmed by the create's own answer: Drive v3 gives the
 * stored content's `md5Checksum` (and `sha256Checksum`, when it has one) when
 * `fields` asks for them (https://developers.google.com/drive/api/reference/rest/v3/files,
 * https://developers.google.com/drive/api/guides/fields-parameter). When the
 * answer's checksum is that of the bytes sent, the one read-back that follows
 * a record's create (a checkpoint, the report, a disposition) is answered from
 * them, with no second request; with no checksum, or another one, it is read from
 * Drive as before. The report files' own writes (and `dispositions.json`) are
 * confirmed the same way, from the md5 their answer gives (`md5`); `last-run.json`
 * is the barrier's last word and is always read back from Drive. Other files are
 * read back from Drive as they always were.
 *
 * Faults for tests come through the fetch: `fault` sees each fenced write's
 * request once, as the fake's `FaultHook` does (`refuse`: nothing is sent;
 * `lose-reply`: the write lands, then its answer is lost).
 */
import { createHash } from 'node:crypto';
import { BowerError } from '../../src/data/types';
import { driveError, type DriveFile, type DrivePatch } from '../../src/data/drive/drive-api';
import { DriveHttp } from '../../src/data/drive/drive-http';
import type { FaultAction, FaultHook, FencedCall, FencedDrive, StoredEvidence } from '../../src/data/drive/fake-drive';
import type { SpineRead } from '../../src/data/spine/plan';
import type { AdmissionScope } from '../../src/data/spine/admission';
import { admissionRead } from '../../src/data/spine/read';
import { sha256 } from '../../src/data/contracts/hashes';
import { SeenFiles, targetOf, type StoredNow } from './still-as-seen';
import { retried } from './retry';
import { staleAttempt, type RunnerToken } from './token';

export interface RunnerDriveOptions {
  token: RunnerToken;
  /** This runner's attempt, from its dispatch. */
  attempt: number;
  fetch?: typeof fetch;
}

const API = 'https://www.googleapis.com/drive/v3';
const FIELDS = 'id,name,mimeType,parents,modifiedTime,createdTime,size,appProperties,trashed';
const FOLDER = 'application/vnd.google-apps.folder';
const WAITS = [500, 1000, 2000];
/** What a create's answer is asked to carry besides its metadata, to confirm the bytes Drive stored. */
const CHECKSUMS = 'md5Checksum,sha256Checksum';
/** A run's records (`checkpointName`, `reportName`, `dispositionName`) and its `dispositions.json`: written once, never changed. */
const RECORD = /^(?:(?:checkpoint-\d+|report|disposition)-[0-9a-f]{64}\.json|dispositions\.json)$/;
/** The report files the barrier brings up to date: confirmed by the md5 of their write's answer, never by kept text. */
const REPORT_FILE = /^(?:questions|suggestions|requests|hashes)\.json$/;
/** How long a plan read is answered again from the first (`planReads`). */
const PLAN_KEEP_MS = 5000;

/** What one of this run's own writes did to a folder listing: the file as Drive answered, or the file put in the Bin. */
export type Change = { file: DriveFile } | { gone: string };

interface WireFile {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  modifiedTime: string;
  createdTime: string;
  size?: string;
  appProperties?: Record<string, string>;
}

const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class RunnerDrive {
  /** Sees, and may refuse or lose the reply of, every fenced write. */
  fault: FaultHook | null = null;
  private readonly http: DriveHttp;
  private readonly fetchFn: typeof fetch;
  private readonly token: RunnerToken;
  private readonly attempt: number;
  private readonly seen = new SeenFiles();
  private readonly writes: FencedDrive;
  /** The fenced write whose request is in flight, and what the fault hook said of it. */
  private current: { call: FencedCall; action: FaultAction | null } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** Files whose create's answer confirmed the bytes sent, by id: the text, for the one read-back that follows. */
  private readonly confirmed = new Map<string, string>();
  /** Rises when a fenced write is about to be sent and again when it ends: a listing read at one value is current at it. */
  generation = 0;
  /** The md5 a write's answer gave for a file, by id, taken once by `md5` (the barrier's read-back of its own write). */
  private readonly answered = new Map<string, string>();
  /** Whether a fenced write's request is out now. */
  private writing = false;
  /** Each fenced write that ended, with the generation it ended at: what it did (null: not known, e.g. a lost answer). */
  private readonly ended: Array<{ end: number; change: Change | null }> = [];

  constructor(opts: RunnerDriveOptions) {
    this.token = opts.token;
    this.attempt = opts.attempt;
    this.fetchFn = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.http = new DriveHttp({ token: (fresh) => this.token.token(fresh), fetch: (input, init) => this.hooked(input, init) });
    this.writes = {
      createFolder: (parentId, name, appProperties) => this.fenced({ op: 'create-folder', parentId, name, ...(appProperties ? { appProperties } : {}) }, () => this.http.createFolder(parentId, name, appProperties)),
      createText: (parentId, name, text, appProperties) => this.fenced({ op: 'create-text', parentId, name, text, ...(appProperties ? { appProperties } : {}) }, () => this.http.createText(parentId, name, text, appProperties)),
      update: (id: string, patch: DrivePatch) => this.fenced({ op: 'update', id, patch }, () => this.http.update(id, patch)),
      trash: (id, appProperties) => this.fenced({ op: 'trash', id, ...(appProperties ? { appProperties } : {}) }, () => this.http.trash(id, appProperties)),
      writeText: (id, text, ifModified, appProperties) =>
        this.fenced({ op: 'write-text', id, text, ifModified, ...(appProperties ? { appProperties } : {}) }, () => this.http.writeText(id, text, ifModified, appProperties)),
    };
  }

  /**
   * The writes of one batch, after the attempt route confirms this runner's
   * attempt is still the current one. Call it again for each batch.
   */
  async batch(): Promise<FencedDrive> {
    await this.stillCurrent();
    return this.seen.wrap(this.writes);
  }

  /**
   * The same fenced writes with no attempt read of their own: for a write whose caller ran `batch()` moments before (or
   * has no other read to guard), since every fenced write reads the attempt again right before it is sent.
   */
  fencedWrites(): FencedDrive {
    return this.seen.wrap(this.writes);
  }

  /**
   * What this runner's own writes did since a listing was taken at `generation`, in order, so the listing can be
   * brought up to date from their answers instead of being read again. Null when it cannot be: a write is out now, or
   * one ended with no answer (a lost reply, a refusal), so what Drive holds is not known.
   */
  changesSince(generation: number): Change[] | null {
    if (this.writing) return null;
    const out: Change[] = [];
    for (const w of this.ended) {
      if (w.end <= generation) continue;
      if (!w.change) return null;
      out.push(w.change);
    }
    return out;
  }

  /**
   * The Worker's attempt is still this runner's; otherwise a newer attempt took the run over. Asked of the light
   * attempt route, which fetches no token (TL-P4-04); the Drive token is kept until near its expiry (`token.ts`).
   */
  private async stillCurrent(): Promise<void> {
    const current = await this.token.attempt();
    if (current !== this.attempt) {
      console.error(`Attempt ${this.attempt} was taken over by attempt ${current}`);
      throw staleAttempt();
    }
  }

  // --- Evidence reads: each file read is what later writes are checked against. ---

  async get(id: string): Promise<DriveFile> {
    return this.seen.note(await this.http.get(id));
  }

  /** A folder's live children, every page. */
  async list(parentId: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({ q: `${quote(parentId)} in parents and trashed = false`, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const body = (await this.read(`${API}/files?${params}`)) as { files?: WireFile[]; nextPageToken?: string };
      for (const w of body.files ?? []) out.push(this.seen.note(toFile(w)));
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  /**
   * The files that carry `key` = `value` in their appProperties, wherever they are and in the Bin or not: Drive's
   * `appProperties has { key=... and value=... }` query, with no parent clause and no `trashed` clause
   * (https://developers.google.com/workspace/drive/api/guides/search-files). A run's own stamp is found this way even
   * after the person moved the thing it made elsewhere, or put it in the Bin.
   */
  async stamped(key: string, value: string): Promise<Array<{ file: DriveFile; trashed: boolean }>> {
    const out: Array<{ file: DriveFile; trashed: boolean }> = [];
    let pageToken = '';
    do {
      const q = `appProperties has { key=${quote(key)} and value=${quote(value)} }`;
      const params = new URLSearchParams({ q, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const body = (await this.read(`${API}/files?${params}`)) as { files?: Array<WireFile & { trashed?: boolean }>; nextPageToken?: string };
      for (const w of body.files ?? []) out.push({ file: w.trashed === true ? toFile(w) : this.seen.note(toFile(w)), trashed: w.trashed === true });
      pageToken = body.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  async readText(id: string): Promise<string> {
    return this.confirmedText(id) ?? this.http.readText(id);
  }

  /** The text a create's answer confirmed, taken once: any later read goes to Drive. */
  private confirmedText(id: string): string | null {
    const text = this.confirmed.get(id);
    if (text === undefined) return null;
    this.confirmed.delete(id);
    return text;
  }

  /**
   * The plan's reads: the shared Drive reads of the Worker's admission (`spine/read.ts` `admissionRead`, TL-P4-04) over
   * this adapter's Drive. Reads only; a plan is fixed before any write, and every write later reads its target again (`get`).
   *
   * - **One listing per level of folders,** with `sha256Checksum` among the fields (Drive v3, partial responses via `fields`:
   *   https://developers.google.com/workspace/drive/api/guides/fields-parameter and "Improve performance",
   *   https://developers.google.com/workspace/drive/api/guides/performance), so a file's stored size and hash come from the
   *   listing and not from one `files.get` each.
   * - **The files the plan will read are started together,** at most `READ_AHEAD` (8) at a time, once the folder is
   *   listed; the plan then takes each from here. Which files depend on the run's `scope`, set by the provider.
   * - **Answered again from the first** (the plan looks at the listing and at a file more than once), keyed by id (a
   *   digest by id and modifiedTime), for a few seconds at most; a write sent in between, or a later time, reads afresh.
   */
  planReads(): SpineRead & { scope: AdmissionScope } {
    const kept = new Map<string, { at: number; generation: number; value: Promise<unknown> }>();
    const once = <T>(key: string, read: () => Promise<T>): Promise<T> => {
      const hit = kept.get(key);
      const now = Date.now();
      if (hit && hit.generation === this.generation && now - hit.at < PLAN_KEEP_MS) return hit.value as Promise<T>;
      const value = read();
      kept.set(key, { at: now, generation: this.generation, value });
      value.catch(() => kept.delete(key));
      return value;
    };
    let source: { generation: number; at: number; reads: SpineRead } | null = null;
    const reads = (): SpineRead => {
      const now = Date.now();
      if (!source || source.generation !== this.generation || now - source.at >= PLAN_KEEP_MS) {
        source = { generation: this.generation, at: now, reads: admissionRead(this.http, out.scope) };
      }
      return source.reads;
    };
    const out: SpineRead & { scope: AdmissionScope } = {
      scope: 'all',
      listAll: async (rootId) => [...(await once(`all:${rootId}`, () => reads().listAll(rootId)))],
      readBytes: async (id) => (await once(`bytes:${id}`, () => reads().readBytes(id))).slice(),
      readText: (id) => once(`text:${id}`, () => reads().readText(id)),
      // By version: a file changed since (a newer modifiedTime in the listing) is never paired with an older digest.
      digest: (file) => once(`digest:${file.id}:${file.modifiedTime}`, () => reads().digest(file)),
      // The plan's own hint that it is about to read these: started together, kept for the reads that follow. A read
      // that fails here is met again, as it failed, by the read of its own.
      warm: (wanted) => {
        for (const w of wanted) {
          if (w.as === 'text') void out.readText(w.id).catch(() => undefined);
          else void out.readBytes(w.id).catch(() => undefined);
        }
      },
    };
    return out;
  }

  /**
   * What Drive stores for a file now, as evidence of an effect: its metadata, whether it is in the Bin, and its
   * content's size and SHA-256 (`sha256Checksum`, or the bytes read when Drive keeps none). Null when it is gone.
   */
  async evidence(id: string): Promise<StoredEvidence | null> {
    let w: WireFile & { trashed?: boolean; sha256Checksum?: string };
    try {
      w = (await this.read(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS},sha256Checksum`)) as typeof w;
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
    const file = toFile(w);
    if (file.folder) return { file, trashed: w.trashed === true, content: null };
    if (w.sha256Checksum !== undefined && file.size !== undefined) return { file, trashed: w.trashed === true, content: { size: file.size, sha256: w.sha256Checksum } };
    const bytes = await this.http.readBytes(id);
    return { file, trashed: w.trashed === true, content: { size: bytes.byteLength, sha256: await sha256(new Blob([bytes.slice()])) } };
  }

  /** The bytes of a file. */
  async readBytes(id: string): Promise<Uint8Array> {
    const text = this.confirmedText(id);
    return text === null ? this.http.readBytes(id) : new TextEncoder().encode(text);
  }

  /**
   * The MD5 of a file's stored bytes, hex, as Drive's `md5Checksum` gives it: the one its own write's answer gave, once
   * (for a report file or record; Drive computed it from what it stored), otherwise read from the bytes Drive holds.
   */
  async md5(id: string): Promise<string> {
    const answered = this.answered.get(id);
    if (answered !== undefined) {
      this.answered.delete(id);
      return answered;
    }
    return createHash('md5').update(await this.http.readBytes(id)).digest('hex');
  }

  /** One fenced write: one at a time, after its still-as-seen read. */
  private fenced<T>(call: FencedCall, write: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      // The attempt again, right before this write: a runner that stalled after its batch began and woke after a
      // takeover sends nothing more (TL-P3-23).
      // and the target read again (still as seen). Both must pass before anything is sent; neither waits for the other.
      const target = targetOf(call);
      if ('id' in call) {
        this.confirmed.delete(call.id);
        this.answered.delete(call.id);
      }
      const [, now] = await Promise.all([this.stillCurrent(), this.peek(target.id)]);
      this.seen.assert(target, now);
      this.current = { call, action: null };
      this.generation++;
      this.writing = true;
      let change: Change | null = null;
      try {
        const answer = await write();
        change = call.op === 'trash' ? { gone: call.id } : { file: answer as DriveFile };
        return answer;
      } finally {
        this.writing = false;
        this.generation++;
        this.ended.push({ end: this.generation, change });
        this.current = null;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async peek(id: string): Promise<StoredNow | null> {
    try {
      return { file: await this.http.get(id), trashed: false };
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
  }

  /** The fetch `DriveHttp` uses: a fenced write's own request meets the fault hook once. */
  private async hooked(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const now = this.current;
    // A read is safe to send again after a network error (`retry.ts`); DriveHttp retries its 429s and 5xx itself.
    if ((init?.method ?? 'GET').toUpperCase() === 'GET') return retried(() => this.fetchFn(input, init), false);
    if (!now) return this.fetchFn(input, init);
    now.action ??= this.fault?.before?.(now.call) ?? 'pass';
    // A TypeError is how fetch fails with no network; DriveHttp reads it as offline.
    if (now.action === 'refuse') throw new TypeError('A fault refused this write.');
    // A record's or report file's create, and any text write, asks its answer for the stored checksums too.
    const asks = now.call.op === 'write-text' || (now.call.op === 'create-text' && (RECORD.test(now.call.name) || REPORT_FILE.test(now.call.name)));
    const res = await this.fetchFn(asks ? withChecksums(input) : input, init);
    // A write Google failed on may still have landed: read as a lost answer, so it is read back, never sent again.
    if (res.status >= 500) {
      console.error(`Drive answered ${res.status} to a write`);
      throw new TypeError('Drive failed on this write; it may have landed.');
    }
    if (!res.ok) return res;
    this.current = null;
    this.fault?.applied?.(now.call);
    if (now.action === 'lose-reply') throw new TypeError('A fault lost the answer to this write.');
    if (asks) await this.confirm(now.call.op === 'create-text' ? now.call.text : null, res.clone());
    return res;
  }

  /**
   * Keeps what the answer proves. A record created (immutable) keeps its text when the answer's checksum is that of the
   * bytes sent; a report file keeps only the md5 Drive gave, for the barrier's read-back right after (`md5`). An answer
   * with no checksum confirms nothing, and `last-run.json` is never confirmed: it is read back from Drive.
   */
  private async confirm(text: string | null, res: Response): Promise<void> {
    const body = (await res.json().catch(() => null)) as { id?: string; name?: string; md5Checksum?: string; sha256Checksum?: string } | null;
    if (!body?.id || body.name === undefined) return;
    const record = RECORD.test(body.name);
    if (!record && !REPORT_FILE.test(body.name)) return;
    if (!record) {
      if (body.md5Checksum !== undefined) this.answered.set(body.id, body.md5Checksum);
      return;
    }
    if (text === null) return;
    const bytes = new TextEncoder().encode(text);
    const sha = body.sha256Checksum !== undefined && body.sha256Checksum === createHash('sha256').update(bytes).digest('hex');
    const md5 = body.md5Checksum !== undefined && body.md5Checksum === createHash('md5').update(bytes).digest('hex');
    if (sha || md5) this.confirmed.set(body.id, text);
    else if (body.sha256Checksum !== undefined || body.md5Checksum !== undefined) console.error(`Drive stored other bytes for file ${body.id} than were sent`);
  }

  /** A read with the token, its one refresh and the retries (`retry.ts`; a 403 rate limit as `DriveHttp` does). */
  private async read(url: string): Promise<unknown> {
    let refreshed = false;
    let tries = 0;
    for (;;) {
      let res: Response;
      try {
        const token = await this.token.token(refreshed);
        res = await retried(() => this.fetchFn(url, { headers: { authorization: `Bearer ${token}` } }));
      } catch (e) {
        if (e instanceof BowerError) throw e;
        if (e instanceof TypeError) throw driveError('offline');
        console.error(e);
        throw driveError('unknown');
      }
      if (res.ok) return res.json();
      if (res.status === 401) {
        if (refreshed) throw driveError('auth');
        refreshed = true;
        continue;
      }
      const wait = WAITS[tries];
      if (wait !== undefined && (await rateLimited(res))) {
        tries++;
        await sleep(wait);
        continue;
      }
      if (res.status === 404) throw driveError('not-found');
      console.error(`Drive answered ${res.status} for a listing`);
      throw driveError('unknown');
    }
  }
}

/** A create's address asking its answer for the stored content's checksums too (`fields`). */
function withChecksums(input: string | URL | Request): string | URL | Request {
  if (input instanceof Request) return input;
  const url = new URL(input);
  const fields = url.searchParams.get('fields');
  if (fields === null) return input;
  url.searchParams.set('fields', `${fields},${CHECKSUMS}`);
  return typeof input === 'string' ? url.href : url;
}

/** Drive's 403 for a rate limit, told apart from a refusal by its reason, as `DriveHttp` does. */
async function rateLimited(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  const body = (await res.clone().json().catch(() => null)) as { error?: { errors?: Array<{ reason?: string }> } } | null;
  return (body?.error?.errors ?? []).some((e) => e.reason === 'rateLimitExceeded' || e.reason === 'userRateLimitExceeded');
}

function toFile(w: WireFile): DriveFile {
  return {
    id: w.id,
    name: w.name,
    folder: w.mimeType === FOLDER,
    parents: w.parents ?? [],
    modifiedTime: w.modifiedTime,
    createdTime: w.createdTime,
    ...(w.size !== undefined ? { size: Number(w.size) } : {}),
    ...(w.appProperties ? { appProperties: w.appProperties } : {}),
  };
}
