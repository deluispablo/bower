import { lstat, realpath, readFile, open, rename, unlink, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { privatePathAllowed } from './guard.mjs';
const refuse = () => { throw new Error('Private R1 location refused.'); };
export function declarations(paths) {
  for (const path of Object.values(paths)) if (!privatePathAllowed(path)) refuse();
  if (new Set(Object.values(paths)).size !== Object.keys(paths).length) refuse();
}
export async function privateLocation(path, existing = true, io = { lstat, realpath, access }) {
  const { lstat: stat, realpath: real, access: check } = io;
  if (!privatePathAllowed(path)) refuse();
  const parent = await real(dirname(path)); if (!privatePathAllowed(parent)) refuse();
  const dir = await stat(parent); if (!dir.isDirectory() || dir.uid !== process.getuid() || (dir.mode & 0o077)) refuse();
  // Any ancestor published as an immutable packet is also forbidden, even outside known defaults.
  let ancestor = parent;
  for (;;) {
    try { await check(join(ancestor, 'packet-hashes.json')); refuse(); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const next = dirname(ancestor); if (next === ancestor) break; ancestor = next;
  }
  try { const file = await stat(path); if (!file.isFile() || file.isSymbolicLink() || file.uid !== process.getuid() || (file.mode & 0o077)) refuse(); }
  catch (e) { if (e.code !== 'ENOENT' || existing) throw e; }
}
export async function readPrivate(path) { await privateLocation(path); return JSON.parse(await readFile(path, 'utf8')); }
export function privateWriter(path) {
  return async (state) => {
    await privateLocation(path, false);
    const temp = `${path}.${randomUUID()}.tmp`;
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(`${JSON.stringify(state)}\n`); await file.sync(); }
    finally { await file.close(); }
    try { await privateLocation(path, false); await rename(temp, path); const dir = await open(dirname(path), 'r'); try { await dir.sync(); } finally { await dir.close(); } }
    catch (e) { await unlink(temp).catch(() => {}); throw e; }
  };
}
