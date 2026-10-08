/**
 * The real Drive effects (TL-P3-22 addendum): how each operation of a run reaches the person's folder, through the
 * runner's adapter (`drive.ts`). It follows the fake run service's boundary (`fake-run-service.ts`: precheck,
 * still as seen, dispatch, observe) on Drive v3:
 *
 * - Before a write, what the operation depends on is read again: its source by the name and place the plan saw
 *   (`stillAsSeen`), a pile folder's children (nothing new arrived), a runner file's or a note's stored bytes and
 *   modifiedTime, a made file's place (nothing there by that name). A refusal here is an honest rejection: nothing
 *   was sent.
 * - The write goes through the adapter's fenced writes, which read the target again right before it and send it
 *   only for this runner's attempt; a content write carries the modifiedTime it read.
 * - After it, stored evidence decides: the effect applied is read back from Drive (`shows`, `readBackEdit`). A write
 *   sent that shows no effect stops the run unresolved; it is never sent again blindly (TL-P2-16).
 * - A write whose answer never came (a network error, or a 5xx the adapter does not retry) is read back the same way
 *   by its stamp (`reconcile`, TL-P3-28): landed, it counts as applied; no stamp, it is not done and settles rejected
 *   with what stays as it was; unreadable, the run stops unresolved, for a redispatch to read back.
 *
 * - Every write carries the run's stamp in the same request (TL-P4-05 addendum): one `appProperties` key, `bowerOp`,
 *   naming `<run_id>:<operation id>` and overwritten by the next write, never one key per run. Only Bower's OAuth
 *   client sees it, and a person's edits in Drive keep it (https://developers.google.com/workspace/drive/api/guides/properties).
 *   An operation named by an open batch is read back by it first: stamped, it landed, and whatever the person changed
 *   since is kept; not stamped, it never landed, and it is sent only if its checks still pass (otherwise set aside, as
 *   an uninterrupted run would); unreadable, the run stops.
 *
 * Drive v3 offers no compare-and-swap on files: these are prechecks with a short window, not a lock (ARCHITECTURE,
 * "Safety at the actual storage boundary").
 */
import { sha256Hex, sha256Sync } from '../../src/data/contracts/hashes';
import { BowerError } from '../../src/data/types';
import type { Checkpoint, EffectEvidence, Failure } from '../../src/data/contracts/run-checkpoint';
import { readBackEdit, recheckEdit, savedLinkKey } from '../../src/data/contracts/note-edit';
import type { EditText, OperationV2, SeenFile } from '../../src/data/contracts/run-manifest';
import type { DriveFile, FencedDrive, StoredEvidence } from '../../src/data/drive/drive-api';
import { isNoAnswer } from '../../src/data/drive/transport';
import { SOURCE_NOT_AS_SEEN, reusedNoteOf, shows } from '../../src/data/fake/fake-run-records';
import { savedTwins } from '../../src/data/spine/duplicates';
import type { RunManifest } from '../../src/data/spine/records';
import type { RunnerDrive } from './drive';
import { notAsSeen, notAsSeenReason } from '../../src/data/contracts/still-as-seen';
import type { Effects, ReadBack, Settled } from './spine/run';

/** The fake run service's sentences for a refused operation, the same here. */
const NOT_AS_SEEN = SOURCE_NOT_AS_SEEN;
const NO_FOLDER = 'The folder for it could not be made.';
const NOTE_NOT_AS_SEEN = 'The note it goes beside is not where Bower left it.';
const NOTE_CHANGED = 'The note changed before Bower could add to it.';
const NOTE_THERE = 'A note with that name was already there, so Bower did not write it.';
const NAME_TAKEN = 'Something else has that name there, so Bower left it as it was.';
const ARRIVED = 'Something new arrived in it, so it stays in your inbox.';
/** A thing already saved whose copy left, or which changed, since the plan: it stays, and the next tidy-up looks again. */
const NOT_SAVED = 'It changed, or the copy Bower found was moved, so it stays in your inbox for now.';
const LIST_CHANGED = "Bower's list of your files changed meanwhile.";
const UNRESOLVED = 'Bower could not check one of the things it moved. It will look again later.';
const NOT_REACHED = "Bower couldn't reach Google Drive, so it stayed as it was.";

/** The run's stamp on every effect it sends (TL-P4-05 addendum). */
export const STAMP = 'bowerOp';

/**
 * The stamp of one operation of one run: the first 32 hex characters of SHA-256(`<run_id>:<operation id>`), 128 bits
 * (TL-P4-05 addendum 2). Written out, a run id (87 characters) and an operation id (64) are more than the 124 bytes Drive keeps for one property's
 * key and value (https://developers.google.com/workspace/drive/api/guides/properties).
 */
export const stampOf = (runId: string, operationId: string): string => sha256Sync(`${runId}:${operationId}`).slice(0, 32);

type Effect = OperationV2['effect'];

const refused = (code: Failure['code'], message: string): Settled => ({ state: 'rejected', failure: { code, message } });

/** Still by the name and place the plan saw (`notAsSeen`, the one check; the caller has it out of the Bin). */
const inPlace = (f: DriveFile, seen: SeenFile): boolean => notAsSeen({ id: seen.fileId, name: seen.name, parents: seen.parents }, { ...f, trashed: false }) === null;

/** Stored evidence in the record shape: read through this runner's adapter. */
function toEvidence(ev: StoredEvidence, encoding: 'utf8' | 'blob' = 'blob'): EffectEvidence {
  const f = ev.file;
  return {
    file: { fileId: f.id, name: f.name, parents: [...f.parents], folder: f.folder, modifiedTime: f.modifiedTime },
    trashed: ev.trashed,
    content: ev.content ? { encoding, size: ev.content.size, sha256: ev.content.sha256, provenance: 'adapter-read', observedModifiedTime: f.modifiedTime } : null,
    provenance: 'adapter-read',
  };
}

/** The id of an operation's parent: a captured folder, or the folder an applied earlier operation made. */
function parentOf(head: Checkpoint, e: Effect): string | null {
  if (e.kind === 'bin' || e.kind === 'write-runner-json' || e.kind === 'edit-text') return null;
  if ('fileId' in e.parent) return e.parent.fileId;
  const by = e.parent.createdBy;
  const made = head.outcomes.find((o) => o.operationId === by);
  return made?.state === 'applied' ? made.evidence.file.fileId : null;
}

/**
 * A file as it is now, for a check; null when it is gone or in the Bin. A read made moments ago for this run, or the
 * answer of its own write, stands for a new read (`RunnerDrive.recheck`), and the fence then does not read it again.
 */
const now = (drive: RunnerDrive, id: string, parent = false): Promise<DriveFile | null> => drive.recheck(id, parent);

/** Whether `from` waits on `to`, through `dependsOn`. */
function waitsOn(manifest: RunManifest, from: string, to: string): boolean {
  const byId = new Map(manifest.operations.map((o) => [o.operationId, o]));
  const seen = new Set<string>();
  const next = [...(byId.get(from)?.dependsOn ?? [])];
  for (let id = next.pop(); id !== undefined; id = next.pop()) {
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(...(byId.get(id)?.dependsOn ?? []));
  }
  return false;
}

/**
 * What a stamp found on a thing says of `op`. `landed`: it is `op`'s own, or that of an operation of the same run
 * waiting on `op`, which is only ever sent once `op` applied (the note an edit changes and then moves carries the
 * move's stamp). `not-landed`: none, another run's, or that of an operation `op` waits on (sent before it).
 * `unknown`: another operation of this run, unrelated to it.
 */
function stampSays(found: string | undefined, runId: string, op: OperationV2, manifest: RunManifest): 'landed' | 'not-landed' | 'unknown' {
  const id = found === undefined ? undefined : manifest.operations.find((o) => stampOf(runId, o.operationId) === found)?.operationId;
  if (id === undefined) return 'not-landed';
  if (id === op.operationId || waitsOn(manifest, id, op.operationId)) return 'landed';
  return waitsOn(manifest, op.operationId, id) ? 'not-landed' : 'unknown';
}

export function driveEffects(drive: RunnerDrive): Effects {
  /** An edit read back (TL-P2-20 rule 5): the same file, out of the Bin, with exactly the edit's text. */
  const readBack = async (e: EditText): Promise<EffectEvidence | null> => {
    const ev = await drive.evidence(e.before.fileId);
    if (!ev) return null;
    const bytes = ev.trashed ? new Uint8Array() : await drive.readBytes(e.before.fileId);
    const read = await readBackEdit(e, { fileId: ev.file.id, name: ev.file.name, parents: ev.file.parents, trashed: ev.trashed, bytes });
    if (read === 'applied' && ev.content?.size === e.content.size && ev.content.sha256 === e.content.sha256) return toEvidence(ev, 'utf8');
    console.error(`The edit of file ${e.before.fileId} reads back as ${read === 'applied' ? 'unresolved' : read}`);
    return null;
  };

  /** Stored evidence that this very effect applied, or null. A lookalike without the create key never counts. */
  const observe = async (op: OperationV2, head: Checkpoint): Promise<EffectEvidence | null> => {
    const e = op.effect;
    const parentId = parentOf(head, e);
    if (e.kind === 'create-folder' || e.kind === 'create-text') {
      if (!parentId) return null;
      const folder = e.kind === 'create-folder';
      const made = (await drive.list(parentId)).filter((f) => f.folder === folder && f.name === e.name && f.appProperties?.bowerItem === e.createKey);
      const [only, ...more] = made;
      if (!only || more.length) return null;
      const ev = await drive.evidence(only.id);
      return ev && shows(e, ev, parentId) ? toEvidence(ev, folder ? 'blob' : 'utf8') : null;
    }
    if (e.kind === 'edit-text') return readBack(e);
    const ev = await drive.evidence(e.before.fileId);
    if (!ev || !shows(e, ev, parentId)) return null;
    return toEvidence(ev, e.kind === 'write-runner-json' ? 'utf8' : 'blob');
  };

  /**
   * Whether the operation may be sent: its parent there, its source as the plan saw it, and for a content write the
   * stored bytes it was planned on. Gives the modifiedTime a content write must carry, or why it is refused.
   */
  const check = async (op: OperationV2, head: Checkpoint, manifest: RunManifest): Promise<{ refused: Settled } | { parentId: string; modifiedTime: string | null }> => {
    const e = op.effect;
    const parentId = parentOf(head, e) ?? '';
    if (e.kind === 'create-folder' || e.kind === 'create-text' || e.kind === 'move') {
      const parent = parentId ? await now(drive, parentId, true) : null;
      if (!parent?.folder) return { refused: refused('not-found', NO_FOLDER) };
      if (e.kind === 'create-folder') return { parentId, modifiedTime: null };
      if (e.kind === 'create-text') {
        // Any file or folder already at a made file's path is a lookalike, never overwritten (TL-P2-17).
        const taken = (await drive.list(parentId)).some((f) => f.name.toLowerCase() === e.name.toLowerCase());
        return taken ? { refused: refused('conflict', e.purpose === 'generated' ? NOTE_THERE : NAME_TAKEN) } : { parentId, modifiedTime: null };
      }
      // The note a saved link goes beside (TL-P2-20 R4-2): still where it was captured, and still that link's note.
      const reused = reusedNoteOf(manifest, op);
      if (reused) {
        const note = await now(drive, reused.file.fileId);
        if (!note || !inPlace(note, reused.file) || note.appProperties?.bowerItem !== (await savedLinkKey(e.before.fileId))) return { refused: refused('conflict', NOTE_NOT_AS_SEEN) };
      }
    }
    if (e.kind === 'edit-text') {
      // The bytes read must be the planned ones (size and hash), and recompute to the planned text.
      let bytes: Uint8Array;
      try {
        bytes = await drive.readBytes(e.before.fileId);
      } catch (err) {
        if (err instanceof BowerError && err.code === 'not-found') return { refused: refused('conflict', NOT_AS_SEEN) };
        throw err;
      }
      if ((await sha256Hex(bytes)) !== e.beforeContent.sha256) return { refused: refused('conflict', NOTE_CHANGED) };
      if ((await recheckEdit(e, bytes)) !== 'ok') return { refused: refused('conflict', NOTE_CHANGED) };
      // The write carries the modifiedTime the plan saw, and the fence reads the file right before the send and refuses
      // it if its name, place or modifiedTime differ: that read is the check, with no earlier one to go stale.
      drive.expectSeen(e.before, true);
      return { parentId, modifiedTime: e.before.modifiedTime };
    }
    if (e.kind === 'write-runner-json') {
      const ev = await drive.evidence(e.before.fileId);
      if (!ev || ev.trashed || ev.content?.sha256 !== e.beforeContent.sha256) return { refused: refused('conflict', LIST_CHANGED) };
      return inPlace(ev.file, e.before) ? { parentId, modifiedTime: ev.file.modifiedTime } : { refused: refused('conflict', LIST_CHANGED) };
    }
    // A thing already saved (review P4-17 I1, I2): decided by its content, so its Bin is sent only while it is still the
    // bytes the plan read, and the copy it stands on is still there, in its place, with those same bytes. The fence then
    // reads it again right before the send, with its modifiedTime too.
    const member = e.kind === 'bin' ? manifest.capture.members.find((m) => m.file.fileId === e.before.fileId) : undefined;
    if (e.kind === 'bin' && member) {
      const same = (ev: StoredEvidence | null, seen: SeenFile): boolean => !!ev && !ev.trashed && inPlace(ev.file, seen) && ev.content?.sha256 === member.content.sha256;
      const twins = savedTwins(manifest, op, head);
      const copyStands = same(await drive.evidence(e.before.fileId), e.before);
      let twinStands = false;
      for (const twin of twins) if (copyStands && !twinStands) twinStands = same(await drive.evidence(twin.fileId), twin);
      if (!copyStands || !twinStands) return { refused: refused('conflict', NOT_SAVED) };
      drive.expectSeen(e.before, true);
      return (await drive.list(e.before.fileId)).length ? { refused: refused('conflict', ARRIVED) } : { parentId, modifiedTime: null };
    }
    // The other note of two kept as one (C05): a note captured as a place, binned only while it is still as the plan
    // read it, its modifiedTime too, so a line the person added since is never binned unread (P4-19 I1).
    if (e.kind === 'bin' && !e.before.folder && manifest.capture.places.some((p) => p.file.fileId === e.before.fileId)) {
      drive.expectSeen(e.before, true);
      return (await drive.list(e.before.fileId)).length ? { refused: refused('conflict', ARRIVED) } : { parentId, modifiedTime: null };
    }
    // A move or a Bin: the source by the name and place the plan saw. The fence reads it right before the send and
    // refuses it if either differs (`expectSeen`): that one read is the check, with no earlier one to go stale.
    drive.expectSeen(e.before);
    if (e.kind === 'bin' && (await drive.list(e.before.fileId)).some((f) => !e.capturedChildIds.includes(f.id))) return { refused: refused('conflict', ARRIVED) };
    return { parentId, modifiedTime: null };
  };

  /** Sends the effect once through the fenced writes. */
  const send = async (e: Effect, w: FencedDrive, parentId: string, modifiedTime: string | null, stamp: string): Promise<DriveFile | null> => {
    const op = { [STAMP]: stamp };
    switch (e.kind) {
      case 'move': {
        const from = e.before.parents[0];
        return w.update(e.before.fileId, {
          ...(e.name !== e.before.name ? { name: e.name } : {}),
          ...(parentId !== from ? { addParent: parentId, ...(from ? { removeParent: from } : {}) } : {}),
          appProperties: { ...e.properties, ...op },
        });
      }
      case 'create-folder':
        return w.createFolder(parentId, e.name, { bowerItem: e.createKey, ...op });
      case 'bin':
        await w.trash(e.before.fileId, op);
        return null;
      case 'write-runner-json':
      case 'edit-text':
        if (modifiedTime === null) throw new BowerError('unknown', UNRESOLVED);
        return w.writeText(e.before.fileId, e.text, modifiedTime, op);
      case 'create-text':
        // A generated note is stamped as Bower's, new, and with its create key at creation (TL-P2-17); a runner file made again only with its create key. Either way a lost reply is found
        // again by that key.
        return w.createText(parentId, e.name, e.text, e.purpose === 'generated' ? { by: 'bower', bowerNew: '1', bowerItem: e.createKey, ...op } : { bowerItem: e.createKey, ...op });
    }
  };

  /**
   * The effect read from the answer of its own write, which Drive gave with the stored checksums: the file as stored
   * (name, place, properties) and, for text, the very bytes sent. Null when the answer cannot show it; the caller then
   * reads it from Drive as before (`observe`).
   */
  const shownByAnswer = async (op: OperationV2, parentId: string, answer: DriveFile | null): Promise<EffectEvidence | null> => {
    const e = op.effect;
    if (e.kind === 'bin') {
      const ev = drive.fromAnswer(e.before.fileId);
      return ev && shows(e, ev, null) ? toEvidence(ev, 'blob') : null;
    }
    if (!answer) return null;
    if (e.kind === 'create-folder' || e.kind === 'move') {
      const ev = drive.fromAnswer(answer.id);
      return ev && shows(e, ev, parentId) ? toEvidence(ev, 'blob') : null;
    }
    const bytes = new TextEncoder().encode(e.text);
    if (!(await drive.confirmsBytes(answer.id, bytes))) return null;
    const stored = drive.answeredFile(answer.id);
    if (!stored) return null;
    const ev: StoredEvidence = { file: stored, trashed: false, content: { size: bytes.byteLength, sha256: await sha256Hex(bytes) } };
    if (e.kind === 'edit-text') {
      const read = await readBackEdit(e, { fileId: stored.id, name: stored.name, parents: stored.parents, trashed: false, bytes });
      return read === 'applied' && ev.content?.size === e.content.size && ev.content.sha256 === e.content.sha256 ? toEvidence(ev, 'utf8') : null;
    }
    return shows(e, ev, e.kind === 'create-text' ? parentId : null) ? toEvidence(ev, 'utf8') : null;
  };

  /**
   * An operation possibly sent, read back by the run's stamp first (TL-P4-05 addendum, strengthening TL-P3-23):
   * - the stamp is there: it landed. What the person changed since (a rename, a move back, the Bin) is kept, and the
   *   evidence is what Drive stores now;
   * - no stamp: it never landed. The caller sends it only if its checks still pass, so a thing the person changed
   *   meanwhile is set aside with the same words an uninterrupted run would use;
   * - a thing it changes is gone from Drive: not landed, so it is set aside, as an uninterrupted run would;
   * - a read fails, or a made thing has a lookalike with its create key and no stamp (made before
   *   stamps, or by something else): unreadable, since making it again could make it twice.
   */
  const reconcile = async (op: OperationV2, head: Checkpoint, manifest: RunManifest): Promise<ReadBack> => {
    const e = op.effect;
    const encoding = e.kind === 'create-folder' || e.kind === 'move' || e.kind === 'bin' ? 'blob' : 'utf8';
    const landed = async (id: string): Promise<ReadBack> => {
      const ev = await drive.evidence(id);
      return ev ? { state: 'landed', evidence: toEvidence(ev, encoding) } : { state: 'unreadable', why: `Operation ${op.ordinal} shows a thing that is gone` };
    };
    const other = (): ReadBack => ({ state: 'unreadable', why: `Operation ${op.ordinal} shows another operation's stamp` });
    try {
      if (e.kind === 'create-folder' || e.kind === 'create-text') {
        // Its own stamp, wherever the person put it since and in the Bin or not: what they did with it is kept.
        const mine = await drive.stamped(STAMP, stampOf(head.runId, op.operationId));
        const [only, ...more] = mine;
        if (more.length) return { state: 'unreadable', why: `Operation ${op.ordinal} shows its stamp more than once` };
        if (only) return landed(only.file.id);
        const parentId = parentOf(head, e);
        if (!parentId) return { state: 'unreadable', why: `Operation ${op.ordinal} has no folder to look in` };
        // A thing with its create key and no stamp of its own: made by an operation waiting on it, or it cannot be told.
        const alike = (await drive.list(parentId)).filter((f) => f.appProperties?.bowerItem === e.createKey);
        const [one, ...others] = alike;
        if (!one) return { state: 'not-landed' };
        return !others.length && stampSays(one.appProperties?.[STAMP], head.runId, op, manifest) === 'landed' ? landed(one.id) : other();
      }
      // Gone from Drive (the person emptied the Bin): no stamp to read, and nothing left to send to. Not landed, so its
      // checks refuse it and it is set aside with the words an uninterrupted run would use.
      const ev = await drive.evidence(e.before.fileId);
      if (!ev) return { state: 'not-landed' };
      const says = stampSays(ev.file.appProperties?.[STAMP], head.runId, op, manifest);
      if (says === 'landed') return { state: 'landed', evidence: toEvidence(ev, encoding) };
      return says === 'unknown' ? other() : { state: 'not-landed' };
    } catch (err) {
      console.error(err);
      return { state: 'unreadable', why: `Operation ${op.ordinal} could not be read back` };
    }
  };

  return {
    observe,
    readBack: reconcile,
    async apply(op, head, w, manifest, sending) {
      const stamp = stampOf(head.runId, op.operationId);
      const ok = await check(op, head, manifest);
      if ('refused' in ok) return ok.refused;
      // Possibly sent from here on: everything before it only read.
      await sending();
      let answer: DriveFile | null;
      try {
        answer = await send(op.effect, w, ok.parentId, ok.modifiedTime, stamp);
      } catch (e) {
        // Refused by the fence's own read before anything was sent: an honest rejection.
        if (e instanceof BowerError && e.code === 'conflict' && (notAsSeenReason(e) !== null || op.effect.kind === 'write-runner-json' || op.effect.kind === 'edit-text')) {
          console.error(e);
          return refused('conflict', op.effect.kind === 'edit-text' ? NOTE_CHANGED : op.effect.kind === 'write-runner-json' ? LIST_CHANGED : NOT_AS_SEEN);
        }
        // No answer kept (a network error, or Google's 5xx): read back once, never sent again blindly (TL-P3-28).
        if (isNoAnswer(e)) {
          console.error(e);
          const back = await reconcile(op, head, manifest);
          if (back.state === 'landed') return { state: 'applied', evidence: back.evidence };
          if (back.state === 'not-landed') return refused('offline', NOT_REACHED);
          console.error(back.why);
        }
        throw e;
      }
      // The answer to the write shows the effect; read from Drive only when it cannot (no checksum, or another one).
      const seen = (await shownByAnswer(op, ok.parentId, answer)) ?? (await observe(op, head));
      if (!seen) {
        console.error(`Operation ${op.ordinal} was sent and shows no effect`);
        throw new BowerError('unknown', UNRESOLVED);
      }
      return { state: 'applied', evidence: seen };
    },
  };
}
