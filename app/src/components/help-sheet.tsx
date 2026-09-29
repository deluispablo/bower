/**
 * The help sheets (#330, boards `Help-*` and `Help-Q-*`): one sheet per tab
 * plus one for a folder screen, with the copy from `help-rows.ts`. Two ways
 * in, one drawing:
 *
 * - `HelpSheet`: what the top bar's "?" opens (`layout.tsx`). "About this
 *   screen", the rows, Close, "Show me around" (the tour), Ideas when the
 *   caller has somewhere to send it, and "What is Bower, from the start".
 * - `Tour`: the first-run tour after onboarding and Settings › Show me around
 *   again (`routes/home.tsx`, `tour-store.ts`). A queued dialog (R-OVL-3) that
 *   steps through the four tabs: "Tour · n of 4", Skip, Back, "Next: <tab>" …
 *   "Let's go". The lit tab gets `.help-tab-on` and a ring, and Bower stands
 *   over it pointing down (R-BIRD-10). It only reports how it ended
 *   (`onEnd`); saving `tourSeenAt` is the caller's.
 *
 * Tabs are found by their `data-tour` attribute (`home`, `notes`, `add`,
 * `bower`); where two exist the one on screen wins. Focus, Escape and the
 * inert page come from `Overlay`.
 *
 * In a demo build (`isDemo()`) the sheets carry the demo's lines
 * (`helpSheet`); nothing else changes.
 */

import type { JSX } from 'preact';
import { createPortal } from 'preact/compat';
import { useLocation } from 'preact-iso';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { isDemo } from '../api.js';
import {
  TOUR_TABS,
  helpSheet,
  tourLabel,
  tourNextLabel,
  tourSheet,
} from '../help-rows.js';
import type { HelpIcon, HelpRow, HelpScreen, HelpTab } from '../help-rows.js';
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
import { Queued } from './queued-overlay.js';
import { Overlay } from './overlay.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import { restoreHint, isHintDismissed } from './hint.js';
import { announceTourSkipped } from '../tour-store.js';
import { useMediaQuery } from '../use-media-query.js';

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

const DESKTOP_QUERY = '(min-width: 900px)';

/** Where "What is Bower, from the start" goes: the intro, with Close. */
export const INTRO_AGAIN_HREF = '/welcome?from=settings';

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Style = Record<string, string>;

export interface TourPlacement {
  /** The ring round the lit tab; `null` when the tab is not on screen. */
  spot: Style | null;
  /** Where Bower stands (fixed, in px); `null` with no tab on screen. */
  bird: Style | null;
}

/** The tour bird's size (spec 6.21: tour 80). */
export const TOUR_BIRD_SIZE = 80;
const SPOT_PAD = 4;
const EDGE = 8;
/** A bar is a bottom tab bar only when it is short and wide. */
const BOTTOM_BAR_MAX_HEIGHT = 120;
const BOTTOM_BAR_MIN_WIDTH = 0.6;

function px(value: number): string {
  return `${Math.round(value)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where the ring and Bower go for the lit `tab` in a `width` x `height`
 * viewport. On a bottom tab bar (`bar` in the lower half) the bird's feet
 * stand on the bar's top edge, over the tab; beside a desktop sidebar it
 * stands just past the right edge of the lit row, level with it.
 */
export function placeTour(
  tab: Box | null,
  bar: Box | null,
  width: number,
  height: number,
): TourPlacement {
  if (tab === null || tab.width === 0 || tab.height === 0) {
    return { spot: null, bird: null };
  }
  const spot: Style = {
    top: px(tab.top - SPOT_PAD),
    left: px(tab.left - SPOT_PAD),
    width: px(tab.width + 2 * SPOT_PAD),
    height: px(tab.height + 2 * SPOT_PAD),
  };
  const onBottomBar =
    bar !== null &&
    bar.height > 0 &&
    bar.height < BOTTOM_BAR_MAX_HEIGHT &&
    bar.width >= BOTTOM_BAR_MIN_WIDTH * width &&
    bar.top + bar.height / 2 > height / 2;
  if (!onBottomBar) {
    // Beside a desktop sidebar the bird stands just past the right edge of
    // the lit row, level with it, so it never covers the Search field or a
    // neighbouring row. It stays inside the viewport.
    const feetLevel = clamp(
      tab.top + tab.height,
      TOUR_BIRD_SIZE + EDGE,
      height - EDGE,
    );
    return {
      spot,
      bird: {
        left: px(
          clamp(
            tab.left + tab.width + SPOT_PAD + EDGE,
            EDGE,
            width - TOUR_BIRD_SIZE - EDGE,
          ),
        ),
        bottom: px(height - feetLevel),
      },
    };
  }
  const feet = bar?.top ?? tab.top;
  const left = clamp(
    tab.left + (tab.width - TOUR_BIRD_SIZE) / 2,
    EDGE,
    width - TOUR_BIRD_SIZE - EDGE,
  );
  return { spot, bird: { left: px(left), bottom: px(height - feet) } };
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

/** Highlights `tab` and keeps the ring and the bird on it as the page moves. */
function useTourPlacement(tab: HelpTab): TourPlacement {
  const [boxes, setBoxes] = useState<{ tab: Box | null; bar: Box | null }>({
    tab: null,
    bar: null,
  });
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  useLayoutEffect(() => {
    const target = findTab(tab);
    target?.classList.add('help-tab-on');
    const bar = target?.closest('nav') ?? target;
    const update = (): void => {
      setBoxes({ tab: measure(target), bar: measure(bar) });
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

  return placeTour(boxes.tab, boxes.bar, viewport.width, viewport.height);
}

function HelpRows({ rows }: { rows: readonly HelpRow[] }): JSX.Element {
  return (
    <ul class="help-rows">
      {rows.map(({ icon, lead, text }) => {
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
  );
}

export interface HelpSheetProps {
  screen: HelpScreen;
  onClose: () => void;
  /** "Show me around": the caller starts the tour. */
  onShowMeAround: () => void;
}

/** A tip that can be dismissed on a screen, with its own words. */
export interface ScreenTip {
  /** The hint id: the choice lives at `bower:hint:<id>` (`hint.tsx`). */
  id: string;
  text: string;
}

/**
 * The tips each screen can show (R-HINT-4). Help lists the dismissed ones
 * under "Tips on this screen" with "Show again"; #777 adds the rest as
 * their tips become hints.
 */
export const SCREEN_TIPS: Readonly<Partial<Record<HelpScreen, ScreenTip[]>>> = {
  home: [
    {
      id: 'home',
      text: 'Use Tidy up once, when you have added everything.',
    },
  ],
  bower: [
    {
      id: 'dictate-keyboard',
      text: 'Long text? Use the microphone key on your phone’s keyboard to dictate.',
    },
  ],
};

/** The tips of `screen` the person has dismissed on this device. */
export function dismissedTips(screen: HelpScreen): ScreenTip[] {
  return (SCREEN_TIPS[screen] ?? []).filter((tip) => isHintDismissed(tip.id));
}

/**
 * What "?" opens: the sheet about the screen on show, queued as an own
 * overlay (R-OVL-2): a bottom sheet on phones, a 440 px right panel from
 * 900 px up (R-OVL-4).
 */
export function HelpSheet({
  screen,
  onClose,
  onShowMeAround,
}: HelpSheetProps): JSX.Element {
  const copy = helpSheet(screen, isDemo());
  const [tips, setTips] = useState<ScreenTip[]>(() => dismissedTips(screen));

  return (
    <Queued id="help-sheet" priority={OVERLAY_PRIORITY.own}>
      <Overlay kind="sheet" labelledBy="help-sheet-title" onClose={onClose}>
        <div class="help-panel">
          <div class="help-head">
            <span class="help-bird" aria-hidden="true">
              <Bird state="idle" face="happy" size={44} overlay />
            </span>
            <div class="help-heading">
              <p class="help-kicker">About this screen</p>
              <h2 id="help-sheet-title" class="help-title">
                {copy.title}
              </h2>
              <p id="help-sheet-lede" class="help-lede">
                {copy.lede}
              </p>
            </div>
            <button
              type="button"
              class="icon-button help-close"
              aria-label="Close"
              onClick={onClose}
            >
              <IconClose />
            </button>
          </div>
          <HelpRows rows={copy.rows} />
          {tips.length > 0 && (
            <section class="help-tips" aria-labelledby="help-tips-title">
              <p id="help-tips-title" class="help-kicker">
                Tips on this screen
              </p>
              <ul class="help-tip-list">
                {tips.map((tip) => (
                  <li key={tip.id} class="help-tip">
                    <span>{tip.text}</span>
                    <button
                      type="button"
                      class="help-tip-again"
                      onClick={() => {
                        restoreHint(tip.id);
                        setTips(dismissedTips(screen));
                      }}
                    >
                      Show again
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div class="help-actions">
            <button type="button" class="button" onClick={onShowMeAround}>
              <IconPlay />
              Show me around
            </button>
          </div>
          <a class="help-intro-link" href={INTRO_AGAIN_HREF}>
            What is Bower, from the start
          </a>
        </div>
      </Overlay>
    </Queued>
  );
}

export interface TourProps {
  /** `true` after "Let's go"; `false` after Skip or Escape. */
  onEnd: (finished: boolean) => void;
}

interface TourCardProps {
  index: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

/** What shows while the tour is in front: the ring, the bird, the card. */
function TourCard({
  index,
  onBack,
  onNext,
  onSkip,
}: TourCardProps): JSX.Element {
  const next = useRef<HTMLButtonElement>(null);
  const tab = TOUR_TABS[index] ?? 'home';
  const copy = tourSheet(tab, isDemo());
  const place = useTourPlacement(tab);

  // Every step starts with its main button focused. The overlay's trap
  // focuses its first control when it opens; this runs after it.
  useEffect(() => {
    queueMicrotask(() => next.current?.focus());
  }, [index]);

  return (
    <>
      {createPortal(
        <div class="tour-stage" aria-hidden="true">
          {place.spot !== null && <div class="tour-spot" style={place.spot} />}
          {place.bird !== null && (
            <span class="tour-bird" style={place.bird}>
              <Bird
                state="pointing"
                face="happy"
                size={TOUR_BIRD_SIZE}
                down
                overlay
              />
            </span>
          )}
        </div>,
        document.body,
      )}
      <div class="help-panel tour-card">
        <div class="help-head">
          <div class="help-heading" aria-live="polite">
            <p class="help-kicker">{tourLabel(index)}</p>
            <h2 id="tour-title" class="help-title">
              {copy.title}
            </h2>
            <p id="tour-lede" class="help-lede">
              {copy.lede}
            </p>
          </div>
          <button type="button" class="help-skip" onClick={onSkip}>
            Skip
          </button>
        </div>
        {copy.rows.length > 0 && <HelpRows rows={copy.rows} />}
        <div class="help-actions">
          {index > 0 && (
            <button
              type="button"
              class="button help-secondary"
              onClick={onBack}
            >
              Back
            </button>
          )}
          <button ref={next} type="button" class="button" onClick={onNext}>
            {tourNextLabel(index)}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * The first-run tour: a queued dialog (R-OVL-3) that steps through the four
 * tabs. It waits while another overlay is open. Skip and Escape end it with
 * a one-off toast; on a desktop, "Let's go" lands on Bower (report F8).
 */
export function Tour({ onEnd }: TourProps): JSX.Element {
  const [index, setIndex] = useState(0);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { route } = useLocation() as Partial<ReturnType<typeof useLocation>>;

  const skip = (): void => {
    announceTourSkipped();
    onEnd(false);
  };
  const next = (): void => {
    if (index < TOUR_TABS.length - 1) {
      setIndex(index + 1);
      return;
    }
    onEnd(true);
    if (desktop) route?.('/bower');
  };

  return (
    <Queued id="tour" priority={OVERLAY_PRIORITY.tour}>
      <Overlay kind="dialog" labelledBy="tour-title" onClose={skip}>
        <TourCard
          index={index}
          onBack={() => {
            setIndex(Math.max(0, index - 1));
          }}
          onNext={next}
          onSkip={skip}
        />
      </Overlay>
    </Queued>
  );
}
