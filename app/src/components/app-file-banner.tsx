/**
 * The amber banner shown on one of Bower's own files (spec §5.3, note.tsx):
 * explains what the file is for, with the same "Open in Drive" link pattern
 * `hydrate-embeds.ts` already uses for a file link (`driveViewUrl`).
 */

import type { JSX } from 'preact';

import type { DriveFile } from '../drive.js';
import { driveViewUrl } from '../markdown/embeds.js';
import '../styles/app-file-banner.css';

export interface AppFileBannerProps {
  file: DriveFile;
}

export function AppFileBanner({ file }: AppFileBannerProps): JSX.Element {
  return (
    <div class="app-file-banner" role="note">
      <p>
        One of Bower&rsquo;s own files. It tells the bird how to file your
        notes. You can edit it in Drive.
      </p>
      <a href={driveViewUrl(file)} target="_blank" rel="noopener">
        Open in Drive
      </a>
    </div>
  );
}
