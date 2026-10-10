#!/usr/bin/env node
/** The one scan for guarded paths and added staged lines. No source text appears in errors. */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @param {string[]} paths @param {string} diff @returns {string[]} */
export function scanStaged(paths, diff) {
  const problems = [];
  for (const path of paths) {
    const parts = path.split('/');
    const name = basename(path);
    if (parts.some((part) => ['.claude', '.agents', '.githooks'].includes(part)) ||
        /^scripts\/guard-.*\.mjs$/.test(path) ||
        ['scripts/check-hook-scripts.mjs', 'scripts/check-agent-defs.mjs'].includes(path) ||
        /^settings.*\.json$/.test(name) || name.startsWith('.env')) {
      problems[problems.length] = `Guarded path: ${JSON.stringify(path)}`;
    }
  }
  const secret = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|\bAKIA[A-Z0-9]{16}\b|\b(?:sk-|ghp_|github_pat_|xox[bp]-)[A-Za-z0-9_-]{8,}|\bclient_secret\b/i;
  const origin = /\b[a-z0-9][a-z0-9.-]*\.workers\.dev\b/i;
  const email = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi;
  const serviceAddress = ['noreply', 'anthropic.com'].join('@');
  let inHunk = !diff.includes('@@');
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) { inHunk = false; continue; }
    if (line.startsWith('@@')) { inHunk = true; continue; }
    if (!inHunk || !line.startsWith('+')) continue;
    const added = line.slice(1);
    if (secret.test(added)) problems[problems.length] = 'Added line contains a secret pattern.';
    if (origin.test(added)) problems[problems.length] = 'Added line contains a service origin.';
    for (const address of added.match(email) ?? []) {
      if (!address.endsWith('@example.com') && address !== serviceAddress) {
        problems[problems.length] = 'Added line contains an address.';
      }
    }
  }
  return problems;
}

// Importing the pure function never runs the CLI.
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const paths = git(['diff', '--cached', '--name-only', '--no-renames', '-z']).split('\0').filter(Boolean);
    const diff = git(['diff', '--cached', '--no-renames', '--no-ext-diff', '--no-textconv', '--unified=0']);
    const problems = scanStaged(paths, diff);
    if (problems.length) { console.error(problems.join('\n')); process.exitCode = 3; }
  } catch (error) {
    console.error(`Staged scan failed: ${error.message}`);
    process.exitCode = 3;
  }
}
