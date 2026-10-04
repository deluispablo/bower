import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    // Installable, and the app shell opens with no network. Only the shell is cached:
    // never Google Drive or the Worker (their answers are the person's own notes).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
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
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['landing/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/landing/],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5190, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
