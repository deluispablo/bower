/**
 * The header button style (spec §5 `header-action.tsx`, System-HeaderActions):
 * an icon and a short label in a bordered 44 px button. Renders a `<button>`,
 * or an `<a>` when `href` is given (no underline either way). A toggle passes
 * `pressed` and gets `aria-pressed`.
 */

import type { ComponentChildren, JSX } from 'preact';

import '../styles/header-action.css';

export interface HeaderActionProps {
  icon: JSX.Element;
  children: ComponentChildren;
  class?: string;
  /** Renders a link instead of a button. */
  href?: string;
  /** With `href`: opens in a new tab (Open in Drive). */
  external?: boolean;
  onClick?: () => void;
  /** Set for a toggle; it becomes `aria-pressed`. */
  pressed?: boolean;
  disabled?: boolean;
  /** The tooltip, e.g. why a disabled action is disabled. */
  title?: string;
}

export function HeaderAction(props: HeaderActionProps): JSX.Element {
  const className =
    props.class === undefined
      ? 'header-action'
      : `header-action ${props.class}`;
  const content = (
    <>
      <span class="header-action-icon" aria-hidden="true">
        {props.icon}
      </span>
      <span class="header-action-label">{props.children}</span>
    </>
  );
  if (props.href !== undefined) {
    return (
      <a
        class={className}
        href={props.href}
        title={props.title}
        {...(props.external === true && {
          target: '_blank',
          rel: 'noopener',
        })}
      >
        {content}
      </a>
    );
  }
  return (
    <button
      type="button"
      class={className}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
    >
      {content}
    </button>
  );
}
