/**
 * The top bar's Back link on an inner screen (#318, #906, spec §3.1): the
 * chevron, then the parent's display name (R-TOPBAR-2, never the Drive name
 * "2-Areas"), ellipsized only when the bar is too narrow. Its accessible
 * name is "Back to <parent>".
 *
 * Back targets (K-5): a folder goes to its parent folder; a root folder to
 * the Folders tab ("‹ Your folders", `YourFoldersBackLink`); Just filed and
 * Settings to Home.
 */

import type { JSX } from 'preact';

import { displayName } from '../navigation.js';
import { FOLDERS_LANDMARK, FOLDERS_PATH } from '../shell-routes.js';
import { IconChevronLeft } from './icons.js';

import '../styles/back-link.css';

export interface BackLinkProps {
  href: string;
  /** Where it goes: "Home", "Folders", the parent folder's name. */
  label: string;
  /** Keeps the name showing on a phone (a note's "‹ Applications", R-NOTE-10)
   * instead of letting it give way to the bare arrow. */
  named?: boolean;
  /** The accessible name when "Back to <label>" does not read right. */
  name?: string;
}

export function BackLink({
  href,
  label: raw,
  named = false,
  name,
}: BackLinkProps): JSX.Element {
  const label = displayName(raw);
  return (
    <a
      class={named ? 'topbar-back topbar-back-named' : 'topbar-back'}
      href={href}
      aria-label={name ?? `Back to ${label}`}
    >
      <IconChevronLeft />
      <span class="topbar-back-label">{label}</span>
    </a>
  );
}

/** A root folder's Back on the phone (AR-Main-375): "‹ Your folders", named
 * "Back to your folders", to the Folders tab. */
export function YourFoldersBackLink(): JSX.Element {
  return (
    <BackLink
      href={FOLDERS_PATH}
      label={FOLDERS_LANDMARK}
      name="Back to your folders"
      named
    />
  );
}
