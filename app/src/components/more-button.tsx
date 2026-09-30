import type { JSX } from 'preact';

import { IconMore } from './icons.js';

/**
 * The ⋯ button's props, frozen in #907 (#906's PageHeader and the note,
 * file and folder screens render it): `expanded` and `onClick` drive the
 * menu, `class` places it, `name` names it "More for <name>" (spec §3.6;
 * "More" when left out).
 */
export interface MoreButtonProps {
  expanded: boolean;
  onClick: () => void;
  class?: string;
  /** What the menu is about: "Home", "CV insights"… */
  name?: string;
}

/** The ⋯ that opens the menu (`note-menu.tsx`): `aria-haspopup="menu"`,
 * `aria-expanded`; the menu hands focus back to it when it closes. It may be
 * drawn twice (the phone's top bar and the desktop header); the
 * stylesheets show only the one that fits the breakpoint. */
export function MoreButton({
  expanded,
  onClick,
  class: className,
  name,
}: MoreButtonProps): JSX.Element {
  const label = name === undefined || name === '' ? 'More' : `More for ${name}`;
  return (
    <button
      type="button"
      class={
        className === undefined ? 'icon-button' : `icon-button ${className}`
      }
      aria-label={label}
      title={label}
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onClick}
    >
      <IconMore />
    </button>
  );
}
