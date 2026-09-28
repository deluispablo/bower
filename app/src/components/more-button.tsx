import type { JSX } from 'preact';

import { IconMore } from './icons.js';

interface MoreButtonProps {
  expanded: boolean;
  onClick: () => void;
  class?: string;
}

/** The "more" menu trigger of a note (#210) or a file (#350): shown twice
 * in the markup — this one in the shell header's `actions` slot for the phone, another in
 * `.note-header-actions` for desktop — `layout.css` and `note-menu.css`
 * show only the one that fits the breakpoint, the same way the shell
 * already does for the crumb slot vs the breadcrumb. */
export function MoreButton({
  expanded,
  onClick,
  class: className,
}: MoreButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class={
        className === undefined ? 'icon-button' : `icon-button ${className}`
      }
      aria-label="More"
      title="More"
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onClick}
    >
      <IconMore />
    </button>
  );
}
