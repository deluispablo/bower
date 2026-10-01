/**
 * The Drive ids the tab ⋯ menus open (R-API-5, #922): the Bower folder and
 * its inbox from the vault pointer the Worker keeps (`GET /me`), the rules
 * file from the vault listing. An id that is not loaded yet, or points at a
 * folder the Worker found gone (`missingAt`), is left out, so the menu hides
 * that item instead of opening a broken Drive page. Pure.
 */

import type { Vault } from './api.js';
import type { DriveFile } from './drive.js';
import type { MenuDriveIds } from './components/note-menu.js';

/** The person's rules file, at the top of the Bower folder. */
export const RULES_FILE_PATH = 'Rules.md';

/** What `menuDriveIds` reads: the vault pointer and the listing, as loaded. */
export interface MenuDriveSources {
  vault:
    Pick<Vault, 'folderId' | 'inboxFolderId' | 'missingAt'> | null | undefined;
  byPath: ReadonlyMap<string, Pick<DriveFile, 'id'>> | null | undefined;
}

/** The ids each tab menu may open; an item without its id stays hidden. */
export function menuDriveIds({
  vault,
  byPath,
}: MenuDriveSources): MenuDriveIds {
  const ids: MenuDriveIds = {};
  if (vault !== null && vault !== undefined && vault.missingAt === undefined) {
    if (vault.folderId !== '') ids.root = vault.folderId;
    if (vault.inboxFolderId !== '') ids.inbox = vault.inboxFolderId;
  }
  const rules = byPath?.get(RULES_FILE_PATH)?.id;
  if (rules !== undefined && rules !== '') ids.rules = rules;
  return ids;
}
