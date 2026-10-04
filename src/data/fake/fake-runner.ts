/**
 * The runner, faked: what a tidy-up does to the Bower folder, done on a
 * FakeDrive with no AI. It walks the real phases on the demo's clock, takes
 * the piles that were in the inbox when it started, files their things
 * where the demo would (the fixture's plan, else a guess from the pile's
 * words), words the rules you typed, marks requests done, drops answered
 * questions and archives the journal. It writes only what the real runner
 * writes (docs/specs/2026-10-04-worker-contract.md).
 */
import type { DriveFile } from '../drive/drive-api';
import type { FakeDrive } from '../drive/fake-drive';
import { FILING, guessFolder, seedPiles, wordRule } from '../demo/fixture';
import { PHASE_MS, type TimeScale } from '../demo/scenario';
import { thingsIn } from '../piles';
import { displayName, freeName, join, kindOf, nameOf, parentOf } from '../tree';
import type { FiledItem, Pile, Question, Request, Rule, RunPhase, RunReport } from '../types';
import { DriveVault } from '../vault/drive-vault';
import type { JournalRecord } from '../vault/journal';
import { PROP, SYSTEM, type QuestionsFile, type RequestsFile } from '../vault/layout';
import { parseNote, serializeNote } from '../vault/note-format';
import { parseRules, serializeRules } from '../vault/rules-format';
import { VaultIndex } from '../vault/vault-index';

export interface FakeRunOptions {
  scope: 'all' | 'instructions';
  scale: TimeScale;
  /** Fails this run in the writing phase, leaving everything as it was. */
  failOnce: boolean;
  onPhase: (phase: RunPhase, total?: number) => void | Promise<void>;
  /** Hears which piles the run took, as soon as it starts. */
  took?: (pileIds: ReadonlySet<string>) => void;
}

export type FakeRunResult = { phase: 'done'; report: RunReport } | { phase: 'failed'; failure: string };

export const FAILURE = 'Bower stopped while writing your notes. Nothing was moved; your inbox is as it was.';

/** The demo's plan for each sample inbox thing, by the name it was added under. */
const PLAN_BY_NAME = new Map(
  seedPiles(0)
    .flatMap((p) => p.items)
    .flatMap((it) => {
      const plan = FILING[it.id];
      return plan ? [[it.name, plan] as const] : [];
    }),
);

/** Hub notes a full tidy-up brings up to date, as the demo does. */
const UPDATES = [
  { path: 'Projects/Flat hunt/Flat hunt.md', what: 'A fourth flat added; the shortlist compared by commute.' },
  { path: 'Projects/Job hunt/Job hunt.md', what: 'New offer from Ferrowick, scored 7 out of 10 against your CV.' },
];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(0, ms)));

export async function runFake(drive: FakeDrive, rootId: string, opts: FakeRunOptions): Promise<FakeRunResult> {
  const reader = new DriveVault({ drive, rootId: async () => rootId, runningPiles: () => new Set(), device: 'runner' });
  const piles = opts.scope === 'all' ? await reader.piles() : [];
  const taken = new Set(piles.filter((p) => p.path).map((p) => p.id));
  opts.took?.(taken);
  const ms = PHASE_MS[opts.scale];
  await opts.onPhase('queued');
  await sleep(ms.queued);
  await opts.onPhase('reading', piles.filter((p) => taken.has(p.id)).reduce((n, p) => n + thingsIn(p), 0));
  await sleep(ms.reading);
  await opts.onPhase('writing');
  await sleep(ms.writing);
  if (opts.failOnce) return { phase: 'failed', failure: FAILURE };
  await opts.onPhase('saving');
  await sleep(ms.saving);

  const w = new Writer(drive, rootId, VaultIndex.build(rootId, await drive.listAll(rootId)));
  const journal = await w.journal();
  await w.clearNew();
  const report: RunReport = { filed: [], created: [], updated: [], setAside: [], questions: [], yourChanges: journal.length };
  if (opts.scope === 'all') {
    for (const pile of piles.filter((p) => taken.has(p.id))) await w.filePile(pile, report);
    for (const u of UPDATES) if (await w.addTimeline(u.path, u.what)) report.updated.push(u);
  }
  await w.wordRules(journal.filter((r) => r.kind === 'rule'));
  await w.doRequests(journal.filter((r) => r.kind === 'request'));
  report.questions = await w.dropAnswered(new Set(journal.filter((r) => r.kind === 'answer').map((r) => r.questionId ?? '')));
  await w.archive(journal);
  return { phase: 'done', report };
}

/** The runner's writes, one helper per step, over a listing it keeps true. */
class Writer {
  constructor(
    private readonly drive: FakeDrive,
    private readonly rootId: string,
    private readonly ix: VaultIndex,
  ) {}

  async journal(): Promise<Array<JournalRecord & { fileId: string }>> {
    const out: Array<JournalRecord & { fileId: string }> = [];
    for (const f of this.ix.filesIn(SYSTEM.changes)) {
      if (f.folder || !f.name.endsWith('.json')) continue;
      try {
        out.push({ ...(JSON.parse(await this.drive.readText(f.id)) as JournalRecord), fileId: f.id });
      } catch {
        // Not a journal record; left where it is.
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }

  /** Last run's "new" marks go; this run's come next. */
  async clearNew(): Promise<void> {
    for (const f of await this.drive.listAll(this.rootId)) if (f.appProperties?.[PROP.isNew]) this.ix.put(await this.drive.update(f.id, { appProperties: { [PROP.isNew]: null } }));
  }

  async filePile(pile: Pile, report: RunReport): Promise<void> {
    if (!pile.items.length) {
      const to = guessFolder(pile.text, 'note');
      const folder = await this.folder(to);
      const name = freeName(this.ix.entries(), to, `${pile.text.slice(0, 48).replace(/[/\\:*?"<>|]+/g, ' ').trim()}.md`);
      const text = serializeNote({ summary: pile.text, properties: [{ key: 'kind', label: 'Kind', value: 'Note' }], tags: [], currentState: [], body: pile.text, timeline: [{ date: 'Today', text: 'Written from a note you added.' }], byBower: true });
      this.ix.put(await this.drive.createText(folder, name, text, { [PROP.by]: 'bower', [PROP.isNew]: '1' }));
      report.filed.push({ name: 'Your note', title: displayName(name), kind: 'note', to, note: join(to, name) });
    } else {
      for (const item of pile.items) {
        const file = this.byId(item.id);
        if (!file) continue;
        const plan = PLAN_BY_NAME.get(item.name) ?? { title: file.name, to: guessFolder(`${pile.text} ${item.name}`, item.kind) };
        const folder = await this.folder(plan.to);
        const name = freeName(this.ix.entries(), plan.to, plan.title);
        const isNote = kindOf(name) === 'note';
        this.ix.put(
          await this.drive.update(file.id, {
            name,
            addParent: folder,
            ...(file.parents[0] ? { removeParent: file.parents[0] } : {}),
            appProperties: { [PROP.isNew]: '1', ...(isNote ? { [PROP.by]: 'bower' } : {}), [PROP.asAdded]: null, [PROP.origin]: null, [PROP.kind]: null, [PROP.pile]: null },
          }),
        );
        const filed: FiledItem = { name: item.name, title: displayName(name), kind: item.kind, to: plan.to };
        if (plan.note && !this.ix.idOf(plan.note)) {
          const at = await this.folder(parentOf(plan.note));
          const text = serializeNote({ summary: `A note for ${displayName(name)}.`, properties: [], tags: [], currentState: [], body: '', timeline: [{ date: 'Today', text: 'Filed by Bower.', source: name }], byBower: true });
          this.ix.put(await this.drive.createText(at, nameOf(plan.note), text, { [PROP.by]: 'bower', [PROP.isNew]: '1' }));
          filed.note = plan.note;
          report.created.push({ path: plan.note, what: `A note for ${displayName(name)}.` });
        }
        report.filed.push(filed);
      }
    }
    // What is left of the pile (its folder and note) goes to the Bin, where it can be found.
    const top = pile.path ? this.ix.file(pile.path) : undefined;
    if (top?.folder) {
      await this.drive.trash(top.id);
      this.ix.drop(top.id);
    }
  }

  async addTimeline(path: string, what: string): Promise<boolean> {
    const f = this.ix.file(path);
    if (!f) return false;
    const n = parseNote(path, await this.drive.readText(f.id));
    const written = await this.drive.writeText(f.id, serializeNote({ ...n, timeline: [...n.timeline, { date: 'Today', text: what }] }), f.modifiedTime);
    this.ix.put(await this.drive.update(written.id, { appProperties: { [PROP.isNew]: '1' } }));
    return true;
  }

  async wordRules(typed: JournalRecord[]): Promise<void> {
    if (!typed.length) return;
    const f = this.ix.file('Rules.md');
    const worded = f ? parseRules(await this.drive.readText(f.id)) : [];
    const added: Rule[] = [...typed].reverse().map((r) => ({ id: r.id, text: wordRule(r.text ?? r.what), yourWords: r.text ?? r.what, since: r.at }));
    const text = serializeRules([...added, ...worded]);
    if (f) this.ix.put(await this.drive.writeText(f.id, text, f.modifiedTime));
    else this.ix.put(await this.drive.createText(this.rootId, 'Rules.md', text, { [PROP.by]: 'bower' }));
  }

  async doRequests(asked: JournalRecord[]): Promise<void> {
    if (!asked.length) return;
    const old = (await this.json<RequestsFile>(SYSTEM.requests))?.done ?? [];
    const done: Request[] = [...asked].reverse().map((r) => ({ id: r.id, text: r.text ?? r.what, at: r.at, done: 'Done. See what changed in your folders.' }));
    await this.writeJson(SYSTEM.requests, { v: 1, done: [...done, ...old].slice(0, 20) } satisfies RequestsFile);
  }

  async dropAnswered(answered: ReadonlySet<string>): Promise<Question[]> {
    const all = (await this.json<QuestionsFile>(SYSTEM.questions))?.questions ?? [];
    const left = all.filter((q) => !answered.has(q.id));
    if (left.length !== all.length) await this.writeJson(SYSTEM.questions, { v: 1, questions: left } satisfies QuestionsFile);
    return left;
  }

  async archive(records: Array<{ fileId: string }>): Promise<void> {
    if (!records.length) return;
    const archive = await this.folder(SYSTEM.archive);
    for (const r of records) {
      const f = this.byId(r.fileId);
      if (f) this.ix.put(await this.drive.update(f.id, { addParent: archive, ...(f.parents[0] ? { removeParent: f.parents[0] } : {}) }));
    }
  }

  private byId(id: string): DriveFile | undefined {
    const path = this.ix.pathOf(id);
    return path === undefined ? undefined : this.ix.file(path);
  }

  /** The id of a folder, made (with its parents) when missing. */
  private async folder(path: string): Promise<string> {
    if (!path) return this.rootId;
    const known = this.ix.idOf(path);
    if (known) return known;
    const made = await this.drive.createFolder(await this.folder(parentOf(path)), nameOf(path));
    this.ix.put(made);
    return made.id;
  }

  private async json<T>(path: string): Promise<T | null> {
    const id = this.ix.idOf(path);
    if (!id) return null;
    try {
      return JSON.parse(await this.drive.readText(id)) as T;
    } catch {
      return null;
    }
  }

  private async writeJson(path: string, body: unknown): Promise<void> {
    const text = `${JSON.stringify(body, null, 2)}\n`;
    const f = this.ix.file(path);
    if (f) this.ix.put(await this.drive.writeText(f.id, text, f.modifiedTime));
    else this.ix.put(await this.drive.createText(await this.folder(parentOf(path)), nameOf(path), text));
  }
}

