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
import { CHANGED_ELSEWHERE, checkStillAsSeen, notAsSeen, notAsSeenError, notAsSeenReason, notRead, type Landing, type SeenExpectation } from '../contracts/still-as-seen';
import { DRIVE_MESSAGES, driveError, type DriveApi, type DriveFile, type Fence, type FencedDrive } from '../drive/drive-api';
import { failureKind, isNoAnswer, isUnconfirmedWrite, marked, type FailureKind } from '../drive/transport';

export const STAMP = 'bowerOp';

/**
 * The stamp of one write: the first 32 hex characters of SHA-256(`<scope>:<intent>`), 128 bits (TL-P4-05 addendum 2).
 * Drive keeps at most 124 bytes for one property's key and value, so the intent is hashed, never written out.
 */
export const stampOf = (scope: string, intent: string): string => sha256Sync(`${scope}:${intent}`).slice(0, 32);

/** A content's hashes, as Drive answers one of them: its `md5Checksum`, or its SHA-256 when it gives one. */
export interface Hashes { md5: string; sha256: string }

/** The hashes of `bytes`, or of a text's UTF-8 bytes. */
export const hashesOf = (content: Uint8Array | string): Hashes => {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return { md5: md5Hex(bytes), sha256: sha256Sync(bytes) };
};

/** Whether a file Drive answered holds the content of `h` (its `md5Checksum`, or its SHA-256 when it gives one). */
const holds = (answer: DriveFile, h: Hashes): boolean =>
  answer.md5Checksum !== undefined ? answer.md5Checksum === h.md5 : answer.sha256 !== undefined && answer.sha256 === h.sha256;

/** Whether the answer to a write says Drive stored exactly `bytes` (its `md5Checksum`, or its SHA-256 when it gives one). */
export const confirms = (answer: DriveFile, bytes: Uint8Array): boolean => holds(answer, hashesOf(bytes));

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
 * modifiedTime ignored), and for text it holds one of the contents sent (Drive's checksum).
 */
export const landed = (key: WriteKey, intended: SeenExpectation, now: DriveFile | null, contents?: readonly Hashes[]): now is DriveFile =>
  happened(key, now) && (contents === undefined || contents.some((h) => holds(now, h))) && notAsSeen(sameButTime(intended), now) === null;

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
  landed({ stamp: stampFor(f, intent) }, expectedAfter(f, intent), now, typeof intent === 'string' ? undefined : [hashesOf(intent.text)]);

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

/**
 * What one create was first sent as, kept with the id reserved for it (TL-P4-24 addendum 16): its folder, its name and,
 * for text, its content's hashes. A retry resends it, never a name picked anew, and is judged against it (`asMade`): a
 * folder listed again since shows the landed file, so a name picked now would be another one.
 */
export interface Sent { parent: string; name: string; content?: Hashes }

/** The intent a create sends first: where, under which name and, for text, with which content. */
export const sentAs = (parent: string, name: string, text?: string): Sent => ({ parent, name, ...(text !== undefined ? { content: hashesOf(text) } : {}) });

const isHashes = (v: unknown): v is Hashes =>
  typeof v === 'object' && v !== null && /^[0-9a-f]{32}$/.test(String((v as Hashes).md5)) && /^[0-9a-f]{64}$/.test(String((v as Hashes).sha256));

/** A kept intent, as a keeper reads it back from the device: anything else is not one (and the keeper keeps none). */
export const isSent = (v: unknown): v is Sent =>
  typeof v === 'object' && v !== null && typeof (v as Sent).parent === 'string' && typeof (v as Sent).name === 'string' &&
  ((v as Sent).content === undefined || isHashes((v as Sent).content));

/** Where a create goes and what it carries; `id` when one was reserved for it earlier (kept across tries). */
type Place = Sent & { props?: Record<string, string>; id?: string };

/** What a create at `at` with `id` makes: that id, under its name, in its folder, out of the Bin. */
const createdAs = (id: string, at: Place): SeenExpectation => ({ id, name: at.name, parents: [at.parent], trashed: false });

/**
 * A create found again by its reserved id, as `landed` says: the file when it is as made (and, for text, holds one of
 * `texts`, or the content first sent with that id); refused when it happened but was moved, renamed, binned or changed
 * elsewhere since. The refusal lets the id go (`releases`), and nothing is written to the file.
 */
function asMade(id: string, at: Place, now: DriveFile, texts?: readonly string[]): DriveFile {
  const intended = createdAs(id, at);
  const contents = texts === undefined ? undefined : [...texts.map((t) => hashesOf(t)), ...(at.content ? [at.content] : [])];
  if (landed({ id }, intended, now, contents)) return now;
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
  /** What the create was first sent as with `reserved` (`Sent`); an entry kept before it was stored has none. */
  sent?: Sent;
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
 * file; a refusal lets it go. With the id the holder keeps what the create was first sent as (`sent`, else `fresh`):
 * every try sends that, never a name picked anew (TL-P4-24 addendum 16). `kindOf` tells a failure's kind when the
 * caller's own table refines it (a 404 listed anew); `signal` stops the reservation with the send it is for.
 */
export function makeOnce(h: Holder, w: Pick<Makes, 'generateIds'>, fresh: Sent, create: (id: string, sent: Sent) => Promise<DriveFile>, kindOf: (e: unknown) => FailureKind = failureKind, signal?: AbortSignal): Promise<DriveFile> {
  return alone(h, async () => {
    await reserveFor(w, [h], signal);
    const id = h.reserved;
    if (id === undefined) throw driveError('unknown');
    // An entry kept before intents were stored has none: it sends this try's, as it did, and keeps it from now on.
    h.sent ??= fresh;
    try {
      return await create(id, h.sent);
    } catch (e) {
      if (releases(e, kindOf(e))) {
        delete h.reserved;
        delete h.sent;
        await h.letGo?.();
      } else if (e instanceof BowerError && e.code === 'not-found') {
        // A 404: the folder it was sent to is gone, so nothing was made there. The id stays; the next try is sent where
        // its place is found anew, and a file an earlier try made with this id is still met by it (a 409, then `asMade`).
        delete h.sent;
      }
      throw e;
    }
  });
}

/** What each holder is doing now, its create or its withdrawal: the tail of its one line of operations. */
const busy = new WeakMap<Holder, Promise<unknown>>();

/**
 * One operation at a time per holder (the per-resource mutex, as Web Locks give per name:
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API): a create and a withdrawal of the same holder never
 * run side by side (TL-P4-24 addendum 11). The next waits for the one before to settle, which its own transport
 * timeout bounds; it is taken in the same turn as the call, so a withdrawal that starts after a send sees it.
 */
function alone<T>(h: Holder, work: () => Promise<T>): Promise<T> {
  const run = (busy.get(h) ?? Promise.resolve()).then(work);
  // expected: the caller hears this failure through `run`; the line of operations only keeps the order.
  const tail = run.catch(() => undefined);
  busy.set(h, tail);
  void tail.then(() => {
    if (busy.get(h) === tail) busy.delete(h);
  });
  return run;
}

/**
 * What a withdrawal found under the reserved id: the file, `binned` by it now or kept where it was; null when none.
 * `held`: the file stays and so does the holder's id (its keeper's `keep` said `hold`).
 */
export type Withdrawn = { file: DriveFile; binned: boolean; held?: true } | null;

/**
 * Whether a live file found under the id stays: false bins it, true lets the id go with the file where it is, `hold`
 * keeps both, and a throw refuses the withdrawal with the holder kept.
 */
export type Keeps = (f: DriveFile) => boolean | 'hold' | Promise<boolean | 'hold'>;

/** What a withdrawal reads and bins with. */
export type Bins = Gets & Pick<DriveApi, 'trash'>;

/** The withdrawal's own refusal (`unreached`): Drive did not answer, so whether the create landed is not known. */
export function unreached(e: unknown): BowerError {
  console.error(e);
  return new BowerError('unreached', DRIVE_MESSAGES.unreached, undefined, { cause: e });
}

/** A failure that leaves whether Drive has the file unknown: no answer, a 5xx, or a fence that could not read. */
const unanswered = (e: unknown): boolean => isNoAnswer(e) || isUnconfirmedWrite(e) || notRead(e);

/**
 * The one exit of an intended create the person withdrew (an Undo, a pile removed; TL-P4-24 finding 3, addendum 1). An
 * id is let go only on Drive's word about it, never on a listing:
 * - a holder with no id reserved was never sent: it lets go without a read;
 * - otherwise the file is read by its id (`byId`, the Bin included): none (a 404) or one in the Bin lets go;
 * - one found live goes to the Bin through the fence (`checkStillAsSeen`, on the name and place just read) and its
 *   stamp (`updateByStamp`), never a hard delete; unless `keep` says it stays (filed elsewhere, other bytes, or inside a
 *   folder that goes to the Bin with it), and then it is let go where it is;
 * - anything else (no answer, a 5xx, a refusal of the read, a 403 or a sign-in asked for) is unknown: the holder keeps
 *   its id, and the withdrawal is refused with its own code, `unreached`, so a caller tells it from every other failure.
 * It decides only on the holder as it is once its own create, if one is on its way, settled (`alone`).
 */
export function withdraw(h: Holder, drive: Bins, keep?: Keeps): Promise<Withdrawn> {
  // Never beside a create of the same holder: one on its way is waited for, and the holder is read once it settled.
  return alone(h, async () => {
    const id = h.reserved;
    let out: Withdrawn = null;
    if (id !== undefined) {
      let found: DriveFile | null;
      try {
        found = await byId(drive, id);
      } catch (e) {
        // Neither a 404 nor a file: whatever Drive said (no answer, a 5xx, a 403, signed out), it is not known.
        throw unreached(e);
      }
      try {
        const stays = found && !found.trashed ? await keep?.(found) : undefined;
        // Held: neither binned nor let go, so the holder keeps its id.
        if (found && stays === 'hold') return { file: found, binned: false, held: true };
        if (found && !found.trashed && !stays) {
          const f = found;
          // The same check is the trash's fence (`WriteOptions`), run again before a resend after a rate limit or a
          // refreshed token (c4-retry-fence, contract point 4).
          const check = (): Promise<DriveFile | null> => checkStillAsSeen({ id: f.id, name: f.name, parents: f.parents }, () => byId(drive, f.id), CHANGED_ELSEWHERE, { unanswered: isNoAnswer, landed: landing(f, 'bin') });
          const fence: Fence = async () => void (await check());
          const landed = await check();
          out = { file: landed ?? (await updateByStamp(drive, f, 'bin', (op) => drive.trash(f.id, op, { fence }))), binned: true };
        } else if (found) out = { file: found, binned: false };
      } catch (e) {
        if (unanswered(e) || !(e instanceof BowerError)) throw unreached(e);
        throw e;
      }
    }
    delete h.reserved;
    delete h.sent;
    await h.letGo?.();
    return out;
  });
}

/** One pile conversion's first intent and its three landed steps (TL-P4-24 addendum 18). */
interface Conversion {
  loose: DriveFile;
  text: string;
  props: Record<string, string>;
  folder: Holder & { landed?: DriveFile };
  moved?: DriveFile;
  note: Holder & { name: string; landed?: DriveFile };
}

/** The names and words chosen once, before the conversion's first send. */
interface ConversionStart {
  loose: DriveFile;
  folder: Sent;
  props: Record<string, string>;
  noteName: string;
  text: string;
}

/**
 * The memory port: what a person means to make, each kept by what is meant (its `key`) with the holder of its id until
 * it is settled. A try again after an answer lost and a read-back failed too is sent with the same id, so it makes one
 * file. There is no pool: each id is reserved for one create, when it is first tried.
 */
export class Intended<H extends Holder = Holder> {
  private readonly held = new Map<string, H & { conversion?: Conversion }>();

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

  /** What `key` meant is withdrawn by the person (`withdraw`): refused while Drive does not answer, it stays kept. */
  async withdraw(key: string, drive: Bins, keep?: Keeps): Promise<Withdrawn> {
    const h = this.held.get(key);
    if (!h) return null;
    const out = await withdraw(h, drive, keep);
    this.held.delete(key);
    return out;
  }

  /** One intended create kept in this page's memory, by its key (`makeOnce`), with what it was first sent as. */
  async make(this: Intended<Holder>, key: string, w: Pick<Makes, 'generateIds'>, fresh: Sent, create: (id: string, sent: Sent) => Promise<DriveFile>): Promise<DriveFile> {
    const h = this.held.get(key) ?? {};
    this.held.set(key, h);
    try {
      const made = await makeOnce(h, w, fresh, create);
      this.held.delete(key);
      return made;
    } catch (e) {
      // Create still pending: the holder stays for the next try. A refused create lets it go.
      if (h.reserved === undefined) this.held.delete(key);
      throw e;
    }
  }

  /** A refresh may list the half-made folder; the intent still names the original loose file. */
  conversion(key: string): Conversion | undefined {
    return this.held.get(key)?.conversion;
  }

  /**
   * One held intent for folder, move and note. Both ids and first names stay until all three land. A retry reads
   * creates by their reserved ids before sending anything, and the caller's stamped, fenced move skips its landing.
   * Already confirmed steps are kept; the folder is still checked before moving into it or creating its note.
   */
  async convert(this: Intended<Holder>, key: string, w: Makes, reads: Gets, fresh: () => ConversionStart, move: (loose: DriveFile, folder: DriveFile) => Promise<DriveFile>): Promise<{ folder: DriveFile; loose: DriveFile; note: DriveFile }> {
    let conversion = this.conversion(key);
    if (!conversion) {
      const first = fresh();
      conversion = { loose: first.loose, text: first.text, props: first.props, folder: { sent: first.folder }, note: { name: first.noteName } };
      this.held.set(key, { conversion });
    }
    try {
      const { folder, note } = conversion;
      await reserveFor(w, [folder, note]);
      if (!folder.reserved || !folder.sent || !note.reserved) throw driveError('unknown');
      // Set the note's place from the same reservation, before the first folder send; never from a refreshed listing.
      note.sent ??= sentAs(folder.reserved, note.name, conversion.text);
      const folderAt = { ...folder.sent, props: conversion.props, id: folder.reserved };
      const there = await madeAt(reads, folderAt);
      if (!there && folder.landed) throw notAsSeenError('gone', CHANGED_ELSEWHERE);
      folder.landed = there ?? (await makeFolder(w, reads, folderAt));
      conversion.moved ??= await move(conversion.loose, folder.landed);
      const noteAt = { ...note.sent, id: note.reserved };
      note.landed ??= (await madeAt(reads, noteAt, [conversion.text])) ?? (await makeText(w, reads, noteAt, conversion.text));
      this.held.delete(key);
      return { folder: folder.landed, loose: conversion.moved, note: note.landed };
    } catch (e) {
      // The existing terminal-refusal rule ends the intent; an unknown outcome keeps every step together.
      if (releases(e, failureKind(e))) this.held.delete(key);
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
