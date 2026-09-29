/**
 * The top bar's Back link on an inner screen (#318, Phone-Note board): the
 * arrow, then the name of where it goes. The name is the first thing to
 * give way when the bar runs out of room (`layout.css`), before the screen
 * title starts to truncate, so on a narrow phone it is usually the arrow
 * alone.
 */

import type { JSX } from 'preact';

import { displayName } from '../navigation.js';
import { IconChevronRight } from './icons.js';

import '../styles/back-link.css';

export interface BackLinkProps {
  href: string;
  /** Where it goes: "Home", "Notes", the parent folder's name. */
  label: string;
  /** Keeps the name showing on a phone (a note's "‹ Applications", R-NOTE-10)
   * instead of letting it give way to the bare arrow. */
  named?: boolean;
}

export function BackLink({
  href,
  label: raw,
  named = false,
}: BackLinkProps): JSX.Element {
  const label = displayName(raw);
  return (
    <a
      class={named ? 'topbar-back topbar-back-named' : 'topbar-back'}
      href={href}
      aria-label={`Back to ${label}`}
    >
      <IconChevronRight />
      <span class="topbar-back-label">{label}</span>
    </a>
  );
}
