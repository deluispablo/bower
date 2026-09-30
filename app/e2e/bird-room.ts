/**
 * The room rule's gate (R-BIRD-6, spec §6.21 rule 3): no ancestor of a bird
 * clips the room around it. The helper walks every ancestor of every visible
 * `svg.b`, treats `overflow` other than visible (per axis), `overflow: clip`,
 * `clip-path` and `contain: paint` as clipping, scrolls the bird into view
 * first, and compares the bird's box, grown by its room, with the ancestor's
 * client box (a scroller's client box excludes its borders and scrollbars).
 * A rounded card edge is not checked. The room comes from the pose class: 50%
 * on every side for the scene states (`p-tidy`, `p-build`), otherwise 12%
 * above and on each side and 2% below.
 */

import type { Page } from '@playwright/test';

/** One place a bird may be cut, with the reason it is allowed. */
export interface RoomAllow {
  /** Selector of the clipping ancestor. */
  ancestor: string;
  /** Selector of the bird (`svg.b`) it may cut. */
  bird: string;
  why: string;
}

/**
 * The only allowed clip: the intro's sort strip. The bird that carries the
 * cards waits outside the strip and flies in, so the strip's edge cutting it
 * is the exit of the animation (spec §6.21, R-BIRD-6).
 */
export const ROOM_ALLOW_LIST: readonly RoomAllow[] = [
  {
    ancestor: '.intro-strip',
    bird: '.intro-strip-carrier svg.b',
    why: "the intro sort strip's exit",
  },
];

/** A bird whose room a clipping ancestor cuts. */
export interface RoomFinding {
  /** The bird's class list, trimmed. */
  bird: string;
  /** Room used, as fractions of the bird's size. */
  room: { top: number; side: number; bottom: number };
  /** The clipping ancestor: tag, id and its first two classes. */
  ancestor: string;
  /** Why it clips. */
  clip: string;
  /** Which sides of the grown box fall outside the ancestor's client box. */
  sides: string[];
}

/** Fractions of the bird's size kept free around it (rule 3). */
export const ROOM = {
  top: 0.12,
  side: 0.12,
  bottom: 0.02,
  /** Every side, for the scene states (`p-tidy`, `p-build`). */
  scene: 0.5,
} as const;

interface WalkArgs {
  allow: readonly RoomAllow[];
  room: typeof ROOM;
}

/** Runs in the page: keep it free of imports and of anything outside `args`. */
function walk(args: WalkArgs): RoomFinding[] {
  const found: RoomFinding[] = [];
  const birds = Array.from(document.querySelectorAll('svg.b'));
  for (const bird of birds) {
    bird.scrollIntoView({ block: 'center', inline: 'center' });
    const own = getComputedStyle(bird);
    if (own.display === 'none' || own.visibility === 'hidden') continue;
    const r = bird.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cls = (bird.getAttribute('class') ?? '').trim();
    const scene = /\bp-(?:tidy|build)\b/.test(cls);
    const room = scene
      ? {
          top: args.room.scene,
          side: args.room.scene,
          bottom: args.room.scene,
        }
      : { top: args.room.top, side: args.room.side, bottom: args.room.bottom };
    const grown = {
      left: r.left - r.width * room.side,
      right: r.right + r.width * room.side,
      top: r.top - r.height * room.top,
      bottom: r.bottom + r.height * room.bottom,
    };
    for (
      let next: Element | null = bird.parentElement;
      next !== null;
      next = next.parentElement
    ) {
      const a: Element = next;
      const cs = getComputedStyle(a);
      const clipsX = cs.overflowX !== 'visible';
      const clipsY = cs.overflowY !== 'visible';
      const clipPath = cs.clipPath !== 'none';
      const paint = /paint|strict|content/.test(cs.contain);
      if (!clipsX && !clipsY && !clipPath && !paint) continue;
      const allowed = args.allow.some(
        (entry) => a.matches(entry.ancestor) && bird.matches(entry.bird),
      );
      if (allowed) continue;
      const page = a === document.documentElement || a === document.body;
      const box = a.getBoundingClientRect();
      const inner = page
        ? {
            left: 0,
            right: document.documentElement.clientWidth,
            top: Number.NEGATIVE_INFINITY,
            bottom: Number.POSITIVE_INFINITY,
          }
        : {
            left: box.left + a.clientLeft,
            right: box.left + a.clientLeft + a.clientWidth,
            top: box.top + a.clientTop,
            bottom: box.top + a.clientTop + a.clientHeight,
          };
      const x = clipsX || clipPath || paint;
      const y = (clipsY && !page) || clipPath || paint;
      const sides: string[] = [];
      if (x && grown.left < inner.left - 0.5) sides.push('left');
      if (x && grown.right > inner.right + 0.5) sides.push('right');
      if (y && grown.top < inner.top - 0.5) sides.push('top');
      if (y && grown.bottom > inner.bottom + 0.5) sides.push('bottom');
      if (sides.length === 0) continue;
      const classes = typeof a.className === 'string' ? a.className : '';
      const named = classes.split(/\s+/).filter((c) => c !== '');
      found.push({
        bird: cls.slice(0, 60),
        room,
        ancestor:
          a.tagName.toLowerCase() +
          (a.id !== '' ? `#${a.id}` : '') +
          (named.length > 0 ? `.${named.slice(0, 2).join('.')}` : ''),
        clip: [
          clipsX || clipsY ? `overflow ${cs.overflowX}/${cs.overflowY}` : '',
          clipPath ? `clip-path ${cs.clipPath}` : '',
          paint ? `contain ${cs.contain}` : '',
        ]
          .filter((part) => part !== '')
          .join(', '),
        sides,
      });
    }
  }
  return found;
}

/**
 * Every bird on the page whose room a clipping ancestor cuts, minus the
 * allow-list. Wait for the screen to settle first; run with reduced motion
 * so the boxes hold still.
 */
export async function birdRoomFindings(
  page: Page,
  allow: readonly RoomAllow[] = ROOM_ALLOW_LIST,
): Promise<RoomFinding[]> {
  return page.evaluate(walk, { allow, room: ROOM });
}

/** One line per finding, for a failure message. */
export function describeFindings(findings: readonly RoomFinding[]): string {
  return findings
    .map(
      (f) =>
        `bird "${f.bird}" is cut on ${f.sides.join('/')} by ${f.ancestor} (${f.clip})`,
    )
    .join('\n');
}
