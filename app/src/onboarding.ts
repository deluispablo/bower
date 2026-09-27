/**
 * Pure helpers for the onboarding screen and the first-run tour. No DOM, no
 * fetch: unit-tested directly.
 */

import type { Me } from './api.js';

const BARE_ID = /^[a-zA-Z0-9_-]+$/;
const FOLDERS_SEGMENT = /\/folders\/([a-zA-Z0-9_-]+)/;

/**
 * Extracts a Drive folder id from a bare id or a Drive URL the user pasted:
 * `https://drive.google.com/drive/folders/<id>`,
 * `https://drive.google.com/drive/u/0/folders/<id>?usp=…`, or
 * `https://drive.google.com/open?id=<id>`. Trims surrounding whitespace.
 * Returns `null` for anything else.
 */
export function parseFolderId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (BARE_ID.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.hostname !== 'drive.google.com') return null;

  const foldersMatch = FOLDERS_SEGMENT.exec(url.pathname);
  const folderId = foldersMatch?.[1];
  if (folderId !== undefined && folderId !== '') return folderId;

  if (url.pathname === '/open') {
    const id = url.searchParams.get('id');
    if (id !== null && id !== '') return id;
  }

  return null;
}

/**
 * Whether Home shows the first-run tour (spec §7): once per account, when it
 * has a folder and the Worker has no `tourSeenAt` for it, or whenever
 * Settings › Show me around again asked for a replay (`replay`, a one-shot
 * flag kept in memory, never a pref).
 */
export function shouldShowTour(me: Me, replay: boolean): boolean {
  if (replay) return true;
  return me.vault !== null && me.tourSeenAt === undefined;
}
