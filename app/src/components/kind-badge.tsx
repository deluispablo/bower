/**
 * The grey 3-4 letter badge of a file kind (spec §5, board `System-Folders`:
 * "Kinds are grey: colour belongs to the folders"). It is never coloured. The
 * letters are text, so the badge is readable by assistive technology.
 */

import type { JSX } from 'preact';

import '../styles/marks.css';

export type FileKind =
  | 'pdf'
  | 'photo'
  | 'csv'
  | 'excel'
  | 'word'
  | 'zip'
  | 'link'
  | 'video';

export const KIND_BADGES: Record<FileKind, string> = {
  pdf: 'PDF',
  photo: 'JPG',
  csv: 'CSV',
  excel: 'XLS',
  word: 'DOC',
  zip: 'ZIP',
  link: 'LINK',
  video: 'MP4',
};

export function KindBadge({ kind }: { kind: FileKind }): JSX.Element {
  return (
    <span class="kind-badge" data-kind={kind}>
      {KIND_BADGES[kind]}
    </span>
  );
}
