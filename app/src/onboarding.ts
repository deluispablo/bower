/**
 * Pure helpers for the onboarding screen. No DOM, no fetch: unit-tested
 * directly.
 */

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
