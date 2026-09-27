/**
 * The stroke icon set of spec §3.4 (paths from `docs/design/gen.py`): one
 * function per icon, inline SVG on a 24 px grid, `currentColor`, hidden
 * from assistive technology (the control around it carries the label).
 * Sized by CSS through the `icon` class; only the icons the app uses.
 */

import type { ComponentChildren, JSX } from 'preact';

function Svg({ children }: { children: ComponentChildren }): JSX.Element {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function IconHome(): JSX.Element {
  return (
    <Svg>
      <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </Svg>
  );
}

export function IconPlus(): JSX.Element {
  return (
    <Svg>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconChat(): JSX.Element {
  return (
    <Svg>
      <path d="M4 5h16v11H9l-5 4z" />
    </Svg>
  );
}

export function IconSliders(): JSX.Element {
  return (
    <Svg>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Svg>
  );
}

export function IconSearch(): JSX.Element {
  return (
    <Svg>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </Svg>
  );
}

export function IconFolder(): JSX.Element {
  return (
    <Svg>
      <path d="M3 6a1 1 0 0 1 1-1h4.5l1.5 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" />
    </Svg>
  );
}

export function IconNote(): JSX.Element {
  return (
    <Svg>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </Svg>
  );
}

export function IconChevronRight(): JSX.Element {
  return (
    <Svg>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function IconHeart(): JSX.Element {
  return (
    <Svg>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </Svg>
  );
}

export function IconInbox(): JSX.Element {
  return (
    <Svg>
      <path d="M3 13l2-8h14l2 8v6H3z" />
      <path d="M3 13h5l1.5 2h5L16 13h5" />
    </Svg>
  );
}

export function IconMenu(): JSX.Element {
  return (
    <Svg>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconClose(): JSX.Element {
  return (
    <Svg>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconSort(): JSX.Element {
  return (
    <Svg>
      <path d="M4 7h12M4 12h8M4 17h4M18 10v10M15 17l3 3 3-3" />
    </Svg>
  );
}

export function IconCollapse(): JSX.Element {
  return (
    <Svg>
      <path d="M6 9l6-6 6 6M6 15l6 6 6-6" />
    </Svg>
  );
}

export function IconEyeOff(): JSX.Element {
  return (
    <Svg>
      <path d="M3 3l18 18M10 6a10 10 0 0 1 12 6 13 13 0 0 1-3 3.5M6.5 6.5A13 13 0 0 0 2 12s4 7 10 7a9 9 0 0 0 4-1" />
    </Svg>
  );
}

export function IconEye(): JSX.Element {
  return (
    <Svg>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function IconMoon(): JSX.Element {
  return (
    <Svg>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Svg>
  );
}

export function IconSun(): JSX.Element {
  return (
    <Svg>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </Svg>
  );
}

export function IconClock(): JSX.Element {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </Svg>
  );
}

export function IconSend(): JSX.Element {
  return (
    <Svg>
      <path d="M4 12l16-8-6 16-2-6z" />
    </Svg>
  );
}

/** Google's own mark, brand colours (never `currentColor`): the sign-in button. */
export function IconGoogle(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-7.1z"
        fill="#4285f4"
      />
      <path
        d="M12 21c2.6 0 4.8-.9 6.3-2.3l-3.1-2.4c-.9.6-2 .9-3.2.9-2.5 0-4.6-1.7-5.3-3.9H3.5v2.5A9 9 0 0 0 12 21z"
        fill="#34a853"
      />
      <path
        d="M6.7 13.3a5.4 5.4 0 0 1 0-3.4V7.4H3.5a9 9 0 0 0 0 8.1l3.2-2.2z"
        fill="#fbbc05"
      />
      <path
        d="M12 6.6c1.4 0 2.7.5 3.7 1.4l2.7-2.7A9 9 0 0 0 3.5 7.4l3.2 2.5C7.4 7.7 9.5 6.6 12 6.6z"
        fill="#ea4335"
      />
    </svg>
  );
}

export function IconExternalLink(): JSX.Element {
  return (
    <Svg>
      <path d="M9 6H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
      <path d="M14 4h6v6M20 4l-9 9" />
    </Svg>
  );
}

export function IconWifi(): JSX.Element {
  return (
    <Svg>
      <path d="M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0" />
      <circle cx="12" cy="19" r="1" />
    </Svg>
  );
}

export function IconMore(): JSX.Element {
  return (
    <Svg>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconPin(): JSX.Element {
  return (
    <Svg>
      <path d="M12 17v5M8 3h8l-1 6 3 3H6l3-3z" />
    </Svg>
  );
}

export function IconCopy(): JSX.Element {
  return (
    <Svg>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a1 1 0 0 1 1-1h10" />
    </Svg>
  );
}

export function IconEdit(): JSX.Element {
  return (
    <Svg>
      <path d="M4 20l4-1 11-11-3-3L5 16z" />
      <path d="M13 7l3 3" />
    </Svg>
  );
}
