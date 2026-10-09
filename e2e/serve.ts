// Starts this worktree's e2e server (dev, or the production preview), unless another worktree's server holds the port.
// Playwright runs it only when no server of this worktree answers (e2e/port.ts).
import { spawn } from 'node:child_process';
import { checkIdentity, e2ePort, ROOT } from './port.ts';

const kind = process.argv[2] === 'preview' ? 'preview' : 'dev';
const port = e2ePort(kind);
const seen = await checkIdentity(port);
if (seen.state === 'foreign') {
  console.error(`Port ${port} is served by another worktree (${seen.root}); set ${kind === 'dev' ? 'E2E_PORT' : 'E2E_PREVIEW_PORT'} or stop it.`);
  process.exit(1);
}
if (seen.state === 'unknown') {
  console.error(`Port ${port} is taken by a server that does not say which worktree it serves; set ${kind === 'dev' ? 'E2E_PORT' : 'E2E_PREVIEW_PORT'}.`);
  process.exit(1);
}
const args = ['exec', 'vite', ...(kind === 'preview' ? ['preview'] : []), '--port', String(port), '--strictPort'];
const child = spawn('pnpm', args, { cwd: ROOT, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
