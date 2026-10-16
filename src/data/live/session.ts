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
  private epoch = 0;
  private transitioning = false;
  private disposed = false;

  constructor(
    private readonly worker: WorkerApi,
    private readonly drive: DriveApi,
    /** Told when the folder is made, so the vault lists it. */
    private readonly onFolder: () => void,
    private readonly onLifetime: () => void = () => undefined,
  ) {}

  private begin(): number {
    if (this.disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
    this.epoch++;
    this.me = null;
    this.transitioning = true;
    this.onLifetime();
    return this.epoch;
  }

  private check(epoch: number): void {
    if (this.disposed) throw new BowerError('unknown', 'Bower is no longer open on this page.');
    if (epoch !== this.epoch) throw new BowerError('conflict', 'Your session changed; try again.');
  }

  dispose(): void {
    this.disposed = true;
    this.epoch++;
    this.me = null;
    this.listeners.clear();
  }

  /** The Bower folder's id, or a sentence for the person when there is none. */
  async rootId(): Promise<string> {
    const epoch = this.epoch;
    const me = await this.whoami();
    this.check(epoch);
    if (!me) throw new BowerError('auth', 'Sign in again to keep going.');
    if (!me.folderId) throw new BowerError('not-found', 'Your Bower folder is not there any more.');
    return me.folderId;
  }

  async current(): Promise<User | null> {
    const epoch = this.epoch;
    const me = await this.whoami();
    this.check(epoch);
    return me?.user ?? null;
  }

  async signIn(): Promise<User> {
    const epoch = this.begin();
    try {
      await this.worker.signIn();
      this.check(epoch);
      this.transitioning = false;
      const user = await this.current();
      this.check(epoch);
      if (!user) throw new BowerError('auth', 'Signing in did not finish. Try again.');
      this.emit();
      return user;
    } finally { if (epoch === this.epoch) this.transitioning = false; }
  }

  async signOut(): Promise<void> {
    const epoch = this.begin();
    try {
      await this.worker.signOut();
      this.check(epoch);
      forgetThisPerson();
      sayGoodbye('signed-out');
      this.me = Promise.resolve(null);
      this.transitioning = false;
      this.emit();
    } finally { if (epoch === this.epoch) this.transitioning = false; }
  }

  async deleteAccount(): Promise<void> {
    const epoch = this.begin();
    try {
      await this.worker.deleteAccount();
      this.check(epoch);
      forgetThisPerson();
      sayGoodbye();
      this.me = Promise.resolve(null);
      this.transitioning = false;
      this.emit();
    } finally { if (epoch === this.epoch) this.transitioning = false; }
  }

  async folderState(): Promise<FolderState> {
    const epoch = this.epoch;
    const me = await this.whoami();
    this.check(epoch);
    return me?.folderId ? 'ready' : 'missing';
  }

  async createFolder(onStep: (root: ParaRoot) => void): Promise<{ found: boolean }> {
    const before = this.epoch;
    const person = await this.whoami();
    this.check(before);
    if (!person) throw new BowerError('auth', 'Sign in again to keep going.');
    const epoch = this.begin();
    try {
      const { id, found } = await this.worker.createFolder();
      this.check(epoch);
      const told = new Set<ParaRoot>();
      const until = Date.now() + GIVE_UP_MS;
      while (told.size < PARA_ROOTS.length) {
        const names = new Set((await this.drive.listAll(id)).filter((f) => f.folder && f.parents[0] === id).map((f) => f.name));
        this.check(epoch);
        for (const r of PARA_ROOTS) {
          if (told.has(r) || !names.has(r)) continue;
          if (told.size) await sleep(STEP_MS);
          this.check(epoch);
          told.add(r);
          onStep(r);
        }
        if (told.size === PARA_ROOTS.length) break;
        if (Date.now() > until) throw new BowerError('unknown', 'Making your Bower folder took too long. Try again.');
        await sleep(POLL_MS);
        this.check(epoch);
      }
      this.me = Promise.resolve({ ...person, folderId: id });
      this.transitioning = false;
      this.onFolder();
      this.emit();
      return { found };
    } finally { if (epoch === this.epoch) this.transitioning = false; }
  }

  /** Google or the Worker no longer accepts this person: ask again, and tell the screens (sign-in shows). */
  expire(): void {
    if (this.disposed) return;
    this.begin();
    this.transitioning = false;
    forgetThisPerson();
    this.emit();
  }

  subscribe(cb: () => void): Unsubscribe {
    if (this.disposed) return () => undefined;
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private whoami(): Promise<Me | null> {
    if (this.disposed) return Promise.reject(new BowerError('unknown', 'Bower is no longer open on this page.'));
    if (this.transitioning) return Promise.reject(new BowerError('conflict', 'Your session changed; try again.'));
    if (!this.me) {
      const epoch = this.epoch;
      const p = this.worker.me().then((me) => { this.check(epoch); return me; });
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
