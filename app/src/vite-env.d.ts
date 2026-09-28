/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_VERSION?: string;
  /** Developer API key for the Google Picker (#53). Public by design. */
  readonly VITE_GOOGLE_API_KEY?: string;
  /** `'1'` builds the demo: no backend, Alex's sample notes (`src/demo/`). */
  readonly VITE_DEMO?: string;
  /** The "what is Bower" site page, linked from "Run your own Bower"
   * (#193). Unset hides that link rather than pointing nowhere. */
  readonly VITE_ABOUT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by `vite.config.ts` from `package.json`'s `version`. */
declare const __APP_VERSION__: string;

/** Injected by `vite.config.ts` (#512): the short commit the build was
 * made from, or `''` when it could not be determined. */
declare const __BOWER_COMMIT__: string;
