import { checkedAnswer, type QuestionAnswer } from '../contracts/questions';
/**
 * The demo: Alex's Bower folder in memory, behind the same doors the real
 * Drive and Worker will use. Moves and renames change the tree for real; a
 * tidy-up walks the real phases on a time scale and then files the inbox.
 */
import type { RunSource, Session, Sources, VaultSource } from '../sources';
import {
  buildTree,
  checkCreationName,
  displayName,
  thingName,
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
  type ChangeEntry,
  type ChangeKind,
  type FolderState,
  type Note,
  type ParaRoot,
  type Pile,
  type Question,
  type Request,
  type Rule,
  type SearchHit,
  type RunReport,
  type RunState,
  type Suggestion,
  type User,
} from '../types';
import {
  ALEX,
  FILING,
  HUB_UPDATES,
  MERGES,
  NOT_LOOKED_UP,
  saltmereQuestion,
  scriptedRequest,
  guessFolder,
  wordRule,
  type SamplePile,
  NOTES,
  SEEDS,
  seedPiles,
  seedQuestions,
  seedRules,
  seedSuggestions,
  seedTime,
} from './fixture';
import { NOTHING_DONE, NOTHING_LOOKED_UP } from '../spine/scripted';
import { keepSignedIn, keptSignedIn, PHASE_MS, type Scenario, type TimeScale } from './scenario';
import { placeOf, plainSnippet, plainText, searchLines } from '../search-text';
import { TASK_LINE } from '../tasks';
import { parseNote, serializeNote } from '../vault/note-format';
import { forgetThisPerson, sayGoodbye } from '../device';
import { ruleLike } from '../rules';
import { formerNames, rewriteLinks } from '../links';
import { shortDay } from '../dates';
import { PILE_NOTE, pileFolderName, pileHasFolder, pileName, safeInboxName, thingsIn } from '../piles';
import { SET_ASIDE_TEXT } from '../pile-readiness';
import { createUploadQueue, broadcastBus, type UploadQueue } from '../upload-queue';
import { indexedDbUploadStore, memoryUploadStore } from '../upload-store';
import { FakeDrive } from '../drive/fake-drive';
import { sha256, sha256Sync } from '../vault/hashes';

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
  /** Where each saved link the demo filed points. */
  private links = new Map<string, string>();
  private piles: Pile[] = [];
  private questions: Question[] = [];
  private rules: Rule[] = [];
  private suggestions: Suggestion[] = [];
  private trash = new Map<string, { entries: Entry[]; pile: { pile: Pile; at: number } | null; change: string | null }>();
  private requests: Request[] = [];
  /** Whether the running tidy-up may look things up on the web (Settings); the demo never does. */
  private allowWeb = false;
  /** Where each pile sits in the inbox (folder or lone file), set by syncInbox. */
  private pilePath = new Map<string, string>();
  private journal: ChangeEntry[] = [];
  /** Your answers to Bower's questions, read by the next tidy-up. */
  private answers = new Map<string, QuestionAnswer>();
  /** Where each inbox thing goes in the next tidy-up (the demo's stand-in for Claude). */
  private plans = new Map<string, { title: string; to: string; note?: string }>(Object.entries(FILING));
  private run: RunState | null = null;
  private user: User | null = ALEX;
  private folder: FolderState = 'ready';
  private vaultListeners = new Set<Listener>();
  private runListeners = new Set<Listener>();
  private sessionListeners = new Set<Listener>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private seq = 0;
  private uploads: Promise<{ queue: UploadQueue; inbox: string }> | null = null;
  private disposed = false;

  /** Demo file fixtures use the same device queue as production, including its reload and purge paths. */
  private uploadFixture(): Promise<{ queue: UploadQueue; inbox: string }> {
    if (!this.uploads) this.uploads = (async () => {
      const drive = new FakeDrive();
      const root = await drive.createFolder('root', 'Bower');
      const inbox = await drive.createFolder(root.id, 'Inbox');
      const bus = broadcastBus();
      const queue = createUploadQueue({ drive,
        store: typeof indexedDB === 'undefined' ? memoryUploadStore() : indexedDbUploadStore(),
        ...(navigator.locks ? { locks: navigator.locks } : {}),
        ...(navigator.storage ? { storage: navigator.storage } : {}),
        ...(bus ? { bus } : {}),
      });
      queue.subscribe(() => this.emitVault());
      await queue.start(sha256Sync(ALEX.email), `demo:${this.scenario}`);
      if (this.disposed) queue.stop();
      return { queue, inbox: inbox.id };
    })();
    return this.uploads;
  }

  private async fixturePiles(): Promise<Pile[]> {
    // Tests without browser storage keep today's purely in-memory demo until a file is added.
    if (!this.uploads && typeof indexedDB === 'undefined') return this.piles;
    const { queue } = await this.uploadFixture();
    const piles = this.piles.map((pile) => ({ ...pile, items: [...pile.items] }));
    for (const item of queue.items()) {
      let pile = piles.find((p) => p.id === item.pileId);
      if (!pile) {
        // Completed demo files follow today's in-memory folder: filing or removing one must not restore it.
        if (item.state === 'done') continue;
        pile = { id: item.pileId, text: item.appProperties.demoText ?? '', createdAt: Date.parse(item.addedAt), items: [] };
        piles.push(pile);
      }
      const old = pile.items.find((it) => it.id === item.memberKey);
      const row = { id: item.memberKey, name: item.name, kind: old?.kind ?? kindOf(item.name),
        origin: old?.origin ?? item.appProperties.origin ?? 'From this computer',
        ...(item.state === 'done' ? {} : { upload: item.state === 'failed' ? -1 : item.size ? Math.min(item.sent / item.size, 0.99) : 0 }),
      };
      pile.items = [...pile.items.filter((it) => it.id !== item.memberKey), row];
    }
    return piles;
  }

  private async forgetUploads(): Promise<void> {
    if (!this.uploads && typeof indexedDB === 'undefined') return;
    try { await (await this.uploadFixture()).queue.forgetAccount(sha256Sync(ALEX.email)); }
    catch (e) {
      console.error(e);
      throw new BowerError('unknown', 'Signing out did not finish. Try again.');
    }
  }
  /** The fail-run scenario fails one tidy-up; trying again works. */
  private failedOnce = false;
  /** The piles a run took when it started; piles added later wait for the next one. */
  private runPiles = new Set<string>();
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
    const kept = keptSignedIn();
    if (kept !== null) this.user = kept ? ALEX : null;
    if (opts.scenario === 'back' || opts.scenario === 'slow-report') this.seedFinishedRun(now);
    if (opts.scenario === 'slow-report') {
      // A finished run's report, and new piles waiting since: the Inbox and the report are both on Home.
      this.piles = seedPiles(now);
      this.syncInbox();
    }
    if (opts.scenario === 'running') {
      this.run = this.newRun('all', now - 70_000);
      this.run.phase = 'reading';
      this.run.phaseAt = now - 20_000;
      this.run.total = this.inboxCount();
      this.advance('reading', PHASE_MS[this.scale].reading - 20_000);
    }
  }

  /**
   * The inbox as it is in Drive: a pile with a note, or more than one thing,
   * is a subfolder with its things and `Pile note.md`; a lone thing sits at
   * the root (see data/piles.ts).
   */
  private syncInbox(): void {
    for (const p of [...this.entries.keys()]) if (p.startsWith('Inbox/')) {
      this.entries.delete(p);
      this.notes.delete(p);
    }
    const now = Date.now();
    this.pilePath.clear();
    for (const pile of this.piles) {
      const at = pile.createdAt || now;
      let folder = 'Inbox';
      if (pileHasFolder(pile)) {
        folder = join('Inbox', freeName(this.entries, 'Inbox', pileFolderName(pile)));
        this.entries.set(folder, { path: folder, type: 'folder', modified: at, created: at });
        if (pile.text.trim()) {
          const notePath = join(folder, PILE_NOTE);
          this.entries.set(notePath, { path: notePath, type: 'file', kind: 'note', modified: at, created: at });
          this.notes.set(notePath, {
            path: notePath,
            title: 'Pile note',
            summary: 'What you wrote about this pile. Bower reads it with every thing in the pile.',
            properties: [{ key: 'kind', label: 'Kind', value: 'Pile note' }],
            tags: [],
            currentState: [],
            body: pile.text,
            timeline: [],
            links: [],
            backlinks: [],
            byBower: false,
          });
        }
      }
      for (const it of pile.items) {
        const name = freeName(this.entries, folder, safeInboxName(it));
        this.entries.set(join(folder, name), { path: join(folder, name), type: 'file', kind: it.kind, modified: at, created: at });
        if (folder === 'Inbox') this.pilePath.set(pile.id, join(folder, name));
      }
      if (folder !== 'Inbox') this.pilePath.set(pile.id, folder);
    }
  }


  /** Keeps every note's content when it or its folder moves (cached or not). */
  private carryNotes(from: string, to: string): void {
    const under = (p: string): boolean => p === from || p.startsWith(`${from}/`);
    const affected = [...this.entries.values()].filter((e) => e.type === 'file' && e.kind === 'note' && under(e.path)).map((e) => e.path);
    const contents = affected.map((p) => [p, this.noteFor(p)] as const);
    for (const [p, n] of contents) {
      this.notes.delete(p);
      const np = to + p.slice(from.length);
      this.notes.set(np, { ...n, path: np, title: p === from ? displayName(nameOf(np)) : n.title });
    }
    // Notes that link to what moved keep pointing at it.
    const moved = (l: string): string => (under(l) ? to + l.slice(from.length) : l);
    for (const e of this.entries.values()) {
      if (e.type !== 'file' || e.kind !== 'note' || under(e.path)) continue;
      const n = this.notes.get(e.path) ?? (NOTES[e.path] ? this.noteFor(e.path) : null);
      if (n?.links.some(under)) this.notes.set(e.path, { ...n, links: n.links.map(moved) });
    }
  }

  /** The notes whose links name `path` now (renames and moves included). */
  private backlinksOf(path: string): string[] {
    const out: string[] = [];
    for (const e of this.entries.values()) {
      if (e.type !== 'file' || e.kind !== 'note' || e.path === path) continue;
      const links = this.notes.get(e.path)?.links ?? NOTES[e.path]?.links ?? [];
      if (links.includes(path)) out.push(e.path);
    }
    return out;
  }

  /** A tidy-up writes the names notes have now into the [[links]] that named them before. */
  private followRenames(): void {
    const taken = new Set([...this.entries.values()].filter((e) => e.type === 'file' && e.kind === 'note').map((e) => displayName(nameOf(e.path)).toLowerCase()));
    const former = formerNames(this.journal, taken);
    if (!former.size) return;
    for (const e of [...this.entries.values()]) {
      if (e.type !== 'file' || e.kind !== 'note' || e.path === 'Rules.md') continue;
      const n = this.noteFor(e.path);
      const next = {
        ...n,
        body: rewriteLinks(n.body, former),
        currentState: n.currentState.map((l) => rewriteLinks(l, former)),
        timeline: n.timeline.map((t) => ({ ...t, text: rewriteLinks(t.text, former) })),
      };
      if (JSON.stringify(next) !== JSON.stringify(n)) this.notes.set(e.path, next);
    }
  }

  private touchRules(): void {
    const e = this.entries.get('Rules.md');
    if (e) this.entries.set('Rules.md', { ...e, modified: Date.now() });
  }

  dispose(): void {
    this.disposed = true;
    void this.uploads?.then(({ queue }) => queue.stop(), (e: unknown) => console.error(e));
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
    return this.piles.reduce((s, p) => s + thingsIn(p), 0);
  }

  private record(kind: ChangeKind, what: string, path?: string, from?: string): string {
    const id = `c${++this.seq}`;
    this.journal.push({ id, at: Date.now(), kind, what, ...(path ? { path } : {}), ...(from ? { from } : {}) });
    return id;
  }
  private unrecord(id: string | null | undefined): void {
    if (id) this.journal = this.journal.filter((c) => c.id !== id);
  }

  /** Where a thing from a pile you added goes: the demo guesses from the pile's words. */
  private guess(text: string, kind: string): string {
    return guessFolder(text, kind);
  }

  /** A demo-only door: adds one of the sample piles, with where its things go. */
  addSample(sample: SamplePile): void {
    const at = Date.now();
    const id = `s${++this.seq}`;
    const items = sample.items.map((it, i) => {
      const itemId = `${id}-${i}`;
      this.plans.set(itemId, { title: it.title, to: it.to });
      return { id: itemId, name: it.name, kind: it.kind, origin: it.origin, ...(it.changed ? { changed: it.changed } : {}) };
    });
    if (sample.note) this.plans.set(`${id}-note`, sample.note);
    this.piles = [{ id, text: sample.text, createdAt: at, items, ...(sample.setAside ? { setAside: sample.setAside } : {}) }, ...this.piles];
    this.syncInbox();
    this.emitVault();
  }

  /** Rules.md, written from the rules: Bower's wording, with your words under it. */
  private rulesNote(): Note {
    const e = this.entries.get('Rules.md');
    const done = this.rules.filter((r) => !r.pending);
    const pending = this.rules.filter((r) => r.pending);
    const body = [
      '## Rules',
      '',
      ...done.flatMap((r) => [`- ${r.text}`, ...(r.yourWords ? [`  *You wrote: "${r.yourWords}"*`] : [])]),
      ...(pending.length ? ['', '## Waiting for the next tidy-up', '', ...pending.map((r) => `- "${r.text}"`)] : []),
    ].join('\n');
    return {
      path: 'Rules.md',
      title: 'Rules',
      summary: `${done.length} rules Bower follows in every tidy-up.`,
      properties: [{ key: 'kind', label: 'Kind', value: 'Rules' }],
      tags: [],
      currentState: [],
      body,
      timeline: [],
      links: [],
      backlinks: [],
      byBower: !!e?.byBower,
    };
  }

  // ---------- notes

  private noteFor(path: string): Note {
    if (path === 'Rules.md' && this.entries.has(path)) return this.rulesNote();
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
          timeline: e.byBower ? [{ date: shortDay(e.modified), text: 'Filed by Bower.' }] : [],
          links: [],
          backlinks,
          byBower: !!e.byBower,
        };
    // Seeded template notes use the same body order and ownership projection as Drive reads.
    const parsed = parseNote(path, serializeNote(note));
    if (parsed.taskRegions) {
      note.body = parsed.body;
      note.taskRegions = parsed.taskRegions;
    }
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
      if (this.scenario === 'fail-run' && to === 'saving' && !this.failedOnce) {
        this.failedOnce = true;
        r.phase = 'failed';
        r.phaseAt = now;
        r.finishedAt = now;
        r.failure = 'Bower stopped while writing your notes. Nothing was moved; your inbox is as it was.';
        this.emitRun();
        return;
      }
      r.phase = to;
      r.phaseAt = now;
      if (to === 'reading') r.total = this.piles.filter((p) => this.runPiles.has(p.id)).reduce((n, p) => n + thingsIn(p), 0);
      if (to === 'done') {
        this.followRenames();
        const yourChanges = this.journal.length;
        r.report = r.scope === 'all' ? this.fileInbox(now) : { filed: [], created: [], updated: [], setAside: [], questions: [] };
        r.report.yourChanges = yourChanges;
        // A request whose done line says it did nothing is not called done (qa6, qa7).
        const asked = this.requests.filter((q) => !q.done && ![NOTHING_DONE, NOTHING_LOOKED_UP].some((w) => this.answerOf(q.text).startsWith(w))).map((q) => q.text);
        const worded = this.rules.filter((x) => x.pending).length;
        if (asked.length) r.report.requests = asked;
        if (worded) r.report.rulesWorded = worded;
        // Each change counts once: the rules the report names are not among the rest, and a request never counts (qa7).
        r.report.yourChanges = yourChanges - this.journal.filter((c) => c.kind === 'request').length - worded;
        this.rules = this.rules.map((x) => (x.pending ? { ...x, text: wordRule(x.yourWords ?? x.text), pending: false } : x));
        this.requests = this.requests.map((q) => (q.done ? q : { ...q, done: this.answerOf(q.text) }));
        this.journal = [];
        r.finishedAt = now;
        this.emitVault();
      } else this.advance(to, PHASE_MS[this.scale][to]);
      this.emitRun();
    }, Math.max(0, ms));
    this.timers.push(t);
  }

  /** A request's done line, as the pretend runner writes it: a scripted answer when its notes are there (C09, C10). */
  private answerOf(text: string): string {
    const scripted = scriptedRequest(text);
    const there = (path: string): boolean => this.entries.get(path)?.type === 'file';
    // The demo never looks anything up, so it says so, web on or off (C10).
    if (scripted?.kind === 'lookup') return this.allowWeb ? NOTHING_LOOKED_UP : NOT_LOOKED_UP;
    // Nor does it write a comparison (C08): it never names a note it did not write. It acts on no request (qa7).
    if (scripted?.kind !== 'answer') return NOTHING_DONE;
    return scripted.uses.every(there) ? scripted.answer : NOTHING_DONE;
  }

  /** Files every inbox thing as the run would, and returns the report. */
  private fileInbox(at: number): RunReport {
    const filed: FiledItem[] = [];
    // The notes this run wrote, worded as the run over Drive words them; a note a thing joined is not one of them.
    const created: RunReport['created'] = [];
    // The notes this run brought up to date: a Timeline line added once, the note marked new, one row for each note.
    // A line already there (the same words, and the same source when it cites one, from any run) is not added, marked
    // or reported again, as the run over Drive does. A line citing a note links to it (C06).
    const updated: RunReport['updated'] = [];
    const addLine = (path: string, what: string, cite?: { source: string; path: string }): void => {
      const e = this.entries.get(path);
      if (!e) return;
      const n = this.noteFor(path);
      // A line with nothing to cite is there already when its words are, with or without a source (C06).
      if (n.timeline.some((t) => t.text === what && (cite === undefined || t.source === cite.source))) return;
      const links = cite && cite.path.endsWith('.md') && !n.links.includes(cite.path) ? [...n.links, cite.path] : n.links;
      this.notes.set(path, { ...n, links, timeline: [...n.timeline, { date: 'Today', text: what, ...(cite ? { source: cite.source } : {}) }] });
      this.entries.set(path, { ...e, modified: at, isNew: true });
      if (!updated.some((u) => u.path === path)) updated.push({ path, what });
    };
    /** What a hub's Timeline line cites for each thing filed now, by the name it was added under (C06). */
    const cited = new Map<string, { source: string; path: string }>();
    // A pile set aside stays in the inbox, with its reason, as a tidy-up over Drive leaves it.
    const aside = this.piles.filter((p) => p.setAside);
    const taken = this.piles.filter((p) => !p.setAside && (!this.runPiles.size || this.runPiles.has(p.id)));
    for (const pile of taken) {
      if (!pile.items.length && pile.text.trim()) {
        const plan = this.plans.get(`${pile.id}-note`) ?? { title: `${pile.text.trim().slice(0, 48).replace(/[/\\:*?"<>|]+/g, ' ')}.md`, to: this.guess(pile.text, 'note') };
        ensureFolders(this.entries, join(plan.to, 'x'), at);
        const name = freeName(this.entries, plan.to, plan.title);
        const path = join(plan.to, name);
        this.entries.set(path, { path, type: 'file', kind: 'note', modified: at, created: at, isNew: true, byBower: true });
        this.notes.set(path, {
          path,
          title: displayName(name),
          summary: 'Written from a note you added.',
          properties: [{ key: 'kind', label: 'Kind', value: 'Note' }],
          tags: [],
          currentState: [],
          body: pile.text.trim(),
          timeline: [{ date: 'Today', text: 'Written from a note you added.' }],
          links: [],
          backlinks: [],
          byBower: true,
        });
        filed.push({ name: 'Your note', title: displayName(name), kind: 'note', to: plan.to, note: path });
        created.push({ path, what: 'Written from a note you added.' });
        continue;
      }
      for (const item of pile.items) {
        const merge = MERGES.find((m) => m.item === item.name && this.answers.get(m.question) === true);
        if (merge) {
          // You said yes to keeping one note: the thing joins that note instead of making its own.
          const folder = parentOf(merge.into);
          const name = freeName(this.entries, folder, merge.title);
          this.entries.set(join(folder, name), { path: join(folder, name), type: 'file', kind: item.kind, modified: at, created: at, isNew: true });
          if (item.kind === 'link') this.links.set(join(folder, name), `https://${item.name}`);
          addLine(merge.into, merge.line);
          filed.push({ name: item.name, title: displayName(nameOf(merge.into)), kind: item.kind, to: folder, note: merge.into });
          continue;
        }
        const plan = this.plans.get(item.id) ?? { title: item.name, to: this.guess(`${pile.text} ${item.name}`, item.kind) };
        const folder = plan.to;
        ensureFolders(this.entries, join(folder, 'x'), at);
        if (!this.entries.has(folder)) this.entries.set(folder, { path: folder, type: 'folder', modified: at, created: at });
        const name = freeName(this.entries, folder, plan.title);
        const path = join(folder, name);
        this.entries.set(path, { path, type: 'file', kind: kindOf(name), modified: at, created: at, isNew: true, byBower: kindOf(name) === 'note' });
        if (item.kind === 'link') this.links.set(path, `https://${item.name}`);
        // A saved link filed as a note is a note this run wrote, as over Drive.
        if (item.kind === 'link' && kindOf(name) === 'note') created.push({ path, what: 'A link you saved.' });
        const f: FiledItem = { name: item.name, title: thingName(name), kind: item.kind, to: folder };
        cited.set(item.name, plan.note ? { source: displayName(nameOf(plan.note)), path: plan.note } : { source: kindOf(name) === 'note' ? displayName(name) : name, path });
        if (plan.note) {
          // A note already in the folder is joined, not written: it stays as it was, and is not new.
          if (!this.entries.has(plan.note)) {
            this.entries.set(plan.note, { path: plan.note, type: 'file', kind: 'note', modified: at, created: at, isNew: true, byBower: true });
            created.push({ path: plan.note, what: `A note for ${thingName(name)}.` });
          }
          f.note = plan.note;
        }
        filed.push(f);
      }
    }
    this.piles = this.piles.filter((p) => !taken.includes(p));
    this.runPiles = new Set();
    this.syncInbox();
    // Each hub gets its lines, citing what this tidy-up filed for it, as the pretend runner writes them (C06).
    for (const u of HUB_UPDATES) {
      const cite = u.cites === undefined ? undefined : cited.get(u.cites);
      if (!u.onlyCited || cite) addLine(u.path, u.what, cite);
    }
    // In path order, as the run over Drive plans its note edits.
    updated.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    // Only the questions this tidy-up asked; the open ones stay on Home.
    const asked = taken.some((p) => /saltmere/i.test(p.text)) && !this.questions.some((q) => q.id === 'q-saltmere') ? [saltmereQuestion(at)] : [];
    this.questions = [...this.questions, ...asked];
    return {
      filed,
      created,
      updated,
      setAside: aside.flatMap((p) => (p.setAside ? [{ name: pileName(p), why: SET_ASIDE_TEXT[p.setAside] }] : [])),
      questions: asked,
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
          keepSignedIn(true);
          this.sessionListeners.forEach((l) => l());
          return ALEX;
        }),
      deleteAccount: async () => {
        await this.forgetUploads();
        return this.wait(() => {
          // The demo forgets Alex as the Worker would, and which folder was theirs; the made-up folder stays, as a Drive folder would.
          this.user = null;
          this.folder = 'missing';
          keepSignedIn(false);
          forgetThisPerson();
          sayGoodbye();
          this.sessionListeners.forEach((l) => l());
        });
      },
      signOut: async () => {
        await this.forgetUploads();
        return this.wait(() => {
          this.user = null;
          keepSignedIn(false);
          forgetThisPerson();
          sayGoodbye('signed-out');
          this.sessionListeners.forEach((l) => l());
        });
      },
      folderState: () => this.wait(() => this.folder),
      createFolder: async (onStep) => {
        // After a deleted account the made-up folder is still there: it is found, not made.
        const found = this.entries.has('Rules.md');
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
        return { found };
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
      driveLinks: false,
      pendingUploadCount: async () => (await this.uploadFixture()).queue.pendingCount?.() ?? 0,
      driveLink: async () => null,
      tree: () => this.wait(() => buildTree(this.entries)),
      note: (path) => this.wait(() => ({ ...this.noteFor(path), backlinks: this.backlinksOf(path) })),
      move: (path, to, opts) =>
        change(() => {
          const folder = this.entries.get(path)?.type === 'folder';
          const before = new Map(this.entries);
          const out = moveEntry(before, path, to, Date.now());
          this.carryNotes(path, out);
          this.entries = before;
          if (out !== path) {
            const last = [...this.journal].reverse().find((c) => c.kind === 'move' && c.path === path);
            if (opts?.undo && last) this.unrecord(last.id);
            else this.record('move', `Moved ${(folder ? nameOf(path) : thingName(nameOf(path)))} to ${to.replaceAll('/', ' / ') || 'your Bower folder'}`, out, path);
          }
          return out;
        }),
      rename: (path, name) =>
        change(() => {
          const folder = this.entries.get(path)?.type === 'folder';
          const next = new Map(this.entries);
          const out = renameEntry(next, path, name, Date.now());
          this.carryNotes(path, out);
          this.entries = next;
          if (out !== path) {
            // A thing made since the last tidy-up and named now is one change: its making, under its name.
            const made = this.journal.find((c) => c.kind === 'create' && c.path === path);
            if (made) {
              this.unrecord(made.id);
              const type = this.entries.get(out)?.type === 'folder' ? 'folder' : 'note';
              this.record('create', `New ${type} "${(folder ? nameOf(out) : thingName(nameOf(out)))}" in ${parentOf(out).replaceAll('/', ' / ') || 'your Bower folder'}`, out);
            } else this.record('rename', `Renamed ${(folder ? nameOf(path) : thingName(nameOf(path)))} to ${(folder ? nameOf(out) : thingName(nameOf(out)))}`, out, path);
          }
          return out;
        }),
      create: (folder, type, name) =>
        change(() => {
          const now = Date.now();
          const base = name ?? (type === 'folder' ? 'New folder' : 'Untitled.md');
          checkCreationName(base, type);
          const path = join(folder, freeName(this.entries, folder, base));
          this.entries.set(path, type === 'folder' ? { path, type, modified: now, created: now } : { path, type: 'file', kind: 'note', modified: now, created: now });
          this.record('create', `New ${type} "${(type === 'folder' ? nameOf(path) : thingName(nameOf(path)))}" in ${folder.replaceAll('/', ' / ') || 'your Bower folder'}`, path);
          return path;
        }),
      trash: (path) =>
        change(() => {
          if (path === 'Inbox' || path.startsWith('Inbox/')) {
            // A pile goes to the Bin as a whole: its folder, or its lone file.
            const pile = this.piles.find((p) => {
              const pp = this.pilePath.get(p.id);
              return pp && (path === pp || path.startsWith(`${pp}/`) || pp.startsWith(`${path}/`));
            });
            if (!pile) throw new BowerError('not-found', 'That is no longer in the inbox.');
            if (this.run && !['done', 'failed'].includes(this.run.phase)) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
            const at = this.piles.indexOf(pile);
            const entries = removeEntry(this.entries, this.pilePath.get(pile.id) ?? path);
            this.piles = this.piles.filter((p) => p.id !== pile.id);
            this.syncInbox();
            this.trash.set(path, { entries, pile: { pile, at }, change: null });
            return;
          }
          const entries = removeEntry(this.entries, path);
          // Something made and binned before any tidy-up saw it leaves no trace in the journal.
          const made = this.journal.find((c) => c.kind === 'create' && c.path === path);
          if (made) {
            this.unrecord(made.id);
            this.trash.set(path, { entries, pile: null, change: null });
            return;
          }
          const folder = entries.find((e) => e.path === path)?.type === 'folder';
          const id = this.record('trash', `Put ${(folder ? nameOf(path) : thingName(nameOf(path)))} in the Bin`, path);
          this.trash.set(path, { entries, pile: null, change: id });
        }),
      restore: (path) =>
        change(() => {
          const gone = this.trash.get(path);
          if (!gone) throw new BowerError('not-found', 'It is no longer in the Bin.');
          if (gone.pile) {
            const { pile, at } = gone.pile;
            if (!this.piles.some((p) => p.id === pile.id)) {
              const next = [...this.piles];
              next.splice(Math.min(at, next.length), 0, pile);
              this.piles = next;
            }
            this.syncInbox();
          } else {
            // The name may have been taken since: come back under a free one, never over it.
            const folder = parentOf(path);
            const back = join(folder, freeName(this.entries, folder, nameOf(path)));
            if (folder && !this.entries.has(folder)) ensureFolders(this.entries, join(folder, 'x'), Date.now());
            gone.entries.forEach((e) => {
              const p = back + e.path.slice(path.length);
              this.entries.set(p, { ...e, path: p });
              const n = this.notes.get(e.path);
              if (n && p !== e.path) this.notes.set(p, { ...n, path: p });
            });
          }
          this.unrecord(gone.change);
          this.trash.delete(path);
        }),
      markSeen: (path) =>
        change(() => {
          const e = this.entries.get(path);
          if (e?.isNew) this.entries.set(path, { ...e, isNew: false });
        }),
      uploadNotice: async () => this.uploads ? (await this.uploads).queue.notice() : null,
      piles: async () => {
        const piles = await this.fixturePiles();
        return this.wait(() =>
          piles
            .map((p) => {
              const path = this.pilePath.get(p.id);
              return { ...p, items: [...p.items], ...(path ? { path } : {}) };
            })
            .sort((a, b) => b.createdAt - a.createdAt),
        );
      },
      addPile: async (input) => {
        const pile = await change(() => {
          if (!input.items.length && !input.text.trim()) throw new BowerError('conflict', 'Add a file, a link or a line first.');
          const pile: Pile = {
            id: `p${Date.now()}`,
            text: input.text.trim(),
            createdAt: Date.now(),
            items: input.items.map((it, i) => ({ name: it.name, kind: it.kind, origin: it.origin, id: `n${Date.now()}-${i}` })),
          };
          this.piles = [pile, ...this.piles];
          this.syncInbox();
          return pile;
        });
        if (input.items.some((it) => it.body)) {
          const { queue, inbox } = await this.uploadFixture();
          for (const [i, it] of input.items.entries()) {
            if (!it.body) continue;
            const member = pile.items[i];
            if (!member) continue;
            await queue.add({ declarationId: pile.id, pileId: pile.id, memberKey: member.id,
              parentId: inbox, name: it.name, body: it.body, sha256: await sha256(it.body),
              appProperties: { demoText: pile.text, origin: it.origin },
            });
          }
          this.emitVault();
        }
        return pile;
      },
      updatePile: (id, text) =>
        change(() => {
          if (this.run && !['done', 'failed'].includes(this.run.phase)) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
          const p = this.piles.find((x) => x.id === id);
          if (!p) throw new BowerError('not-found', 'That pile is already filed.');
          if (!p.items.length && !text.trim()) throw new BowerError('conflict', 'A pile with no files needs its note.');
          const next = { ...p, text: text.trim() };
          this.piles = this.piles.map((x) => (x.id === id ? next : x));
          this.syncInbox();
          return { ...next, items: [...next.items] };
        }),
      removePile: async (id) => {
        if (this.run && !['done', 'failed'].includes(this.run.phase)) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
        if (this.uploads) {
          const { queue } = await this.uploads;
          for (const item of queue.items().filter((it) => it.pileId === id)) await queue.discard(item.id);
        }
        return change(() => {
          if (this.run && !['done', 'failed'].includes(this.run.phase)) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
          const at = this.piles.findIndex((p) => p.id === id);
          const pile = this.piles[at];
          // Kept where Undo (`restore`) looks: by its place, or by its id when it has none.
          if (pile) this.trash.set(this.pilePath.get(id) ?? id, { entries: [], pile: { pile, at }, change: null });
          this.piles = this.piles.filter((p) => p.id !== id);
          this.syncInbox();
        });
      },
      retryPile: async () => {
        if (this.uploads) (await this.uploads).queue.retry();
        return this.wait(() => undefined);
      },
      // The demo knows files by name only: the same name outside the inbox is "already there".
      duplicates: (files) =>
        this.wait(() =>
          files.map((f) => {
            const name = f.name.toLowerCase();
            const hit = [...this.entries.values()].find((e) => e.type === 'file' && !e.path.startsWith('Inbox/') && nameOf(e.path).toLowerCase() === name);
            return hit?.path ?? null;
          }),
        ),
      questions: () => this.wait(() => [...this.questions]),
      answer: (id, yes) =>
        change(() => {
          const q = this.questions.find((x) => x.id === id);
          this.questions = this.questions.filter((x) => x.id !== id);
          if (q) {
            this.answers.set(id, checkedAnswer(q, yes));
            this.record('answer', `Answered "${yes ? q.yes : q.no}" to a question`);
          }
        }),
      rules: () => this.wait(() => [...this.rules]),
      requests: () => this.wait(() => [...this.requests]),
      addRequest: (text) =>
        change(() => {
          const t = text.trim();
          if (!t) throw new BowerError('conflict', 'Write what you want first.');
          const r: Request = { id: `q${++this.seq}`, text: t, at: Date.now() };
          this.requests = [r, ...this.requests];
          this.record('request', `Asked Bower: "${t}"`);
          return r;
        }),
      removeRequest: (id) =>
        change(() => {
          const r = this.requests.find((x) => x.id === id && !x.done);
          if (!r) throw new BowerError('not-found', 'That request is no longer there.');
          const at = this.requests.indexOf(r);
          this.requests = this.requests.filter((x) => x !== r);
          // As a pending rule: its "Asked Bower" line goes with it, and Undo puts both back.
          const was = [...this.journal].reverse().find((c) => c.kind === 'request' && c.what === `Asked Bower: "${r.text}"`);
          const place = was ? this.journal.indexOf(was) : -1;
          if (was) this.unrecord(was.id);
          return () =>
            change(() => {
              this.requests = [...this.requests.slice(0, at), r, ...this.requests.slice(at)];
              if (was) this.journal = [...this.journal.slice(0, place), was, ...this.journal.slice(place)];
            });
        }),
      linkAddress: (path) =>
        this.wait(() => {
          if (!path.endsWith('.url') || !this.entries.has(path)) return null;
          // A saved link in the inbox is named by its address, as it arrived.
          const bare = nameOf(path).replace(/\.url$/, '');
          return this.links.get(path) ?? (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(bare) ? `https://${bare}` : null);
        }),
      search: (query) =>
        this.wait(() => {
          const words = query.toLowerCase().split(/\s+/).filter(Boolean);
          if (!words.length) return [];
          const hits: Array<SearchHit & { score: number }> = [];
          for (const e of this.entries.values()) {
            if (e.type !== 'file') continue;
            const title = thingName(nameOf(e.path));
            const t = displayName(nameOf(e.path)).toLowerCase();
            // What waits in the inbox is found by its name, not by what it says.
            if (e.path.startsWith('Inbox/')) {
              if (words.every((w) => t.includes(w))) hits.push({ path: e.path, title, snippet: 'Waiting in the inbox', score: 3 });
              continue;
            }
            let score = 0;
            let snippet = placeOf(e.path.slice(0, Math.max(0, e.path.lastIndexOf('/'))));
            if (words.every((w) => t.includes(w))) score = 3;
            else if (e.kind === 'note') {
              const line = searchLines(this.noteFor(e.path)).map(plainText).find((l) => words.every((w) => l.toLowerCase().includes(w)));
              if (line) {
                score = 1;
                snippet = plainSnippet(line);
              }
            }
            if (score) hits.push({ path: e.path, title, snippet, score });
          }
          return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 50).map(({ score, ...h }) => (void score, h));
        }),
      addRule: (text) =>
        change(() => {
          const t = text.trim();
          if (!t) throw new BowerError('conflict', 'Write the rule first.');
          if (ruleLike(this.rules, t)) throw new BowerError('conflict', 'You have that rule already.');
          // A waiting rule is its line in your changes, as on Drive: one id for both.
          const r: Rule = { id: this.record('rule', `New rule: "${t}"`, 'Rules.md'), text: t, yourWords: t, since: Date.now(), pending: true };
          this.rules = [r, ...this.rules];
          this.touchRules();
          return r;
        }),
      removeRule: (id) =>
        change(() => {
          const r = this.rules.find((x) => x.id === id);
          if (!r) throw new BowerError('not-found', 'That rule is no longer there.');
          const at = this.rules.indexOf(r);
          this.rules = this.rules.filter((x) => x !== r);
          this.touchRules();
          // Not worded yet: its own line goes, and nothing else is written.
          const was = r.pending ? this.journal.find((c) => c.id === r.id) : undefined;
          if (was) this.unrecord(r.id);
          const line = was ? null : this.record('rule', `Removed the rule "${r.text}"`, 'Rules.md');
          return () =>
            change(() => {
              this.rules = [...this.rules.slice(0, at), r, ...this.rules.slice(at)];
              this.touchRules();
              if (was) this.journal = [...this.journal, was].sort((a, b) => a.at - b.at);
              else this.unrecord(line);
            });
        }),
      suggestions: () => this.wait(() => this.suggestions.filter((s) => !ruleLike(this.rules, s.title))),
      dismissSuggestion: (id, keep) =>
        change(() => {
          const s = this.suggestions.find((x) => x.id === id);
          const at = s ? this.suggestions.indexOf(s) : -1;
          this.suggestions = this.suggestions.filter((x) => x.id !== id);
          let line: string | null = null;
          if (keep && s && !ruleLike(this.rules, s.title)) {
            line = this.record('rule', `Kept a suggestion as a rule: "${s.title}"`, 'Rules.md');
            this.rules = [{ id: line, text: s.title, yourWords: s.title, since: Date.now(), pending: true }, ...this.rules];
          }
          return () =>
            change(() => {
              if (s && !this.suggestions.includes(s)) this.suggestions = [...this.suggestions.slice(0, at), s, ...this.suggestions.slice(at)];
              if (line) {
                this.unrecord(line);
                this.rules = this.rules.filter((r) => r.id !== line);
              }
            });
        }),
      toggleTask: (path, index) =>
        change(() => {
          if (this.run && !['done', 'failed'].includes(this.run.phase)) throw new BowerError('conflict', 'Wait for the tidy-up to end.');
          const n = this.noteFor(path);
          let i = -1;
          let label = '';
          const body = n.body
            .split('\n')
            .map((line) => {
              const m = TASK_LINE.exec(line);
              if (!m) return line;
              i++;
              if (i !== index) return line;
              label = m[4] ?? '';
              return `${m[1]}${m[2] === 'x' ? ' ' : 'x'}${m[3]}${m[4]}`;
            })
            .join('\n');
          if (!label) throw new BowerError('not-found', 'That line is no longer in the note.');
          this.notes.set(path, { ...n, body });
          const e = this.entries.get(path);
          if (e) this.entries.set(path, { ...e, modified: Date.now() });
          const ticked = body.split('\n').filter((l) => /^\s*[-*]\s+\[x\]/.test(l)).some((l) => l.endsWith(label));
          this.record('task', `${ticked ? 'Ticked' : 'Unticked'} "${label}" in ${n.title}`, path);
        }),
      changes: () => this.wait(() => [...this.journal]),
      subscribe: (cb) => this.on(this.vaultListeners, cb),
    };
  }

  private runs(): RunSource {
    return {
      start: (scope, opts) =>
        this.wait(() => {
          if (this.run && !['done', 'failed'].includes(this.run.phase)) return this.run;
          if (scope === 'all' && !this.inboxCount()) throw new BowerError('conflict', 'Nothing is waiting in the inbox.');
          if (scope === 'instructions' && !this.journal.length) throw new BowerError('conflict', 'There is nothing new for Bower to read.');
          this.run = this.newRun(scope, Date.now());
          this.allowWeb = !!opts?.allowWeb;
          this.runPiles = new Set(this.piles.filter((p) => !p.setAside).map((p) => p.id));
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
