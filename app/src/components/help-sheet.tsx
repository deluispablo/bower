/**
 * The help sheets (#330, boards `Help-*` and `Help-Q-*`): one sheet per tab
 * plus one for a folder screen, with the copy from `help-rows.ts`. Two ways
 * in, one drawing:
 *
 * - `HelpSheet`: what the top bar's "?" opens (`layout.tsx`). "About this
 *   screen", the rows, Close, "Show me around" (the tour), Ideas when the
 *   caller has somewhere to send it, and "What is Bower, from the start".
 * - `Tour`: the first-run tour after onboarding and Settings › Show me around
 *   again (`routes/home.tsx`, `tour-store.ts`). The four tab sheets in a
 *   row: "Tour · n of 4", Skip, "Next: <tab>" … "Let's go". It only reports
 *   how it ended (`onEnd`); saving `tourSeenAt` is the caller's.
 *
 * Either way the screen dims except for the bar the sheet's tab sits in
 * (the phone's bottom nav, the desktop sidebar), the tab itself gets the
 * highlight (`.help-tab-on`, added here and removed when the sheet goes)
 * and the sheet sits over it. Tabs are found by their `data-tour` attribute
 * (`home`, `notes`, `add`, `bower`); where two exist the one on screen
 * wins. The sheet is a `role="dialog"` with focus trapped; Escape closes
 * the help sheet or skips the tour.
 *
 * In a demo build (`isDemo()`) the sheets carry the demo's lines
 * (`helpSheet`); nothing else changes.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { isDemo } from '../api.js';
import {
  TOUR_TABS,
  helpSheet,
  tourLabel,
  tourNextLabel,
} from '../help-rows.js';
import type {
  HelpIcon,
  HelpScreen,
  HelpSheetCopy,
  HelpTab,
} from '../help-rows.js';
import { Bird } from './bird.js';
import {
  IconChat,
  IconClock,
  IconClose,
  IconEdit,
  IconEyeOff,
  IconFile,
  IconFolder,
  IconInbox,
  IconNote,
  IconPin,
  IconPlay,
  IconSearch,
  IconShield,
  IconSparkle,
} from './icons.js';
import { useDismissGuard } from './use-dismiss-guard.js';
import { useFocusTrap } from './use-focus-trap.js';

import '../styles/help-sheet.css';

const ICONS: Readonly<Record<HelpIcon, () => JSX.Element>> = {
  inbox: IconInbox,
  clock: IconClock,
  pin: IconPin,
  note: IconNote,
  folder: IconFolder,
  search: IconSearch,
  'eye-off': IconEyeOff,
  file: IconFile,
  edit: IconEdit,
  sparkle: IconSparkle,
  chat: IconChat,
  shield: IconShield,
};

/** Where "What is Bower, from the start" goes: the intro, with Close. */
export const INTRO_AGAIN_HREF = '/welcome?from=settings';

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Style = Record<string, string>;

export interface SheetPlacement {
  /** The hole in the dimmed screen; `null` when the tab is not on screen. */
  spot: Style | null;
  sheet: Style;
}

const GAP = 16;
/** Space between the sheet and the bar under it (the board's 86 px). */
const BAR_GAP = 6;
const SPOT_PAD = 4;
const SHEET_MAX = 520;
const SIDE_SHEET = 400;
/** Narrower than this beside the bar, the sheet goes along the bottom. */
const SIDE_MIN = 280;

function px(value: number): string {
  return `${Math.round(value)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where the hole and the sheet go for a bar at `bar` in a `width` x
 * `height` viewport. A bar in the lower half (the phone's bottom nav) gets
 * the sheet right above it, as wide as the screen up to 520 px; a bar on
 * the left (the desktop sidebar) gets it beside, level with the bar's top.
 * No bar on screen: the sheet at the bottom, centred.
 */
export function placeSheet(
  bar: Box | null,
  width: number,
  height: number,
): SheetPlacement {
  const bottomWidth = Math.min(width, SHEET_MAX);
  const centred = px((width - bottomWidth) / 2);
  if (bar === null || bar.width === 0 || bar.height === 0) {
    return {
      spot: null,
      sheet: {
        left: centred,
        width: px(bottomWidth),
        bottom: px(GAP),
        maxHeight: px(height - 2 * GAP),
      },
    };
  }

  const spot: Style = {
    top: px(bar.top - SPOT_PAD),
    left: px(bar.left - SPOT_PAD),
    width: px(bar.width + 2 * SPOT_PAD),
    height: px(bar.height + 2 * SPOT_PAD),
  };

  const right = bar.left + bar.width + GAP;
  const sideWidth = Math.min(SIDE_SHEET, width - right - GAP);
  if (bar.top + bar.height / 2 > height / 2 || sideWidth < SIDE_MIN) {
    const bottom = Math.max(height - bar.top + BAR_GAP, GAP);
    return {
      spot,
      sheet: {
        left: centred,
        width: px(bottomWidth),
        bottom: px(bottom),
        maxHeight: px(height - bottom - GAP),
      },
    };
  }

  const top = clamp(bar.top, GAP, height - GAP);
  return {
    spot,
    sheet: {
      left: px(right),
      width: px(sideWidth),
      top: px(top),
      maxHeight: px(height - top - GAP),
    },
  };
}

/** The tab on screen for `tab`, else the first one in the page. */
function findTab(tab: HelpTab): HTMLElement | null {
  const all = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${tab}"]`),
  );
  return all.find((el) => el.getClientRects().length > 0) ?? all[0] ?? null;
}

function measure(el: Element | null): Box | null {
  if (el === null) return null;
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** Highlights `tab` and keeps the placement on its bar as the page moves. */
function usePlacement(tab: HelpTab): SheetPlacement {
  const [bar, setBar] = useState<Box | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useLayoutEffect(() => {
    const target = findTab(tab);
    target?.classList.add('help-tab-on');
    // The whole bar stays lit, as on the boards; the tab carries the ring.
    const lit = target?.closest('nav') ?? target;
    const update = (): void => {
      setBar(measure(lit));
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      target?.classList.remove('help-tab-on');
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [tab]);

  return placeSheet(bar, viewport.width, viewport.height);
}

interface SheetFrameProps {
  copy: HelpSheetCopy;
  kicker: string;
  /** Skip (tour) or Close (help), top-right. */
  corner: JSX.Element;
  onEscape: () => void;
  /** Help only: a tap on the dimmed screen closes the sheet. */
  onBackdrop?: () => void;
  /** The tour's text changes in place, so it is announced. */
  live?: boolean;
  children: ComponentChildren;
}

function SheetFrame({
  copy,
  kicker,
  corner,
  onEscape,
  onBackdrop,
  live = false,
  children,
}: SheetFrameProps): JSX.Element {
  const sheet = useRef<HTMLDivElement>(null);
  useFocusTrap(sheet, onEscape);
  const place = usePlacement(copy.tab);
  const guardedBackdrop = useDismissGuard(() => onBackdrop?.());

  return (
    <div
      class={place.spot === null ? 'help help--no-spot' : 'help'}
      onClick={(event) => {
        if (event.target === event.currentTarget) guardedBackdrop();
      }}
    >
      {place.spot !== null && (
        <div class="help-spot" style={place.spot} aria-hidden="true" />
      )}
      <div
        ref={sheet}
        class="help-sheet"
        style={place.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-sheet-title"
        aria-describedby="help-sheet-lede"
      >
        <div class="help-head">
          <span class="help-bird" aria-hidden="true">
            <Bird state="idle" face="happy" size={44} />
          </span>
          <div class="help-heading" aria-live={live ? 'polite' : undefined}>
            <p class="help-kicker">{kicker}</p>
            <h2 id="help-sheet-title" class="help-title">
              {copy.title}
            </h2>
            <p id="help-sheet-lede" class="help-lede">
              {copy.lede}
            </p>
          </div>
          {corner}
        </div>
        <ul class="help-rows">
          {copy.rows.map(({ icon, lead, text }) => {
            const Icon = ICONS[icon];
            return (
              <li key={lead} class="help-row">
                <Icon />
                <span>
                  <b>{lead}</b> {text}
                </span>
              </li>
            );
          })}
        </ul>
        {children}
      </div>
    </div>
  );
}

export interface HelpSheetProps {
  screen: HelpScreen;
  onClose: () => void;
  /** "Show me around": the caller starts the tour. */
  onShowMeAround: () => void;
  /**
   * Where the Ideas button goes (`IDEAS_PATH`, #332); left out, there is
   * no Ideas button. `layout.tsx` passes it on every screen.
   */
  ideasHref?: string;
}

/** What "?" opens: the sheet about the screen on show. */
export function HelpSheet({
  screen,
  onClose,
  onShowMeAround,
  ideasHref,
}: HelpSheetProps): JSX.Element {
  return (
    <SheetFrame
      copy={helpSheet(screen, isDemo())}
      kicker="About this screen"
      corner={
        <button
          type="button"
          class="icon-button help-close"
          aria-label="Close"
          onClick={onClose}
        >
          <IconClose />
        </button>
      }
      onEscape={onClose}
      onBackdrop={onClose}
    >
      <div class="help-actions">
        <button type="button" class="button" onClick={onShowMeAround}>
          <IconPlay />
          Show me around
        </button>
        {ideasHref !== undefined && (
          <a class="button help-secondary" href={ideasHref}>
            <IconSparkle />
            Ideas
          </a>
        )}
      </div>
      <a class="help-intro-link" href={INTRO_AGAIN_HREF}>
        What is Bower, from the start
      </a>
    </SheetFrame>
  );
}

export interface TourProps {
  /** `true` after "Let's go"; `false` after Skip or Escape. */
  onEnd: (finished: boolean) => void;
}

/** The first-run tour: the four tab sheets, one after the other. */
export function Tour({ onEnd }: TourProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const next = useRef<HTMLButtonElement>(null);
  const tab = TOUR_TABS[index] ?? 'home';
  const last = index === TOUR_TABS.length - 1;

  const skip = (): void => {
    onEnd(false);
  };

  // Every sheet starts with its main button focused.
  useEffect(() => {
    next.current?.focus();
  }, [index]);

  return (
    <SheetFrame
      copy={helpSheet(tab, isDemo())}
      kicker={tourLabel(index)}
      corner={
        <button type="button" class="help-skip" onClick={skip}>
          Skip
        </button>
      }
      onEscape={skip}
      live
    >
      <div class="help-actions">
        <button
          ref={next}
          type="button"
          class="button"
          onClick={() => {
            if (last) onEnd(true);
            else setIndex(index + 1);
          }}
        >
          {tourNextLabel(index)}
        </button>
      </div>
    </SheetFrame>
  );
}
