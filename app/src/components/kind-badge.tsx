/**
 * The grey 3-4 letter badge of a file kind (spec §5, board `System-Folders`:
 * "Kinds are grey: colour belongs to the folders"). It is never coloured. The
 * letters come from `kindBadge` (`vault-index.ts`) and are text, so the badge
 * is readable by assistive technology.
 */

import type { JSX } from 'preact';

import { kindBadge } from '../vault-index.js';
import type { DriveFile } from '../drive.js';
import type { FileKind } from '../vault-index.js';

import '../styles/marks.css';

export function KindBadge({
  kind,
  file,
}: {
  kind: FileKind;
  file?: Pick<DriveFile, 'name' | 'mimeType'>;
}): JSX.Element {
  return (
    <span class="kind-badge" data-kind={kind}>
      {kindBadge(kind, file)}
    </span>
  );
}
