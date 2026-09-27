/**
 * The first-run tour (spec §7, #149): three coach marks over Home, one after
 * the other, driven by `TOUR_STEPS`. Each step dims the screen, leaves a
 * hole over its target and gives the target the pulsing ring
 * (`.tour-ring`, added here and removed when the step changes). Targets are
 * found by their stable `data-tour` attribute (`add`, `tidy`, `tell`) on the
 * shell's controls; where two exist (the phone's bottom nav and the desktop
 * sidebar) the one on screen wins.
 *
 * The card is a `role="dialog"` with focus trapped; Escape and "Skip tour"
 * skip, "Next" moves on and "Let's go" on the last step finishes. The tour
 * only reports how it ended (`onEnd`); saving `tourSeenAt` is the caller's.
 *
 * In a demo build (spec §5, #195) the same three steps run with copy that
 * names Alex's sample notes, plus a fourth step pointing at the persistent
 * demo banner (`data-tour="banner"`, `components/demo-banner.tsx`) whose
 * card ends "This is a demo; run your own" with a button to the Run your
 * own Bower route instead of "Let's go" (`TourStep.cta`). `isDemo()` picks
 * the array; nothing else about the tour changes.
 */

import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { isDemo } from '../api.js';
import { Bird } from './bird.js';
import type { BirdState } from './bird-classes.js';
import { useFocusTrap } from './use-focus-trap.js';

import '../styles/tour.css';

export type TourTarget = 'add' | 'tidy' | 'tell' | 'banner';

export interface TourStep {
  /** The `data-tour` value of the control this step points at. */
  target: TourTarget;
  label: string;
  title: string;
  body: string;
  bird: BirdState;
  /** Stand the bird on the target when there is room (the phone's tabs). */
  birdOnTarget: boolean;
  /**
   * Replaces "Let's go" with a link styled as the same button: the demo's
   * last step, which ends the tour by leaving Home for another route
   * rather than staying on it.
   */
  cta?: { label: string; href: string };
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'add',
    label: '1 of 3 · Add',
    title: 'Drop anything here.',
    body: 'Photos, PDFs, links, screenshots, voice memos. You can also share to Bower from any app. I read all of it.',
    bird: 'shiny',
    birdOnTarget: true,
  },
  {
    target: 'tidy',
    label: '2 of 3 · Tidy up',
    title: "When you're ready, tap Tidy up.",
    body: 'Nothing happens until you tap; there is no schedule. Add a pile first: I do better work with ten things than with one.',
    bird: 'tidying',
    birdOnTarget: false,
  },
  {
    target: 'tell',
    label: '3 of 3 · Tell Bower',
    title: 'Talk to me like a person.',
    body: 'Give me a rule, a task or a question. I remember rules for good and answer questions in a note under Answers.',
    bird: 'singing',
    birdOnTarget: true,
  },
];

/**
 * The demo's tour (#195): the same three steps, worded for Alex's sample
 * notes, plus a fourth pointing at the demo banner and ending on "Run your
 * own Bower" (`routes/run-your-own.tsx`, `/login` in a demo build) instead
 * of dismissing the tour on Home.
 */
const DEMO_TOUR_STEPS: readonly TourStep[] = [
  {
    target: 'add',
    label: '1 of 4 · Add',
    title: 'Drop anything here.',
    body: "These are Alex's notes, a sample folder. Photos, PDFs, links, screenshots, voice memos: drop anything in and Bower reads it, same as it would with your own.",
    bird: 'shiny',
    birdOnTarget: true,
  },
  {
    target: 'tidy',
    label: '2 of 4 · Tidy up',
    title: "When you're ready, tap Tidy up.",
    body: "Nothing happens until you tap; there is no schedule. Alex's inbox already has a few things waiting, so you can watch them get filed for real.",
    bird: 'tidying',
    birdOnTarget: false,
  },
  {
    target: 'tell',
    label: '3 of 4 · Tell Bower',
    title: 'Talk to me like a person.',
    body: "Give me a rule, a task or a question about Alex's notes. I remember rules for good and answer questions in a note under Answers.",
    bird: 'singing',
    birdOnTarget: true,
  },
  {
    target: 'banner',
    label: '4 of 4 · This is a demo',
    title: 'This is a demo; run your own.',
    body: "Alex's notes are just a sample, so nothing you do here is saved. Run your own Bower and it keeps your own notes tidy in your own Google Drive instead.",
    bird: 'hello',
    birdOnTarget: false,
    cta: { label: 'Run your own Bower', href: '/login' },
  },
];

export interface TourProps {
  /** `true` after "Let's go"; `false` after "Skip tour" or Escape. */
  onEnd: (finished: boolean) => void;
  /**
   * Start at the step pointing at this control instead of the first: the
   * top bar's "?" opens the step for the tab on screen (#318), until each
   * tab has a help sheet of its own (#330).
   */
  startAt?: TourTarget;
}

/** The index of the step pointing at `target`, or 0 when there is none. */
export function tourStartIndex(
  steps: readonly TourStep[],
  target: TourTarget | undefined,
): number {
  const found = steps.findIndex((step) => step.target === target);
  return found === -1 ? 0 : found;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Style = Record<string, string>;

interface Placement {
  /** The hole in the dimmed screen; `null` when the target is not on screen. */
  spot: Style | null;
  card: Style;
  /** Where the bird stands; `null` puts it inside the card. */
  bird: Style | null;
}

const GAP = 16;
const SPOT_PAD = 8;
const BIRD_SIZE = 64;
const CARD_MAX = 416;

function px(value: number): string {
  return `${Math.round(value)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Where the spot, the card and the bird go for a target at `box` in a
 * `width` x `height` viewport. A target in the lower half (the phone's
 * bottom nav) gets the card above it, with the bird standing on the target
 * in between; anything else gets the card below it and the bird inside.
 */
export function placeCoach(
  box: Box | null,
  width: number,
  height: number,
  birdOnTarget: boolean,
): Placement {
  const cardWidth = Math.min(width - 2 * GAP, CARD_MAX);
  if (box === null || box.width === 0 || box.height === 0) {
    return {
      spot: null,
      card: {
        left: px((width - cardWidth) / 2),
        width: px(cardWidth),
        top: px(GAP),
        maxHeight: px(height - 2 * GAP),
      },
      bird: null,
    };
  }

  const centre = box.left + box.width / 2;
  const left = px(clamp(centre - cardWidth / 2, GAP, width - cardWidth - GAP));
  const spot: Style = {
    top: px(box.top - SPOT_PAD),
    left: px(box.left - SPOT_PAD),
    width: px(box.width + 2 * SPOT_PAD),
    height: px(box.height + 2 * SPOT_PAD),
  };

  if (box.top + box.height / 2 > height / 2) {
    const onTarget = birdOnTarget && box.top > BIRD_SIZE + 240;
    const birdTop = box.top - SPOT_PAD - BIRD_SIZE;
    const cardBottom = height - (onTarget ? birdTop : box.top - SPOT_PAD) + 8;
    return {
      spot,
      card: {
        left,
        width: px(cardWidth),
        bottom: px(cardBottom),
        maxHeight: px(height - cardBottom - GAP),
      },
      bird: onTarget
        ? {
            left: px(clamp(centre - BIRD_SIZE / 2, 8, width - BIRD_SIZE - 8)),
            top: px(birdTop),
          }
        : null,
    };
  }

  const cardTop = box.top + box.height + SPOT_PAD + GAP;
  return {
    spot,
    card: {
      left,
      width: px(cardWidth),
      top: px(cardTop),
      maxHeight: px(height - cardTop - GAP),
    },
    bird: null,
  };
}

/** The target on screen for `name`, else the first one in the page. */
function findTarget(name: TourTarget): HTMLElement | null {
  const all = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`),
  );
  return all.find((el) => el.getClientRects().length > 0) ?? all[0] ?? null;
}

function measure(target: HTMLElement | null): Box | null {
  if (target === null) return null;
  const rect = target.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** Step 2's picture: the bird carrying a page from the inbox tray to the nest. */
function TidyScene(): JSX.Element {
  return (
    <div class="tour-scene" aria-hidden="true">
      <span class="tour-scene-ground" />
      <span class="tour-scene-label tour-scene-label--from">Inbox</span>
      <span class="tour-scene-label tour-scene-label--to">
        Cooking · Finance
      </span>
      <span class="tour-scene-bird">
        <Bird state="tidying" size={80} scene />
      </span>
    </div>
  );
}

/** Step 3's two examples and where to replay the tour. */
function TellExamples(): JSX.Element {
  return (
    <div class="tour-examples">
      <p class="tour-example">
        <span class="tour-example-kind">Rule</span>
        File every receipt under Finance.
      </p>
      <p class="tour-example">
        <span class="tour-example-kind">Ask</span>
        What did I save about Lisbon?
      </p>
      <p class="tour-note">
        Replay any time from Settings › Show me around again.
      </p>
    </div>
  );
}

export function Tour({ onEnd, startAt }: TourProps): JSX.Element {
  const [index, setIndex] = useState(() =>
    tourStartIndex(isDemo() ? DEMO_TOUR_STEPS : TOUR_STEPS, startAt),
  );
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const ctaLink = useRef<HTMLAnchorElement>(null);

  const steps = isDemo() ? DEMO_TOUR_STEPS : TOUR_STEPS;
  const step = steps[index] ?? steps[0];
  if (step === undefined) throw new Error('The tour has no steps');
  const last = index === steps.length - 1;

  const skip = (): void => {
    onEnd(false);
  };
  useFocusTrap(card, skip);

  // Ring the step's target and keep the spot on it as the page moves.
  useLayoutEffect(() => {
    const target = findTarget(step.target);
    target?.classList.add('tour-ring');
    const update = (): void => {
      setBox(measure(target));
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      target?.classList.remove('tour-ring');
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target]);

  // Every step starts with the main button (or the demo's final link) focused.
  useEffect(() => {
    (next.current ?? ctaLink.current)?.focus();
  }, [index]);

  const place = placeCoach(
    box,
    viewport.width,
    viewport.height,
    step.birdOnTarget,
  );
  const bird = (
    <Bird
      state={step.bird}
      size={place.bird === null ? 48 : BIRD_SIZE}
      scene={step.bird === 'shiny'}
    />
  );

  return (
    <div class={place.spot === null ? 'tour tour--no-spot' : 'tour'}>
      {place.spot !== null && (
        <div class="tour-spot" style={place.spot} aria-hidden="true" />
      )}
      {place.bird !== null && step.target !== 'tidy' && (
        <div class="tour-bird" style={place.bird} aria-hidden="true">
          {bird}
        </div>
      )}
      <div
        ref={card}
        class="tour-card"
        style={place.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
      >
        <div class="tour-text" aria-live="polite">
          <div class="tour-head">
            {place.bird === null && step.target !== 'tidy' && (
              <span class="tour-card-bird">{bird}</span>
            )}
            <p class="tour-label">{step.label}</p>
          </div>
          <h2 id="tour-title" class="tour-title">
            {step.title}
          </h2>
          <p id="tour-body" class="tour-body">
            {step.body}
          </p>
        </div>
        {step.target === 'tidy' && <TidyScene />}
        {step.target === 'tell' && <TellExamples />}
        <div class="tour-actions">
          <button type="button" class="button-link" onClick={skip}>
            Skip tour
          </button>
          {step.cta !== undefined ? (
            <a
              ref={ctaLink}
              class="button"
              href={step.cta.href}
              onClick={() => onEnd(true)}
            >
              {step.cta.label}
            </a>
          ) : (
            <button
              ref={next}
              type="button"
              class="button"
              onClick={() => {
                if (last) onEnd(true);
                else setIndex(index + 1);
              }}
            >
              {last ? "Let's go" : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
