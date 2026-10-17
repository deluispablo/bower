import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchOf, main } from '../src/main';
import { RUN_ID, TICKET } from './drive-v3';

afterEach(() => vi.restoreAllMocks());

const STAGING = 'https://staging.example.com';
const PROD = 'https://api.example.com';
const REFUSED = "This run's Worker is not one this repository serves; add its origin to BOWER_API_URL.";
const MALFORMED = "BOWER_API_URL must be the Worker's origin, for example https://api.example.com (a repository variable).";

async function eventFile(payload: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bower-origin-'));
  const file = join(dir, 'event.json');
  await writeFile(file, JSON.stringify({ client_payload: { run_id: RUN_ID, attempt: 1, ticket: TICKET, scope: 'all', allow_web: false, ...payload } }));
  return file;
}

/** One run of `main` with a fetch that must stay untouched: the exit code, what it said, and the fetch calls. */
async function refused(variable: string | undefined, payload: Record<string, unknown>): Promise<{ code: number; said: string[]; calls: number; out: string }> {
  vi.restoreAllMocks();
  const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new Error('the ticket was sent')));
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const code = await main({ ...(variable === undefined ? {} : { BOWER_API_URL: variable }), GITHUB_EVENT_PATH: await eventFile(payload), GITHUB_ACTIONS: 'true' }, { fetch: fetchMock });
  const said = err.mock.calls.map((c) => String(c[0]));
  const out = [...stdout.mock.calls, ...log.mock.calls].map((c) => String(c[0])).join('');
  return { code, said, calls: fetchMock.mock.calls.length, out };
}

describe('one instance repository serves several Workers', () => {
  it('dispatchOf keeps api_url, and a present api_url that is not an origin is malformed', () => {
    const base = { run_id: RUN_ID, attempt: 1, ticket: TICKET, scope: 'all' };
    expect(dispatchOf({ client_payload: { ...base, api_url: PROD } })?.apiUrl).toBe(PROD);
    expect(dispatchOf({ client_payload: base })?.apiUrl).toBeUndefined();
    for (const bad of ['', 7, null, false, 'not an origin', `${PROD}/`, `${PROD}/path`]) {
      expect(dispatchOf({ client_payload: { ...base, api_url: bad } }), String(bad)).toBeNull();
    }
  });

  it('an unlisted origin is refused with the fixed sentence, naming no origin, with no call made', async () => {
    const r = await refused(PROD, { api_url: STAGING });
    expect(r.code).toBe(1);
    expect(r.said).toEqual([REFUSED]);
    expect(r.calls).toBe(0);
    expect(r.said.join('')).not.toContain(STAGING);
  });

  it('a lookalike, another case, port, scheme or trailing slash does not match a listed origin', async () => {
    for (const lookalike of [`${PROD}.evil`, 'https://API.example.com', `${PROD}:8443`, 'http://api.example.com', `${PROD}/`]) {
      const r = await refused(PROD, { api_url: lookalike });
      expect(r.code, lookalike).toBe(1);
      expect(r.calls, lookalike).toBe(0);
      expect(r.said.length, lookalike).toBe(1);
    }
    expect((await refused(PROD, { api_url: `${PROD}.evil` })).said).toEqual([REFUSED]);
  });

  it('a malformed api_url refuses and never falls back to the listed origin', async () => {
    for (const bad of ['', 7, null, 'not an origin']) {
      const r = await refused(PROD, { api_url: bad });
      expect(r.code, String(bad)).toBe(1);
      expect(r.calls, String(bad)).toBe(0);
      expect(r.said.join(' '), String(bad)).toContain('No bower-tidy dispatch to run');
    }
  });

  it('a dispatch without api_url refuses when two origins are listed', async () => {
    const r = await refused(`${STAGING},${PROD}`, {});
    expect(r.code).toBe(1);
    expect(r.said).toEqual([REFUSED]);
    expect(r.calls).toBe(0);
  });

  it('a malformed variable keeps its own sentence, one bad entry refusing the whole list', async () => {
    for (const variable of [undefined, '', ' , ', `${PROD},not an origin`, `${PROD}/,${STAGING}`]) {
      const r = await refused(variable, { api_url: PROD });
      expect(r.code, String(variable)).toBe(1);
      expect(r.said, String(variable)).toEqual([MALFORMED]);
      expect(r.calls).toBe(0);
    }
  });

  it('the ticket is masked before a refusal can print anything', async () => {
    const r = await refused(PROD, { api_url: STAGING });
    expect(r.out).toContain(`::add-mask::${TICKET}`);
    expect(r.said.join('')).not.toContain(TICKET);
  });

  it('a listed origin (spaces and empty entries allowed) is the one the run calls; no api_url uses a lone listed origin', async () => {
    for (const [variable, payload, calledOrigin] of [
      [` ${STAGING} , ,${PROD} `, { api_url: PROD }, PROD],
      [`${STAGING},${PROD}`, { api_url: STAGING }, STAGING],
      [` ${PROD} `, {}, PROD],
    ] as const) {
      const urls: string[] = [];
      const fetchMock = vi.fn<typeof fetch>((input) => {
        urls.push(String(input));
        return Promise.reject(new Error('stop here'));
      });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await main({ BOWER_API_URL: variable, GITHUB_EVENT_PATH: await eventFile(payload) }, { fetch: fetchMock, pacing: { sleep: () => Promise.resolve() } });
      expect(urls.length, variable).toBeGreaterThan(0);
      expect(urls.every((u) => u.startsWith(`${calledOrigin}/`)), `${variable}: ${urls.join(' ')}`).toBe(true);
    }
  });
});
