#!/usr/bin/env node
/**
 * Generates `dist/_headers` (#184): Cloudflare Pages reads this file on
 * deploy and applies its rules to every response the app serves.
 *
 * Built from the same `VITE_`-prefixed values Vite bakes into the bundle:
 * `VITE_API_URL` (the Worker's origin, added to `connect-src`) and, only
 * when set at build time, `VITE_GOOGLE_API_KEY` (adds
 * `https://apis.google.com` to `script-src` and `frame-src` for the Google
 * Picker, see `app/src/picker.ts`). `loadEnv` (from `vite`, already a
 * dependency) reads `.env` files and `process.env` the same way Vite itself
 * does, so this script and the build can never disagree on the values.
 *
 * `style-src` needs `'unsafe-inline'`: several components set a dynamic
 * inline `style` attribute (`tree.tsx`'s and `working-sheet.tsx`'s row
 * indent and progress width, `add.tsx`'s upload progress, `onboarding.tsx`'s
 * animation delay) — CSP treats an inline `style` attribute the same as an
 * inline `<style>` block. Nothing else in the built output is inline
 * (`app/dist/index.html` has no inline `<script>` or `<style>`), so
 * `script-src` stays free of `'unsafe-inline'`.
 *
 * `buildHeaders` is pure and unit-tested
 * (`app/test/generate-headers.test.ts`); `main` only does I/O — reading the
 * env and writing the file — and is never called from tests.
 *
 * Plain `.mjs`, no `@types/node` (the repo has none): every Node API is
 * imported, never used as a global, so ESLint's `no-undef` is satisfied
 * without a Node globals config (same trick as
 * `api/scripts/bundle-template.mjs`).
 *
 * Run via `pnpm -C app build` (appended to the `build` script, after
 * `vite build` so `dist/` already exists).
 */

import console from 'node:console';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { loadEnv } from 'vite';

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** The origin (`https://host`) of a URL, or `null` if it does not parse. */
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The `dist/_headers` file content for `/*`, given the API's public URL
 * (`apiUrl`) and an optional Google Picker API key (`googleApiKey`). Throws
 * if `apiUrl` is missing or not a URL: a broken `connect-src` origin must
 * fail the build loudly, never ship as a placeholder or an empty directive.
 */
export function buildHeaders({ apiUrl, googleApiKey }) {
  const apiOrigin = originOf(apiUrl ?? '');
  if (apiOrigin === null) {
    throw new Error(
      `generate-headers: VITE_API_URL is missing or not a URL (got ${JSON.stringify(apiUrl)})`,
    );
  }
  const pickerEnabled = googleApiKey !== undefined && googleApiKey !== '';
  const picker = pickerEnabled ? ' https://apis.google.com' : '';

  const csp = [
    `default-src 'self'`,
    `script-src 'self'${picker}`,
    `style-src 'self' 'unsafe-inline'`,
    `connect-src 'self' ${apiOrigin} https://www.googleapis.com`,
    `img-src 'self' data: blob: https://lh3.googleusercontent.com`,
    `font-src 'self'`,
    `worker-src 'self'`,
    ...(pickerEnabled ? [`frame-src${picker}`] : []),
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  return `/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Referrer-Policy: no-referrer
`;
}

function main() {
  const env = loadEnv('production', APP_DIR, 'VITE_');
  const content = buildHeaders({
    apiUrl: env.VITE_API_URL,
    googleApiKey: env.VITE_GOOGLE_API_KEY,
  });
  const outFile = path.join(APP_DIR, 'dist', '_headers');
  writeFileSync(outFile, content);
  console.log('generate-headers: wrote dist/_headers');
}

// Only run when executed directly (`node scripts/generate-headers.mjs`),
// never when `buildHeaders` above is imported by the test.
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
