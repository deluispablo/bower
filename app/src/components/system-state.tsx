/**
 * The system states every screen shares (issue #908, spec §3.38 R-SYS-1,
 * R-SYS-2, R-SYS-4, R-GLOBAL-7): a skeleton shaped like the content that
 * appears only after 300 ms without data, one error sentence with "Try
 * again", and the empty folder with the bird. Screens import these instead
 * of writing their own.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { Bird } from './bird.js';

import '../styles/system-state.css';

/** A skeleton waits this long before it shows (no flash on a fast load). */
export const SKELETON_DELAY_MS = 300;

export type SkeletonShape = 'rows' | 'tiles' | 'properties';

/** R-SYS-2's sentences, exactly as the spec writes them. */
export const ERROR_COPY = {
  folder: 'Could not load this folder. Try again.',
  note: 'Could not open this note. Try again.',
  file: 'Could not open this file. Try again.',
  home: 'Could not load Home. Try again.',
} as const;

export type ErrorWhat = keyof typeof ERROR_COPY;

const TRY_AGAIN = 'Try again.';

/** R-SYS-4's lines. */
export const EMPTY_COPY = {
  title: 'Nothing here yet.',
  text: 'Add something, or ask Bower to write about this folder.',
  originals:
    'No originals here. Everything in this folder was written by Bower.',
  /** Originals 0 on a folder of folders (AR-Main): its files sit in the
   * folders inside it, so the line above would not be true (DA-30). */
  originalsInFolders:
    'No originals at this level. Your files are in the folders inside it.',
  bower: 'Nothing by Bower here yet.',
} as const;

/** True once `ms` have passed since the first render. */
export function useDelayed(ms: number = SKELETON_DELAY_MS): boolean {
  const [shown, setShown] = useState(ms <= 0);
  useEffect(() => {
    if (ms <= 0) return undefined;
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return shown;
}

/**
 * Loading (R-SYS-1): after 300 ms, placeholders shaped like the content:
 * rows (32 px box and two bars, 60 % and 35 % wide), tiles, or the About
 * properties. No spinner; no shimmer under reduced motion (CSS).
 */
export function Skeleton({
  shape,
  count = 3,
  delay = SKELETON_DELAY_MS,
}: {
  shape: SkeletonShape;
  count?: number;
  delay?: number;
}): JSX.Element {
  const shown = useDelayed(delay);
  const items = Array.from({ length: count }, (_, at) => at);
  return (
    <div
      class={`skeleton skeleton-${shape}`}
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      {shown &&
        items.map((at) =>
          shape === 'rows' ? (
            <span class="skeleton-row" key={at} aria-hidden="true">
              <span class="skeleton-box" />
              <span class="skeleton-lines">
                <span class="skeleton-bar skeleton-bar-long" />
                <span class="skeleton-bar skeleton-bar-short" />
              </span>
            </span>
          ) : shape === 'tiles' ? (
            <span class="skeleton-tile" key={at} aria-hidden="true">
              <span class="skeleton-bar skeleton-bar-short" />
              <span class="skeleton-bar skeleton-bar-long" />
            </span>
          ) : (
            <span class="skeleton-property" key={at} aria-hidden="true">
              <span class="skeleton-bar skeleton-bar-short" />
              <span class="skeleton-bar skeleton-bar-long" />
            </span>
          ),
        )}
    </div>
  );
}

/**
 * The error line (R-SYS-2, R-GLOBAL-7): one sentence in `--color-danger`
 * where the content would be, with "Try again." as a link that retries.
 * The caller logs the details to the console.
 */
export function ErrorLine({
  what,
  onRetry,
}: {
  what: ErrorWhat;
  onRetry: () => void;
}): JSX.Element {
  const lead = ERROR_COPY[what].slice(0, -TRY_AGAIN.length).trimEnd();
  return (
    <p class="error-line" role="alert">
      {`${lead} `}
      <button type="button" class="error-line-retry" onClick={onRetry}>
        {TRY_AGAIN}
      </button>
    </p>
  );
}

/**
 * The empty folder (R-SYS-4): the looking bird 52, "Nothing here yet." and
 * the way on, with "Add" and "Ask Bower" links.
 */
export function EmptyFolder({
  addHref = '/add',
  onAsk,
}: {
  addHref?: string;
  onAsk: () => void;
}): JSX.Element {
  return (
    <div class="empty-folder">
      <Bird state="looking" size={52} />
      <p class="empty-folder-title">{EMPTY_COPY.title}</p>
      <p class="empty-folder-text">
        Add something, or ask Bower to write about this folder.{' '}
        <a class="empty-folder-link" href={addHref}>
          Add
        </a>
        {' · '}
        <button type="button" class="empty-folder-link" onClick={onAsk}>
          Ask Bower
        </button>
      </p>
    </div>
  );
}

/** An empty segment (R-SYS-4): one muted line, no bird. */
export function EmptySegment({
  segment,
  folderOfFolders = false,
}: {
  segment: 'originals' | 'bower';
  /** A folder of folders: its originals are in its subfolders. */
  folderOfFolders?: boolean;
}): JSX.Element {
  const copy =
    segment === 'originals' && folderOfFolders
      ? EMPTY_COPY.originalsInFolders
      : EMPTY_COPY[segment];
  return <p class="empty-segment">{copy}</p>;
}
