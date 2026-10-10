/**
 * The one Drive read cache (TL-P4-14 `c2-read-cache`; ARCHITECTURE, mechanism map): what a file holds, kept by its id
 * and the modifiedTime a listing gave. Used by the app's `DriveVault` and its `Journal`, and by the runner's plan reads.
 *
 * - **Keyed by version, as an ETag keys a response** (RFC 9110 §8.8.3, §13.1.1). Drive changes a file's `modifiedTime`
 *   whenever its content changes (https://developers.google.com/workspace/drive/api/reference/rest/v3/files, field
 *   `modifiedTime`), so the content read for one id and one modifiedTime is the content of that version: it never goes
 *   stale and is never cleared. A newer listing gives a newer key; only the listing is ever read again.
 * - **Single flight.** A file asked for again while its read is on its way shares that read (request coalescing).
 * - **One version per id.** A newer modifiedTime replaces the one kept; an older one (a caller still on an older
 *   listing) is read and not kept. A read that fails is not kept, so the next ask reads again.
 * - **Never a fence, but for the runner's own records.** A write's check reads Drive itself, right before the send
 *   (`stillAsSeen`, the runner's fence and the transport's `ifModified`). The one read that stands in for it is a
 *   record folder the runner made, kept by the version its create answered (`keep`), while that is the latest
 *   version the runner saw.
 */

/** A file as a listing gave it: its id and modifiedTime (undefined when no listing shows it; then it is not kept). */
export interface Version {
  readonly id: string;
  readonly modifiedTime: string | undefined;
}

type Kind = 'text' | 'bytes' | 'prefix' | 'digest' | 'file';

export class ReadCache {
  private readonly kept = new Map<string, { modifiedTime: string; reads: Map<Kind, Promise<unknown>>; settled: Set<Kind>; published?: true }>();

  text(v: Version, read: () => Promise<string>): Promise<string> {
    return this.once('text', v, () => {
      const bytes = this.keptRead<Uint8Array>('bytes', v);
      return bytes ? bytes.then((value) => new TextDecoder().decode(value)) : read();
    });
  }

  /** A prefix is never evidence of the full media, even when it is short. */
  prefix(v: Version, read: () => Promise<string | null>): Promise<string | null> {
    return this.once('prefix', v, read);
  }

  /** Each caller gets its own copy. */
  async bytes(v: Version, read: () => Promise<Uint8Array>): Promise<Uint8Array> {
    return (await this.once('bytes', v, read)).slice();
  }

  digest<T>(v: Version, read: () => Promise<T>): Promise<T> {
    return this.once('digest', v, read);
  }

  /** The text kept for this version. A projection can request only a completed read and never wait on media. */
  keptText(v: Version, settledOnly = false): Promise<string> | undefined {
    if (settledOnly && !this.kept.get(v.id)?.settled.has('text')) return undefined;
    return this.keptRead<string>('text', v);
  }

  /** Notify a view once when it has projected this completed text version; no separate publication store. */
  publishText(v: Version, notify: () => void): void {
    const entry = this.kept.get(v.id);
    if (!entry || entry.modifiedTime !== v.modifiedTime || !entry.settled.has('text') || entry.published) return;
    entry.published = true;
    notify();
  }

  private keptRead<T>(kind: Kind, v: Version): Promise<T> | undefined {
    const entry = this.kept.get(v.id);
    return entry && entry.modifiedTime === v.modifiedTime ? (entry.reads.get(kind) as Promise<T> | undefined) : undefined;
  }

  /** A file's metadata, under the version it shows (a record folder the runner made). */
  keep<T extends Version>(file: T): void {
    this.once('file', file, () => Promise.resolve(file));
  }

  /** The file kept for this version by `keep`. */
  keptFile<T>(v: Version): Promise<T> | undefined {
    const entry = this.kept.get(v.id);
    return entry && entry.modifiedTime === v.modifiedTime ? (entry.reads.get('file') as Promise<T> | undefined) : undefined;
  }

  /** Text this page wrote, under the version Drive's answer gave. */
  wrote(v: Version, text: string): void {
    this.once('text', v, () => Promise.resolve(text));
  }

  clear(): void {
    this.kept.clear();
  }

  private once<T>(kind: Kind, v: Version, read: () => Promise<T>): Promise<T> {
    const at = v.modifiedTime;
    if (at === undefined) return read();
    let entry = this.kept.get(v.id);
    if (entry && entry.modifiedTime !== at) {
      // RFC 3339 times in one form (Drive's) order as text.
      if (at < entry.modifiedTime) return read();
      entry = undefined;
    }
    if (!entry) {
      entry = { modifiedTime: at, reads: new Map(), settled: new Set() };
      this.kept.set(v.id, entry);
    }
    const have = entry.reads.get(kind);
    if (have) return have as Promise<T>;
    const p = read();
    const reads = entry.reads;
    reads.set(kind, p);
    const settled = entry.settled;
    // expected: the caller hears the failure; this only forgets the failed read, so the next ask reads again.
    p.then(() => { settled.add(kind); }, () => {
      if (reads.get(kind) === p) reads.delete(kind);
    });
    return p;
  }
}
