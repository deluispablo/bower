/**
 * Google Picker for the onboarding "Choose a folder" button (#53) and for
 * Add's "From your Drive" button (#217). The
 * Picker library is never bundled: `loadPicker` injects
 * `https://apis.google.com/js/api.js` on first call and waits for
 * `gapi.load('picker', ...)`, so nothing is fetched until a user actually
 * clicks the button. `folderIdFromPickerResponse` and
 * `filesFromPickerResponse` are pure and unit-tested; `loadPicker`,
 * `openFolderPicker` and `openFilePicker` touch the DOM and `google.picker`
 * directly and are never called in tests.
 */

const SCRIPT_SRC = 'https://apis.google.com/js/api.js';

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise !== null) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`) !== null) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      reject(new Error('Could not load the Google Picker library.'));
    };
    document.head.appendChild(script);
  });
  // A failed load must not be cached: the next call should try again.
  scriptPromise.catch(() => {
    scriptPromise = null;
  });
  return scriptPromise;
}

let pickerPromise: Promise<typeof google.picker> | null = null;

/**
 * Loads the Picker library (once; concurrent and later calls share the same
 * load) and resolves to the `google.picker` namespace. Rejects if the
 * script or the `picker` module fails to load, so callers fall back to the
 * paste-a-link form. Never called from tests.
 */
export function loadPicker(): Promise<typeof google.picker> {
  if (pickerPromise !== null) return pickerPromise;
  pickerPromise = loadScript().then(
    () =>
      new Promise<typeof google.picker>((resolve, reject) => {
        const gapiRef = window.gapi;
        if (gapiRef === undefined) {
          reject(new Error('gapi did not load.'));
          return;
        }
        gapiRef.load('picker', {
          callback: () => {
            const picker = window.google?.picker;
            if (picker === undefined) {
              reject(new Error('The Picker module did not load.'));
              return;
            }
            resolve(picker);
          },
          onerror: () => {
            reject(new Error('The Picker module did not load.'));
          },
        });
      }),
  );
  pickerPromise.catch(() => {
    pickerPromise = null;
  });
  return pickerPromise;
}

/**
 * Builds and shows a folder-only Picker: an existing Drive folder the user
 * owns or can see, never a file. `onResult` receives the raw picker
 * response; pass it to `folderIdFromPickerResponse` to read the folder id.
 */
export function openFolderPicker(
  pickerApi: typeof google.picker,
  accessToken: string,
  apiKey: string,
  onResult: (data: google.picker.ResponseObject) => void,
): void {
  const view = new pickerApi.DocsView()
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
    .setMimeTypes('application/vnd.google-apps.folder');
  new pickerApi.PickerBuilder()
    .addView(view)
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .setCallback(onResult)
    .build()
    .setVisible(true);
}

/**
 * The chosen folder's Drive id from a Picker response, or `null` if the
 * user cancelled or the response holds no usable document (for example a
 * `picked` action with an empty `docs` array). Pure: no DOM, no
 * `google.picker`, unit-tested directly.
 */
export function folderIdFromPickerResponse(
  data: google.picker.ResponseObject,
): string | null {
  if (data.action !== 'picked') return null;
  const id = data.docs?.[0]?.id;
  return typeof id === 'string' && id !== '' ? id : null;
}

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

/**
 * Builds and shows the Picker for Add's "From your Drive" button: several
 * files and folders at once, over four views (recent files, the ones the
 * user owns, the ones shared with them, the starred ones). Same library
 * load and Drive access token as `openFolderPicker`. `onResult` receives
 * the raw picker response; pass it to `filesFromPickerResponse`.
 */
export function openFilePicker(
  pickerApi: typeof google.picker,
  accessToken: string,
  apiKey: string,
  onResult: (data: google.picker.ResponseObject) => void,
): void {
  const view = (): google.picker.DocsView =>
    new pickerApi.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true);
  new pickerApi.PickerBuilder()
    // Recent first: the plain view lists everything, newest first.
    .addView(view())
    .addView(view().setOwnedByMe(true))
    .addView(view().setOwnedByMe(false))
    .addView(view().setStarred(true))
    .enableFeature(pickerApi.Feature.MULTISELECT_ENABLED)
    .setTitle('From your Drive')
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .setCallback(onResult)
    .build()
    .setVisible(true);
}

/** One item picked with `openFilePicker`. */
export interface PickedItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
}

export interface PickedFiles {
  /** The picks to copy, in the order the Picker returned them. */
  items: PickedItem[];
  /** Picks left out because they are the Bower folder or sit right in it. */
  excluded: number;
}

/**
 * The files and folders in a Picker response, minus the Bower folder
 * itself and anything directly inside it (the Picker cannot hide a folder,
 * so it is filtered here). A cancelled or empty response gives no items.
 * A document without an id is skipped; one without a name gets
 * "Untitled". Pure: no DOM, no `google.picker`, unit-tested directly.
 */
export function filesFromPickerResponse(
  data: google.picker.ResponseObject,
  bowerFolderId: string | null,
): PickedFiles {
  const result: PickedFiles = { items: [], excluded: 0 };
  if (data.action !== 'picked' || data.docs === undefined) return result;
  for (const doc of data.docs) {
    if (typeof doc.id !== 'string' || doc.id === '') continue;
    if (
      bowerFolderId !== null &&
      (doc.id === bowerFolderId || doc.parentId === bowerFolderId)
    ) {
      result.excluded++;
      continue;
    }
    const mimeType = typeof doc.mimeType === 'string' ? doc.mimeType : '';
    result.items.push({
      id: doc.id,
      name:
        typeof doc.name === 'string' && doc.name !== '' ? doc.name : 'Untitled',
      mimeType,
      isFolder: mimeType === FOLDER_MIME_TYPE,
    });
  }
  return result;
}
