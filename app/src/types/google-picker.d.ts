/**
 * Ambient types for the slice of the Google Picker library (`apis.google.com
 * /js/api.js`, then `gapi.load('picker', ...)`) that `picker.ts` uses.
 * The library is loaded lazily at runtime, never installed as a dependency,
 * so there is no upstream `@types` package for it; this covers only what
 * `picker.ts` calls.
 */

declare namespace google.picker {
  /** The subset of `google.picker.Action` values this app checks for. */
  type Action = 'picked' | 'cancel';

  /** One Drive item as it appears in a picker result's `docs` array. */
  interface ResponseDocument {
    id: string;
  }

  /** What `PickerBuilder.setCallback`'s callback receives. */
  interface ResponseObject {
    action: string;
    docs?: ResponseDocument[];
  }

  class DocsView {
    setIncludeFolders(include: boolean): this;
    setSelectFolderEnabled(enabled: boolean): this;
    setMimeTypes(mimeTypes: string): this;
  }

  interface Picker {
    setVisible(visible: boolean): void;
  }

  class PickerBuilder {
    addView(view: DocsView): this;
    setOAuthToken(token: string): this;
    setDeveloperKey(key: string): this;
    setCallback(callback: (data: ResponseObject) => void): this;
    build(): Picker;
  }
}

declare namespace gapi {
  interface LoadOptions {
    callback: () => void;
    onerror?: () => void;
  }

  /** `gapi.load('picker', { callback, onerror })`. */
  function load(api: string, options: LoadOptions): void;
}

interface Window {
  google?: typeof google;
  gapi?: typeof gapi;
}
