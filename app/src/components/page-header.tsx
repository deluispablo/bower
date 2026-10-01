/**
 * The page header (#906, spec §3.5, R-HEADER-1..4): one on every screen, so
 * the name appears once. From the top:
 *
 * - the desktop breadcrumb: parents only, " / " between them, 13 px muted
 *   links (the boards over the spec's 14). Settings and Just filed pass
 *   `HOME_CRUMBS`; a root folder passes `rootPath` and reads "Your folders",
 *   which reveals the tree at that root (E-17). The phone has no breadcrumb:
 *   the top bar's back link does that job.
 * - the title row: the h1 (28 px on the phone, 32 px from 900 px; it wraps,
 *   never truncates), then, top-aligned to its first line, the (i) (notes
 *   and files below 1200 px, where the About column is not on screen) and
 *   the ⋯ (`MoreButton`, rendered with its own props as they are).
 * - the meta line from `metaLine` (#905) with the 8 px root dot, an optional
 *   purpose line (a folder of folders) and an optional tabs row.
 *
 * Screens adopt it in their own issues (#911 and on); until then they keep
 * their own title rows.
 */

import type { ComponentChildren, JSX } from 'preact';

import type { MetaLine } from '../meta-line.js';
import { breadcrumb, folderHref } from '../navigation.js';
import { revealHref, revealInFolders } from '../reveal.js';
import { FOLDERS_LANDMARK } from '../shell-routes.js';
import { useMediaQuery } from '../use-media-query.js';
import { IconInfo } from './icons.js';
import { MoreButton } from './more-button.js';

import '../styles/page-header.css';

/** One breadcrumb link: a parent of the page. */
export interface Crumb {
  label: string;
  href: string;
}

/** What the page shows: notes and files get the (i) below 1200 px; a tab
 * (Home, Add, Bower) shows its title in the phone's top bar, so the header's
 * title row shows from 900 px only. */
export type PageKind = 'screen' | 'tab' | 'folder' | 'note' | 'file';

/** Settings and Just filed: their parent is Home (K-5, R-HEADER-4). */
export const HOME_CRUMBS: readonly Crumb[] = [{ label: 'Home', href: '/' }];

/** From this width the About column is on screen: no (i) (R-HEADER-3). */
const ABOUT_COLUMN_QUERY = '(min-width: 1200px)';

/**
 * The parents of a folder, note or file at `path` (a vault path), top
 * first, as breadcrumb links; the item itself is never included.
 */
export function crumbsFor(path: string): Crumb[] {
  return breadcrumb(path).map((segment) => ({
    label: segment.name,
    href: folderHref(segment.path),
  }));
}

export interface PageHeaderProps {
  title: string;
  kind?: PageKind;
  /** The desktop breadcrumb: the page's parents, top first. */
  crumbs?: readonly Crumb[];
  /** A root folder's own path: the crumb reads "Your folders" (E-17). */
  rootPath?: string;
  /** The ⋯ button's state and toggle (`MoreButton`'s own props). */
  more?: { expanded: boolean; onClick: () => void; name?: string };
  /** Opens About this note or file; the (i) shows only on notes and files
   * below 1200 px. */
  onAbout?: () => void;
  meta?: MetaLine | null;
  /** A folder of folders' purpose line (AR-Main). */
  purpose?: string;
  /** The List | Compare tabs, or another row under the meta line. */
  tabs?: ComponentChildren;
}

function RootDot({ root }: { root: MetaLine['dot'] }): JSX.Element | null {
  if (root === null) return null;
  return (
    <span
      class="page-header-dot"
      data-root={root.root ?? 'none'}
      aria-hidden="true"
    />
  );
}

function Meta({ line }: { line: MetaLine }): JSX.Element {
  return (
    <p class="page-header-meta">
      {line.parts.map((part, i) => (
        <span key={`${i}-${part}`}>
          {i > 0 && ' · '}
          {line.dot?.at === i && <RootDot root={line.dot} />}
          {part}
        </span>
      ))}
    </p>
  );
}

function Breadcrumb({
  crumbs,
  rootPath,
}: {
  crumbs: readonly Crumb[];
  rootPath: string | undefined;
}): JSX.Element | null {
  if (rootPath !== undefined) {
    return (
      <nav class="page-header-crumbs" aria-label="Breadcrumb">
        <a
          href={revealHref({ kind: 'folder', path: rootPath })}
          onClick={(event) => {
            event.preventDefault();
            revealInFolders(rootPath);
          }}
        >
          {FOLDERS_LANDMARK}
        </a>
      </nav>
    );
  }
  if (crumbs.length === 0) return null;
  return (
    <nav class="page-header-crumbs" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href}>
          {i > 0 && ' / '}
          <a href={crumb.href}>{crumb.label}</a>
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  kind = 'screen',
  crumbs = [],
  rootPath,
  more,
  onAbout,
  meta,
  purpose,
  tabs,
}: PageHeaderProps): JSX.Element {
  const aboutColumn = useMediaQuery(ABOUT_COLUMN_QUERY);
  const about =
    onAbout !== undefined &&
    !aboutColumn &&
    (kind === 'note' || kind === 'file');
  return (
    <header class={`page-header page-header-${kind}`}>
      <Breadcrumb crumbs={crumbs} rootPath={rootPath} />
      <div class="page-header-title-row">
        <h1 class="page-header-title">{title}</h1>
        {(about || more !== undefined) && (
          <div class="page-header-buttons">
            {about && (
              <button
                type="button"
                class="icon-button page-header-about"
                aria-label={
                  kind === 'note' ? 'About this note' : 'About this file'
                }
                onClick={onAbout}
              >
                <IconInfo />
              </button>
            )}
            {more !== undefined && (
              <MoreButton
                expanded={more.expanded}
                onClick={more.onClick}
                {...(more.name !== undefined && { name: more.name })}
                class="page-header-more"
              />
            )}
          </div>
        )}
      </div>
      {meta != null && meta.parts.length > 0 && <Meta line={meta} />}
      {purpose !== undefined && purpose !== '' && (
        <p class="page-header-purpose">{purpose}</p>
      )}
      {tabs !== undefined && tabs !== null && (
        <div class="page-header-tabs">{tabs}</div>
      )}
    </header>
  );
}
