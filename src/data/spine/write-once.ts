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
 *
 * A key found again answers two questions, each with its one name here (TL-P4-24 addenda 9 and 10), for both cases:
 * - `happened`: did this write run? The reserved id is there, or the stamp is this write's. The runner's reconcile and
 *   the upload ask it: sending again would undo what the person did with the file since.
 * - `landed`: is the file as this write intended? It happened, and the file is what the write makes it (`notAsSeen`
 *   against what it read with the write's own change applied, or for a create the name and place it was sent with, out
 *   of the Bin; modifiedTime ignored), with the bytes sent for text. The app asks it: a create that happened but has
 *   moved, been renamed, binned or changed elsewhere since is refused (`CHANGED_ELSEWHERE`), nothing is sent or made
 *   again, and its id is let go, so the file stays where the person put it. An idempotency key that finds a different
 *   state is refused, not reinterpreted (Stripe, as above; RFC 9110 13.1.1: a precondition comes from what the client
 *   meant, never from a read just before the write).
 */
import { BowerError } from '../types';
import { md5Hex, sha256Sync } from '../contracts/hashes';
import { CHANGED_ELSEWHERE, notAsSeen, notAsSeenError, notAsSeenReason, type Landing, type SeenExpectation } from '../contracts/still-as-seen';
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

/** An unbin: out of the Bin as it was (`unbin`), or under a free name in the same write (`unbin:<name>`). */
export const unbins = (intent: Intent): boolean => intent === 'unbin' || (typeof intent === 'string' && intent.startsWith('unbin:'));

/** A write's key: the id reserved for a create (case 1), or the stamp of an update (case 2). */
export type WriteKey = { id: string } | { stamp: string };

/** Did this write run? Drive keeps the file under its reserved id, or the file carries its stamp. */
export const happened = (key: WriteKey, now: DriveFile | null): now is DriveFile =>
  now !== null && ('id' in key ? now.id === key.id : now.appProperties?.[STAMP] === key.stamp);

/**
 * Is the file as this write intended? It `happened`, it is what the write makes it (`intended`, by `notAsSeen`,
 * modifiedTime ignored), and for text it holds one of the texts sent (Drive's checksum).
 */
export const landed = (key: WriteKey, intended: SeenExpectation, now: DriveFile | null, texts?: readonly string[]): now is DriveFile =>
  happened(key, now) && (texts === undefined || texts.some((t) => confirms(now, new TextEncoder().encode(t)))) && notAsSeen(sameButTime(intended), now) === null;

/** What a write intends, its modifiedTime left out: the write itself changes it. */
const sameButTime = ({ id, name, parents, trashed }: SeenExpectation): SeenExpectation => ({ id, name, parents, ...(trashed !== undefined ? { trashed } : {}) });

/**
 * The file as that write to `f` leaves it: what it read, with the write's own change applied (TL-P4-24 addendum 7). Its
 * modifiedTime is left out, since the write itself changes it.
 * - a rename (`rename:<name>`): that name; a move (`move:<folder>` or `move:<folder>:<name>`): that folder, and name;
 * - a Bin: in the Bin; an unbin (`unbin`, or `unbin:<name>` back under a free name): out of it, under that name;
 * - a text, or a change of properties only: the name and place it read, out of the Bin for a text.
 */
function expectedAfter(f: DriveFile, intent: Intent): SeenExpectation {
  const read: SeenExpectation = { id: f.id, name: f.name, parents: f.parents, trashed: f.trashed === true };
  if (typeof intent !== 'string') return { ...read, trashed: false };
  const [kind = '', ...rest] = intent.split(':');
  const arg = rest.join(':');
  if (kind === 'bin') return { ...read, trashed: true };
  if (kind === 'unbin') return { ...read, trashed: false, ...(arg ? { name: arg } : {}) };
  if (kind === 'rename') return { ...read, name: arg };
  if (kind === 'move') {
    const [to = '', ...name] = rest;
    // Drive's move: the folder it read goes (`removeParent`, its one parent), the new one comes (`addParent`).
    return { ...read, parents: [...f.parents.slice(1), to], ...(name.length ? { name: name.join(':') } : {}) };
  }
  return read;
}

/**
 * `landed` for a write to `f` (TL-P4-24 addenda 7 and 8): `now` carries the stamp of that write (and, for text, the
 * checksum of the text sent) **and** is exactly what the write makes it (`expectedAfter`). A file renamed, moved or put
 * in or out of the Bin since, elsewhere, is not this write landed. The fence (`checkStillAsSeen`, through `landing`)
 * and a lost answer's read (`updateByStamp`) both ask it.
 */
export const landedAs = (f: DriveFile, intent: Intent, now: DriveFile): boolean =>
  landed({ stamp: stampFor(f, intent) }, expectedAfter(f, intent), now, typeof intent === 'string' ? undefined : [intent.text]);

/** That write to `f` as the fence's landed case (`checkStillAsSeen`): `landedAs`. */
export const landing = (f: DriveFile, intent: Intent): Landing<DriveFile> => (now) => landedAs(f, intent, now);

/**
 * Case 2: an update or a move of a file read as `f`, sent once with its stamp and found again by reading `f` by its id;
 * a text write counts only when Drive's checksum is that of the text sent. `read` is told what that read found.
 */
export async function updateByStamp(reads: Gets, f: DriveFile, intent: Intent, send: (op: { [STAMP]: string }) => Promise<DriveFile>, read?: (now: DriveFile | null) => void): Promise<DriveFile> {
  const out = await once(stampFor(f, intent), (s) => send({ [STAMP]: s }), async () => {
    const now = await byId(reads, f.id);
    read?.(now);
    return now && landedAs(f, intent, now) ? now : null;
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

/** What a create at `at` with `id` makes: that id, under its name, in its folder, out of the Bin. */
const createdAs = (id: string, at: Place): SeenExpectation => ({ id, name: at.name, parents: [at.parent], trashed: false });

/**
 * A create found again by its reserved id, as `landed` says: the file when it is as made (and, for text, holds one of
 * `texts`); refused when it happened but was moved, renamed, binned or changed elsewhere since. The refusal lets the id
 * go (`releases`), and nothing is written to the file.
 */
function asMade(id: string, at: Place, now: DriveFile, texts?: readonly string[]): DriveFile {
  const intended = createdAs(id, at);
  if (landed({ id }, intended, now, texts)) return now;
  const reason = notAsSeen(intended, now) ?? 'modified';
  console.error(`A file made by its reserved id is no longer as made (${reason}); it stays where it is`);
  throw notAsSeenError(reason, CHANGED_ELSEWHERE);
}

/**
 * The file a create kept on `at.id` made, read by that id: null when Drive keeps none; the file when it `landed` (with
 * one of `texts`, for text); refused when it happened and is no longer as made.
 */
export async function madeAt(reads: Gets, at: Place & { id: string }, texts?: readonly string[]): Promise<DriveFile | null> {
  const now = await byId(reads, at.id);
  return now === null ? null : asMade(at.id, at, now, texts);
}

/** An app's create, sent once by its reserved id; found again by it, it counts only when it `landed` (`asMade`). */
async function makeAs(id: string, at: Place, send: (id: string) => Promise<DriveFile>, reads: Gets, texts?: readonly string[]): Promise<DriveFile> {
  const read: { found?: DriveFile } = {};
  const out = await createById(id, send, async (key) => {
    const now = await byId(reads, key);
    if (now) read.found = now;
    return now;
  });
  return out === read.found ? asMade(id, at, out, texts) : out;
}

/** A folder made once, by its reserved id. */
export const makeFolder = async (w: Makes, reads: Gets, at: Place): Promise<DriveFile> =>
  makeAs(at.id ?? (await reserveId(w)), at, (id) => w.createFolder(at.parent, at.name, at.props, id), reads);

/** A text file made once, by its reserved id, and confirmed by its answer's checksum. */
export const makeText = async (w: Makes, reads: Gets, at: Place, text: string): Promise<DriveFile> =>
  confirmed(await makeAs(at.id ?? (await reserveId(w)), at, (id) => w.createText(at.parent, at.name, text, at.props, id), reads, [text]), text);

/**
 * The port: where one intended create keeps the id reserved for it, the home keeping no store of its own. Its outbox
 * line on the device (the journal: it survives a reload), its upload record on the device (the upload queue keeps the
 * id there before the first byte is sent, `heldAs`), a thing on its way (`Sending`), or this page's memory (`Intended`).
 */
export interface Holder {
  reserved?: string;
  /** A keeper that stores the id in its own shape lets it go there too, when the home lets it go (`makeOnce`). */
  letGo?: () => Promise<void>;
}

/**
 * The holder of an id a keeper stores in its own shape (an upload record's `fileId`, null until one is reserved): the
 * home reserves it once (`makeOnce`), the keeper keeps it in its create before anything is sent with it, and lets it go
 * (`letGo`) when the home does, so a try after a refusal reserves anew.
 */
export const heldAs = (id: string | null, letGo: () => Promise<void>): Holder => (id === null ? { letGo } : { reserved: id, letGo });

/** Ids for every holder that has none yet, in one request (`files.generateIds`), each set on its holder. */
export async function reserveFor(w: Pick<Makes, 'generateIds'>, holders: readonly Holder[], signal?: AbortSignal): Promise<void> {
  const bare = holders.filter((h) => h.reserved === undefined);
  if (!bare.length) return;
  const ids = await w.generateIds(bare.length, signal);
  if (ids.length < bare.length) throw driveError('unknown');
  bare.forEach((h, i) => (h.reserved = ids[i]));
}

/**
 * Whether a failed create lets its id go: when refused outright (a 4xx, `permanent` in the transport's table,
 * TL-P4-14 addendum 13), or found again no longer as made (`asMade`: the file is the person's now, TL-P4-24 addendum
 * 10). Not known to have failed (no answer, a 5xx, a conflict its landing may explain), or not taken for now (a rate
 * limit, a full Drive: addendum 16), it keeps it for the next try.
 */
const releases = (e: unknown, kind: FailureKind): boolean => notAsSeenReason(e) !== null || (kind === 'permanent' && !unsettled(e));

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
    if (releases(e, kindOf(e))) {
      delete h.reserved;
      await h.letGo?.();
    }
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
