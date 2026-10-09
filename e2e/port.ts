import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * The one home of the e2e port and of the dev server's identity (c4-e2e-port). Used by every Playwright config.
 *
 * Each worktree gets its own port, a hash of its root, so two worktrees never share a server; `E2E_PORT` (dev) and
 * `E2E_PREVIEW_PORT` (production preview) override it. A server already listening there is reused only when it answers
 * the identity route below with this worktree's root. Playwright reuses a server when `webServer.url` answers OK
 * (https://playwright.dev/docs/test-webserver#configuring-a-web-server), so the url carries our root and a foreign server
 * answers 409; the command (e2e/serve.ts) then refuses in one line. The route is a Vite plugin hook that exists only on
 * the dev and preview servers (https://vite.dev/guide/api-plugin#configureserver), never in the build.
 */
export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
export const IDENTITY_PATH = '/__bower-e2e-root';

type Kind = 'dev' | 'preview';
const RANGE: Record<Kind, { base: number; env: string }> = {
  dev: { base: 5300, env: 'E2E_PORT' },
  preview: { base: 7300, env: 'E2E_PREVIEW_PORT' },
};

export function e2ePort(kind: Kind, root: string = ROOT, env: Record<string, string | undefined> = process.env): number {
  const { base, env: name } = RANGE[kind];
  const given = env[name];
  if (given !== undefined && given !== '') {
    const n = Number(given);
    if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error(`${name} must be a port from 1024 to 65535.`);
    return n;
  }
  return base + (createHash('sha1').update(`${kind}:${root}`).digest().readUInt32BE(0) % 2000);
}

/** The route every dev and preview server of a worktree answers: 200 with its root, or 409 if the asker names another root. */
export function identityMiddleware(root: string = ROOT): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== IDENTITY_PATH) return next();
    const asked = url.searchParams.get('root');
    res.statusCode = asked === null || asked === root ? 200 : 409;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ root }));
  };
}

/** Vite plugin for vite.config.ts: serve-only hooks, so nothing reaches the production build. */
export function identityPlugin(root: string = ROOT): Plugin {
  const handle = identityMiddleware(root);
  return {
    name: 'bower-e2e-identity',
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}

export type Identity = { state: 'free' } | { state: 'own' } | { state: 'foreign'; root: string } | { state: 'unknown' };

export async function checkIdentity(port: number, root: string = ROOT): Promise<Identity> {
  let res: Response;
  try {
    res = await fetch(`http://localhost:${port}${IDENTITY_PATH}`);
  } catch {
    return { state: 'free' };
  }
  try {
    const body = (await res.json()) as { root?: unknown };
    if (typeof body.root !== 'string') return { state: 'unknown' };
    return body.root === root ? { state: 'own' } : { state: 'foreign', root: body.root };
  } catch {
    return { state: 'unknown' };
  }
}

/** The `webServer` and `baseURL` of a Playwright config. */
export function e2eServer(kind: Kind): { baseURL: string; webServer: { command: string; url: string; cwd: string; reuseExistingServer: true } } {
  const port = e2ePort(kind);
  const serve = fileURLToPath(new URL('./serve.ts', import.meta.url));
  return {
    baseURL: `http://localhost:${port}`,
    webServer: {
      command: `node "${serve}" ${kind}`,
      url: `http://localhost:${port}${IDENTITY_PATH}?root=${encodeURIComponent(ROOT)}`,
      cwd: ROOT,
      reuseExistingServer: true,
    },
  };
}
