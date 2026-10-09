/**
 * The dev server's dependency list, with its one test (src/vite-config.test.ts): every bare module the app imports is
 * pre-bundled when the server starts, so none is found late. A late find re-runs the optimizer and answers 504
 * "Outdated Optimize Dep" to the pages already loaded (https://vite.dev/config/dep-optimization-options#optimizedeps-include).
 */
export const OPTIMIZED_DEPS: string[] = [
  '@noble/hashes/legacy',
  '@noble/hashes/sha2',
  '@radix-ui/react-context-menu',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  'cmdk',
  'react',
  'react-dom',
  'react-dom/client',
  'react-router',
  'react/jsx-dev-runtime',
  'react/jsx-runtime',
  'zustand',
];

/** Pre-transformed at server start so the first page does not wait on a waterfall (https://vite.dev/guide/performance#warm-up-frequently-used-files). */
export const WARMUP_FILES: string[] = ['./src/main.tsx'];
