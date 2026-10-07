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
 *
 * Drive v3 offers no compare-and-swap on files: these are prechecks with a short window, not a lock (ARCHITECTURE,
 * "Safety at the actual storage boundary").
 */
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

export function driveEffects(drive: RunnerDrive): Effects {
  /** An edit read back (TL-P2-20 rule 5): the same file, out of the Bin, with exactly the edit's text. */
  const readBack = async (e: EditText): Promise<EffectEvidence | null> => {
    const ev = await drive.evidence(e.before.fileId);
    if (!ev) return null;
    const bytes = ev.trashed ? new Uint8Array() : await drive.readBytes(e.before.fileId);
    const read = await readBackEdit(e, { fileId: ev.file.id, name: ev.file.name, parents: ev.file.parents, trashed: ev.trashed, bytes });
    if (read === 'applied' && ev.content?.size === e.content.size && ev.content.sha256 === e.content.sha256) return toEvidence(ev, 'utf8');
    console.error(`The edit of ${e.path} reads back as ${read === 'applied' ? 'unresolved' : read}`);
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
  const send = async (e: Effect, w: FencedDrive, parentId: string, modifiedTime: string | null): Promise<void> => {
    switch (e.kind) {
      case 'move': {
        const from = e.before.parents[0];
        await w.update(e.before.fileId, {
          ...(e.name !== e.before.name ? { name: e.name } : {}),
          ...(parentId !== from ? { addParent: parentId, ...(from ? { removeParent: from } : {}) } : {}),
          appProperties: { ...e.properties },
        });
        return;
      }
      case 'create-folder':
        await w.createFolder(parentId, e.name, { bowerItem: e.createKey });
        return;
      case 'bin':
        await w.trash(e.before.fileId);
        return;
      case 'write-runner-json':
      case 'edit-text':
        if (modifiedTime === null) throw new BowerError('unknown', UNRESOLVED);
        await w.writeText(e.before.fileId, e.text, modifiedTime);
        return;
      case 'create-text':
        // A generated note is stamped as Bower's, new, and with its create key at creation (TL-P2-17); a runner file
        // made again only with its create key. Either way a lost reply is found again by that key.
        await w.createText(parentId, e.name, e.text, e.purpose === 'generated' ? { by: 'bower', bowerNew: '1', bowerItem: e.createKey } : { bowerItem: e.createKey });
        return;
    }
  };

  /** Stub: landed on evidence, otherwise unreadable. */
  const readBackOp = async (op: OperationV2, head: Checkpoint): Promise<ReadBack> => {
    const seen = await observe(op, head);
    return seen ? { state: 'landed', evidence: seen } : { state: 'unreadable', why: 'no evidence' };
  };

  return {
    observe,
    readBack: readBackOp,
    async apply(op, head, w, manifest, sending) {
      const ok = await check(op, head, manifest);
      if ('refused' in ok) return ok.refused;
      // Possibly sent from here on: everything before it only read.
      await sending();
      try {
        await send(op.effect, w, ok.parentId, ok.modifiedTime);
      } catch (e) {
        // Refused by the fence's own read before anything was sent: an honest rejection.
        if (e instanceof BowerError && e.code === 'conflict' && (e.message === notAsSeen().message || op.effect.kind === 'write-runner-json' || op.effect.kind === 'edit-text')) {
          console.error(e);
          return refused('conflict', op.effect.kind === 'edit-text' ? NOTE_CHANGED : op.effect.kind === 'write-runner-json' ? LIST_CHANGED : NOT_AS_SEEN);
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
