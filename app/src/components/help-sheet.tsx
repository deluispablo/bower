/**
 * The help sheets (#330, boards `Help-*` and `Help-Q-*`): one sheet per tab
 * plus one for a folder screen, with the copy from `help-rows.ts`. Two ways
 * in, one drawing:
 *
 * - `HelpSheet`: what the top bar's "?" and the ⋯ menu's "Help and about
 *   this" open: the one Help template (#907, spec §3.7).
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
  currentHelpTopic,
  helpSheet,
  tourLabel,
  tourNextLabel,
  tourSheet,
} from '../help-rows.js';
import type { HelpIcon, HelpRow, HelpScreen, HelpTab } from '../help-rows.js';
import { Bird, BowerMark } from './bird.js';
import {
  IconBolt,
  IconChat,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconClose,
  IconDocument,
  IconEdit,
  IconExternalLink,
  IconEye,
  IconFile,
  IconFolder,
  IconInbox,
  IconPin,
  IconPlay,
  IconSearch,
  IconShield,
  IconSort,
  IconSparkle,
  IconSun,
} from './icons.js';
import { Queued } from './queued-overlay.js';
import { Overlay } from './overlay.js';
import { LEARN_PATH } from '../learn.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import { restoreHint, isHintDismissed } from './hint.js';
import { announceTourSkipped } from '../tour-store.js';
import { useMediaQuery } from '../use-media-query.js';

import '../styles/help-sheet.css';

const ICONS: Readonly<Record<Exclude<HelpIcon, 'bird'>, () => JSX.Element>> = {
  inbox: IconInbox,
  clock: IconClock,
  pin: IconPin,
  folder: IconFolder,
  search: IconSearch,
  eye: IconEye,
  external: IconExternalLink,
  chevron: IconChevronRight,
  file: IconFile,
  edit: IconEdit,
  sparkle: IconSparkle,
  chat: IconChat,
  shield: IconShield,
  document: IconDocument,
  check: IconCheck,
  bolt: IconBolt,
  sun: IconSun,
  play: IconPlay,
  compare: IconSort,
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
  /**
   * How Bower points (R-TR-3): `down` at a phone tab from above it, `left`
   * at a desktop sidebar target from its right, turned to face it (the one
   * left-facing bird, G-20).
   */
  facing: 'down' | 'left';
}

/** The tour bird's size (spec 6.21: tour 80). */
export const TOUR_BIRD_SIZE = 80;
const SPOT_PAD = 4;
const EDGE = 8;
/** Between the desktop ring's right edge and the bird (TR-*-Fixed-1280). */
const BIRD_GAP = 12;
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
 * viewport (spec §4.15, TR-*-Fixed boards). On a bottom tab bar (`bar` in
 * the lower half) the ring is 14 px round, and the bird's feet stand on the
 * bar's top edge over the tab, pointing down at it. Beside a desktop
 * sidebar the ring is 10 px round, and the bird stands 12 px past its right
 * edge, level with its middle, turned to face it and pointing at it.
 */
export function placeTour(
  tab: Box | null,
  bar: Box | null,
  width: number,
  height: number,
): TourPlacement {
  const onBottomBar =
    bar !== null &&
    bar.height > 0 &&
    bar.height < BOTTOM_BAR_MAX_HEIGHT &&
    bar.width >= BOTTOM_BAR_MIN_WIDTH * width &&
    bar.top + bar.height / 2 > height / 2;
  const facing = onBottomBar ? 'down' : 'left';
  if (tab === null || tab.width === 0 || tab.height === 0) {
    return { spot: null, bird: null, facing };
  }
  const spot: Style = {
    top: px(tab.top - SPOT_PAD),
    left: px(tab.left - SPOT_PAD),
    width: px(tab.width + 2 * SPOT_PAD),
    height: px(tab.height + 2 * SPOT_PAD),
    borderRadius: onBottomBar ? '14px' : '10px',
  };
  if (!onBottomBar) {
    const top = clamp(
      tab.top + (tab.height - TOUR_BIRD_SIZE) / 2,
      EDGE,
      height - TOUR_BIRD_SIZE - EDGE,
    );
    return {
      spot,
      bird: {
        left: px(
          clamp(
            tab.left + tab.width + SPOT_PAD + BIRD_GAP,
            EDGE,
            width - TOUR_BIRD_SIZE - EDGE,
          ),
        ),
        top: px(top),
      },
      facing,
    };
  }
  const feet = bar?.top ?? tab.top;
  const left = clamp(
    tab.left + (tab.width - TOUR_BIRD_SIZE) / 2,
    EDGE,
    width - TOUR_BIRD_SIZE - EDGE,
  );
  return {
    spot,
    bird: { left: px(left), bottom: px(height - feet) },
    facing,
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

/**
 * The lit target's box. The desktop sidebar's Folders target is the
 * "YOUR FOLDERS" label; step 2 rings the whole explorer (TR-2), so the box
 * runs on to the bottom of the tree under it, kept on screen.
 */
function measureTarget(el: Element | null): Box | null {
  const box = measure(el);
  const tree = el?.nextElementSibling;
  if (box === null || !(tree?.classList.contains('explorer-tree') ?? false)) {
    return box;
  }
  const below = measure(tree ?? null);
  if (below === null || below.height === 0) return box;
  const bottom = Math.min(below.top + below.height, window.innerHeight - EDGE);
  return { ...box, height: Math.max(box.height, bottom - box.top) };
}

/** Highlights `tab` and keeps the ring and the bird on it as the page moves;
 * also hands back the lit tab and its box, for the copy over the scrim. */
function useTourPlacement(
  tab: HelpTab,
): TourPlacement & { target: HTMLElement | null; box: Box | null } {
  const [target, setTarget] = useState<HTMLElement | null>(null);
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
    setTarget(target);
    target?.classList.add('help-tab-on');
    const bar = target?.closest('nav') ?? target;
    const update = (): void => {
      setBoxes({ tab: measureTarget(target), bar: measure(bar) });
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

  return {
    ...placeTour(boxes.tab, boxes.bar, viewport.width, viewport.height),
    target,
    box: boxes.tab,
  };
}

/**
 * The lit phone tab, drawn again over the scrim (TR-*-375 boards): the real
 * tab sits in the inert page under the scrim, so a copy of it, teal, takes
 * its place inside the ring. Only on the bottom tab bar; the copy is a
 * picture (no link, no focus).
 */
function TourTabCopy({
  target,
  box,
}: {
  target: HTMLElement;
  box: Box;
}): JSX.Element {
  const holder = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = holder.current;
    if (el === null) return;
    const copy = target.cloneNode(true);
    if (!(copy instanceof HTMLElement)) return;
    copy.removeAttribute('href');
    copy.removeAttribute('id');
    copy.removeAttribute('data-tour');
    copy.classList.remove('help-tab-on');
    copy.setAttribute('tabindex', '-1');
    el.replaceChildren(copy);
  }, [target]);
  return (
    <div
      ref={holder}
      class="bottom-nav tour-tab-copy"
      inert
      style={{
        top: px(box.top),
        left: px(box.left),
        width: px(box.width),
        height: px(box.height),
      }}
    />
  );
}

/**
 * Rows about what Bower wrote carry the bird mark, 20 px (R-HELP-4, D-18):
 * rows whose icon is 'bird', and the "By Bower" and "The bird" rows.
 */
export function isBowerRow(lead: string): boolean {
  return /^(by bower|the bird)\b/i.test(lead.trim());
}

function HelpRows({ rows }: { rows: readonly HelpRow[] }): JSX.Element {
  return (
    <ul class="help-rows">
      {rows.map(({ icon, lead, text }) => {
        const Icon = icon === 'bird' ? null : ICONS[icon];
        return (
          <li key={lead} class="help-row">
            {Icon === null || isBowerRow(lead) ? <BowerMark size={20} /> : <Icon />}
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
 * What "?" and "Help and about this" open: the one Help template (#907,
 * spec §3.7, R-HELP-1, boards PF-Help): a header with the bird 52, the
 * overline, the title and ✕ "Close Help"; the lede; the rows; then the
 * "Bower" group with "Show me around" and "Learn Bower". Queued as an own
 * overlay: a content sheet on phones, the 440 px side panel from 900 px.
 * The copy is `help-rows.ts`'s (#919).
 */
export function HelpSheet({
  screen,
  onClose,
  onShowMeAround,
}: HelpSheetProps): JSX.Element {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  // The screen on show may say which of its kinds it is, and what it shows.
  const topic = currentHelpTopic(screen);
  const copy = helpSheet(topic.screen, {
    desktop,
    demo: isDemo(),
    ...(topic.context !== undefined && { context: topic.context }),
  });
  const [tips, setTips] = useState<ScreenTip[]>(() => dismissedTips(screen));

  return (
    <Queued id="help-sheet" priority={OVERLAY_PRIORITY.own}>
      <Overlay kind="sheet" labelledBy="help-sheet-title" onClose={onClose}>
        <div class="overlay-body help-template">
          <div class="help-head">
            <span class="help-bird" aria-hidden="true">
              <Bird state="idle" face="happy" size={52} overlay />
            </span>
            <div class="help-heading">
              <p class="help-kicker">Help and about this</p>
              <h2 id="help-sheet-title" class="help-title" tabIndex={-1}>
                {copy.title}
              </h2>
            </div>
            <button
              type="button"
              class="icon-button help-close"
              aria-label="Close Help"
              onClick={onClose}
            >
              <IconClose />
            </button>
          </div>
          <p id="help-sheet-lede" class="help-lede">
            {copy.lede}
          </p>
          <HelpRows rows={copy.rows} />
          {tips.length > 0 && (
            <section class="help-tips" aria-labelledby="help-tips-title">
              <p id="help-tips-title" class="help-group">
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
          <p class="help-group">Bower</p>
          <div class="help-actions">
            <button
              type="button"
              class="btn btn-secondary"
              onClick={onShowMeAround}
            >
              <IconPlay />
              Show me around
            </button>
            <a class="btn btn-secondary" href={LEARN_PATH} onClick={onClose}>
              Learn Bower
            </a>
          </div>
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
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const copy = tourSheet(tab, { desktop, demo: isDemo() });
  const place = useTourPlacement(tab);
  // No focus box when the tour opens (TR-*); the first key press brings the
  // ring back for keyboard users.
  const [quiet, setQuiet] = useState(true);

  // Every step starts with its main button focused. The overlay focuses it
  // when the tour opens (`initialFocus`); this moves it there again on
  // each later step, after Back or Next re-rendered the card.
  useEffect(() => {
    queueMicrotask(() => next.current?.focus());
  }, [index]);

  return (
    <>
      {createPortal(
        <div class="tour-stage" aria-hidden="true">
          {place.spot !== null && <div class="tour-spot" style={place.spot} />}
          {place.facing === 'down' &&
            place.target !== null &&
            place.box !== null && (
              <TourTabCopy target={place.target} box={place.box} />
            )}
          {place.bird !== null && (
            <span class="tour-bird" style={place.bird}>
              <Bird
                state="pointing"
                face="happy"
                size={TOUR_BIRD_SIZE}
                down={place.facing === 'down'}
                flip={place.facing === 'left'}
                overlay
              />
            </span>
          )}
        </div>,
        document.body,
      )}
      <div
        class={`help-panel tour-card${quiet ? ' tour-quiet' : ''}`}
        onKeyDown={() => {
          setQuiet(false);
        }}
      >
        <div class="help-head">
          {/* The step's title is announced as it changes; the heading's
              own box is `display: contents` in the card's grid. */}
          <div class="help-heading">
            <p class="help-kicker">{tourLabel(index)}</p>
            <h2 id="tour-title" class="help-title" aria-live="polite">
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
            <button type="button" class="btn btn-secondary" onClick={onBack}>
              Back
            </button>
          )}
          <button
            ref={next}
            type="button"
            class="btn tour-next"
            onClick={onNext}
          >
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
 * a one-off toast; "Let's go" opens the Bower tab (R-TR-5).
 */
export function Tour({ onEnd }: TourProps): JSX.Element {
  const [index, setIndex] = useState(0);
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
    route?.('/bower');
  };

  return (
    <Queued id="tour" priority={OVERLAY_PRIORITY.tour}>
      <Overlay
        kind="dialog"
        labelledBy="tour-title"
        onClose={skip}
        initialFocus=".tour-next"
      >
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
