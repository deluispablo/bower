/**
 * The demo's pretend Worker and agent: Alex's account, the in-memory
 * folder and the scripted Tidy up run (#192). Time drives the run: nothing
 * happens on a timer, every call first applies whatever is due by
 * `now()` (`advance`), so the run moves on exactly as fast as the app
 * polls, and a test moves it with fake timers.
 *
 * The run: queued for 1.5 s, then running, filing the inbox items one by
 * one (their paths added to `processed` as they go), done at 8 s. On done
 * the instruction notes it filed get their replies (`replies.ts`): a note in
 * `Answers/`, or a rule in `Rules.md`.
 */

import { ApiError } from '../api.js';
import type {
  Me,
  Run,
  RunItemKind,
  RunScope,
  RunsResponse,
  StatusResponse,
} from '../api.js';
import { FOLDER_MIME } from '../drive.js';
import {
  DEMO_EMAIL,
  DEMO_NAME,
  DEMO_QUOTA_LIMIT,
  DEMO_RUNS,
  DEMO_RUN_STATES,
  FIXTURE_FILES,
  FIXTURE_FOLDERS,
  SCRIPTED_ADDED,
  SCRIPTED_LISTINGS,
  INBOX_PLAN,
} from './fixture.js';
import { instructionText, replyTo } from './replies.js';
import type { Reply } from './replies.js';
import { demoTourSeenAt, setDemoTourSeenAt } from './store.js';
import { DemoVault, ROOT_ID } from './vault.js';

export const QUEUED_MS = 1_500;
export const FIRST_FILED_MS = 2_500;
export const LAST_FILED_MS = 7_000;
export const DONE_MS = 8_000;

/** How many finished runs `GET /runs` keeps, as the Worker does. */
const RUN_HISTORY_LIMIT = 20;

function copyRun(run: Run): Run {
  const copy: Run = { ...run, processed: [...(run.processed ?? [])] };
  if (run.setAside !== undefined)
    copy.setAside = run.setAside.map((item) => ({ ...item }));
  if (run.items !== undefined)
    copy.items = run.items.map((item) => ({ ...item }));
  return copy;
}

interface Step {
  at: number;
  apply: () => void;
}

interface ActiveRun {
  run: Run;
  startedAt: number;
  steps: Step[];
}

/** Whether `path` is waiting for a run: the agent's own rule (`agent/run.sh`). */
function isPending(path: string, name: string): boolean {
  const top = path.split('/')[0];
  return (
    (top === '0-Inbox' || top === 'Clippings') &&
    !path.startsWith('0-Inbox/Processed/') &&
    !name.startsWith('_')
  );
}

function isInstruction(path: string, name: string, text: string): boolean {
  return (
    path === `0-Inbox/${name}` &&
    name.startsWith('Bower - ') &&
    name.endsWith('.md') &&
    /tags:\s*\[instruction\]/.test(text) &&
    /via:\s*app/.test(text)
  );
}

/** Add's "What is this?" note (`add.ts`, `tell.ts#InstructionKind`): it
 * applies to its own batch, so it is never a question (#444) — no answer
 * note gets written for it. */
function isContext(text: string): boolean {
  return /kind:\s*context/.test(text);
}

/** The session-storage switch that holds the demo's current run. */
export const DEMO_RUN_KEY = 'bower:demo:run';

export class DemoServer {
  readonly vault: DemoVault;
  readonly me: Me;
  private active: ActiveRun | null = null;
  /** The last run `GET /status` reports: none until a scripted run ends, so
   * Home starts on "No tidy-up yet". The story's earlier tidy-ups, today's
   * included, are in `history` (`GET /runs`, #583). */
  private last: Run | null = null;
  /** Finished runs, newest first (`GET /runs`, #345): the story's four
   * tidy-ups, then every scripted run as it ends. */
  private history: Run[] = DEMO_RUNS.map(copyRun);

  constructor(
    private readonly now: () => number = () => Date.now(),
    /** `null` in tests: `tourSeenAt` then starts unset and is never persisted. */
    private readonly storage: Storage | null = null,
  ) {
    this.vault = new DemoVault(FIXTURE_FILES, now, FIXTURE_FOLDERS);
    const inbox = this.vault.byPath('0-Inbox');
    this.me = {
      email: DEMO_EMAIL,
      name: DEMO_NAME,
      vault: {
        folderId: ROOT_ID,
        inboxFolderId: inbox?.id ?? ROOT_ID,
        name: 'Bower',
      },
      quota: { used: 0, limit: DEMO_QUOTA_LIMIT },
      needsReauth: false,
      hasApiKey: false,
      allowWeb: false,
      tourSeenAt:
        this.storage === null ? undefined : demoTourSeenAt(this.storage),
    };
  }

  /** Sets `tourSeenAt` and persists it (`updateSettings`, `store.ts`). */
  setTourSeenAt(seenAt: string): void {
    this.me.tourSeenAt = seenAt;
    if (this.storage !== null) setDemoTourSeenAt(this.storage, seenAt);
  }

  private iso(ms: number): string {
    return new Date(ms).toISOString();
  }

  /** Applies every step of the run in flight that is due by now. */
  advance(): void {
    const active = this.active;
    if (active === null) return;
    const elapsed = this.now() - active.startedAt;
    const { run } = active;
    if (run.state === 'queued' && elapsed >= QUEUED_MS) {
      run.state = 'running';
      run.startedAt = this.iso(active.startedAt + QUEUED_MS);
    }
    while (active.steps[0] !== undefined && active.steps[0].at <= elapsed) {
      active.steps.shift()?.apply();
    }
    if (active.steps.length === 0) {
      this.active = null;
      this.last = run;
    }
  }

  /**
   * `POST /process`: the run in flight, or a new scripted one; `scope`
   * `instructions` files only the instruction notes and leaves the rest of
   * the inbox where it is.
   */
  async startProcess(scope: RunScope = 'all'): Promise<Run> {
    this.advance();
    if (this.active !== null) return { ...this.active.run };
    if (this.me.quota.used >= this.me.quota.limit) {
      throw new ApiError(429, 'quota', 'No more runs today.', 3600);
    }
    this.me.quota.used += 1;

    const startedAt = this.now();
    const run: Run = {
      state: 'queued',
      requestedAt: this.iso(startedAt),
      processed: [],
      items: [],
      runId: `demo-run-${this.me.quota.used}`,
    };
    const steps = await this.plan(run, startedAt, scope);
    this.active = { run, startedAt, steps };
    return { ...run, processed: [], items: [] };
  }

  /**
   * A test can hold the current run in one of the states `DEMO_RUN_STATES`
   * has (running, done, partial, failed) by setting `bower:demo:run` in the
   * page's session storage; the times are put relative to the demo clock.
   */
  private heldRun(): Run | null {
    if (this.storage === null) return null;
    let held: string | null;
    try {
      held = this.storage.getItem(DEMO_RUN_KEY);
    } catch {
      return null;
    }
    if (held === null || !(held in DEMO_RUN_STATES)) return null;
    const run = copyRun(DEMO_RUN_STATES[held as keyof typeof DEMO_RUN_STATES]);
    const now = this.now();
    const minutes = (n: number): string => this.iso(now - n * 60_000);
    run.requestedAt = minutes(held === 'running' ? 2 : 6);
    if (run.startedAt !== undefined) {
      run.startedAt = minutes(held === 'running' ? 2 : 5);
    }
    if (run.finishedAt !== undefined) run.finishedAt = minutes(1);
    return run;
  }

  /** `GET /status`. */
  status(): StatusResponse {
    this.advance();
    const run = this.active?.run ?? this.heldRun() ?? this.last;
    return { run: run === null ? null : copyRun(run), stale: false };
  }

  /** `GET /runs` (#345): finished runs, newest first. */
  runs(): RunsResponse {
    this.advance();
    return { runs: this.history.map(copyRun) };
  }

  /** The run's steps: one per pending item in `scope`, then done with the
   * replies. */
  private async plan(
    run: Run,
    startedAt: number,
    scope: RunScope,
  ): Promise<Step[]> {
    const date = this.iso(startedAt).slice(0, 10);
    const pending: { path: string; name: string; text: string }[] = [];
    for (const path of this.pendingPaths()) {
      const entry = this.vault.byPath(path);
      if (entry === undefined) continue;
      const text = (await this.vault.text(entry.id)) ?? '';
      if (scope === 'instructions' && !isInstruction(path, entry.name, text)) {
        continue;
      }
      pending.push({ path, name: entry.name, text });
    }
    const replies: Reply[] = [];
    const filed: { name: string; folder: string; at: number }[] = [];
    const steps: Step[] = [];
    const gap =
      pending.length > 1
        ? (LAST_FILED_MS - FIRST_FILED_MS) / (pending.length - 1)
        : 0;

    // The flat listings' companion notes (`kind: rental-listing`) are written
    // again first, so the notes the run files itself stay the newest.
    const withFiles =
      scope !== 'instructions' &&
      pending.some((item) => !isInstruction(item.path, item.name, item.text));
    if (withFiles) {
      steps.push({
        at: FIRST_FILED_MS,
        apply: () => {
          for (const item of SCRIPTED_LISTINGS) {
            const note = (item.to ?? '').replace(/\.pdf$/, '.md');
            const text = this.textAt(note);
            if (text !== '')
              this.vault.write(
                note,
                `${text}
`,
              );
          }
        },
      });
    }

    // What the run will count as done: the sheet's "Tidying up N things" and
    // the filed count at the end are the same number (#888). A context note
    // is never counted.
    run.total =
      pending.filter((item) => !isContext(item.text)).length +
      (withFiles ? SCRIPTED_LISTINGS.length : 0);

    for (const [i, { path, name, text }] of pending.entries()) {
      let destination = INBOX_PLAN.get(path) ?? `3-Resources/${name}`;
      // What the runner reports for each item (#345, `agent/run.sh`).
      let kind: RunItemKind = 'file';
      if (isInstruction(path, name, text)) {
        destination = `0-Inbox/Processed/${name}`;
        kind = isContext(text) ? 'context' : 'request';
        if (kind === 'request') {
          replies.push(replyTo(name, instructionText(text), date));
        }
      }
      const at = FIRST_FILED_MS + i * gap;
      if (kind === 'file') {
        filed.push({
          name,
          folder: destination.slice(0, destination.lastIndexOf('/')),
          at,
        });
      }
      steps.push({
        at,
        apply: () => {
          this.vault.move(path, destination);
          run.processed?.push(path);
          // Where the item went, and its old name when the run renamed it
          // (report v2, #583): what makes "New" appear (`seen.ts`).
          const newName = destination.slice(destination.lastIndexOf('/') + 1);
          run.items?.push({
            path,
            kind,
            // A request or context note goes to `Processed`, a folder the
            // person never sees: it names no destination, so no row says
            // "Processed" (#888).
            ...(kind === 'file' && { to: destination }),
            ...(newName !== name && { renamedFrom: name }),
          });
        },
      });
    }

    steps.push({
      at: DONE_MS,
      apply: () => {
        // The flat listings come with the run, so Home and Just filed show
        // what the boards draw.
        if (withFiles) {
          for (const item of SCRIPTED_LISTINGS) {
            run.processed?.push(item.path);
            run.items?.push({ ...item });
            filed.push({
              name: item.path.slice(item.path.lastIndexOf('/') + 1),
              folder: (item.to ?? '').slice(
                0,
                (item.to ?? '').lastIndexOf('/'),
              ),
              at: DONE_MS,
            });
          }
          run.added = SCRIPTED_ADDED;
        }
        for (const reply of replies) this.applyReply(reply, date);
        const count = run.processed?.length ?? 0;
        this.appendLog(
          filed.map(
            ({ name, folder, at }) =>
              `- ${this.stamp(startedAt + at)} · Filed: ${name} → ${folder}`,
          ),
        );
        run.state = 'done';
        run.finishedAt = this.iso(startedAt + DONE_MS);
        run.summary =
          count === 0
            ? 'Nothing new to file.'
            : `Filed ${count} ${count === 1 ? 'item' : 'items'}.`;
        this.history = [copyRun(run), ...this.history].slice(
          0,
          RUN_HISTORY_LIMIT,
        );
      },
    });
    return steps;
  }

  private pendingPaths(): string[] {
    const paths: string[] = [];
    const walk = (folderId: string): void => {
      for (const child of this.vault.children(folderId)) {
        const path = this.vault.pathOf(child.id);
        if (child.mimeType === FOLDER_MIME) walk(child.id);
        else if (isPending(path, child.name)) paths.push(path);
      }
    };
    walk(ROOT_ID);
    return paths.sort();
  }

  /** The text of the note at `path` without trailing blank lines; `''` if absent. */
  private textAt(path: string): string {
    const content = this.vault.byPath(path)?.content;
    return typeof content === 'string' ? content.replace(/\s+$/, '') : '';
  }

  private applyReply(reply: Reply, date: string): void {
    if (reply.kind === 'answer') {
      this.vault.write(
        `Answers/${date} ${reply.title}.md`,
        `---\ntags: [answer]\ncreated: ${date}\nupdated: ${date}\n---\n\n${reply.body}\n`,
      );
      return;
    }
    const rules = `${this.textAt('Rules.md')}\n\n${reply.heading}\n${reply.rule}\n`;
    this.vault.write('Rules.md', rules);
  }

  /** `YYYY-MM-DD HH:MM` in UTC, as the agent stamps `log.md`. */
  private stamp(ms: number): string {
    return this.iso(ms).slice(0, 16).replace('T', ' ');
  }

  /** One `Filed:` line per file filed, as the agent writes them (#345). */
  private appendLog(lines: readonly string[]): void {
    if (lines.length === 0) return;
    this.vault.write(
      'log.md',
      `${this.textAt('log.md')}\n${lines.join('\n')}\n`,
    );
  }
}
