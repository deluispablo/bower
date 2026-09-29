/**
 * The single source of the inbox number (issue #745, spec §10 R-INBOX-1,
 * §7b T14). Home's Inbox card, Add's hint and the "Is that everything?"
 * dialog all read it, so they can never disagree (R-CONF-2, R-ADD-2).
 * Things (files and links) and requests are counted apart; the batch's
 * own context note is neither. While the listing loads it says `loading`,
 * never 0 (R-CONF-3).
 */

import type { DriveFile } from './drive.js';
import { pendingCount } from './navigation.js';
import { processedKind } from './run-progress.js';

export type InboxCount =
  | { status: 'loading' }
  | {
      status: 'ready';
      /** Files and links waiting to be filed. */
      things: number;
      /** `Bower - ` notes waiting to be answered. */
      requests: number;
      /** `things + requests`: the number every screen shows. */
      total: number;
    };

/**
 * The inbox's count. `loading` is true while the folder listing has not
 * resolved yet, when `files` cannot be trusted to be complete.
 */
export function inboxCount(
  files: readonly DriveFile[],
  loading: boolean,
): InboxCount {
  if (loading) return { status: 'loading' };
  let things = 0;
  let requests = 0;
  for (const file of files) {
    if (pendingCount([file]) !== 1) continue;
    const kind = processedKind(file.path, undefined);
    if (kind === 'context') continue;
    if (kind === 'request') requests += 1;
    else things += 1;
  }
  return { status: 'ready', things, requests, total: things + requests };
}

/** The number to show once the count is known, 0 while it loads. Callers
 * that render it must check `status` first (never show this 0 as a fact). */
export function inboxTotal(count: InboxCount): number {
  return count.status === 'ready' ? count.total : 0;
}
