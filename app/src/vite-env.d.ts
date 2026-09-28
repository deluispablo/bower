/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_VERSION?: string;
  /** Developer API key for the Google Picker (#53). Public by design. */
  readonly VITE_GOOGLE_API_KEY?: string;
  /** `'1'` builds the demo: no backend, Alex's sample notes (`src/demo/`). */
  readonly VITE_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by `vite.config.ts` from `package.json`'s `version`. */
declare const __APP_VERSION__: string;
