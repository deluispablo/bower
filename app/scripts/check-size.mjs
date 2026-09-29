#!/usr/bin/env node
/**
 * Performance budget (#41): sums the gzipped size of every JS asset
 * `dist/index.html` loads on start — its `<script type="module" src>` tags
 * and `<link rel="modulepreload" href>` links — and fails the build if the
 * total is over budget.
 *
 * Plain `node:zlib` plus a small regex scan of the built `index.html`, no
 * `size-limit` dependency: this is a single gzip-and-sum, cheap enough to
 * write directly.
 *
 * Run via `pnpm -C app size`, and appended to `pnpm -C app build` so a PR
 * can't grow the bundle past budget unnoticed.
 *
 * Plain `.mjs`, no `@types/node` (the repo has none): `console` and
 * `process` are imported, never used as globals, so ESLint's `no-undef` is
 * satisfied without a Node globals config (same trick as
 * `api/scripts/bundle-template.mjs`).
 */

import console from 'node:console';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST_DIR = path.join(APP_DIR, 'dist');
const BUDGET_BYTES = 170 * 1024; // 170 KB gzipped (raised for v5; see docs/decisions.md)

/** The value of `name="..."` (single or double quoted) inside an HTML tag. */
function extractAttr(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'),
  );
  return match?.[1];
}

/**
 * Every `.js` path `html` loads on start: `<script type="module" src>` and
 * `<link rel="modulepreload" href>`, in document order, de-duplicated.
 * Attribute order within the tag doesn't matter.
 */
export function startupScriptPaths(html) {
  const paths = [];
  const seen = new Set();
  for (const match of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    const tagName = match[1]?.toLowerCase();
    let src;
    if (tagName === 'script' && extractAttr(tag, 'type') === 'module') {
      src = extractAttr(tag, 'src');
    } else if (
      tagName === 'link' &&
      extractAttr(tag, 'rel') === 'modulepreload'
    ) {
      src = extractAttr(tag, 'href');
    }
    if (src !== undefined && src.endsWith('.js') && !seen.has(src)) {
      seen.add(src);
      paths.push(src);
    }
  }
  return paths;
}

function gzipSize(filePath) {
  return gzipSync(readFileSync(filePath)).length;
}

function main() {
  const html = readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
  const scripts = startupScriptPaths(html);

  if (scripts.length === 0) {
    console.error(
      'check-size: found no startup <script type="module"> in dist/index.html',
    );
    process.exit(1);
  }

  let total = 0;
  for (const src of scripts) {
    const filePath = path.join(DIST_DIR, src.replace(/^\/+/, ''));
    total += gzipSize(filePath);
  }

  const totalKB = (total / 1024).toFixed(1);
  const budgetKB = (BUDGET_BYTES / 1024).toFixed(0);
  console.log(
    `check-size: ${scripts.length} startup script(s), ${totalKB} KB gzipped (budget ${budgetKB} KB)`,
  );

  if (total > BUDGET_BYTES) {
    console.error(
      `check-size: over budget by ${((total - BUDGET_BYTES) / 1024).toFixed(1)} KB`,
    );
    process.exit(1);
  }
}

main();
