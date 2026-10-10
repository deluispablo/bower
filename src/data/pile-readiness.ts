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
import { recordableId, recordableName } from './contracts/run-manifest';
import { PILE_NOTE, safeInboxName } from './piles';
import { isJournalRecord } from './contracts/journal-record';
import { PROP, SYSTEM } from './vault/layout';
import { BowerError, type SetAside } from './types';
import { NotReadHere } from './spine/budget';
import { sha256 } from './vault/hashes';

export type ReadBytes = (id: string) => Promise<Uint8Array>;

/** A file's size and SHA-256 as the caller could establish them; null when they could not be checked. */
export type Digest = { size: number; sha256: string };
export type DigestOf = (file: DriveFile) => Promise<Digest | null>;

/** Bin entries with any of these member keys, with their stored size and hash: one call per evaluation. */
export type BinnedOf = (keys: readonly string[]) => Promise<ReadonlyArray<{ file: DriveFile; size: number | null; sha256: string | null }>>;

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

/**
 * The one pile-records query (TL-P4-16 b): the declarations or dispositions in `.bower/piles` (by real parents) that can be
 * about these piles, from the listing alone; none is read. Records are stamped with their pile id when written
 * (`PROP.recordPile`; Drive `files.list` returns `appProperties` with each file, so no second call is needed), so a
 * stamped record is picked by its stamp, never by its name. A record with no stamp is not read (TL-P4-16 ruling: only
 * staging test folders have them). With no `pileIds`, every stamped record.
 */
export function pileRecords(files: readonly DriveFile[], rootId: string, kind: 'declaration' | 'disposition', pileIds?: ReadonlySet<string>): DriveFile[] {
  const bower = new Set(files.filter((f) => f.folder && f.name === BOWER_DIR && f.parents.includes(rootId)).map((f) => f.id));
  const piles = new Set(files.filter((f) => f.folder && f.name === PILES_NAME && f.parents.some((p) => bower.has(p))).map((f) => f.id));
  return files.filter((f) => {
    if (f.folder || !f.name.startsWith(`${kind}-`) || !f.parents.some((p) => piles.has(p))) return false;
    if (kind === 'declaration' && !f.name.endsWith('.json')) return false;
    const stamp = f.appProperties?.[PROP.recordPile];
    return stamp !== undefined && (!pileIds || pileIds.has(stamp));
  });
}

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

/** Every copy of one declaration in `.bower/piles`, by real parents and its name; none is read. */
export function declarationCopies(files: readonly DriveFile[], rootId: string, declarationId: string): DriveFile[] {
  const bower = new Set(files.filter((f) => f.folder && f.name === BOWER_DIR && f.parents.includes(rootId)).map((f) => f.id));
  const piles = new Set(files.filter((f) => f.folder && f.name === PILES_NAME && f.parents.some((p) => bower.has(p))).map((f) => f.id));
  const prefix = `declaration-${declarationId}-`;
  return files.filter((f) => !f.folder && f.parents.some((p) => piles.has(p)) && f.name.startsWith(prefix) && f.name.endsWith('.json'));
}

/** Declarations found gone and logged already, per reader (its cache): each is logged once. */
const goneLogged = new WeakMap<Map<string, DeclarationResult>, Set<string>>();

/**
 * The declaration a pile folder or loose file names, found by real parents (`.bower` →
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
  const prefix = `declaration-${declarationId}-`;
  const copies = declarationCopies(files, rootId, declarationId);
  if (!copies.length) {
    // Every copy missing or in the Bin (TL-P2-31 amendment): an ordinary observed pile, as Drive's restore leaves it.
    const logged = cache ? (goneLogged.get(cache) ?? new Set<string>()) : new Set<string>();
    if (cache) goneLogged.set(cache, logged);
    if (!logged.has(declarationId)) console.error(`A pile's declaration is gone (${declarationId}); it is taken as an ordinary pile.`);
    logged.add(declarationId);
    return { state: 'unmarked' };
  }
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
        // Signed out stops the look; a read admission left to the runner (TL-P4-11) is not this copy's failure.
        if ((e instanceof BowerError && e.code === 'auth') || e instanceof NotReadHere) throw e;
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
  // The declaration must be about this folder or loose file: same layout, same pile, same inbox.
  if (anchor.kind !== (folder.folder ? 'folder' : 'loose') || declaration.pileId !== folder.appProperties?.[PROP.pile] || !folder.parents.includes(anchor.inboxId)) return { state: 'conflict' };
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
export async function findLooseDeclarations(files: readonly DriveFile[], rootId: string, inboxId: string, read: ReadBytes, cache?: Map<string, DeclarationResult>, skip: ReadonlySet<string> = new Set(), onlyPile?: string): Promise<LooseDeclaration[]> {
  // Piles whose declaration a consumed disposition retired, known from the listing's stamps alone (a loose thing has the
  // one member the disposition files). With `onlyPile` (a Remove of that pile) nothing is retired: its copies are wanted.
  const retired = new Set(onlyPile === undefined ? pileRecords(files, rootId, 'disposition').flatMap((d) => d.appProperties?.[PROP.recordPile] ?? []) : []);
  const wanted = pileRecords(files, rootId, 'declaration', onlyPile === undefined ? undefined : new Set([onlyPile])).filter((copy) => {
    // A declaration a live folder or file carries is read through that pile, never here.
    if (skip.has(copy.name.slice('declaration-'.length, -'-.json'.length - 64))) return false;
    return copy.appProperties?.[PROP.recordAnchor] !== 'folder' && !retired.has(copy.appProperties?.[PROP.recordPile] ?? '');
  });
  return (await readDeclarations(wanted, rootId, inboxId, read, cache)).declarations
    .filter((d) => d.declaration.anchor.kind === 'loose' && (onlyPile === undefined || d.declaration.pileId === onlyPile));
}

/** The full-read record query, shared by loose discovery and the recovery summary. */
export function findPileDeclarations(files: readonly DriveFile[], rootId: string, inboxId: string, read: ReadBytes, cache?: Map<string, DeclarationResult>): Promise<{ declarations: LooseDeclaration[]; complete: boolean }> {
  // TL-P4-53 addendum 5: a listing disposition stamp retires its declaration, even when damaged or foreign.
  const retired = new Set(pileRecords(files, rootId, 'disposition').flatMap((f) => f.appProperties?.[PROP.recordPile] ?? []));
  const anchored = new Set(files.filter((f) => f.appProperties?.[PROP.pile] && f.appProperties?.[PROP.declaration])
    .map((f) => `${f.appProperties?.[PROP.pile]}:${f.appProperties?.[PROP.declaration]}:${f.folder ? 'folder' : 'loose'}`));
  const wanted = pileRecords(files, rootId, 'declaration').filter((copy) => {
    const pile = copy.appProperties?.[PROP.recordPile];
    const id = copy.name.slice('declaration-'.length, -'-.json'.length - 64);
    // Live anchors have their own read path; they cannot be unanchored work.
    return !retired.has(pile ?? '') && !anchored.has(`${pile}:${id}:${copy.appProperties?.[PROP.recordAnchor]}`);
  });
  return readDeclarations(wanted, rootId, inboxId, read, cache);
}

/** One parser and copy merge for every declaration form; failed evidence stays unknown. */
async function readDeclarations(wanted: readonly DriveFile[], rootId: string, inboxId: string, read: ReadBytes, cache?: Map<string, DeclarationResult>): Promise<{ declarations: LooseDeclaration[]; complete: boolean }> {
  const parsedCopies = await Promise.all(wanted.map(async (copy) => {
    const key = `${copy.id}@${copy.modifiedTime}`;
    let parsed = cache?.get(key);
    if (!parsed) {
      let bytes: Uint8Array;
      try {
        bytes = await read(copy.id);
      } catch (e) {
        if ((e instanceof BowerError && e.code === 'auth') || e instanceof NotReadHere) throw e;
        console.error(e);
        return null;
      }
      parsed = await parsePileDeclaration(bytes, rootId);
      cache?.set(key, parsed);
    }
    return parsed;
  }));
  let complete = true;
  const byPile = new Map<string, LooseDeclaration | 'conflict'>();
  const pileById = new Map<string, string>();
  for (const [i, copy] of wanted.entries()) {
    const parsed = parsedCopies[i];
    // A parser-validated declaration in another root is outside this summary.
    if (parsed && !parsed.ok && parsed.reason === 'scope') continue;
    const stamp = copy.appProperties?.[PROP.recordPile] ?? '';
    const refuse = (): void => {
      complete = false;
      byPile.set(stamp, 'conflict');
    };
    if (!parsed) { refuse(); continue; }
    if (!parsed.ok || copy.name !== declarationName(parsed.value.declarationId, parsed.sha256)) {
      console.error(`A pile declaration copy was refused (${parsed.ok ? 'name' : parsed.reason}).`);
      refuse();
      continue;
    }
    const { declarationId, pileId, anchor } = parsed.value;
    if (anchor.inboxId !== inboxId || pileId !== stamp) {
      console.error('A pile declaration copy was refused (pile or inbox).');
      refuse();
      continue;
    }
    const otherPile = pileById.get(declarationId);
    pileById.set(declarationId, pileId);
    const had = byPile.get(pileId);
    if (otherPile !== undefined && otherPile !== pileId) {
      byPile.set(otherPile, 'conflict');
      byPile.set(pileId, 'conflict');
      complete = false;
      console.error('Two piles carry the same declaration identity.');
    } else if (had === undefined) byPile.set(pileId, { declaration: parsed.value, sha256: parsed.sha256, copies: [copy] });
    else if (had !== 'conflict' && had.sha256 === parsed.sha256) had.copies.push(copy);
    else {
      byPile.set(pileId, 'conflict');
      complete = false;
      console.error('Two different copies of a pile declaration were found; neither is used.');
    }
  }
  return { declarations: [...byPile.values()].filter((d): d is LooseDeclaration => d !== 'conflict'), complete };
}

/** One accounting result supplies both the recovery count and the missing loose row. */
export type OrphanState = { state: 'orphan' | 'retired' | 'unknown'; missingLoose: boolean };

/** Unstamped unanchored work uses the existing member accounting and context-removal facts. */
export async function orphanState(found: LooseDeclaration, inbox: DriveFile, files: readonly DriveFile[], read: ReadBytes, digest: DigestOf, binned: BinnedOf, cache: Map<string, DispositionResult>, removedContext: (path: string) => Promise<boolean>): Promise<OrphanState> {
  const { declaration, sha256: hash } = found;
  const { anchor, context } = declaration;
  const anchors = files.filter((f) => f.appProperties?.[PROP.pile] === declaration.pileId
    && f.appProperties?.[PROP.declaration] === declaration.declarationId && f.folder === (anchor.kind === 'folder'));
  const result = (state: OrphanState['state'], missingLoose = false): OrphanState => ({ state, missingLoose });
  if (anchors.length) return result('retired');
  // With no real folder, verified members anywhere in this root are outside its intended anchor.
  const place = anchor.kind === 'loose' ? inbox : { ...inbox, id: anchor.createKey };
  let inBin = false;
  const accounting = await accountPile(declaration, hash, place, files, read, digest, async (keys) => {
    const hits = await binned(keys);
    inBin = hits.length > 0;
    return hits;
  }, cache);
  // A loose file Binned from the inbox was deliberately removed, just as the row accounting treats it.
  const missingLoose = anchor.kind === 'loose' && accounting.members[0]?.state === 'missing' && !inBin;
  if (anchor.kind === 'loose' && inBin && accounting.members[0]?.state === 'missing') return result('retired');
  if (accounting.members.some((m) => m.state === 'unchecked')) return result('unknown');
  if (accounting.members.some((m) => m.state === 'missing' || m.state === 'changed' || m.state === 'verified')) return result('orphan', missingLoose);
  if (context.kind === 'absent') return result('retired');
  const contexts = keyed(files, context.memberKey);
  if (contexts.length === 1) return result('retired');
  if (contexts.length > 1) return result('unknown');
  if (anchor.kind === 'folder' && await removedContext(`Inbox/${anchor.name}`)) return result('retired');
  if ((await binned([context.memberKey])).length === 1) return result('retired');
  return result('unknown');
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
  // Every member is looked up together (a pile of four is one wait on a slow Drive, not four); the order is kept.
  const states = await Promise.all(declaration.members.map((m) => observe(m, folder, files, digest)));
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
 * Reads (and keeps, by file id and modified time) the dispositions that can be about this pile (`pileRecords`), all at
 * once: those stamped with its id. The rest of the history is never read.
 */
async function readDispositions(rootId: string, pileId: string, files: readonly DriveFile[], read: ReadBytes, cache?: Map<string, DispositionResult>): Promise<{ f: DriveFile; parsed: DispositionResult }[]> {
  const candidates = pileRecords(files, rootId, 'disposition', new Set([pileId]));
  return Promise.all(candidates.map(async (f) => {
    const key = `${f.id}@${f.modifiedTime}`;
    let parsed = cache?.get(key);
    if (!parsed) {
      parsed = await parsePileDisposition(await read(f.id), rootId);
      cache?.set(key, parsed);
    }
    return { f, parsed };
  }));
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
  const out = new Set<string>();
  const results = await readDispositions(declaration.scope.rootId, declaration.pileId, files, read, cache);
  for (const { f, parsed } of results) {
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

/** A loose file's lookup and accounting, as the Inbox and the run both take them (`accountLoose`). */
export interface LooseAccounting {
  lookup: DeclarationLookup['state'];
  /** Why it waits; null when it is ready, or not declared. */
  blocked: Blocked;
  /** The declaration and its accounting, when it was found and could be accounted for. */
  found: { declaration: Declaration; sha256: string; accounting: Accounting } | null;
}

/**
 * The one rule for an arrived loose file (fixture 07), shared by the Inbox and the run so they never disagree
 * (TL-P2-21, TL-P2-29): its lookup (`findDeclaration`, which the caller makes) and then the pile accounting with
 * the inbox standing for its folder. The reason it waits comes from `setAsideOf`, as for a pile folder.
 */
export async function accountLoose(lookup: DeclarationLookup, inbox: DriveFile | undefined, files: readonly DriveFile[], read: ReadBytes, digest: DigestOf, binned?: BinnedOf, cache?: Map<string, DispositionResult>): Promise<LooseAccounting> {
  if (lookup.state !== 'found') return { lookup: lookup.state, blocked: null, found: null };
  if (!inbox) return { lookup: 'found', blocked: 'not-checked', found: null };
  const accounting = await accountPile(lookup.declaration, lookup.sha256, inbox, files, read, digest, binned, cache);
  return { lookup: 'found', blocked: accounting.blocked, found: { declaration: lookup.declaration, sha256: lookup.sha256, accounting } };
}

/** Why a tidy-up leaves a loose file in the inbox, by the same rule as a pile folder; null when it takes it. */
export function looseSetAside(loose: LooseAccounting): SetAside | null {
  return setAsideOf(loose.lookup, loose.blocked, { things: 1, text: '', restore: false });
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
  'not-tidied': "Bower couldn't tidy this up yet. Try again.",
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
 * What a tidy-up that takes a pile writes down about it, by the rules the Inbox and the run share (TL-P2-38): a pile
 * one of these says no to is held, not tidied, with Try again, and the rest of the run goes on. Its id must be a
 * logical id and every name (its folder's, its files') one a run record can carry.
 */
export function recordablePile(pileId: string, names: readonly string[]): boolean {
  return recordableId(pileId) && names.every(recordableName);
}

/**
 * Whether a text read is exactly the bytes stored for it, so the one note a run records is taken from one read: a
 * note whose bytes do not come back as its text (a byte order mark, bytes that are not UTF-8, a change in between)
 * cannot be recorded as read. Null (the bytes could not be checked) is not the same.
 */
export async function sameText(text: string, digest: Digest | null): Promise<boolean> {
  if (!digest) return false;
  const raw = new TextEncoder().encode(text);
  return digest.size === raw.byteLength && digest.sha256 === (await sha256(new Blob([raw])));
}

/**
 * Whether a run can check a thing's bytes, from its listing alone (no byte is read): a thing Drive keeps no checksum
 * of holds its pile, with Try again, in the Inbox and the run alike (TL-P2-38).
 */
export function checkable(file: DriveFile): boolean {
  return !file.unchecked;
}

/**
 * Whether a declared pile's first pile note is one of its members still to file: read as the pile's note, it would
 * never be filed as a thing, so the run cannot account for it.
 */
export function memberAsNote(children: readonly DriveFile[], remaining: readonly string[]): boolean {
  const key = children.find((f) => !f.folder && f.name === PILE_NOTE)?.appProperties?.[PROP.item];
  return key !== undefined && remaining.includes(key);
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
  // All lines are asked for at once (a dozen at 300 ms each is not a wait of a dozen calls); they are read in order.
  const lines = files.filter((f) => !f.folder && f.name.endsWith('.json'));
  const texts = await Promise.all(lines.map((f) => read(f.id)));
  for (const text of texts) {
    try {
      out.push(JSON.parse(text));
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      console.error(e);
    }
  }
  return out;
}
