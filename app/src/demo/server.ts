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
import type { Me, Run, RunScope, StatusResponse } from '../api.js';
import { FOLDER_MIME } from '../drive.js';
import {
  DEMO_EMAIL,
  DEMO_NAME,
  DEMO_QUOTA_LIMIT,
  FIXTURE_FILES,
  INBOX_PLAN,
} from './fixture.js';
import { instructionText, replyTo } from './replies.js';
import type { Reply } from './replies.js';
import { DemoVault, ROOT_ID } from './vault.js';

export const QUEUED_MS = 1_500;
export const FIRST_FILED_MS = 2_500;
export const LAST_FILED_MS = 7_000;
export const DONE_MS = 8_000;

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

export class DemoServer {
  readonly vault: DemoVault;
  readonly me: Me;
  private active: ActiveRun | null = null;
  private last: Run | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {
    this.vault = new DemoVault(FIXTURE_FILES, now);
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
    };
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
      runId: `demo-run-${this.me.quota.used}`,
    };
    const steps = await this.plan(run, startedAt, scope);
    this.active = { run, startedAt, steps };
    return { ...run, processed: [] };
  }

  /** `GET /status`. */
  status(): StatusResponse {
    this.advance();
    const run = this.active?.run ?? this.last;
    return {
      run:
        run === null ? null : { ...run, processed: [...(run.processed ?? [])] },
      stale: false,
    };
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
    const steps: Step[] = [];
    const gap =
      pending.length > 1
        ? (LAST_FILED_MS - FIRST_FILED_MS) / (pending.length - 1)
        : 0;

    for (const [i, { path, name, text }] of pending.entries()) {
      let destination = INBOX_PLAN.get(path) ?? `3-Resources/${name}`;
      if (isInstruction(path, name, text)) {
        destination = `0-Inbox/Processed/${name}`;
        replies.push(replyTo(name, instructionText(text), date));
      }
      steps.push({
        at: FIRST_FILED_MS + i * gap,
        apply: () => {
          this.vault.move(path, destination);
          run.processed?.push(path);
        },
      });
    }

    steps.push({
      at: DONE_MS,
      apply: () => {
        for (const reply of replies) this.applyReply(reply, date);
        const count = run.processed?.length ?? 0;
        this.appendLog(date, count, replies.length);
        run.state = 'done';
        run.finishedAt = this.iso(startedAt + DONE_MS);
        run.summary =
          count === 0
            ? 'Nothing new to file.'
            : `Filed ${count} ${count === 1 ? 'item' : 'items'}.`;
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

  private appendLog(date: string, filed: number, answered: number): void {
    const line = `- ${date} · Tidy up · ${filed} filed, ${answered} answered`;
    this.vault.write('log.md', `${this.textAt('log.md')}\n${line}\n`);
  }
}
