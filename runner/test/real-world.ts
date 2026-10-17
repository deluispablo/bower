/**
 * The real-adapter world (P3-18): Alex's folder (the demo fixture, as the fake world seeds it) on one `FakeDrive`
 * that every party reaches only through Drive v3 (`drive-v3-real.ts`); the Worker's app in-process
 * (`api/test/in-process.ts`); Google's token endpoint and GitHub's REST API answered here; and each dispatch run as
 * GitHub Actions runs it, by the runner's `main` with the event file at `GITHUB_EVENT_PATH`. No network: every
 * transport is replayed.
 *
 * GitHub: `POST /repos/:repo/dispatches` keeps the payload and answers 204; the run it makes is named
 * `tidy <run_id> <attempt>` (the workflow's `run-name`) and listed by `GET …/actions/runs`, its one job by
 * `GET …/actions/runs/:id/jobs` (https://docs.github.com/en/rest/actions/workflow-runs,
 * https://docs.github.com/en/rest/actions/workflow-jobs), queued until its job runs here.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeDrive } from '../../src/data/drive/fake-drive';
import type { ClaudeSpawn } from '../src/claude';
import { main } from '../src/main';
import { phaseAwareClaude } from './b1-planning-support';
import { realDrive } from './drive-v3-real';
import type { ApiHost, ApiOptions, Dispatched, Fetch, Hop, RealWorld } from './real-world-types';

export const ORIGIN = 'https://app.example.com';
const REPO = '/repos/OWNER/REPO';

interface Job {
  id: number;
  payload: Dispatched;
  status: 'queued' | 'in_progress' | 'completed';
  startedAt: string | null;
  completedAt: string | null;
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=UTF-8' } });
const urlOf = (input: string | URL | Request): URL => new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

/** The demo fixture's folder on `drive`, as the fake world seeds it; its id. */
async function demoFolder(drive: FakeDrive): Promise<string | null> {
  // Loaded at run time: the seed reaches the demo's modules, which type-check with the browser's types, not Node's.
  const seedModule = new URL('../../src/data/fake/seed.ts', import.meta.url).pathname;
  const { seedFakeDrive } = (await import(/* @vite-ignore */ seedModule)) as { seedFakeDrive(d: FakeDrive, scenario: 'default', now: number): Promise<string | null> };
  return await seedFakeDrive(drive, 'default', Date.now());
}

/** What a world starts from, when not the demo fixture with the scripted provider. */
export interface WorldOptions {
  /** Makes Alex's folder on `drive` and gives its id (a corpus case, `seedCase`); the demo fixture by default. */
  seed?: (drive: FakeDrive) => Promise<string>;
  /** Answers for the model in every job, through the Claude provider (as `corpus-run.ts` does); no live call. */
  claude?: ClaudeSpawn;
}

export async function realWorld(opts: WorldOptions = {}): Promise<RealWorld> {
  const drive = new FakeDrive();
  const rootId = opts.seed ? await opts.seed(drive) : await demoFolder(drive);
  if (rootId === null) throw new Error('the default scenario has a Bower folder');
  const wire = realDrive(drive);
  let revoked = false;
  const jobs: Job[] = [];

  const google: Fetch = async (input) => {
    if (urlOf(input).pathname !== '/token') return json(404, { error: 'not_found' });
    if (revoked) return json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
    return json(200, { access_token: await wire.mint(), expires_in: 3599, token_type: 'Bearer' });
  };
  const github: Fetch = async (input, init = {}) => {
    const url = urlOf(input);
    const method = (init.method ?? 'GET').toUpperCase();
    if (method === 'POST' && url.pathname === `${REPO}/dispatches`) {
      const body = JSON.parse(String(init.body)) as { event_type: string; client_payload: Dispatched };
      if (body.event_type !== 'bower-tidy') return json(422, { message: 'Unknown event' });
      jobs.push({ id: 1000 + jobs.length, payload: body.client_payload, status: 'queued', startedAt: null, completedAt: null });
      return new Response(null, { status: 204 });
    }
    if (method === 'GET' && url.pathname === `${REPO}/actions/runs`) {
      const runs = [...jobs].reverse().map((j) => ({ id: j.id, display_title: `tidy ${j.payload.run_id} ${j.payload.attempt}`, status: j.status }));
      return json(200, { total_count: runs.length, workflow_runs: runs });
    }
    const of = new RegExp(`^${REPO}/actions/runs/(\\d+)/jobs$`).exec(url.pathname);
    const job = jobs.find((j) => j.id === Number(of?.[1]));
    if (method === 'GET' && job) return json(200, { total_count: 1, jobs: [{ status: job.status, started_at: job.startedAt, completed_at: job.completedAt }] });
    return json(404, { message: 'Not Found' });
  };
  // The Worker lists with Drive's own page size; the runner's reads keep the fake's pages.
  const workerDrive = wire.fetchPaged(1000);
  const outside: Fetch = async (input, init) => {
    const { origin } = urlOf(input);
    if (origin === 'https://oauth2.googleapis.com') return await google(input, init);
    if (origin === 'https://api.github.com') return await github(input, init);
    return await workerDrive(input, init);
  };

  // Loaded at run time: the Worker's modules type-check under its own settings (Workers types), not the runner's.
  const hostModule = new URL('../../api/test/in-process.ts', import.meta.url).pathname;
  const { startApi } = (await import(/* @vite-ignore */ hostModule)) as { startApi(o: ApiOptions): Promise<ApiHost> };
  const api = await startApi({ origin: ORIGIN, outside });
  await api.signIn(rootId);

  const model = opts.claude ? phaseAwareClaude(opts.claude, () => ({ drive, root: rootId })) : undefined;
  const dir = await mkdtemp(join(tmpdir(), 'bower-real-'));
  const runJob = async (i: number, hop?: Hop): Promise<number> => {
    const job = jobs[i];
    if (!job) throw new Error(`no dispatch ${i}`);
    job.status = 'in_progress';
    job.startedAt = new Date().toISOString();
    const event = join(dir, `event-${i}-${Date.now()}.json`);
    await writeFile(event, JSON.stringify({ action: 'bower-tidy', client_payload: job.payload }));
    const runner: Fetch = async (input, init = {}) => {
      const url = urlOf(input);
      const next = (): Promise<Response> => (url.origin === ORIGIN ? api.fetch(input, init) : wire.fetch(input, init));
      return hop ? await hop(url, init, next) : await next();
    };
    try {
      const claude = opts.claude ? { BOWER_PROVIDER: 'claude', CLAUDE_CODE_OAUTH_TOKEN: 'made-up-token-for-tests-only' } : {};
      return await main({ BOWER_API_URL: ORIGIN, GITHUB_EVENT_PATH: event, ...claude }, { fetch: runner as typeof fetch, pacing: { baseMs: 0 }, ...(model ? { claude: (call: Parameters<ClaudeSpawn>[0]) => model(Object.assign(call, { fixture: { drive, root: rootId } })) } : {}) });
    } finally {
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
    }
  };
  const ran = new Set<number>();
  return {
    origin: ORIGIN,
    drive,
    rootId,
    api,
    driveFetch: wire.fetch,
    get dispatched() {
      return jobs.map((j) => j.payload);
    },
    runJob: async (i, hop) => {
      ran.add(i);
      return await runJob(i, hop);
    },
    killJob: (i) => {
      const job = jobs[i];
      if (!job) throw new Error(`no dispatch ${i}`);
      ran.add(i);
      job.status = 'completed';
      job.startedAt ??= new Date().toISOString();
      job.completedAt = new Date().toISOString();
    },
    runPending: async () => {
      for (let i = 0; i < jobs.length; i++) {
        if (ran.has(i)) continue;
        ran.add(i);
        await runJob(i);
      }
    },
    revokeGoogle: () => {
      revoked = true;
      wire.revoke();
    },
    driveWrites: () => [...wire.writes],
    paths: async () =>
      (await drive.listAll(rootId))
        .filter((f) => !f.folder)
        .map((f) => drive.pathOf(f.id, rootId))
        .filter((p) => !p.startsWith('.bower/'))
        .sort(),
  };
}
