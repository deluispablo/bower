import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { identityPlugin } from './e2e/port.ts';
import { OPTIMIZED_DEPS, WARMUP_FILES } from './vite.deps.ts';

export default defineConfig({
  plugins: [
    react(),
    // Dev and preview servers only: tells e2e which worktree a server serves (e2e/port.ts).
    identityPlugin(),
    // Installable, and the app shell opens with no network. Only the shell is cached:
    // never Google Drive or the Worker (their answers are the person's own notes).
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // The external registration script does not reload an existing page.
      // Lifecycle and navigation routing live in src/sw.ts.
      manifest: {
        name: 'Bower',
        short_name: 'Bower',
        description: 'Your notes in your Google Drive, kept tidy by Bower.',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['landing/**'],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  optimizeDeps: { include: OPTIMIZED_DEPS },
  server: { port: 5190, strictPort: true, warmup: { clientFiles: WARMUP_FILES } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts', './testing/timer-gate-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
