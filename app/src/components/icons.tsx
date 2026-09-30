/**
 * The stroke icon set of spec §3.4 (paths from the design canvas): one
 * function per icon, inline SVG on a 24 px grid, `currentColor`, hidden
 * from assistive technology (the control around it carries the label).
 * Sized by CSS through the `icon` class; only the icons the app uses.
 */

import type { ComponentChildren, JSX } from 'preact';

/** An icon's size in px when it must differ from the `icon` class's. */
export interface IconSizeProps {
  size?: number;
}

function Svg({
  children,
  size,
}: {
  children: ComponentChildren;
  size?: number | undefined;
}): JSX.Element {
  return (
    <svg
      class="icon"
      {...(size === undefined
        ? {}
        : { style: { width: `${size}px`, height: `${size}px` } })}
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

export function IconFolder({ size }: IconSizeProps = {}): JSX.Element {
  return (
    <Svg size={size}>
      <path d="M3 6a1 1 0 0 1 1-1h4.5l1.5 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" />
    </Svg>
  );
}

/** One document for every original, whatever its kind (FileIcon; boards
 * SE-Query, AD-Confirm, AR-Ask; lead ruling on #929). */
export function IconDocument({ size }: IconSizeProps = {}): JSX.Element {
  return (
    <Svg size={size}>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5M10 13h6M10 17h6" />
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

/** A PDF on a folder screen (#349): the note's page with one short line more. */
export function IconPdf(): JSX.Element {
  return (
    <Svg>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 13h6M9 16h6M9 10h2" />
    </Svg>
  );
}

/** A photo or any other image on a folder screen (#349), Add's "Choose
 * files" door when what was picked is a picture, and the Added queue's
 * type icon for a picture (#334). */
export function IconImage(): JSX.Element {
  return (
    <Svg>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M20 16l-5-5-7 8" />
    </Svg>
  );
}

/** A Google Doc, a note copied from Drive, or any other file (#349). */
export function IconDoc(): JSX.Element {
  return (
    <Svg>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </Svg>
  );
}

/** Add's "Take a photo" door (spec C.6). */
export function IconCamera(): JSX.Element {
  return (
    <Svg>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  );
}

/** Add's "From your Drive" door (spec C.6): the Drive triangle. */
export function IconDrive(): JSX.Element {
  return (
    <Svg>
      <path d="M9 4h6l6 10-3 6H6l-3-6z" />
      <path d="M3 14h18M9 4l3 10" />
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

/** The top bar's "?" (#318): a question mark in a circle. */
export function IconHelp(): JSX.Element {
  return (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
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
      <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />
    </Svg>
  );
}

export function IconCollapse(): JSX.Element {
  return (
    <Svg>
      <path d="M7 20l5-5 5 5M7 4l5 5 5-5" />
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

/** A plain page: the help sheets' "Photo, files, your Drive, a link"
 * (#330), Add's "Choose files" door (spec C.6), and the Added queue's
 * type icon for anything that is not a picture (#334). */
export function IconFile(): JSX.Element {
  return (
    <Svg>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </Svg>
  );
}

/** A shield: Rules on the Bower help sheet (#330) and the Bower tab's
 * Rules segment (#340). */
export function IconShield(): JSX.Element {
  return (
    <Svg>
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    </Svg>
  );
}

/** A play triangle: the help sheets' "Show me around" (#330). */
export function IconPlay(): JSX.Element {
  return (
    <Svg>
      <path d="M7 5l12 7-12 7z" />
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

/** A round arrow: "Apply it to what is already filed" (board Phone-Rule-Menu). */
export function IconRedo(): JSX.Element {
  return (
    <Svg>
      <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
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

/** The sparkle on the Tidy up button (Phone-Home and Phone-Add boards),
 * and next to each example under the Bower tab's box (#340). */
export function IconSparkle(): JSX.Element {
  return (
    <Svg>
      <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
    </Svg>
  );
}

/** A tick: a request answered or kept as a rule (#344, board
 * Phone-Bower-Requests). */
export function IconCheck(): JSX.Element {
  return (
    <Svg>
      <path d="M5 12l4 4L19 6" />
    </Svg>
  );
}

/*
 * v6 icons (spec §2.6, R-ICON-1 to 35): one meaning per icon. Paths from the
 * v6 boards where a board draws the glyph; the others follow the spec.
 */

/** Open your folders (the drawer): the files panel glyph (R-ICON-1). */
export function IconPanel(): JSX.Element {
  return (
    <Svg>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Svg>
  );
}

/** Back to the parent (R-ICON-2). */
export function IconChevronLeft(): JSX.Element {
  return (
    <Svg>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

/** About this note or file, (i) only (R-ICON-4). */
export function IconInfo(): JSX.Element {
  return (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Svg>
  );
}

/** Show in folders / show the open item in the tree (R-ICON-9). */
export function IconLocate(): JSX.Element {
  return (
    <Svg>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </Svg>
  );
}

/** Move to… (R-ICON-11). */
export function IconMove(): JSX.Element {
  return (
    <Svg>
      <path d="M3 6a1 1 0 0 1 1-1h4.5l1.5 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z" />
      <path d="M10 13h6M13 10l3 3-3 3" />
    </Svg>
  );
}

/** Download (R-ICON-13). */
export function IconDownload(): JSX.Element {
  return (
    <Svg>
      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
    </Svg>
  );
}

/** Add a paragraph… (R-ICON-14): text lines and a plus. */
export function IconAddParagraph(): JSX.Element {
  return (
    <Svg>
      <path d="M4 6h16M4 10h16M4 14h8M17 14v6M14 17h6" />
    </Svg>
  );
}

/** Edit the text (R-ICON-15). */
export function IconText(): JSX.Element {
  return (
    <Svg>
      <path d="M5 6h14M5 10h14M5 14h10M5 18h7" />
    </Svg>
  );
}

/** Things you can ask (R-ICON-17). */
export function IconBulb(): JSX.Element {
  return (
    <Svg>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
    </Svg>
  );
}

/** Dictate (R-ICON-22). */
export function IconMic(): JSX.Element {
  return (
    <Svg>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </Svg>
  );
}

/** Dictation blocked or not available: the mic crossed out (owner review O-R2). */
export function IconMicOff(): JSX.Element {
  return (
    <Svg>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 4l16 16" />
    </Svg>
  );
}

/** Stop dictating: a filled square (R-ICON-23). */
export function IconStopSquare(): JSX.Element {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

/** The text box's commit: send, save, rename, add (R-ICON-24). */
export function IconArrowUp(): JSX.Element {
  return (
    <Svg>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  );
}

/** The Link door (R-ICON-25). */
export function IconLink(): JSX.Element {
  return (
    <Svg>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Svg>
  );
}

/** Settings (R-ICON-28): a gear, so the sliders keep Filter & sort only. */
export function IconGear(): JSX.Element {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
    </Svg>
  );
}

/** Remove a thing from a pile, unpin in edit mode, remove a rule (R-ICON-32). */
export function IconRemove(): JSX.Element {
  return (
    <Svg>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </Svg>
  );
}

/** Pause a rule (R-ICON-33). */
export function IconPause(): JSX.Element {
  return (
    <Svg>
      <path d="M9 6v12M15 6v12" />
    </Svg>
  );
}
