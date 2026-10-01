import { describe, expect, it } from 'vitest';

import {
  FILE_PICKER_VIEWS,
  filesFromPickerResponse,
  folderIdFromPickerResponse,
  openFilePicker,
} from '../src/picker.js';

describe('openFilePicker', () => {
  it('shows two views only, My Drive and Shared with me (R-API-6)', () => {
    const views: { label?: string; parent?: string; ownedByMe?: boolean }[] =
      [];
    class DocsView {
      state: { label?: string; parent?: string; ownedByMe?: boolean } = {};
      constructor() {
        views.push(this.state);
      }
      setIncludeFolders(): this {
        return this;
      }
      setSelectFolderEnabled(): this {
        return this;
      }
      setParent(parent: string): this {
        this.state.parent = parent;
        return this;
      }
      setOwnedByMe(me: boolean): this {
        this.state.ownedByMe = me;
        return this;
      }
      setLabel(label: string): this {
        this.state.label = label;
        return this;
      }
    }
    const added: unknown[] = [];
    interface Builder {
      addView(view: DocsView): Builder;
      enableFeature(): Builder;
      setTitle(): Builder;
      setOAuthToken(): Builder;
      setDeveloperKey(): Builder;
      setCallback(): Builder;
      build(): { setVisible(): void };
    }
    const builder: Builder = {
      addView(view) {
        added.push(view);
        return builder;
      },
      enableFeature: () => builder,
      setTitle: () => builder,
      setOAuthToken: () => builder,
      setDeveloperKey: () => builder,
      setCallback: () => builder,
      build: () => ({ setVisible: (): void => undefined }),
    };
    const api = {
      DocsView,
      PickerBuilder: function PickerBuilder() {
        return builder;
      },
      Feature: { MULTISELECT_ENABLED: 'multi' },
    } as unknown as typeof google.picker;

    openFilePicker(api, 'TOKEN', 'KEY', () => undefined);

    expect(added).toHaveLength(2);
    expect(views.map((view) => view.label)).toEqual([...FILE_PICKER_VIEWS]);
    expect(FILE_PICKER_VIEWS).toEqual(['My Drive', 'Shared with me']);
    expect(views[0]?.parent).toBe('root');
    expect(views[1]?.ownedByMe).toBe(false);
  });
});

describe('folderIdFromPickerResponse', () => {
  it('returns the folder id for a picked response', () => {
    expect(
      folderIdFromPickerResponse({
        action: 'picked',
        docs: [{ id: 'FOLDER_ID' }],
      }),
    ).toBe('FOLDER_ID');
  });

  it('returns null when the user cancelled', () => {
    expect(folderIdFromPickerResponse({ action: 'cancel' })).toBeNull();
  });

  it('returns null for a picked response with no docs', () => {
    expect(folderIdFromPickerResponse({ action: 'picked' })).toBeNull();
  });

  it('returns null for a picked response with an empty docs array', () => {
    expect(
      folderIdFromPickerResponse({ action: 'picked', docs: [] }),
    ).toBeNull();
  });

  it('returns null for an unexpected action', () => {
    expect(folderIdFromPickerResponse({ action: 'loaded' })).toBeNull();
  });
});

describe('filesFromPickerResponse', () => {
  it('returns every picked file and folder, folders flagged', () => {
    expect(
      filesFromPickerResponse(
        {
          action: 'picked',
          docs: [
            {
              id: 'PDF_ID',
              name: 'Lease agreement.pdf',
              mimeType: 'application/pdf',
              parentId: 'OTHER_ID',
            },
            {
              id: 'DIR_ID',
              name: 'Tax 2025',
              mimeType: 'application/vnd.google-apps.folder',
            },
          ],
        },
        new Set(['FOLDER_ID']),
      ),
    ).toEqual({
      items: [
        {
          id: 'PDF_ID',
          name: 'Lease agreement.pdf',
          mimeType: 'application/pdf',
          isFolder: false,
        },
        {
          id: 'DIR_ID',
          name: 'Tax 2025',
          mimeType: 'application/vnd.google-apps.folder',
          isFolder: true,
        },
      ],
      excluded: 0,
    });
  });

  it('leaves out the Bower folder and what sits right in it', () => {
    const result = filesFromPickerResponse(
      {
        action: 'picked',
        docs: [
          { id: 'FOLDER_ID', name: 'Bower' },
          { id: 'INBOX_ID', name: '0-Inbox', parentId: 'FOLDER_ID' },
          { id: 'PHOTO_ID', name: 'IMG_1.jpg', mimeType: 'image/jpeg' },
        ],
      },
      new Set(['FOLDER_ID']),
    );
    expect(result.items.map((item) => item.id)).toEqual(['PHOTO_ID']);
    expect(result.excluded).toBe(2);
  });

  // #312: a fixture parent chain three deep — the Bower root, its
  // "1-Projects" folder, and "1-Projects/Flat hunt" inside that — the shape
  // `knownFolderIds` is built from (every folder in the app's own index, at
  // any depth), to check a pick is refused wherever in that tree it sits,
  // not only right at the root.
  const ROOT_ID = 'FOLDER_ID';
  const PROJECTS_ID = 'PROJECTS_ID';
  const FLAT_HUNT_ID = 'FLAT_HUNT_ID';
  const knownFolderIds = new Set([ROOT_ID, PROJECTS_ID, FLAT_HUNT_ID]);

  it('leaves out a pick at any depth in the known folder tree', () => {
    const result = filesFromPickerResponse(
      {
        action: 'picked',
        docs: [
          // Sits right in the root: excluded by parent.
          { id: 'INBOX_ID', name: '0-Inbox', parentId: ROOT_ID },
          // Sits two levels down, inside a known subfolder: still excluded.
          {
            id: 'LISTING_ID',
            name: 'rentradar.example',
            parentId: FLAT_HUNT_ID,
          },
          // The known subfolder itself, picked directly: excluded by id.
          {
            id: PROJECTS_ID,
            name: '1-Projects',
            mimeType: 'application/vnd.google-apps.folder',
          },
          // Elsewhere in Drive, no relation to the known tree: kept.
          { id: 'PHOTO_ID', name: 'IMG_1.jpg', mimeType: 'image/jpeg' },
        ],
      },
      knownFolderIds,
    );
    expect(result.items.map((item) => item.id)).toEqual(['PHOTO_ID']);
    expect(result.excluded).toBe(3);
  });

  it('leaves out a dot-folder or a Processed folder by name, wherever it sits', () => {
    const result = filesFromPickerResponse(
      {
        action: 'picked',
        docs: [
          {
            id: 'DOT_ID',
            name: '.obsidian',
            mimeType: 'application/vnd.google-apps.folder',
          },
          {
            id: 'PROCESSED_ID',
            name: 'Processed',
            mimeType: 'application/vnd.google-apps.folder',
            // Not in `knownFolderIds`: the app never learns a hidden
            // folder's own id, so the name is the only signal here.
            parentId: 'SOME_OTHER_FOLDER',
          },
          {
            id: 'DIR_ID',
            name: 'Tax 2025',
            mimeType: 'application/vnd.google-apps.folder',
          },
        ],
      },
      new Set(),
    );
    expect(result.items.map((item) => item.id)).toEqual(['DIR_ID']);
    expect(result.excluded).toBe(2);
  });

  it('names an untitled pick and skips one without an id', () => {
    const result = filesFromPickerResponse(
      { action: 'picked', docs: [{ id: '' }, { id: 'X_ID' }] },
      new Set(),
    );
    expect(result.items).toEqual([
      { id: 'X_ID', name: 'Untitled', mimeType: '', isFolder: false },
    ]);
  });

  it('returns nothing for an empty or cancelled response', () => {
    const empty = { items: [], excluded: 0 };
    const ids = new Set(['FOLDER_ID']);
    expect(filesFromPickerResponse({ action: 'picked' }, ids)).toEqual(empty);
    expect(
      filesFromPickerResponse({ action: 'picked', docs: [] }, ids),
    ).toEqual(empty);
    expect(filesFromPickerResponse({ action: 'cancel' }, ids)).toEqual(empty);
  });
});
