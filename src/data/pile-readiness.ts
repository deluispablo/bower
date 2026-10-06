/**
 * Whether a declared pile has arrived, worked out from what is in Drive: its
 * immutable declaration in `.bower/piles` and the files that carry its
 * member keys (`bowerItem`). No I/O of its own: callers hand in the listing,
 * a byte reader and a digest. A declaration never says "ready"; only
 * verified effects do.
 */
import type { DriveFile } from './drive/drive-api';
import { parsePileDeclaration, type Declaration, type DeclarationResult, type Member } from './contracts/pile-declaration';
import { parsePileDisposition, type DispositionResult } from './contracts/pile-disposition';
import { canonicalRecordJson, hashRecordJson } from './contracts/record-json';
import { PILE_NOTE, safeInboxName } from './piles';
import { isJournalRecord } from './vault/journal';
import { PROP, SYSTEM } from './vault/layout';
import { BowerError, type SetAside } from './types';

export type ReadBytes = (id: string) => Promise<Uint8Array>;

/** A file's size and SHA-256 as the caller could establish them; null when they could not be checked. */
export type Digest = { size: number; sha256: string };
export type DigestOf = (file: DriveFile) => Promise<Digest | null>;

/** Bin entries with any of these member keys, with their stored size and hash: one call per evaluation. */
export type BinnedOf = (keys: readonly string[]) => Promise<ReadonlyArray<{ file: DriveFile; size: number | null; sha256: string | null }>>;

/** A Drive that can say what it stored without handing back the bytes (the pretend Drive). */
export interface StoredDigests {
  storedDigest(id: string): Promise<Digest | null>;
}

export function hasStoredDigests(drive: object): drive is StoredDigests {
  return typeof (drive as { storedDigest?: unknown }).storedDigest === 'function';
}

export type DeclarationLookup =
  | { state: 'found'; declaration: Declaration; sha256: string }
  /** The folder carries no declaration mark: an ordinary pile. */
  | { state: 'unmarked' }
  /** Marked, but no copy of its declaration is there. */
  | { state: 'missing' }
  /** Copies that differ, or a declaration about another pile or folder. */
  | { state: 'conflict' }
  /**
   * A copy that could not be read, or whose bytes are not the declaration its name says (TL-P2-08 (a)).
   * Only its own pile waits, and it is never taken for an undeclared one; `error` is for the console.
   */
  | { state: 'unreadable'; error: BowerError };

export type MemberState =
  | { memberKey: string; state: 'missing' }
  /** In the pile's folder with the declared bytes. */
  | { memberKey: string; state: 'verified'; file: DriveFile }
  /** Arrived and has left the pile: outside its folder, not in the Bin, with the declared bytes. A readiness fact, not a disposition. */
  | { memberKey: string; state: 'left'; file: DriveFile }
  /** More than one file with its key, or one whose size or hash differs from the declaration. */
  | { memberKey: string; state: 'changed'; fileIds: string[] }
  /** Its file is there, but its bytes could not be checked. */
  | { memberKey: string; state: 'unchecked'; file: DriveFile };

/** Why a declared pile waits; null when its members are ready. */
export type Blocked = 'changed' | 'not-arrived' | 'not-checked' | null;

export interface Readiness {
  blocked: Blocked;
  members: MemberState[];
  /** The declared context file, whatever its text now; null when absent or ambiguous. */
  context: DriveFile | null;
}

const HASH = /^[0-9a-f]{64}$/;
/** `.bower` and `piles`, as Drive names them. */
const BOWER_DIR = SYSTEM.dir;
const PILES_NAME = SYSTEM.piles.slice(SYSTEM.dir.length + 1);

/** The file name of a declaration: its logical id and the hash of its canonical body. */
export function declarationName(declarationId: string, hash: string): string {
  return `declaration-${declarationId}-${hash}.json`;
}

/** Canonical bytes, their hash and the file name, refused when the record breaks the contract. */
export async function declarationRecord(value: Declaration, rootId: string): Promise<{ name: string; text: string } | null> {
  const bytes = canonicalRecordJson(value);
  const hash = await hashRecordJson(value);
  if (!bytes.ok || !hash.ok) return null;
  const parsed = await parsePileDeclaration(bytes.value, rootId);
  if (!parsed.ok || parsed.sha256 !== hash.value) return null;
  return { name: declarationName(value.declarationId, hash.value), text: new TextDecoder().decode(bytes.value) };
}

/** The name a member is declared under: as added when the contract allows it, else its inbox name. */
export function declaredName(item: { name: string; kind: Member['kind'] }): string {
  // A link keeps its slashes, escaped so the name holds no path separator: `/` → %2F, `\` → %5C, `%` → %25.
  const name = item.kind === 'link' ? item.name.replace(/[%/\\]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`) : item.name;
  const control = [...name].some((c) => c.charCodeAt(0) <= 0x1f || c.charCodeAt(0) === 0x7f);
  const plain = name.length > 0 && name !== '.' && name !== '..' && !control && !/[/\\]/.test(name);
  return plain ? name : safeInboxName(item);
}

/** A member's name as the person added it, as the declaration keeps it. */
export function shownName(member: Pick<Member, 'name' | 'kind'>): string {
  return member.kind === 'link' ? member.name.replace(/%(2F|5C|25)/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))) : member.name;
}

/**
 * The declaration a pile folder names, found by real parents (`.bower` →
 * `piles`, duplicates included), never by a disambiguated path. Identical
 * copies are one; anything else refuses. Parsed copies are kept in `cache`
 * by file id and modified time, since a declaration never changes. A copy
 * that cannot be read, or is damaged, makes only this pile `unreadable` (a
 * bulkhead: the rest of the inbox is still listed); a failed read is not kept,
 * so the next look reads it again. Signed out is not a pile's problem: it is
 * thrown.
 */
export async function findDeclaration(files: readonly DriveFile[], rootId: string, folder: DriveFile, read: ReadBytes, cache?: Map<string, DeclarationResult>): Promise<DeclarationLookup> {
  const declarationId = folder.appProperties?.[PROP.declaration];
  if (!declarationId) return { state: 'unmarked' };
  const bower = new Set(files.filter((f) => f.folder && f.name === BOWER_DIR && f.parents.includes(rootId)).map((f) => f.id));
  const piles = new Set(files.filter((f) => f.folder && f.name === PILES_NAME && f.parents.some((p) => bower.has(p))).map((f) => f.id));
  const prefix = `declaration-${declarationId}-`;
  const copies = files.filter((f) => !f.folder && f.parents.some((p) => piles.has(p)) && f.name.startsWith(prefix) && f.name.endsWith('.json'));
  if (!copies.length) return { state: 'missing' };
  const found = new Map<string, Declaration>();
  for (const copy of copies) {
    const hash = copy.name.slice(prefix.length, -'.json'.length);
    const key = `${copy.id}@${copy.modifiedTime}`;
    let parsed = cache?.get(key);
    if (!parsed) {
      let bytes: Uint8Array;
      try {
        bytes = await read(copy.id);
      } catch (e) {
        if (e instanceof BowerError && e.code === 'auth') throw e;
        return { state: 'unreadable', error: e instanceof BowerError ? e : new BowerError('unknown', `A pile declaration could not be read (${String(e)}).`) };
      }
      parsed = await parsePileDeclaration(bytes, rootId);
      cache?.set(key, parsed);
    }
    // Bytes that are not a declaration, or not the one the name hashes: a damaged copy.
    if (!parsed.ok || !HASH.test(hash) || parsed.sha256 !== hash) return { state: 'unreadable', error: new BowerError('unknown', `A pile declaration copy was refused (${parsed.ok ? 'name' : parsed.reason}).`) };
    if (parsed.value.declarationId !== declarationId) {
      console.error('A pile declaration copy was refused (id).');
      return { state: 'conflict' };
    }
    found.set(parsed.sha256, parsed.value);
  }
  const [only, ...more] = [...found.entries()];
  if (!only || more.length) return { state: 'conflict' };
  const [hash, declaration] = only;
  const anchor = declaration.anchor;
  // The declaration must be about this folder: same pile, same inbox.
  if (anchor.kind !== 'folder' || declaration.pileId !== folder.appProperties?.[PROP.pile] || !folder.parents.includes(anchor.inboxId)) return { state: 'conflict' };
  return { state: 'found', declaration, sha256: hash };
}

/** A loose single thing's declaration, with the files that hold it (identical copies). */
export type LooseDeclaration = { declaration: Declaration; sha256: string; copies: DriveFile[] };

/**
 * The declarations of loose single things in this inbox (fixture 07): no folder carries their mark, so
 * they are found by reading `.bower/piles` by real parents, as `findDeclaration` does. Identical copies
 * are one; copies that differ, or a copy that breaks its name or the contract, are logged and left out.
 * Folder declarations are skipped, and `skip` names declarations not to read at all (those a live folder or
 * file carries, read through their own pile). Parsed copies are kept in `cache`, since a declaration never changes.
 */
export async function findLooseDeclarations(files: readonly DriveFile[], rootId: string, inboxId: string, read: ReadBytes, cache?: Map<string, DeclarationResult>, skip: ReadonlySet<string> = new Set()): Promise<LooseDeclaration[]> {
  const bower = new Set(files.filter((f) => f.folder && f.name === BOWER_DIR && f.parents.includes(rootId)).map((f) => f.id));
  const piles = new Set(files.filter((f) => f.folder && f.name === PILES_NAME && f.parents.some((p) => bower.has(p))).map((f) => f.id));
  const byId = new Map<string, LooseDeclaration | 'conflict'>();
  for (const copy of files) {
    if (copy.folder || !copy.name.startsWith('declaration-') || !copy.name.endsWith('.json') || !copy.parents.some((p) => piles.has(p))) continue;
    // A declaration a live folder or file carries is read through that pile, never here.
    if (skip.has(copy.name.slice('declaration-'.length, -'-.json'.length - 64))) continue;
    const key = `${copy.id}@${copy.modifiedTime}`;
    let parsed = cache?.get(key);
    if (!parsed) {
      let bytes: Uint8Array;
      try {
        bytes = await read(copy.id);
      } catch (e) {
        // One copy that cannot be read affects only its own pile (TL-P2-08 a): it is skipped this time and read
        // again next listing. Signed out stops the listing.
        if (e instanceof BowerError && e.code === 'auth') throw e;
        console.error(e);
        continue;
      }
      parsed = await parsePileDeclaration(bytes, rootId);
      cache?.set(key, parsed);
    }
    if (!parsed.ok || copy.name !== declarationName(parsed.value.declarationId, parsed.sha256)) {
      console.error(`A pile declaration copy was refused (${parsed.ok ? 'name' : parsed.reason}).`);
      continue;
    }
    const { declarationId, anchor } = parsed.value;
    if (anchor.kind !== 'loose' || anchor.inboxId !== inboxId) continue;
    const had = byId.get(declarationId);
    if (had === undefined) byId.set(declarationId, { declaration: parsed.value, sha256: parsed.sha256, copies: [copy] });
    else if (had !== 'conflict' && had.sha256 === parsed.sha256) had.copies.push(copy);
    else if (had !== 'conflict') {
      console.error('Two different copies of a loose pile declaration were found; neither is used.');
      byId.set(declarationId, 'conflict');
    }
  }
  return [...byId.values()].filter((d): d is LooseDeclaration => d !== 'conflict');
}

const keyed = (files: readonly DriveFile[], key: string): DriveFile[] => files.filter((f) => !f.folder && f.appProperties?.[PROP.item] === key);

async function check(file: DriveFile, member: Member, digest: DigestOf): Promise<'match' | 'differs' | 'unchecked'> {
  const d = await digest(file);
  if (!d) return 'unchecked';
  return d.size === member.content.size && d.sha256 === member.content.sha256 ? 'match' : 'differs';
}

/** One member's state: in the folder, or arrived and gone from it, by its key and its bytes. */
async function observe(member: Member, folder: DriveFile, files: readonly DriveFile[], digest: DigestOf): Promise<MemberState> {
  const all = keyed(files, member.memberKey);
  const inside = all.filter((f) => f.parents[0] === folder.id);
  const [file, ...others] = inside.length ? inside : all;
  if (!file) return { memberKey: member.memberKey, state: 'missing' };
  if (others.length) return { memberKey: member.memberKey, state: 'changed', fileIds: [file, ...others].map((f) => f.id) };
  const result = await check(file, member, digest);
  if (result === 'unchecked') return { memberKey: member.memberKey, state: 'unchecked', file };
  if (result === 'differs') return { memberKey: member.memberKey, state: 'changed', fileIds: [file.id] };
  return inside.length ? { memberKey: member.memberKey, state: 'verified', file } : { memberKey: member.memberKey, state: 'left', file };
}

/**
 * Members with no live file anywhere, looked up in the Bin with one call: a
 * binned file outside the pile folder with the declared size and hash
 * arrived and left (it counts whether or not it is in the Bin); other bytes
 * are a change. One binned inside the folder is the person removing it.
 */
async function resolveBinned(declaration: Declaration, folder: DriveFile, states: MemberState[], binned?: BinnedOf): Promise<MemberState[]> {
  const missing = states.filter((s) => s.state === 'missing').map((s) => s.memberKey);
  if (!binned || !missing.length) return states;
  const found = (await binned(missing)).filter((b) => b.file.parents[0] !== folder.id);
  return states.map((s) => {
    if (s.state !== 'missing') return s;
    const member = declaration.members.find((m) => m.memberKey === s.memberKey);
    const files = found.filter((b) => b.file.appProperties?.[PROP.item] === s.memberKey);
    const [first] = files;
    if (!member || !first) return s;
    if (files.some((b) => b.size === null || b.sha256 === null)) return { memberKey: s.memberKey, state: 'unchecked', file: first.file };
    const match = files.filter((b) => b.size === member.content.size && b.sha256 === member.content.sha256);
    const [only] = match;
    return only && match.length === files.length && files.length === 1
      ? { memberKey: s.memberKey, state: 'left', file: only.file }
      : { memberKey: s.memberKey, state: 'changed', fileIds: files.map((b) => b.file.id) };
  });
}

async function observeAll(declaration: Declaration, folder: DriveFile, files: readonly DriveFile[], digest: DigestOf, binned?: BinnedOf): Promise<MemberState[]> {
  const states: MemberState[] = [];
  for (const m of declaration.members) states.push(await observe(m, folder, files, digest));
  return resolveBinned(declaration, folder, states, binned);
}

/** Each member's state; the pile waits while any member is missing, changed or unchecked. The context only has to be there. */
export async function observePile(declaration: Declaration, folder: DriveFile, files: readonly DriveFile[], digest: DigestOf, binned?: BinnedOf): Promise<Readiness> {
  const members = await observeAll(declaration, folder, files, digest, binned);
  const contextFiles = declaration.context.kind === 'text' ? keyed(files, declaration.context.memberKey).filter((f) => f.parents[0] === folder.id) : [];
  const context = contextFiles.length === 1 ? (contextFiles[0] ?? null) : null;
  const has = (state: MemberState['state']): boolean => members.some((m) => m.state === state);
  const blocked: Blocked = has('changed') ? 'changed' : has('missing') ? 'not-arrived' : has('unchecked') ? 'not-checked' : null;
  return { blocked, members, context };
}

/** What a declared pile's members come to, by the one accounting rule (`accountPile`). */
export interface Accounting extends Readiness {
  /** Members a consumed disposition records: filed, whatever their files are like now. Not in `members`. */
  disposed: ReadonlySet<string>;
  /** Members still in the pile's folder with their declared bytes: what a run takes of it now. */
  remaining: string[];
}

/**
 * Member keys the consumed dispositions in `.bower/piles` record for this pile and this declaration,
 * found by real parents. A disposition that cannot be read records nothing and is logged. Parsed records
 * are kept in `cache` by file id and modified time, since a disposition never changes.
 *
 * Accepted limit (review of b-path-leftover-piles, Minor 1): any well-formed consumed disposition with a
 * matching scope, pile and declaration is trusted; its run's published report (`authority.reportHash`) is
 * not read back. Only Bower's runner writes there, after it confirmed that report (guard 13).
 */
async function disposedKeys(declaration: Declaration, declarationSha256: string, files: readonly DriveFile[], read: ReadBytes, cache?: Map<string, DispositionResult>): Promise<Set<string>> {
  const rootId = declaration.scope.rootId;
  const bower = new Set(files.filter((f) => f.folder && f.name === BOWER_DIR && f.parents.includes(rootId)).map((f) => f.id));
  const piles = new Set(files.filter((f) => f.folder && f.name === PILES_NAME && f.parents.some((p) => bower.has(p))).map((f) => f.id));
  const out = new Set<string>();
  for (const f of files) {
    if (f.folder || !f.name.startsWith('disposition-') || !f.parents.some((p) => piles.has(p))) continue;
    const key = `${f.id}@${f.modifiedTime}`;
    let parsed = cache?.get(key);
    if (!parsed) {
      parsed = await parsePileDisposition(await read(f.id), rootId);
      cache?.set(key, parsed);
    }
    if (!parsed.ok || f.name !== `disposition-${parsed.sha256}.json`) {
      console.error(`A pile disposition was refused (${parsed.ok ? 'name' : parsed.reason}).`);
      continue;
    }
    const d = parsed.value;
    if (d.action !== 'consumed' || d.pileId !== declaration.pileId || d.declaration?.declarationId !== declaration.declarationId || d.declaration.sha256 !== declarationSha256) continue;
    for (const k of d.memberKeys) out.add(k);
  }
  return out;
}

/**
 * The one accounting rule the Inbox and the tidy-up share (TL-P2-09, TL-P2-12, TL-P2-29), so they never
 * disagree: a member a consumed disposition records is filed, whatever its file is like now; any other
 * member is looked up, and has arrived and left when it is outside the folder with its declared bytes.
 * Readiness is judged only on the members not disposed of. A disposed member the person moves back into
 * the folder is no longer a member: it is ordinary input in the pile.
 */
export async function accountPile(declaration: Declaration, declarationSha256: string, folder: DriveFile, files: readonly DriveFile[], read: ReadBytes, digest: DigestOf, binned?: BinnedOf, cache?: Map<string, DispositionResult>): Promise<Accounting> {
  const disposed = await disposedKeys(declaration, declarationSha256, files, read, cache);
  const open: Declaration = { ...declaration, members: declaration.members.filter((m) => !disposed.has(m.memberKey)) };
  const readiness = await observePile(open, folder, files, digest, binned);
  return { ...readiness, disposed, remaining: readiness.members.filter((m) => m.state === 'verified').map((m) => m.memberKey) };
}

/**
 * The approved sentence for each reason (TL-P2-11 (1), TL-P2-19, TL-P2-30); the same
 * words the tidy-up's report gives. "Remove" names the pile's own Remove button.
 */
export const SET_ASIDE_TEXT: Readonly<Record<SetAside, string>> = {
  'not-arrived': 'Some of its things have not arrived yet.',
  'not-checked': 'Bower could not check some of its things. Try again.',
  unreadable: 'Bower could not read the list of what is in this pile. Try again.',
  changed: 'Some of its things changed after they were added. Remove it and add them again.',
  declaration: 'Bower found two different lists of what is in this pile. Remove it and add it again.',
  empty: 'Nothing is left in it. Remove it from your inbox.',
  'note-format': "This pile's note needs a newer Bower.",
  'note-damaged': "Bower can't read this pile's note.",
};

/**
 * Why a tidy-up leaves a pile in the inbox, from the facts the runner reads:
 * its declaration, its members' states, and whether anything is left in it
 * (things in its folder, its words, or a note to write again). null when a
 * tidy-up takes it.
 */
export function setAsideOf(lookup: DeclarationLookup['state'], blocked: Blocked, left: { things: number; text: string; restore: boolean }): SetAside | null {
  if (lookup === 'unmarked') return null;
  if (lookup === 'conflict') return 'declaration';
  // A list that cannot be read, or is damaged, says so (TL-P2-30 (b)); one not there to check against: Try again.
  if (lookup === 'unreadable') return 'unreadable';
  if (lookup === 'missing') return 'not-checked';
  if (blocked) return blocked;
  return !left.things && !left.text.trim() && !left.restore ? 'empty' : null;
}

/**
 * Whether everything a tidy-up would write down about a pile (its folder's name, its words, its things' names) is
 * text a run record can carry. One that holds half of a character is held as not checked, with Try again, by the
 * Inbox and the tidy-up alike (TL-P2-21).
 */
export function writable(texts: readonly string[]): boolean {
  return canonicalRecordJson(texts).ok;
}

/**
 * The one pile note a tidy-up records for a pile, and so the only one it reads: the note bound by the pile's context
 * key when it is there, otherwise the first pile note. Any other pile note is an uncaptured child, never read.
 */
export function recordedNote(children: readonly DriveFile[], contextKey: string | null): DriveFile | undefined {
  const bound = contextKey === null ? undefined : children.find((f) => !f.folder && f.appProperties?.[PROP.item] === contextKey);
  return bound ?? children.find((f) => !f.folder && f.name === PILE_NOTE);
}

/** Whether the person put the pile's note in the Bin through Bower: a `trash` change for it in your changes. */
export function contextRemoved(records: readonly unknown[], folderPath: string): boolean {
  return records.some((r) => isJournalRecord(r) && r.kind === 'trash' && r.path === `${folderPath}/${PILE_NOTE}`);
}

/** Your changes, read for `contextRemoved`; a line that is not JSON says nothing and is logged. */
export async function journalValues(files: readonly DriveFile[], read: (id: string) => Promise<string>): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const f of files) {
    if (f.folder || !f.name.endsWith('.json')) continue;
    const text = await read(f.id);
    try {
      out.push(JSON.parse(text));
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(e);
    }
  }
  return out;
}
