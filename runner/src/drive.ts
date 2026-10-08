/**
 * The runner's fenced Drive: `FencedDrive` on real Drive, built on the one Drive
 * transport (`DriveHttp`, headless: its token refresh, retry policy, errors and
 * wire type) with Node's `fetch` and the run ticket's token route (TL-P3-19).
 * What is left here is the fence and the attempt check.
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
import { BowerError } from '../../src/data/types';
import type { DriveFile, DrivePatch, FaultAction, FaultHook, FencedCall, FencedDrive, StoredEvidence } from '../../src/data/drive/drive-api';
import type { Pacing } from '../../src/data/drive/transport';
import { DriveHttp, FIELDS, quote, toFile, type WireFile } from '../../src/data/drive/drive-http';
import type { SpineRead } from '../../src/data/spine/plan';
import type { AdmissionScope } from '../../src/data/spine/admission';
import { admissionRead } from '../../src/data/spine/read';
import { md5Hex, sha256, sha256Hex } from '../../src/data/contracts/hashes';
import { ReadCache } from '../../src/data/drive/read-cache';
import { SeenFiles, targetOf, type StoredNow } from './still-as-seen';
import { staleAttempt, type RunnerToken } from './token';

export interface RunnerDriveOptions {
  token: RunnerToken;
  /** This runner's attempt, from its dispatch. */
  attempt: number;
  fetch?: typeof fetch;
  /** The transport's waits between tries; the real backoff when absent. */
  pacing?: Partial<Pacing>;
}

const API = 'https://www.googleapis.com/drive/v3';
/** What a create's answer is asked to carry besides its metadata, to confirm the bytes Drive stored. */
const CHECKSUMS = 'md5Checksum,sha256Checksum';
/** A run's records (`checkpointName`, `reportName`, `dispositionName`) and its `dispositions.json`: written once, never changed. */
const RECORD = /^(?:(?:checkpoint-\d+|manifest|report|disposition)-[0-9a-f]{64}\.json|dispositions\.json)$/;
/** The report files the barrier brings up to date: confirmed by the md5 of their write's answer, never by kept text. */
const REPORT_FILE = /^(?:questions|suggestions|requests|hashes)\.json$/;
/**
 * How long a folder this run made stands for the read the fence would make before a create into it (`heldNow`): the
 * records go into the run's own folders, and each effect that makes something in a folder it just made. Nothing else is
 * kept: the read that checks a move, an edit or a Bin is taken right before its send (`fenced`), never from before.
 */
const HOLD_MS = 3000;

/** What one of this run's own writes did to a folder listing: the file as Drive answered, or the file put in the Bin. */
export type Change = { file: DriveFile } | { gone: string };

export class RunnerDrive {
  /** Sees, and may refuse or lose the reply of, every fenced write. */
  fault: FaultHook | null = null;
  private readonly http: DriveHttp;
  private readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
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
  /** Folders this run made, by id, for `HOLD_MS` (`heldNow`). */
  private readonly held = new Map<string, { file: DriveFile; trashed: boolean; at: number; own: boolean }>();
  /** The file each fenced write answered, by id, for `fromAnswer` and `answeredFile`: the effect read from its answer. */
  private readonly answers = new Map<string, { file: DriveFile; trashed: boolean }>();
  /** The target of the fenced write in flight, as its fence saw it: a content write compares it instead of reading again. */
  private peeked: DriveFile | null = null;
  /** What each write's answer said of the stored bytes, by id (checksums asked of every fenced write). */
  private readonly sums = new Map<string, { size?: number; md5?: string; sha256?: string; trashed?: boolean }>();
  /** Each fenced write that ended, with the generation it ended at: what it did (null: not known, e.g. a lost answer). */
  private readonly ended: Array<{ end: number; change: Change | null }> = [];
  /** What the plan read of each file, by id and the modifiedTime its listing gave (the one read cache, `read-cache.ts`). */
  private readonly reads = new ReadCache();

  constructor(opts: RunnerDriveOptions) {
    this.token = opts.token;
    this.attempt = opts.attempt;
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
    // Headless: a request with no answer is never worded as offline; a lost write's answer is still read back (`isNoAnswer`).
    this.http = new DriveHttp({ token: (fresh) => this.token.token(fresh), fetch: (url, init) => this.hooked(url, init), context: 'headless', ...(opts.pacing ? { pacing: opts.pacing } : {}) });
    this.writes = {
      createFolder: (parentId, name, appProperties) => this.fenced({ op: 'create-folder', parentId, name, ...(appProperties ? { appProperties } : {}) }, () => this.http.createFolder(parentId, name, appProperties)),
      createText: (parentId, name, text, appProperties) => this.fenced({ op: 'create-text', parentId, name, text, ...(appProperties ? { appProperties } : {}) }, () => this.http.createText(parentId, name, text, appProperties)),
      update: (id: string, patch: DrivePatch) => this.fenced({ op: 'update', id, patch }, () => this.http.update(id, patch)),
      trash: (id, appProperties) => this.fenced({ op: 'trash', id, ...(appProperties ? { appProperties } : {}) }, () => this.http.trash(id, appProperties)),
      writeText: (id, text, ifModified, appProperties) =>
        this.fenced({ op: 'write-text', id, text, ifModified, ...(appProperties ? { appProperties } : {}) }, () => this.http.writeText(id, text, ifModified, appProperties, this.peeked?.id === id ? this.peeked : undefined)),
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

  private hold(file: DriveFile, trashed: boolean, own: boolean): void {
    this.held.set(file.id, { file, trashed, at: Date.now(), own });
  }

  /** A read kept for this file, or a folder this run made when `parent` (a create's target is its folder). */
  private heldNow(id: string, reads: boolean): StoredNow | null {
    const h = this.held.get(id);
    return h && (h.own || reads) && Date.now() - h.at < HOLD_MS ? { file: h.file, trashed: h.trashed } : null;
  }

  /**
   * A file as it is now for an effect's check: read now, or for the folder an effect goes into (`parent`) the one this
   * run made or read for another effect within the last `HOLD_MS`. Null when it is gone or in the Bin. The fence then does not read it a second time (`fenced`).
   */
  async recheck(id: string, parent = false): Promise<DriveFile | null> {
    const h = parent ? this.heldNow(id, true) : null;
    if (h) return h.trashed ? null : this.seen.note(h.file);
    try {
      const file = await this.get(id);
      if (parent) this.hold(file, false, false);
      return file;
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
  }

  /**
   * What the answer to this run's own write to `id` shows as stored evidence, or null when the answer cannot confirm it
   * (no checksum asked back): the caller then reads it from Drive. A folder has no content; a file's is the answer's.
   */
  fromAnswer(id: string): StoredEvidence | null {
    const a = this.answers.get(id);
    if (!a) return null;
    if (a.file.folder) return { file: a.file, trashed: a.trashed, content: null };
    const sum = this.sums.get(id);
    if (sum?.sha256 === undefined || a.file.size === undefined) return null;
    return { file: a.file, trashed: a.trashed, content: { size: a.file.size, sha256: sum.sha256 } };
  }

  /** Whether the answer to this run's own write to `id` confirms exactly these bytes (the md5 or sha-256 Drive stored). */
  async confirmsBytes(id: string, bytes: Uint8Array): Promise<boolean> {
    const sum = this.sums.get(id);
    if (!sum) return false;
    if (sum.size !== undefined && sum.size !== bytes.byteLength) return false;
    if (sum.sha256 !== undefined) return sum.sha256 === (await sha256Hex(bytes));
    return sum.md5 !== undefined && sum.md5 === md5Hex(bytes);
  }

  /** The file this run's own write answered, as it was then. */
  answeredFile(id: string): DriveFile | null {
    return this.answers.get(id)?.file ?? null;
  }

  async get(id: string): Promise<DriveFile> {
    return this.seen.note(await this.http.get(id));
  }

  /**
   * What the plan saw of a file an effect changes, as the fence must find it right before the send: its name and place
   * (a move, a Bin) and, with `withTime`, its modifiedTime too (a content write, which carries it).
   */
  expectSeen(seenByPlan: { fileId: string; name: string; parents: string[]; folder: boolean; modifiedTime: string }, withTime = false): void {
    this.seen.expectPlace({ id: seenByPlan.fileId, name: seenByPlan.name, parents: seenByPlan.parents, folder: seenByPlan.folder, modifiedTime: seenByPlan.modifiedTime, createdTime: '' }, withTime);
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
      const body = (await this.read(`${API}/files?${params}`)) as { files?: WireFile[]; nextPageToken?: string };
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
   * - **Each file read once per version** (`read-cache.ts`): its text, bytes and digest are kept by id and the
   *   modifiedTime the latest listing gave, however long the plan takes (a model's turn takes minutes). The listing is
   *   kept until this runner sends a write (`generation`), then read again; a file it shows changed is read afresh.
   *   Nothing here stands in for the fence's read before a write (`fenced`).
   */
  planReads(): SpineRead & { scope: AdmissionScope } {
    let listed: { generation: number; reads: SpineRead; listings: Map<string, Promise<DriveFile[]>> } | null = null;
    /** The modifiedTime each file had in the latest listing: the version its reads are kept under. */
    const versions = new Map<string, string>();
    const current = (): NonNullable<typeof listed> => {
      if (!listed || listed.generation !== this.generation) listed = { generation: this.generation, reads: admissionRead(this.http, out.scope), listings: new Map() };
      return listed;
    };
    const at = (id: string): { id: string; modifiedTime: string | undefined } => ({ id, modifiedTime: versions.get(id) });
    const out: SpineRead & { scope: AdmissionScope } = {
      scope: 'all',
      listAll: async (rootId) => {
        const now = current();
        let listing = now.listings.get(rootId);
        if (!listing) {
          listing = now.reads.listAll(rootId);
          now.listings.set(rootId, listing);
          listing.then((files) => { for (const f of files) versions.set(f.id, f.modifiedTime); }, () => now.listings.delete(rootId));
        }
        return [...(await listing)];
      },
      readBytes: (id) => this.reads.bytes(at(id), () => current().reads.readBytes(id)),
      readText: (id) => this.reads.text(at(id), () => current().reads.readText(id)),
      // By version: a file changed since (a newer modifiedTime in the listing) is never paired with an older digest.
      digest: (file) => this.reads.digest(file, () => current().reads.digest(file)),
      // The Bin is asked fresh each time, only for a declared member missing from the listing.
      binnedByItem: (rootId, keys) => current().reads.binnedByItem(rootId, keys),
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
    let w: WireFile;
    try {
      w = (await this.read(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS},sha256Checksum`)) as typeof w;
    } catch (e) {
      if (e instanceof BowerError && e.code === 'not-found') return null;
      throw e;
    }
    // The checksum goes in the evidence, not on the file, as before.
    const file = toFile({ ...w, sha256Checksum: undefined });
    this.seen.note(file);
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
    return md5Hex(await this.http.readBytes(id));
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
      // Read now, right before the send, never from a kept read; only a folder this run made, which a create goes
      // into, is held (see `HOLD_MS`).
      const held = target.part === 'parent' ? this.heldNow(target.id, false) : null;
      const [, now] = await Promise.all([this.stillCurrent(), held ?? this.peek(target.id)]);
      this.seen.assert(target, now);
      this.peeked = now?.file ?? null;
      if ('id' in call) {
        this.held.delete(call.id);
        this.answers.delete(call.id);
        this.sums.delete(call.id);
      }
      this.current = { call, action: null };
      this.generation++;
      this.writing = true;
      let change: Change | null = null;
      try {
        const answer = await write();
        change = call.op === 'trash' ? { gone: call.id } : { file: answer as DriveFile };
        if (call.op === 'trash') {
          // The Bin is shown by Drive's own answer (`trashed`), not by what was read before.
          if (this.peeked && this.sums.get(call.id)?.trashed === true) this.answers.set(call.id, { file: this.peeked, trashed: true });
        } else {
          // Noted here too, before the next queued write asks: the wrap notes it only after this promise has resolved.
          const file = this.seen.note(answer as DriveFile);
          this.answers.set(file.id, { file, trashed: false });
          if (file.folder) this.hold(file, false, true);
        }
        return answer;
      } finally {
        this.writing = false;
        this.generation++;
        this.ended.push({ end: this.generation, change });
        this.current = null;
        this.peeked = null;
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
  private async hooked(url: string, init?: RequestInit): Promise<Response> {
    const now = this.current;
    // Reads, and writes outside a fence, go as they are: the transport bounds, retries and words them (`transport.ts`).
    if ((init?.method ?? 'GET').toUpperCase() === 'GET' || !now) return this.fetchFn(url, init);
    now.action ??= this.fault?.before?.(now.call) ?? 'pass';
    // A TypeError is how fetch fails with no network; the transport reads it as no answer (`isNoAnswer`).
    if (now.action === 'refuse') throw new TypeError('A fault refused this write.');
    // A record's or report file's create, and any text write, asks its answer for the stored checksums too.
    // Every fenced write asks its answer for the stored checksums too: the answer then shows the effect, with no read-back.
    const res = await this.fetchFn(withChecksums(url), init);
    // A write Google failed on may still have landed: read as a lost answer, so it is read back, never sent again.
    if (res.status >= 500) {
      console.error(`Drive answered ${res.status} to a write`);
      throw new TypeError('Drive failed on this write; it may have landed.');
    }
    if (!res.ok) return res;
    this.current = null;
    this.fault?.applied?.(now.call);
    if (now.action === 'lose-reply') throw new TypeError('A fault lost the answer to this write.');
    await this.confirm(now.call.op === 'create-text' ? now.call.text : null, res.clone());
    return res;
  }

  /**
   * Keeps what the answer proves. A record created (immutable) keeps its text when the answer's checksum is that of the
   * bytes sent; a report file keeps only the md5 Drive gave, for the barrier's read-back right after (`md5`). An answer
   * with no checksum confirms nothing, and `last-run.json` is never confirmed: it is read back from Drive.
   */
  private async confirm(text: string | null, res: Response): Promise<void> {
    const body = (await res.json().catch(() => null)) as { id?: string; name?: string; size?: string; trashed?: boolean; md5Checksum?: string; sha256Checksum?: string } | null;
    if (!body?.id || body.name === undefined) return;
    this.sums.set(body.id, {
      ...(body.size !== undefined ? { size: Number(body.size) } : {}),
      ...(body.trashed !== undefined ? { trashed: body.trashed } : {}),
      ...(body.md5Checksum !== undefined ? { md5: body.md5Checksum } : {}),
      ...(body.sha256Checksum !== undefined ? { sha256: body.sha256Checksum } : {}),
    });
    const record = RECORD.test(body.name);
    if (!record && !REPORT_FILE.test(body.name)) return;
    if (!record) {
      if (body.md5Checksum !== undefined) this.answered.set(body.id, body.md5Checksum);
      return;
    }
    if (text === null) return;
    const bytes = new TextEncoder().encode(text);
    const sha = body.sha256Checksum !== undefined && body.sha256Checksum === (await sha256Hex(bytes));
    const md5 = body.md5Checksum !== undefined && body.md5Checksum === md5Hex(bytes);
    if (sha || md5) this.confirmed.set(body.id, text);
    else if (body.sha256Checksum !== undefined || body.md5Checksum !== undefined) console.error(`Drive stored other bytes for file ${body.id} than were sent`);
  }

  /** A read through the transport: the token, its one refresh, the retry policy and the error mapping (`DriveHttp.call`). */
  private async read(url: string): Promise<unknown> {
    return (await this.http.call(url)).json();
  }
}

/** A create's address asking its answer for the stored content's checksums too (`fields`). */
function withChecksums(input: string): string {
  const url = new URL(input);
  const fields = url.searchParams.get('fields');
  if (fields === null) return input;
  url.searchParams.set('fields', `${fields},${CHECKSUMS}`);
  return url.href;
}
