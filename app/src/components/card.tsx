/**
 * The one card (spec §3.20, K-24, R-CARD-1): every card-like surface uses
 * it. `plain` is the raised card, `accent` the teal-edged one (the new pile,
 * "Just filed"), `bubble` the bird's speech, which never runs past its
 * column (R-CARD-3). `StatTile` is a card with a label, a 24 px number and
 * one line under it (R-CARD-2). Styles in `styles/primitives.css`.
 */

import type { ComponentChildren, JSX } from 'preact';

export type CardVariant = 'plain' | 'accent' | 'bubble';

export interface CardProps {
  variant?: CardVariant;
  /** Extra classes for the caller's layout (width, flex, margins). */
  class?: string;
  children: ComponentChildren;
}

const VARIANT_CLASS: Record<CardVariant, string> = {
  plain: 'card',
  accent: 'card card-accent',
  bubble: 'card card-bubble',
};

export function Card({
  variant = 'plain',
  class: extra,
  children,
}: CardProps): JSX.Element {
  const classes =
    extra === undefined
      ? VARIANT_CLASS[variant]
      : `${VARIANT_CLASS[variant]} ${extra}`;
  return <div class={classes}>{children}</div>;
}

export interface StatTileProps {
  /** The label above the number ("Inbox"). */
  label: string;
  /** An 18 px icon before the label. */
  icon?: ComponentChildren;
  /** The number, or a short phrase ("Not checked yet"). */
  value: number | string;
  /** One line under the number ("Nothing waiting. Add something."). */
  note?: string;
  class?: string;
}

export function StatTile({
  label,
  icon,
  value,
  note,
  class: extra,
}: StatTileProps): JSX.Element {
  return (
    <Card class={extra === undefined ? 'stat-tile' : `stat-tile ${extra}`}>
      <div class="stat-tile-label">
        {icon}
        {label}
      </div>
      <div class="stat-tile-value">{value}</div>
      {note !== undefined && <div class="stat-tile-note">{note}</div>}
    </Card>
  );
}
