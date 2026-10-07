/**
 * The Claude provider on recorded replies (TL-P4-01, `claude-provider`): no live call and no model. The folder and
 * the admitted set are the scripted provider's contract fixtures (the same seeded folder `main.test.ts` runs), and
 * each reply is a `claude -p --output-format json` result recorded in `fixtures/claude/`.
 */
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PILE_NOTE } from '../../src/data/piles';
import type { AdmissionManifest } from '../../src/data/spine/admission';
import { planAdmission } from '../../src/data/spine/plan';
import { fakeRead } from '../../src/data/spine/read';
import { hashRecordJson } from '../../src/data/contracts/record-json';
import type { RunManifest } from '../../src/data/spine/records';
import { B_FAILURE } from '../../src/data/spine/scripted';
import { SYSTEM } from '../../src/data/vault/layout';
import type { ClaudeCall, ClaudeExit } from '../src/claude';
import { main } from '../src/main';
import { API, RUN_ID, TICKET, driveV3, fixedDrive, type DriveV3 } from './drive-v3';

const AT = Date.UTC(2026, 9, 7, 9);
/** A made-up credential: what the test looks for in every captured line. */
const TOKEN = 'sk-ant-oat01-made-up-token-for-tests-only';

afterEach(() => vi.restoreAllMocks());

const recorded = (name: string): string => readFileSync(new URL(`./fixtures/claude/${name}`, import.meta.url), 'utf8');

/** Alex's folder on a pretend Drive v3, as `main.test.ts` seeds it: two loose things and a pile with words. */
async function wired(): Promise<{ wire: DriveV3; root: string; admission: AdmissionManifest }> {
  const drive = fixedDrive();
  const root = (await drive.createFolder('root', 'Bower')).id;
  const inbox = (await drive.createFolder(root, 'Inbox')).id;
  for (const name of ['Projects', 'Areas', 'Resources', 'Archive']) await drive.createFolder(root, name);
  const sys = (await drive.createFolder(root, SYSTEM.dir)).id;
  await drive.createFolder(sys, 'changes');
  await drive.createText(sys, 'questions.json', '{ "v": 1, "questions": [] }\n');
  await drive.createText(inbox, 'Payslip_Aug.pdf', '%PDF payslip', { pile: 'p-payslip' });
  await drive.createText(inbox, 'Dentist reminder.pdf', '%PDF dentist', { pile: 'p-dentist' });
  const pile = (await drive.createFolder(inbox, 'Flat photos', { pile: 'p-photos' })).id;
  await drive.createText(pile, PILE_NOTE, 'The kitchen at the Wrenfield Road viewing.\n');
  await drive.createText(pile, 'IMG_2301.jpg', 'made-up photo bytes');
  const admitted = await planAdmission(fakeRead(drive), root, { scope: 'all', clock: () => AT, newId: () => 'admission-1' });
  if (admitted.kind !== 'manifest') throw new Error(`nothing admitted: ${admitted.cause}`);
  const wire = driveV3(drive);
  wire.folderId = root;
  wire.manifest = admitted.manifest;
  return { wire, root, admission: admitted.manifest };
}

async function eventFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bower-runner-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ action: 'bower-tidy', client_payload: { run_id: RUN_ID, attempt: 1, ticket: TICKET, scope: 'all', allow_web: false } }));
  return file;
}

/** A pretend `claude` that answers every call with `reply`, and keeps the calls. */
function recordedClaude(reply: Partial<ClaudeExit> & { stdout: string }): { calls: ClaudeCall[]; spawn: (call: ClaudeCall) => Promise<ClaudeExit> } {
  const calls: ClaudeCall[] = [];
  return { calls, spawn: async (call) => (calls.push(call), { code: 0, stderr: '', cut: null, ...reply }) };
}

/** The recorded success with its manifest changed by `edit`: a reply that is JSON but outside the run manifest schema. */
function edited(edit: (manifest: Record<string, unknown>) => void): string {
  const envelope = JSON.parse(recorded('reply-ok.json')) as { result: string };
  const manifest = JSON.parse(envelope.result) as Record<string, unknown>;
  edit(manifest);
  return JSON.stringify({ ...envelope, result: JSON.stringify(manifest) });
}

async function hash(value: unknown): Promise<string> {
  const h = await hashRecordJson(value);
  if (!h.ok) throw new Error(h.reason);
  return h.value;
}

/**
 * The recorded success edited by `edit`, then its capture id and operation ids made again as the planner makes them
 * (as `checkpoints.test.ts` does): a reply inside the contract that plans for another run, request or thing.
 */
async function rehashed(edit: (text: string) => string): Promise<string> {
  const envelope = JSON.parse(recorded('reply-ok.json')) as { result: string };
  const value = JSON.parse(edit(envelope.result)) as RunManifest;
  value.captureId = await hash({ scope: value.scope, runScope: value.runScope, capture: value.capture });
  const renamed = new Map<string, string>();
  const ref = (id: string): string => renamed.get(id) ?? id;
  for (const op of value.operations) {
    op.dependsOn = op.dependsOn.map(ref);
    if ('parent' in op.effect && 'createdBy' in op.effect.parent) op.effect.parent = { createdBy: ref(op.effect.parent.createdBy) };
    const next = await hash({ runId: value.runId, captureId: value.captureId, ordinal: op.ordinal, effect: op.effect });
    renamed.set(op.operationId, next);
    op.operationId = next;
  }
  for (const item of value.reportPlan) item.requires = item.requires.map(ref);
  return JSON.stringify({ ...envelope, result: JSON.stringify(value) });
}

const claudeEnv = (extra: Record<string, string> = {}): Record<string, string> => ({ BOWER_PROVIDER: 'claude', CLAUDE_CODE_OAUTH_TOKEN: TOKEN, ...extra });

describe('the Claude provider', () => {
  it('a recorded Claude reply becomes operations the spine validates', async () => {
    const { wire, admission } = await wired();
    const claude = recordedClaude({ stdout: recorded('reply-ok.json') });

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: claude.spawn })).toBe(0);

    expect(claude.calls).toHaveLength(1);
    // The prepared context went in: the admitted set it took, never an instruction to touch Drive itself.
    expect(claude.calls[0]?.input).toContain(admission.id);
    expect(wire.statuses.map((s) => s.phase)).toEqual(['reading', 'writing', 'saving', 'done']);
    // The spine applied the reply's operations: every thing it took left the inbox, and the report says so.
    const items = admission.piles.flatMap((p) => p.items.filter((i) => i.name !== PILE_NOTE).map((i) => i.fileId));
    const inbox = (await wire.drive.listAll(wire.folderId)).find((f) => f.name === 'Inbox')?.id;
    for (const id of items) expect((await wire.drive.evidence(id))?.file.parents).not.toContain(inbox);
    expect(wire.requests.filter((r) => r.method === 'PATCH').length).toBeGreaterThanOrEqual(items.length);
  });

  it('a malformed or out-of-schema Claude reply fails truthfully and writes nothing', async () => {
    const replies: Array<[string, Partial<ClaudeExit> & { stdout: string }]> = [
      ['prose instead of JSON', { stdout: recorded('reply-prose.json') }],
      ['the turn cap reached', { stdout: recorded('reply-max-turns.json') }],
      ['not a result at all', { stdout: 'Error: something went wrong', code: 1 }],
      ['cut at the size cap', { stdout: recorded('reply-ok.json'), cut: 'size' }],
      ['an effect the contract has no room for', { stdout: edited((m) => {
        for (const op of (m.operations as Array<{ effect: { kind: string } }>).slice(0, 1)) op.effect.kind = 'delete';
      }) }],
      ['a manifest for another run', { stdout: edited((m) => (m.runId = 'another-run')) }],
      ['a thing it was not admitted to take', {
        stdout: edited((m) => {
          const members = (m.capture as { members: Array<{ file: { fileId: string } }> }).members;
          for (const member of members.slice(0, 1)) member.file.fileId = 'not-admitted';
        }),
      }],
    ];
    // Inside the contract, its hashes made again, but not this run's plan from what it took.
    const payslip = (JSON.parse(JSON.parse(recorded('reply-ok.json')).result as string) as RunManifest).capture.members[0]?.file.fileId ?? '';
    expect(payslip).not.toBe('');
    replies.push(
      ['the contract kept, for another run', { stdout: await rehashed((t) => t.replaceAll(`"runId":"${RUN_ID}"`, '"runId":"another-run"')) }],
      ['the contract kept, for another request', { stdout: await rehashed((t) => t.replace('"requestId":"admission-1"', '"requestId":"admission-2"')) }],
      ['the contract kept, with a thing not admitted', { stdout: await rehashed((t) => t.replaceAll(`"${payslip}"`, '"not-admitted"')) }],
    );
    for (const [what, reply] of replies) {
      const { wire } = await wired();
      const before = await wire.drive.listAll(wire.folderId);
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: recordedClaude(reply).spawn }), what).toBe(0);

      // Truthful: the run ends failed, saying nothing changed, and nothing did.
      expect(wire.statuses.map((s) => s.phase), what).toEqual(['reading', 'writing', 'failed']);
      expect(wire.statuses.at(-1)?.failure, what).toBe(B_FAILURE);
      expect(wire.requests.filter((r) => r.method !== 'GET'), what).toEqual([]);
      expect(await wire.drive.listAll(wire.folderId), what).toEqual(before);
      expect(errors, what).toHaveBeenCalled();
      errors.mockRestore();
    }
  });

  it('the runner logs one timing line per run with the Claude reply\'s numbers', async () => {
    const { wire } = await wired();
    const said: string[] = [];
    const keep = (...args: unknown[]): void => void said.push(args.map(String).join(' '));
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation(keep);

    expect(await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv() }, { fetch: wire.fetch, claude: recordedClaude({ stdout: recorded('reply-ok.json') }).spawn })).toBe(0);

    const lines = said.filter((l) => l.startsWith('timing:'));
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? '';
    expect(line.length).toBeLessThan(300);
    // Numbers and phase names only: every field is name=number, but how the run ended.
    const fields = Object.fromEntries(line.replace(/^timing: /, '').split(' ').map((f) => f.split('=') as [string, string]));
    expect(Object.keys(fields)).toEqual(['end', 'total', 'start', 'token', 'reads', 'model', 'api', 'turns', 'in', 'out', 'apply', 'checkpoints', 'report', 'status']);
    expect(fields.end).toBe('done');
    for (const [name, value] of Object.entries(fields)) if (name !== 'end') expect(value, name).toMatch(name === 'checkpoints' ? /^\d+\/[1-9]\d*$/ : /^\d+$/);
    // The model step as the recorded reply reports it: wall and API time, turns and tokens.
    expect(fields).toMatchObject({ model: '41250', api: '40980', turns: '1', in: '5120', out: '3890' });
    expect(line).not.toContain(TOKEN);
    // No path or content: no folder or file name from the run.
    expect(line).not.toMatch(/Inbox|Payslip|Dentist|Flat photos|\.pdf|\.jpg/);
  });

  it('the Claude provider runs under the original permission policy and never logs the token', async () => {
    const { wire } = await wired();
    const said: string[] = [];
    const keep = (...args: unknown[]): void => void said.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation(keep);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => (said.push(String(chunk)), true));
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => (said.push(String(chunk)), true));
    // A failing reply that echoes the credential on both streams: still never repeated.
    const claude = recordedClaude({ stdout: `{"type":"result","subtype":"error_during_execution","is_error":true,"result":"bad ${TOKEN}"}`, stderr: `auth with ${TOKEN} failed`, code: 1 });

    const env = { BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), GITHUB_ACTIONS: 'true', HOME: '/home/runner', PATH: '/usr/bin', BOWER_API_KEY: 'not-for-claude', ...claudeEnv() };
    expect(await main(env, { fetch: wire.fetch, claude: claude.spawn })).toBe(0);
    expect(wire.statuses.at(-1)?.phase).toBe('failed');

    const call = claude.calls[0];
    expect(call?.command).toBe('claude');
    const args = call?.args ?? [];
    const flag = (name: string): string | undefined => args[args.indexOf(name) + 1];
    expect(args[0]).toBe('-p');
    expect(flag('--output-format')).toBe('json');
    // Model and turn cap from the environment; the start is Sonnet and the original's DEFAULT_MAX_TURNS.
    expect(flag('--model')).toBe('claude-sonnet-5-5');
    expect(flag('--max-turns')).toBe('60');
    // No tool at all (so no Drive, no write, no shell), no MCP server, and nothing that may ask.
    expect(flag('--tools')).toBe('');
    expect(args).toContain('--strict-mcp-config');
    expect(flag('--permission-mode')).toBe('dontAsk');
    // The original's settings (agent/claude-settings.json), its deny list kept, with every tool that writes, runs a
    // shell or reaches the network denied too.
    const settings = JSON.parse(flag('--settings') ?? '{}') as { permissions: { blockReadsOutsideWorkingDirectories: boolean; deny: string[] } };
    expect(settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
    for (const rule of ['Write(**/CLAUDE.md)', 'Edit(.claude/**)', 'Bash(*://*)', 'Read(../**)', 'Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task']) {
      expect(settings.permissions.deny).toContain(rule);
    }
    // The credential reaches claude through its own small environment only: never in an argument or the input.
    expect(call?.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    expect(Object.keys(call?.env ?? {}).sort()).toEqual(['CLAUDE_CODE_OAUTH_TOKEN', 'GITHUB_ACTIONS', 'HOME', 'PATH']);
    expect(args.join(' ')).not.toContain(TOKEN);
    expect(call?.input).not.toContain(TOKEN);
    // Nothing said anywhere repeats it.
    expect(said.length).toBeGreaterThan(0);
    expect(said.filter((line) => line.includes(TOKEN))).toEqual([]);

    // The model and the turn cap are the environment's when it sets them.
    const other = await wired();
    const set = recordedClaude({ stdout: recorded('reply-prose.json') });
    await main({ BOWER_API_URL: API, GITHUB_EVENT_PATH: await eventFile(), ...claudeEnv({ BOWER_MODEL: 'claude-opus-5-5', BOWER_MAX_TURNS: '12' }) }, { fetch: other.wire.fetch, claude: set.spawn });
    const setArgs = set.calls[0]?.args ?? [];
    expect(setArgs[setArgs.indexOf('--model') + 1]).toBe('claude-opus-5-5');
    expect(setArgs[setArgs.indexOf('--max-turns') + 1]).toBe('12');
  });
});
