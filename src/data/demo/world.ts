/**
 * The demo: Alex's Bower folder in memory, behind the same doors the real
 * Drive and Worker will use. Moves and renames change the tree for real; a
 * tidy-up walks the real phases on a time scale and then files the inbox.
 */
import type { RunSource, Session, Sources, VaultSource } from '../sources';
import {
  buildTree,
  displayName,
  ensureFolders,
  freeName,
  join,
  kindOf,
  moveEntry,
  nameOf,
  parentOf,
  removeEntry,
  renameEntry,
  type Entries,
  type Entry,
} from '../tree';
import {
  BowerError,
  PARA_ROOTS,
  type FiledItem,
  type FolderState,
  type Note,
  type ParaRoot,
  type Pile,
  type Question,
  type Rule,
  type RunReport,
  type RunState,
  type Suggestion,
  type User,
} from '../types';
import {
  ALEX,
  FILING,
  NOTES,
  RECEIPTS_TO,
  SEEDS,
  seedPiles,
  seedQuestions,
  seedRules,
  seedSuggestions,
  seedTime,
} from './fixture';
import { PHASE_MS, type Scenario, type TimeScale } from './scenario';

type Listener = () => void;

export interface WorldOptions {
  scenario: Scenario;
  scale: TimeScale;
  /** Extra wait on every answer, in ms (the "slow" scenario sets 1500). */
  latency?: number;
  now?: number;
}

export class DemoWorld {
  private entries: Entries = new Map();
  private notes = new Map<string, Note>();
  private piles: Pile[] = [];
  private questions: Question[] = [];
  private rules: Rule[] = [];
  private suggestions: Suggestion[] = [];
  private trash = new Map<string, Entry[]>();
  private run: RunState | null = null;
  private user: User | null = ALEX;
  private folder: FolderState = 'ready';
  private vaultListeners = new Set<Listener>();
  private runListeners = new Set<Listener>();
  private sessionListeners = new Set<Listener>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private seq = 0;
  readonly scenario: Scenario;
  readonly scale: TimeScale;
  private latency: number;

  constructor(opts: WorldOptions) {
    this.scenario = opts.scenario;
    this.scale = opts.scale;
    this.latency = opts.latency ?? (opts.scenario === 'slow' ? 1500 : opts.scale === 'instant' ? 0 : 90);
    const now = opts.now ?? Date.now();
    if (opts.scenario === 'first') {
      this.folder = 'missing';
    } else {
      this.seedFolder(now);
      this.piles = opts.scenario === 'empty' || opts.scenario === 'back' ? [] : seedPiles(now);
      this.questions = seedQuestions(now);
      this.rules = seedRules(now);
      this.suggestions = seedSuggestions();
    }
    this.syncInbox();
    if (opts.scenario === 'signed-out') this.user = null;
    if (opts.scenario === 'back') this.seedFinishedRun(now);
    if (opts.scenario === 'running') {
      this.run = this.newRun('all', now - 70_000);
      this.run.phase = 'reading';
      this.run.phaseAt = now - 20_000;
      this.run.total = this.inboxCount();
      this.advance('reading', PHASE_MS[this.scale].reading - 20_000);
    }
  }

  /** The inbox folder shows each pile's things as files, as in Drive. */
  private syncInbox(): void {
    for (const p of [...this.entries.keys()]) if (p.startsWith('Inbox/')) this.entries.delete(p);
    const now = Date.now();
    for (const pile of this.piles)
      for (const it of pile.items) {
        const name = freeName(this.entries, 'Inbox', it.name);
        this.entries.set(join('Inbox', name), { path: join('Inbox', name), type: 'file', kind: it.kind, modified: pile.createdAt || now, created: pile.createdAt || now });
      }
  }

  dispose(): void {
    this.timers.forEach(clearTimeout);
  }

  // ---------- setup

  private seedFolder(now: number): void {
    for (const r of PARA_ROOTS) this.entries.set(r, { path: r, type: 'folder', modified: now, created: now - 400 * 86_400_000 });
    for (const s of SEEDS) {
      const folder = s.path.endsWith('/');
      const path = folder ? s.path.slice(0, -1) : s.path;
      const at = seedTime(s.age, now);
      ensureFolders(this.entries, path, at);
      const e: Entry = { path, type: folder ? 'folder' : 'file', modified: at, created: at - 86_400_000 };
      if (!folder) e.kind = s.kind ?? kindOf(path);
      if (s.isNew) e.isNew = true;
      if (s.byBower) e.byBower = true;
      if (s.hub) e.hub = true;
      this.entries.set(path, e);
    }
  }

  private seedFinishedRun(now: number): void {
    const piles = seedPiles(now);
    this.piles = piles;
    const r = this.newRun('all', now - 50 * 60_000);
    this.run = r;
    r.total = this.inboxCount();
    r.report = this.fileInbox(now - 45 * 60_000);
    r.phase = 'done';
    r.phaseAt = now - 45 * 60_000;
    r.finishedAt = r.phaseAt;
  }

  // ---------- plumbing

  private wait<T>(fn: () => T): Promise<T> {
    if (this.scenario === 'offline') return Promise.reject(new BowerError('offline', "You're offline."));
    return new Promise((resolve, reject) => {
      const go = (): void => {
        try {
          resolve(fn());
        } catch (e) {
          reject(e instanceof Error ? e : new BowerError('unknown', String(e)));
        }
      };
      if (!this.latency) queueMicrotask(go);
      else setTimeout(go, this.latency * (0.6 + Math.random() * 0.8));
    });
  }
  private emitVault(): void {
    this.vaultListeners.forEach((l) => l());
  }
  private emitRun(): void {
    this.runListeners.forEach((l) => l());
  }
  private on(set: Set<Listener>, cb: Listener): () => void {
    set.add(cb);
    return () => set.delete(cb);
  }
  private inboxCount(): number {
    return this.piles.reduce((s, p) => s + p.items.length, 0);
  }

  // ---------- notes

  private noteFor(path: string): Note {
    const cached = this.notes.get(path);
    if (cached) return cached;
    const e = this.entries.get(path);
    if (!e || e.type !== 'file') throw new BowerError('not-found', 'That note is no longer there.');
    const seed = NOTES[path];
    const backlinks = Object.entries(NOTES)
      .filter(([p, n]) => p !== path && n.links.includes(path))
      .map(([p]) => p);
    const folder = parentOf(path);
    const note: Note = seed
      ? { ...seed, title: seed.title ?? displayName(nameOf(path)), path, backlinks, byBower: !!e.byBower }
      : {
          path,
          title: displayName(nameOf(path)),
          summary: e.byBower ? `Kept by Bower in ${folder || 'your Bower folder'}.` : '',
          properties: [{ key: 'folder', label: 'Folder', value: folder.replaceAll('/', ' / ') || 'Bower' }],
          tags: [],
          currentState: [],
          body: e.hub
            ? `Everything about ${displayName(nameOf(path))} lives in this folder. Bower keeps this note up to date.`
            : '',
          timeline: e.byBower ? [{ date: new Date(e.modified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), text: 'Filed by Bower.' }] : [],
          links: [],
          backlinks,
          byBower: !!e.byBower,
        };
    this.notes.set(path, note);
    return note;
  }

  // ---------- the tidy-up

  private newRun(scope: 'all' | 'instructions', at: number): RunState {
    return { id: `run-${++this.seq}`, scope, phase: 'queued', requestedAt: at, phaseAt: at, seen: false };
  }

  private advance(phase: 'queued' | 'reading' | 'writing' | 'saving', ms: number): void {
    const next = { queued: 'reading', reading: 'writing', writing: 'saving', saving: 'done' } as const;
    const t = setTimeout(() => {
      const r = this.run;
      if (!r || r.phase !== phase) return;
      const to = next[phase];
      const now = Date.now();
      if (this.scenario === 'fail-run' && to === 'saving') {
        r.phase = 'failed';
        r.phaseAt = now;
        r.finishedAt = now;
        r.failure = 'Bower stopped while writing your notes. Nothing was moved; your inbox is as it was.';
        this.emitRun();
        return;
      }
      r.phase = to;
      r.phaseAt = now;
      if (to === 'reading') r.total = this.inboxCount();
      if (to === 'done') {
        r.report = this.fileInbox(now);
        r.finishedAt = now;
        this.emitVault();
      } else this.advance(to, PHASE_MS[this.scale][to]);
      this.emitRun();
    }, Math.max(0, ms));
    this.timers.push(t);
  }

  /** Files every inbox thing as the run would, and returns the report. */
  private fileInbox(at: number): RunReport {
    const filed: FiledItem[] = [];
    for (const pile of this.piles) {
      for (const item of pile.items) {
        const plan = FILING[item.id] ?? { title: item.name, to: RECEIPTS_TO };
        const folder = plan.to;
        ensureFolders(this.entries, join(folder, 'x'), at);
        if (!this.entries.has(folder)) this.entries.set(folder, { path: folder, type: 'folder', modified: at, created: at });
        const name = freeName(this.entries, folder, plan.title);
        const path = join(folder, name);
        this.entries.set(path, { path, type: 'file', kind: kindOf(name), modified: at, created: at, isNew: true, byBower: kindOf(name) === 'note' });
        const f: FiledItem = { name: item.name, title: displayName(name), kind: item.kind, to: folder };
        if (plan.note) {
          this.entries.set(plan.note, { path: plan.note, type: 'file', kind: 'note', modified: at, created: at, isNew: true, byBower: true });
          f.note = plan.note;
        }
        filed.push(f);
      }
    }
    this.piles = [];
    this.syncInbox();
    const touch = (p: string): void => {
      const e = this.entries.get(p);
      if (e) this.entries.set(p, { ...e, modified: at, isNew: true });
      this.notes.delete(p);
    };
    const updated = [
      { path: 'Projects/Flat hunt/Flat hunt.md', what: 'A fourth flat added; the shortlist compared by commute.' },
      { path: 'Projects/Job hunt/Job hunt.md', what: 'New offer from Fabrikam, scored 7 out of 10 against your CV.' },
    ];
    updated.forEach((u) => touch(u.path));
    return {
      filed,
      created: filed.filter((f) => f.note).map((f) => ({ path: f.note ?? '', what: `A note for ${f.title}.` })),
      updated,
      setAside: [],
      questions: this.questions,
    };
  }

  // ---------- the doors

  sources(): Sources {
    return { session: this.session(), vault: this.vault(), runs: this.runs() };
  }

  private session(): Session {
    return {
      current: () => this.wait(() => this.user),
      signIn: () =>
        this.wait(() => {
          this.user = ALEX;
          this.sessionListeners.forEach((l) => l());
          return ALEX;
        }),
      signOut: () =>
        this.wait(() => {
          this.user = null;
          this.sessionListeners.forEach((l) => l());
        }),
      folderState: () => this.wait(() => this.folder),
      createFolder: async (onStep) => {
        const step = this.scale === 'instant' ? 0 : 650;
        for (const r of PARA_ROOTS) {
          await new Promise((res) => setTimeout(res, step));
          const now = Date.now();
          this.entries.set(r, { path: r, type: 'folder', modified: now, created: now });
          onStep(r as ParaRoot);
        }
        const now = Date.now();
        this.entries.set('Rules.md', { path: 'Rules.md', type: 'file', kind: 'note', modified: now, created: now });
        this.entries.set('About me.md', { path: 'About me.md', type: 'file', kind: 'note', modified: now, created: now });
        this.folder = 'ready';
        this.sessionListeners.forEach((l) => l());
        this.emitVault();
      },
      subscribe: (cb) => this.on(this.sessionListeners, cb),
    };
  }

  private vault(): VaultSource {
    const change = <T>(fn: () => T): Promise<T> =>
      this.wait(() => {
        const out = fn();
        this.emitVault();
        return out;
      });
    return {
      tree: () => this.wait(() => buildTree(this.entries)),
      note: (path) => this.wait(() => this.noteFor(path)),
      move: (path, to) =>
        change(() => {
          const out = moveEntry(this.entries, path, to, Date.now());
          this.notes.delete(path);
          return out;
        }),
      rename: (path, name) =>
        change(() => {
          const out = renameEntry(this.entries, path, name, Date.now());
          const n = this.notes.get(path);
          this.notes.delete(path);
          if (n) this.notes.set(out, { ...n, path: out, title: displayName(nameOf(out)) });
          return out;
        }),
      create: (folder, type, name) =>
        change(() => {
          const now = Date.now();
          const base = name ?? (type === 'folder' ? 'New folder' : 'Untitled.md');
          const path = join(folder, freeName(this.entries, folder, base));
          this.entries.set(path, type === 'folder' ? { path, type, modified: now, created: now } : { path, type: 'file', kind: 'note', modified: now, created: now });
          return path;
        }),
      trash: (path) =>
        change(() => {
          this.trash.set(path, removeEntry(this.entries, path));
        }),
      restore: (path) =>
        change(() => {
          const gone = this.trash.get(path);
          if (!gone) throw new BowerError('not-found', 'It is no longer in the Bin.');
          gone.forEach((e) => this.entries.set(e.path, e));
          this.trash.delete(path);
        }),
      markSeen: (path) =>
        change(() => {
          const e = this.entries.get(path);
          if (e?.isNew) this.entries.set(path, { ...e, isNew: false });
        }),
      piles: () => this.wait(() => this.piles.map((p) => ({ ...p, items: [...p.items] }))),
      addPile: (input) =>
        change(() => {
          if (!input.items.length && !input.text.trim()) throw new BowerError('conflict', 'Add a file, a link or a line first.');
          const pile: Pile = {
            id: `p${Date.now()}`,
            text: input.text.trim(),
            createdAt: Date.now(),
            items: input.items.map((it, i) => ({ ...it, id: `n${Date.now()}-${i}` })),
          };
          this.piles = [pile, ...this.piles];
          this.syncInbox();
          return pile;
        }),
      removePile: (id) =>
        change(() => {
          if (this.run && !['done', 'failed'].includes(this.run.phase)) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
          this.piles = this.piles.filter((p) => p.id !== id);
          this.syncInbox();
        }),
      questions: () => this.wait(() => [...this.questions]),
      answer: (id) =>
        change(() => {
          this.questions = this.questions.filter((q) => q.id !== id);
        }),
      rules: () => this.wait(() => [...this.rules]),
      addRule: (text) =>
        change(() => {
          const r: Rule = { id: `u${Date.now()}`, text: text.trim(), since: Date.now() };
          this.rules = [r, ...this.rules];
          return r;
        }),
      suggestions: () => this.wait(() => [...this.suggestions]),
      dismissSuggestion: (id, keep) =>
        change(() => {
          const s = this.suggestions.find((x) => x.id === id);
          this.suggestions = this.suggestions.filter((x) => x.id !== id);
          if (keep && s) this.rules = [{ id: `u${Date.now()}`, text: s.title, since: Date.now() }, ...this.rules];
        }),
      subscribe: (cb) => this.on(this.vaultListeners, cb),
    };
  }

  private runs(): RunSource {
    return {
      start: (scope) =>
        this.wait(() => {
          if (this.run && !['done', 'failed'].includes(this.run.phase)) return this.run;
          if (!this.inboxCount()) throw new BowerError('conflict', 'Nothing is waiting in the inbox.');
          this.run = this.newRun(scope, Date.now());
          this.advance('queued', PHASE_MS[this.scale].queued);
          this.emitRun();
          return this.run;
        }),
      current: () => this.wait(() => (this.run ? { ...this.run } : null)),
      markSeen: (id) =>
        this.wait(() => {
          if (this.run?.id === id) {
            this.run.seen = true;
            this.emitRun();
          }
        }),
      subscribe: (cb) => this.on(this.runListeners, cb),
    };
  }
}
