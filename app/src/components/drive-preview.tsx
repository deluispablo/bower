/**
 * Drive's own preview of a file, in a frame (issue #604, boards
 * `Phone-File-Excel` and `Phone-File-Video`): Office files and videos, which
 * Bower keeps but cannot show itself. The label says whose picture it is.
 */

import type { JSX } from 'preact';

import { drivePreviewUrl } from '../file-preview.js';

export function DrivePreview({
  id,
  title,
  label,
  demo = false,
}: {
  id: string;
  title: string;
  /** "Preview from Google Drive", or "Plays from Google Drive" for video. */
  label: string;
  /** The demo's ids are not Drive's: no frame, one sentence instead. */
  demo?: boolean;
}): JSX.Element {
  return (
    <figure class="drive-preview">
      <figcaption>{label}</figcaption>
      {demo ? (
        <p class="file-preview-note">
          Not in the demo. Run your own Bower to use it.
        </p>
      ) : (
        <iframe
          src={drivePreviewUrl(id)}
          title={`${title}: ${label}`}
          loading="lazy"
          referrerpolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups"
          allow="fullscreen"
        />
      )}
    </figure>
  );
}
