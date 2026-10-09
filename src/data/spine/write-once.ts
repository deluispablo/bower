/**
 * Write-once (ARCHITECTURE, mechanism map): every write Bower sends, the app's, a run's and the Worker's, carries an
 * idempotency key (as Stripe's: https://stripe.com/docs/api/idempotent_requests; RFC 9110 9.2.2). With no answer, an
 * unknown outcome (a 5xx) or a conflict, the write is looked for by that key: found, it landed (the person's own write,
 * never "changed somewhere else"); not found, the error stands. Never by a name, a substring or a text. Two cases:
 * 1. A create carries an id Drive reserved for it (`files.generateIds`,
 *    https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds); Drive refuses a second
 *    file with it (409, https://developers.google.com/workspace/drive/api/guides/handle-errors) (`createById`).
 * 2. An update or a move carries one `appProperties` key, `bowerOp` (https://developers.google.com/workspace/drive/api/guides/properties),
 *    naming its intent; the file read by its id must carry it and, for text, the checksum of the bytes sent (`updateByStamp`).
 * The answer confirms the write by the `md5Checksum` its `fields` ask for
 * (https://developers.google.com/workspace/drive/api/reference/rest/v3/files), with no read after it (`confirms`).
 */
import { BowerError } from '../types';
import { md5Hex, sha256Sync } from '../contracts/hashes';
import { driveError, type DriveApi, type DriveFile, type FencedDrive } from '../drive/drive-api';
import { failureKind, isNoAnswer, isUnconfirmedWrite, marked, type FailureKind } from '../drive/transport';

export const STAMP = 'bowerOp';

/**
 * The stamp of one write: the first 32 hex characters of SHA-256(`<scope>:<intent>`), 128 bits (TL-P4-05 addendum 2).
 * Drive keeps at most 124 bytes for one property's key and value, so the intent is hashed, never written out.
 */
export const stampOf = (scope: string, intent: string): string => sha256Sync(`${scope}:${intent}`).slice(0, 32);

/** Whether the answer to a write says Drive stored exactly `bytes` (its `md5Checksum`, or its SHA-256 when it gives one). */
export function confirms(answer: DriveFile, bytes: Uint8Array): boolean {
  if (answer.md5Checksum !== undefined) return answer.md5Checksum === md5Hex(bytes);
  return answer.sha256 !== undefined && answer.sha256 === sha256Sync(bytes);
}

/** A write whose outcome is to be read back by its key: no answer, a 5xx, or a conflict its own landing may explain. */
const unsettled = (e: unknown): boolean => isNoAnswer(e) || isUnconfirmedWrite(e) || (e instanceof BowerError && e.code === 'conflict');

/** The rule: sends the write with its key; with no answer, an unknown outcome or a conflict, looks for it by that key. */
async function once<T>(key: string, send: (key: string) => Promise<T>, find: (key: string) => Promise<T | null>): Promise<T> {
  try {
    return await send(key);
  } catch (e) {
    if (!unsettled(e)) throw e;
    let found: T | null;
    try {
      found = await find(key);
    } catch (again) {
      console.error(again);
      throw e;
    }
    if (found === null) throw e;
    // It landed and only its answer was lost (or a retry met it): the same write, not a second one.
    console.error(e);
    return found;
  }
}

/** Case 1: a create, sent with the id Drive reserved for it and found again by that id (a 409 says it is there). */
export const createById = <T>(id: string, send: (id: string) => Promise<T>, find: (id: string) => Promise<T | null>): Promise<T> => once(id, send, find);

/** A read by id: the file as Drive keeps it, even in the Bin (`binned`), with its checksum. */
export type Gets = Pick<DriveApi, 'get'>;

/** The file Drive keeps under `id`, in the Bin or not, with its checksum; null when it keeps none. */
export const byId = (drive: Gets, id: string): Promise<DriveFile | null> =>
  drive.get(id, { checksums: true, binned: true }).catch((e: unknown) => {
    if (e instanceof BowerError && e.code === 'not-found') return null;
    throw e;
  });

/** What one write to a file does: a change named by its intent, or a text (whose bytes are checked too). */
export type Intent = string | { text: string };

/** The stamp of one write to `f`: the version it read and what it does, so a retry of the same change is the same write. */
const stampFor = (f: DriveFile, intent: Intent): string => stampOf(f.id, `${f.modifiedTime}:${typeof intent === 'string' ? intent : `text:${sha256Sync(intent.text)}`}`);

/**
 * Whether `now` holds that write to `f`: it carries its stamp and, for text, Drive's checksum of the text sent; a Bin
 * or a restore, only while it is still in the Bin or out of it (a restore in Drive's own page keeps the stamp).
 */
export const holds = (f: DriveFile, intent: Intent, now: DriveFile): boolean =>
  now.appProperties?.[STAMP] === stampFor(f, intent) &&
  (intent === 'bin' ? now.trashed === true : intent === 'unbin' ? now.trashed !== true : typeof intent === 'string' || confirms(now, new TextEncoder().encode(intent.text)));

/**
 * Case 2: an update or a move of a file read as `f`, sent once with its stamp and found again by reading `f` by its id;
 * a text write counts only when Drive's checksum is that of the text sent. `read` is told what that read found.
 */
export async function updateByStamp(reads: Gets, f: DriveFile, intent: Intent, send: (op: { [STAMP]: string }) => Promise<DriveFile>, read?: (now: DriveFile | null) => void): Promise<DriveFile> {
  const out = await once(stampFor(f, intent), (s) => send({ [STAMP]: s }), async () => {
    const now = await byId(reads, f.id);
    read?.(now);
    return now && holds(f, intent, now) ? now : null;
  });
  return typeof intent === 'string' ? out : confirmed(out, intent.text);
}

/** What makes a file once: an id reserved, then a create with it. */
type Makes = Pick<FencedDrive, 'generateIds' | 'createFolder' | 'createText'>;

/** An id Drive reserved for one create (`files.generateIds`): the create's idempotency key. */
export async function reserveId(w: Pick<Makes, 'generateIds'>): Promise<string> {
  const [id] = await w.generateIds(1);
  if (id === undefined) throw driveError('unknown');
  return id;
}

/** Where a create goes and what it carries; `id` when one was reserved for it earlier (kept across tries). */
type Place = { parent: string; name: string; props?: Record<string, string>; id?: string };

/** A folder made once, by its reserved id. */
export const makeFolder = async (w: Makes, reads: Gets, at: Place): Promise<DriveFile> =>
  createById(at.id ?? (await reserveId(w)), (id) => w.createFolder(at.parent, at.name, at.props, id), (id) => byId(reads, id));

/** A text file made once, by its reserved id, and confirmed by its answer's checksum. */
export const makeText = async (w: Makes, reads: Gets, at: Place, text: string): Promise<DriveFile> =>
  confirmed(await createById(at.id ?? (await reserveId(w)), (id) => w.createText(at.parent, at.name, text, at.props, id), (id) => byId(reads, id)), text);

/**
 * The port: where one intended create keeps the id reserved for it, the home keeping no store of its own. Its outbox
 * line on the device (the journal: it survives a reload), its upload record on the device (the upload queue keeps the
 * id there before the first byte is sent, `heldAs`), a thing on its way (`Sending`), or this page's memory (`Intended`).
 */
export interface Holder {
  reserved?: string;
}

/**
 * The holder of an id a keeper stores in its own shape (an upload record's `fileId`, null until one is reserved): the
 * home reserves it once (`makeOnce`), and the keeper keeps it in its create, before anything is sent with it.
 */
export const heldAs = (id: string | null): Holder => (id === null ? {} : { reserved: id });

/** Ids for every holder that has none yet, in one request (`files.generateIds`), each set on its holder. */
export async function reserveFor(w: Pick<Makes, 'generateIds'>, holders: readonly Holder[], signal?: AbortSignal): Promise<void> {
  const bare = holders.filter((h) => h.reserved === undefined);
  if (!bare.length) return;
  const ids = await w.generateIds(bare.length, signal);
  if (ids.length < bare.length) throw driveError('unknown');
  bare.forEach((h, i) => (h.reserved = ids[i]));
}

/**
 * Whether a failed create lets its id go: only when refused outright (a 4xx, `permanent` in the transport's table,
 * TL-P4-14 addendum 13). Not known to have failed (no answer, a 5xx, a conflict its landing may explain), or not taken
 * for now (a rate limit, a full Drive: addendum 16), it keeps it for the next try.
 */
const releases = (e: unknown, kind: FailureKind): boolean => kind === 'permanent' && !unsettled(e);

/**
 * One intended create, sent with the id its holder keeps (reserved now when it has none) and found again by it: the id
 * stays on the holder until the create is confirmed, so a try after a lost answer and a failed read-back is that same
 * file; a refusal lets it go. `kindOf` tells a failure's kind when the caller's own table refines it (a 404 listed anew);
 * `signal` stops the reservation with the send it is for.
 */
export async function makeOnce(h: Holder, w: Pick<Makes, 'generateIds'>, create: (id: string) => Promise<DriveFile>, kindOf: (e: unknown) => FailureKind = failureKind, signal?: AbortSignal): Promise<DriveFile> {
  await reserveFor(w, [h], signal);
  const id = h.reserved;
  if (id === undefined) throw driveError('unknown');
  try {
    return await create(id);
  } catch (e) {
    if (releases(e, kindOf(e))) delete h.reserved;
    throw e;
  }
}

/**
 * The memory port: what a person means to make, each kept by what is meant (its `key`) with the holder of its id until
 * it is settled. A try again after an answer lost and a read-back failed too is sent with the same id, so it makes one
 * file. There is no pool: each id is reserved for one create, when it is first tried.
 */
export class Intended<H extends Holder = Holder> {
  private readonly held = new Map<string, H>();

  /** The id kept for `key`, when an earlier try may have landed with its answer lost. */
  kept(key: string): string | undefined {
    return this.held.get(key)?.reserved;
  }

  /** The holder kept for `key`, when what it means is not settled yet. */
  holder(key: string): H | undefined {
    return this.held.get(key);
  }

  /** What `key` means waits on `h`: a later try with the same key is that one. */
  keep(key: string, h: H): void {
    this.held.set(key, h);
  }

  /** What `key` meant is settled (made, refused, or found another way): its holder and id are let go. */
  forget(key: string): void {
    this.held.delete(key);
  }

  /** One intended create kept in this page's memory, by its key (`makeOnce`). */
  async make(this: Intended<Holder>, key: string, w: Pick<Makes, 'generateIds'>, create: (id: string) => Promise<DriveFile>): Promise<DriveFile> {
    const h = this.held.get(key) ?? {};
    this.held.set(key, h);
    try {
      const made = await makeOnce(h, w, create);
      this.held.delete(key);
      return made;
    } catch (e) {
      // Still not known whether it landed, or not taken for now: the id stays for the next try. Refused: let go.
      if (h.reserved === undefined) this.held.delete(key);
      throw e;
    }
  }
}

/** The file a write answered, when its checksum is that of `text`; otherwise the write is not confirmed. */
export function confirmed(file: DriveFile, text: string): DriveFile {
  if (confirms(file, new TextEncoder().encode(text))) return file;
  console.error(`Drive did not confirm the bytes of ${file.name} as sent`);
  // Its key now holds other bytes: the same write sent again is answered the same, so it is not tried again as is.
  throw new BowerError('unknown', 'Bower could not save what it did. Try again later.', undefined, marked('permanent'));
}
