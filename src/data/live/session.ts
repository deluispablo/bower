/**
 * Who is signed in and their Bower folder, from the Worker. Making the
 * folder asks the Worker to copy the template, then watches Drive until the
 * five main folders are there, telling the welcome screen as each lands.
 */
import type { DriveApi } from '../drive/drive-api';
import type { Session, Unsubscribe } from '../sources';
import { BowerError, PARA_ROOTS, type FolderState, type ParaRoot, type User } from '../types';
import type { Me, WorkerApi } from '../worker/worker-api';
import { forgetThisPerson, sayGoodbye } from '../device';

const POLL_MS = 500;
const GIVE_UP_MS = 20_000;
/** The welcome screen shows each folder land; a little room between them. */
const STEP_MS = 300;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class LiveSession implements Session {
  private listeners = new Set<() => void>();
  private me: Promise<Me | null> | null = null;

  constructor(
    private readonly worker: WorkerApi,
    private readonly drive: DriveApi,
    /** Told when the folder is made, so the vault lists it. */
    private readonly onFolder: () => void,
  ) {}

  /** The Bower folder's id, or a sentence for the person when there is none. */
  async rootId(): Promise<string> {
    const me = await this.whoami();
    if (!me) throw new BowerError('auth', 'Sign in again to keep going.');
    if (!me.folderId) throw new BowerError('not-found', 'Your Bower folder is not there any more.');
    return me.folderId;
  }

  async current(): Promise<User | null> {
    return (await this.whoami())?.user ?? null;
  }

  async signIn(): Promise<User> {
    await this.worker.signIn();
    this.me = null;
    const user = await this.current();
    if (!user) throw new BowerError('auth', 'Signing in did not finish. Try again.');
    this.emit();
    return user;
  }

  async signOut(): Promise<void> {
    await this.worker.signOut();
    forgetThisPerson();
    this.me = null;
    this.emit();
  }

  async deleteAccount(): Promise<void> {
    await this.worker.deleteAccount();
    forgetThisPerson();
    sayGoodbye();
    this.me = null;
    this.emit();
  }

  async folderState(): Promise<FolderState> {
    return (await this.whoami())?.folderId ? 'ready' : 'missing';
  }

  async createFolder(onStep: (root: ParaRoot) => void): Promise<{ found: boolean }> {
    const { id, found } = await this.worker.createFolder();
    const told = new Set<ParaRoot>();
    const until = Date.now() + GIVE_UP_MS;
    while (told.size < PARA_ROOTS.length) {
      const names = new Set((await this.drive.listAll(id)).filter((f) => f.folder && f.parents[0] === id).map((f) => f.name));
      for (const r of PARA_ROOTS) {
        if (told.has(r) || !names.has(r)) continue;
        if (told.size) await sleep(STEP_MS);
        told.add(r);
        onStep(r);
      }
      if (told.size === PARA_ROOTS.length) break;
      if (Date.now() > until) throw new BowerError('unknown', 'Making your Bower folder took too long. Try again.');
      await sleep(POLL_MS);
    }
    this.me = null;
    this.onFolder();
    this.emit();
    return { found };
  }

  /** Google or the Worker no longer accepts this person: ask again, and tell the screens (sign-in shows). */
  expire(): void {
    this.me = null;
    this.emit();
  }

  subscribe(cb: () => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private whoami(): Promise<Me | null> {
    if (!this.me) {
      const p = this.worker.me();
      this.me = p;
      // expected: the caller hears the error; this only forgets the failed answer, so the next call asks again.
      p.catch(() => {
        if (this.me === p) this.me = null;
      });
    }
    return this.me;
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}
