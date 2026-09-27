import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import pkg from './package.json' with { type: 'json' };

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Fallback app version for the settings screen footer, used when
    // VITE_APP_VERSION isn't set. Kept in sync with the API by convention.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    preact(),
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
