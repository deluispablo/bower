import { execSync } from 'node:child_process';

import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import pkg from './package.json' with { type: 'json' };

// https://vite.dev/config/

// No `@types/node` in this repo (see CLAUDE.md); `process` is a real
// Node global at runtime (this file is never bundled, only run by the
// Vite CLI), so it's declared locally rather than pulling in the package.
declare const process: { env: Record<string, string | undefined> };
// `execSync`'s own minimal ambient type: `src/node-child-process.d.ts`.

/**
 * The commit the running build was made from, short form (#512): Cloudflare
 * Pages sets `CF_PAGES_COMMIT_SHA` (the full SHA) on every deploy, sliced
 * to match `git rev-parse --short`'s length; a local or CI build without
 * that var falls back to asking git directly. Neither available (no git
 * checkout, git missing) is not a build error — `settings.tsx`'s version
 * line just leaves the commit part off, so this returns `''` rather than
 * throwing.
 */
function resolveCommitSha(): string {
  const fromPages = process.env.CF_PAGES_COMMIT_SHA;
  if (fromPages !== undefined && fromPages !== '') {
    return fromPages.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Injects `<meta name="robots" content="noindex">` into `index.html`
 * unless this is the demo build (`VITE_DEMO=1`, `app/package.json`'s
 * `build:demo`): a real instance should never be indexed, the public demo
 * should (#194). Reads `process.env` directly (this runs in Node, at
 * build time), the same value `cross-env` sets for the `build:demo`
 * script.
 */
function noindexPlugin(): Plugin {
  return {
    name: 'bower-noindex',
    transformIndexHtml() {
      if (process.env.VITE_DEMO === '1') return [];
      return [
        {
          tag: 'meta',
          attrs: { name: 'robots', content: 'noindex' },
          injectTo: 'head',
        },
      ];
    },
  };
}

export default defineConfig({
  define: {
    // Fallback app version for the settings screen footer, used when
    // VITE_APP_VERSION isn't set. Kept in sync with the API by convention.
    __APP_VERSION__: JSON.stringify(pkg.version),
    // The short commit the settings screen footer shows next to the
    // version (#512); '' when it cannot be determined.
    __BOWER_COMMIT__: JSON.stringify(resolveCommitSha()),
  },
  plugins: [
    preact(),
    noindexPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      // The Web Share Target (`POST /add`) needs a custom `fetch` handler
      // that a generated service worker cannot have.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // The app shell only; the Worker API and Drive itself are never
        // cached offline. `woff2` covers the self-hosted fonts under
        // public/fonts/ (#136), precached the same way as the rest of the
        // shell.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      manifest: {
        name: 'Bower',
        short_name: 'Bower',
        description: 'Your notes, kept organised.',
        display: 'standalone',
        start_url: '/',
        theme_color: '#0b1220',
        background_color: '#ffffff',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        share_target: {
          action: '/add',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [{ name: 'files', accept: ['*/*'] }],
          },
        },
      },
    }),
  ],
});
