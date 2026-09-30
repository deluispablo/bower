/**
 * The one badge (spec §3.21, R-BADGE-1): a 22 px pill, 12 px bold, in five
 * tones. It always carries a word, so colour is never the only signal.
 * Styles in `styles/primitives.css`.
 */

import type { ComponentChildren, JSX } from 'preact';

/** `new` "New" / "1 new", `done` "Done", `failed` "Did not finish", `check` "Check", `filed` "Filed". */
export type BadgeTone = 'new' | 'done' | 'failed' | 'check' | 'filed';

export interface BadgeProps {
  tone: BadgeTone;
  children: ComponentChildren;
  /** Extra classes (a caller's older hook, such as `new-tag`). */
  class?: string;
}

export function Badge({
  tone,
  children,
  class: extra,
}: BadgeProps): JSX.Element {
  const classes = `badge badge-${tone}`;
  return (
    <span class={extra === undefined ? classes : `${classes} ${extra}`}>
      {children}
    </span>
  );
}
