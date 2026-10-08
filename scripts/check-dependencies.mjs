#!/usr/bin/env node
// Usage: check-dependencies.mjs [--root <dir>]
// Runs dependency-cruiser (rules in .dependency-cruiser.cjs) on src, runner/src and api/src of <dir>.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--root');
const root = i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : process.cwd();
const targets = ['src', 'runner/src', 'api/src'].filter((d) => fs.existsSync(path.join(root, d)));
const r = spawnSync(path.join(here, 'node_modules/.bin/depcruise'), [...targets, '--config', path.join(here, '.dependency-cruiser.cjs')], { cwd: root, encoding: 'utf8' });
process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
