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
import { createHash } from 'node:crypto';
import { BowerError } from '../../src/data/types';
import type { Checkpoint, EffectEvidence, Failure } from '../../src/data/contracts/run-checkpoint';
import { readBackEdit, recheckEdit, savedLinkKey } from '../../src/data/contracts/note-edit';
import type { EditText, OperationV2, SeenFile } from '../../src/data/contracts/run-manifest';
import type { DriveFile } from '../../src/data/drive/drive-api';
import type { FencedDrive, StoredEvidence } from '../../src/data/drive/fake-drive';
import { SOURCE_NOT_AS_SEEN, reusedNoteOf, shows } from '../../src/data/fake/fake-run-records';
import type { RunManifest } from '../../src/data/spine/records';
import type { RunnerDrive } from './drive';
import { notAsSeen } from './still-as-seen';
import type { Effects, ReadBack, Settled } from './spine/run';

/** The fake run service's sentences for a refused operation, the same here. */
const NOT_AS_SEEN = SOURCE_NOT_AS_SEEN;
const NO_FOLDER = 'The folder for it could not be made.';
const NOTE_NOT_AS_SEEN = 'The note it goes beside is not where Bower left it.';
const NOTE_CHANGED = 'The note changed before Bower could add to it.';
const NOTE_THERE = 'A note with that name was already there, so Bower did not write it.';
const NAME_TAKEN = 'Something else has that name there, so Bower left it as it was.';
const ARRIVED = 'Something new arrived in it, so it stays in your inbox.';
const LIST_CHANGED = "Bower's list of your files changed meanwhile.";
const UNRESOLVED = 'Bower could not check one of the things it moved. It will look again later.';
const NOT_REACHED = "Bower couldn't reach Google Drive, so it stayed as it was.";

/** The run's stamp on every effect it sends (TL-P4-05 addendum). */
export const STAMP = 'bowerOp';

/**
 * The stamp of one operation of one run: `<run_id>:<operation id>`, by its SHA-256 (base64url, 192 bits). Written
 * out, a run id (87 characters) and an operation id (64) are more than the 124 bytes Drive keeps for one property's
 * key and value (https://developers.google.com/workspace/drive/api/guides/properties).
 */
export const stampOf = (runId: string, operationId: string): string => createHash('sha256').update(`${runId}:${operationId}`).digest('base64url').slice(0, 32);

type Effect = OperationV2['effect'];

const refused = (code: Failure['code'], message: string): Settled => ({ state: 'rejected', failure: { code, message } });

const samePlace = (f: DriveFile, seen: SeenFile): boolean => f.name === seen.name && f.parents.length === seen.parents.length && f.parents.every((p, i) => p === seen.parents[i]);

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

/** A file read again now; null when it is gone or in the Bin. */
async function now(drive: RunnerDrive, id: string): Promise<DriveFile | null> {
  try {
    return await drive.get(id);
  } catch (e) {
    if (e instanceof BowerError && e.code === 'not-found') return null;
    throw e;
  }
}

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
      const parent = parentId ? await now(drive, parentId) : null;
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
        if (!note || !samePlace(note, reused.file) || note.appProperties?.bowerItem !== (await savedLinkKey(e.before.fileId))) return { refused: refused('conflict', NOTE_NOT_AS_SEEN) };
      }
    }
    if (e.kind === 'edit-text') {
      const ev = await drive.evidence(e.before.fileId);
      if (!ev || ev.trashed || !samePlace(ev.file, e.before)) return { refused: refused('conflict', NOT_AS_SEEN) };
      if (ev.content?.size !== e.beforeContent.size || ev.content.sha256 !== e.beforeContent.sha256) return { refused: refused('conflict', NOTE_CHANGED) };
      if ((await recheckEdit(e, await drive.readBytes(e.before.fileId))) !== 'ok') return { refused: refused('conflict', NOTE_CHANGED) };
      // The fence then checks this very modifiedTime again right before the write.
      return (await now(drive, e.before.fileId))?.modifiedTime === ev.file.modifiedTime ? { parentId, modifiedTime: ev.file.modifiedTime } : { refused: refused('conflict', NOTE_CHANGED) };
    }
    if (e.kind === 'write-runner-json') {
      const ev = await drive.evidence(e.before.fileId);
      if (!ev || ev.trashed || ev.content?.sha256 !== e.beforeContent.sha256) return { refused: refused('conflict', LIST_CHANGED) };
      const file = await now(drive, e.before.fileId);
      return file && samePlace(file, e.before) && file.modifiedTime === ev.file.modifiedTime ? { parentId, modifiedTime: file.modifiedTime } : { refused: refused('conflict', LIST_CHANGED) };
    }
    // A move or a Bin: the source by the name and place the plan saw.
    const source = await now(drive, e.before.fileId);
    if (!source || !samePlace(source, e.before)) return { refused: refused('conflict', NOT_AS_SEEN) };
    if (e.kind === 'bin' && (await drive.list(e.before.fileId)).some((f) => !e.capturedChildIds.includes(f.id))) return { refused: refused('conflict', ARRIVED) };
    return { parentId, modifiedTime: null };
  };

  /** Sends the effect once through the fenced writes. */
  const send = async (e: Effect, w: FencedDrive, parentId: string, modifiedTime: string | null, stamp: string): Promise<void> => {
    const op = { [STAMP]: stamp };
    switch (e.kind) {
      case 'move': {
        const from = e.before.parents[0];
        await w.update(e.before.fileId, {
          ...(e.name !== e.before.name ? { name: e.name } : {}),
          ...(parentId !== from ? { addParent: parentId, ...(from ? { removeParent: from } : {}) } : {}),
          appProperties: { ...e.properties, ...op },
        });
        return;
      }
      case 'create-folder':
        await w.createFolder(parentId, e.name, { bowerItem: e.createKey, ...op });
        return;
      case 'bin':
        await w.trash(e.before.fileId, op);
        return;
      case 'write-runner-json':
      case 'edit-text':
        if (modifiedTime === null) throw new BowerError('unknown', UNRESOLVED);
        await w.writeText(e.before.fileId, e.text, modifiedTime, op);
        return;
      case 'create-text':
        // A generated note is stamped as Bower's, new, and with its create key at creation (TL-P2-17); a runner file
        // made again only with its create key. Either way a lost reply is found again by that key.
        await w.createText(parentId, e.name, e.text, e.purpose === 'generated' ? { by: 'bower', bowerNew: '1', bowerItem: e.createKey, ...op } : { bowerItem: e.createKey, ...op });
        return;
    }
  };

  /**
   * An operation possibly sent, read back by the run's stamp first (TL-P4-05 addendum, strengthening TL-P3-23):
   * - the stamp is there: it landed. What the person changed since (a rename, a move back, the Bin) is kept, and the
   *   evidence is what Drive stores now;
   * - no stamp: it never landed. The caller sends it only if its checks still pass, so a thing the person changed
   *   meanwhile is set aside with the same words an uninterrupted run would use;
   * - a read fails, the thing is gone, or a made thing has a lookalike with its create key and no stamp (made before
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
        const parentId = parentOf(head, e);
        if (!parentId) return { state: 'unreadable', why: `Operation ${op.ordinal} has no folder to look in` };
        // Its own stamp, in the Bin or not: whatever the person did with it since is kept.
        const mine = await drive.stamped(parentId, STAMP, stampOf(head.runId, op.operationId));
        const [only, ...more] = mine;
        if (more.length) return { state: 'unreadable', why: `Operation ${op.ordinal} shows its stamp more than once` };
        if (only) return landed(only.file.id);
        // A thing with its create key and no stamp of its own: made by an operation waiting on it, or it cannot be told.
        const alike = (await drive.list(parentId)).filter((f) => f.appProperties?.bowerItem === e.createKey);
        const [one, ...others] = alike;
        if (!one) return { state: 'not-landed' };
        return !others.length && stampSays(one.appProperties?.[STAMP], head.runId, op, manifest) === 'landed' ? landed(one.id) : other();
      }
      const ev = await drive.evidence(e.before.fileId);
      if (!ev) return { state: 'unreadable', why: `Operation ${op.ordinal} changes a thing that is gone` };
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
      try {
        await send(op.effect, w, ok.parentId, ok.modifiedTime, stamp);
      } catch (e) {
        // Refused by the fence's own read before anything was sent: an honest rejection.
        if (e instanceof BowerError && e.code === 'conflict' && (e.message === notAsSeen().message || op.effect.kind === 'write-runner-json' || op.effect.kind === 'edit-text')) {
          console.error(e);
          return refused('conflict', op.effect.kind === 'edit-text' ? NOTE_CHANGED : op.effect.kind === 'write-runner-json' ? LIST_CHANGED : NOT_AS_SEEN);
        }
        // No answer kept (a network error, or Google's 5xx): read back once, never sent again blindly (TL-P3-28).
        if (e instanceof BowerError && e.code === 'offline') {
          console.error(e);
          const back = await reconcile(op, head, manifest);
          if (back.state === 'landed') return { state: 'applied', evidence: back.evidence };
          if (back.state === 'not-landed') return refused('offline', NOT_REACHED);
          console.error(back.why);
        }
        throw e;
      }
      const seen = await observe(op, head);
      if (!seen) {
        console.error(`Operation ${op.ordinal} was sent and shows no effect`);
        throw new BowerError('unknown', UNRESOLVED);
      }
      return { state: 'applied', evidence: seen };
    },
  };
}
