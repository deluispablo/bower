/// <reference types="node" />
/** The e2e port and server identity (c4-e2e-port): one port per worktree, and a server is reused only if it serves this worktree. */
import { spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { checkIdentity, e2ePort, identityMiddleware } from '../e2e/port';

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

/** A scratch dev server that answers the identity route for `root`, as vite.config.ts does. */
const serving = async (root: string): Promise<number> => {
  const handle = identityMiddleware(root);
  const server = createServer((req, res) => handle(req, res, () => { res.statusCode = 404; res.end(); }));
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return (server.address() as AddressInfo).port;
};

describe('the e2e port and server identity', () => {
  it('two worktrees run e2e at once, each on its own server', () => {
    const a = e2ePort('dev', '/tmp/bower-a', {});
    const b = e2ePort('dev', '/tmp/bower-b', {});
    expect(a).not.toBe(b);
    expect(e2ePort('dev', '/tmp/bower-a', {})).toBe(a);
    for (const p of [a, b, e2ePort('preview', '/tmp/bower-a', {})]) expect(p).toBeGreaterThan(5192);
    expect(e2ePort('preview', '/tmp/bower-a', {})).not.toBe(a);
    expect(e2ePort('dev', '/tmp/bower-a', { E2E_PORT: '6123' })).toBe(6123);
    expect(() => e2ePort('dev', '/tmp/bower-a', { E2E_PORT: 'abc' })).toThrow(/E2E_PORT/);
  });

  it('a server from another worktree is never reused', async () => {
    const port = await serving('/tmp/bower-other');
    expect(await checkIdentity(port, '/tmp/bower-other')).toEqual({ state: 'own' });
    expect(await checkIdentity(port, '/tmp/bower-mine')).toEqual({ state: 'foreign', root: '/tmp/bower-other' });
    // The real entry point that starts a run: it refuses in one line naming the other root, and starts nothing.
    const run = spawnSync('node', [fileURLToPath(new URL('../e2e/serve.ts', import.meta.url)), 'dev'], {
      env: { ...process.env, E2E_PORT: String(port) },
      encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(run.stderr.trim().split('\n')).toHaveLength(1);
    expect(run.stderr).toContain('/tmp/bower-other');
  });
});
