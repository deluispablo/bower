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
    name?: string;
    mimeType?: string;
    /** The folder the item sits in, when the Picker knows it. */
    parentId?: string;
  }

  /** What `PickerBuilder.setCallback`'s callback receives. */
  interface ResponseObject {
    action: string;
    docs?: ResponseDocument[];
  }

  /** The `google.picker.Feature` values this app enables. */
  const Feature: {
    readonly MULTISELECT_ENABLED: string;
  };

  class DocsView {
    constructor(viewId?: string);
    setIncludeFolders(include: boolean): this;
    setSelectFolderEnabled(enabled: boolean): this;
    setMimeTypes(mimeTypes: string): this;
    setOwnedByMe(me: boolean): this;
    setStarred(starred: boolean): this;
    /** `'root'` for My Drive: real folder navigation from that parent,
     * instead of a flat, unfiltered grid of every folder in the account. */
    setParent(parentId: string): this;
  }

  interface Picker {
    setVisible(visible: boolean): void;
  }

  class PickerBuilder {
    addView(view: DocsView): this;
    setOAuthToken(token: string): this;
    setDeveloperKey(key: string): this;
    setCallback(callback: (data: ResponseObject) => void): this;
    setTitle(title: string): this;
    enableFeature(feature: string): this;
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
