import {
  forwardRef,
  useCallback,
  type ReactNode,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { usePrefs } from '@/app/prefs';
import { useMedia } from '@/ui/media';
import { BirdEngine, type EngineOptions, type PoseName, type Point, type TargetFn } from './engine';
import { activeHandle, useBirdTurn, useOutranked } from './presence';
import { react } from './react';
import { Rig, type RigPart } from './Rig';
import './poses.css';
import './bower.css';

export type Pose = PoseName;

/** Whether the Bower holding the turn may move: the setting, the system. */
function useMoves(turn: boolean): boolean {
  const birdMoves = usePrefs((p) => p.birdMoves);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  return turn && birdMoves && !reduced;
}

interface EngineEls {
  /** The element the engine moves (the layer's flyer, the perched bird's inner wrapper). */
  bird: RefObject<HTMLElement | null>;
  /** The box whose pixels home and the pointer are measured in. */
  frame: RefObject<HTMLElement | null>;
  carry?: RefObject<HTMLElement | null>;
  spark?: RefObject<HTMLElement | null>;
}

interface EngineUse {
  turn: boolean;
  setHandle: (engine: BirdEngine | null, frame?: Element | null) => void;
  /** A perched bird plays this pose in place; its engine exists only while it moves. */
  pose?: Pose;
  speed?: number;
  options?: EngineOptions;
}

/**
 * The one engine mount, for the layer and the perched bird: the rig's parts,
 * the engine, its size and speed, start and stop on motion and visibility,
 * home on resize, and the look source: the pointer and touches (over the
 * layer's parent, or the whole document for a perched bird) and the focused
 * control. Presence gets the engine while it moves.
 */
function useBirdEngine(els: EngineEls, home: TargetFn, size: number, moves: boolean, look: 'parent' | 'document', use: EngineUse) {
  const parts = useRef<Partial<Record<RigPart, SVGGElement | null>>>({});
  const onPart = useCallback((part: RigPart, el: SVGGElement | null) => {
    parts.current[part] = el;
  }, []);
  const engine = useRef<BirdEngine | null>(null);
  const homeRef = useRef(home);
  useLayoutEffect(() => {
    homeRef.current = home;
  });
  const { turn, pose, speed = 1, options, setHandle } = use;
  const perched = pose !== undefined;
  const birdMoves = usePrefs((p) => p.birdMoves);
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  // Remember completion, not elapsed wall time. Adjust input state during render (React's derived-state pattern).
  const allowed = turn && !reduced;
  const [motionState, setMotionState] = useState({ moves, allowed, settled: !moves });
  if (motionState.moves !== moves || motionState.allowed !== allowed) {
    setMotionState({ moves, allowed, settled: !allowed || (!motionState.allowed && !moves) ? true :
      moves ? false : motionState.settled });
  }
  const animated = moves || (allowed && !birdMoves && !motionState.settled);
  const wakeOnEnable = useRef(!birdMoves);
  const settling = useRef(!birdMoves && !reduced);
  useLayoutEffect(() => { settling.current = !birdMoves && !reduced; }, [birdMoves, reduced]);
  const settings = window.location.pathname === '/settings';
  const settingStill = !birdMoves && !reduced && !animated;
  const closedStill = settings && settingStill;

  // A static Settings frame is CSS, like the other still poses. The engine owns all animated attributes.
  useLayoutEffect(() => {
    const head = parts.current.head;
    const eye = parts.current.eye;
    if (head) { head.style.transform = closedStill ? 'rotate(8deg)' : ''; head.style.transformOrigin = closedStill ? '60px 50px' : ''; }
    if (eye) { eye.style.transform = settingStill ? `scaleY(${settings ? '0.08' : '1'})` : ''; eye.style.transformOrigin = settingStill ? '70px 34px' : ''; }
  }, [closedStill, settingStill, settings]);

  useEffect(() => {
    if (!birdMoves) wakeOnEnable.current = true;
    if (!engine.current && (moves || !perched)) {
      const p = parts.current;
      const bird = els.bird.current;
      if (!bird || !p.rig || !p.head || !p.tail || !p.wing || !p.legs || !p.jaw || !p.tuft || !p.eye || !p.iris) return;
      const e = new BirdEngine({ bird, rig: p.rig, head: p.head, tail: p.tail, wing: p.wing, legs: p.legs,
        jaw: p.jaw, tuft: p.tuft, eye: p.eye, iris: p.iris, glyph: p.carry ?? null,
        carry: els.carry?.current ?? null, spark: els.spark?.current ?? null },
        () => homeRef.current(), size, { sleeps: perched, ...options, settings, motionChange: () => settling.current || wakeOnEnable.current,
          onStill: () => {
            e.release();
            if (perched) engine.current = null;
            setHandle(null);
            setMotionState({ moves: false, allowed: true, settled: true });
          },
        });
      engine.current = e;
      if (pose) e.setPose(pose);
    }
    const e = engine.current;
    if (!e) return;
    e.setSize(size);
    e.speed = speed;
    if (moves) {
      setHandle(e, els.frame.current);
      if (wakeOnEnable.current) react('moves-on');
      wakeOnEnable.current = false;
      e.start();
    } else if (!birdMoves && allowed && animated) {
      // The handle and engine stay live until the engine draws the final settle frame.
      if (activeHandle() === e) react('moves-off');
    } else {
      e.release();
      if (perched) engine.current = null;
      setHandle(null);
    }
    // The rig refs and options belong to this mount; size and speed are updated separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, turn, birdMoves, reduced, setHandle]);

  useEffect(() => {
    if (pose) engine.current?.setPose(pose);
  }, [pose]);
  useEffect(() => {
    engine.current?.setSize(size);
    if (engine.current) engine.current.speed = speed;
  }, [size, speed]);
  useEffect(() => () => {
    engine.current?.release();
    engine.current = null;
    setHandle(null);
  }, [setHandle]);

  useEffect(() => {
    const stopOnHide = (): void => {
      const e = engine.current;
      if (!e || !animated) return;
      if (document.hidden) e.stop(); else e.start();
    };
    document.addEventListener('visibilitychange', stopOnHide);
    const keep = (): void => { if (!animated) engine.current?.snapHome(); };
    window.addEventListener('resize', keep);
    return () => {
      document.removeEventListener('visibilitychange', stopOnHide);
      window.removeEventListener('resize', keep);
    };
  }, [animated]);

  // The look source: Bower watches the pointer and touches over the layer's parent (anywhere, for a
  // perched bird) and the focused control. Listeners only read; they never stop or change the event.
  useEffect(() => {
    const host = look === 'document' ? document : els.frame.current?.parentElement;
    if (!host || !moves) return;
    const toFrame = (x: number, y: number): Point | null => {
      const r = els.frame.current?.getBoundingClientRect();
      return r ? { x: x - r.left, y: y - r.top } : null;
    };
    const onPointer = (ev: Event): void => {
      if (!(ev instanceof MouseEvent)) return;
      const p = toFrame(ev.clientX, ev.clientY);
      if (p) engine.current?.look(p, ev.type === 'pointerdown' ? 'touch' : 'pointer');
    };
    // The focused control's place is read each frame, so the gaze follows it as the page scrolls or
    // lays out again, and ends when focus leaves it. A key with nothing focused still counts as input,
    // and leaves a live pointer gaze as it is; so does focus a pointer gave (main, on a click), which
    // is not :focus-visible, so a tap's pointer gaze holds.
    const onFocus = (ev: Event): void => {
      const el = ev.type === 'keydown' ? document.activeElement : ev.target;
      if (!(el instanceof Element) || el === document.body || el === document.documentElement || !el.matches(':focus-visible')) {
        engine.current?.look(null, 'focus');
        return;
      }
      engine.current?.look(() => {
        if (!el.isConnected || document.activeElement !== el) return null;
        const t = el.getBoundingClientRect();
        return toFrame(t.left + t.width / 2, t.top + t.height / 2);
      }, 'focus');
    };
    host.addEventListener('pointermove', onPointer);
    host.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('keydown', onFocus);
    return () => {
      host.removeEventListener('pointermove', onPointer);
      host.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('keydown', onFocus);
    };
    // The elements are refs, read when an input comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, look]);

  return { onPart, engine, home: homeRef, animated };
}

interface PoseProps {
  pose: Pose;
  size: number;
  /** Overlays outrank the page, so the bird in a sheet is the one that moves. */
  priority?: number;
  /** A small bird beside the page's (the run chip's): never takes the turn, shows its still frame. */
  minor?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Test-only: fake frames and a seeded random source for the engine. */
  engineOptions?: EngineOptions;
}

/**
 * Bower in one place. The bird holding the turn plays its pose through the
 * engine, inside an inner wrapper the engine owns; every other bird (and every
 * bird with "Bower moves" off or reduced motion) shows the pose's still frame.
 */
export function PoseBower({ pose, size, priority = 0, minor = false, className = '', style, engineOptions }: PoseProps) {
  const { turn, setHandle } = useBirdTurn(priority, { minor });
  const moves = useMoves(turn);
  // One Bower on screen: under an overlay with its own Bower, the page's steps out of sight.
  const outranked = useOutranked(priority);
  const box = useRef<HTMLDivElement>(null);
  const perch = useRef<HTMLDivElement>(null);
  // The box as drawn: a caller's CSS may resize it (Sign in on a phone), and the engine draws to fit.
  const [drawn, setDrawn] = useState(size);
  useLayoutEffect(() => {
    const read = (): void => setDrawn(box.current?.offsetWidth || size);
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [size]);
  // The feet on y 92 of the drawing, in the middle of the box.
  const home = useCallback(() => ({ x: drawn / 2, y: 0.92 * drawn }), [drawn]);
  const { onPart, animated } = useBirdEngine({ bird: perch, frame: box }, home, drawn, moves, 'document', {
    pose,
    turn,
    setHandle,
    options: engineOptions,
  });
  return (
    <div
      ref={box}
      className={`bird ${animated ? '' : `posed ${pose} still`} ${className}`}
      style={{ width: size, height: size, ...style, ...(outranked ? { visibility: 'hidden' } : {}) }}
      data-pose={pose}
      data-bird
      aria-hidden="true"
      // A tap pokes Bower (pointer or touch only: it is never focusable, and no key pokes it).
      onPointerDown={() => react('tap')}
    >
      <div ref={perch} className="bird-perch">
        <Rig onPart={onPart} />
      </div>
    </div>
  );
}

export interface BowerController {
  flyTo(get: TargetFn): BowerController;
  hopTo(get: TargetFn): BowerController;
  peck(onBite?: () => void): BowerController;
  holding(on: boolean): BowerController;
  showOff(): BowerController;
  face(dir: 1 | -1): BowerController;
  study(seconds?: number): BowerController;
  scribble(seconds: number, onStroke?: () => void, every?: number): BowerController;
  then(fn: () => void): BowerController;
  wait(seconds: number): BowerController;
  settled(): Promise<void>;
  /** Forgets the queued actions, e.g. when the run moves to another phase. */
  interrupt(): void;
  /** Converts a page element to a landing point (top edge, toward its right). */
  pointOn(el: Element | null, along?: number): Point;
  readonly moving: boolean;
}

interface LayerProps {
  /** Where Bower lives, in the layer's pixels; read every frame. */
  home: TargetFn;
  size?: number;
  priority?: number;
  /** What the carried chip shows (a short label)... */
  carryLabel?: string;
  /** ...or the thing itself, drawn by the caller. */
  carry?: ReactNode;
  /** Plays flights faster than life (a replay). */
  speed?: number;
  /** Test-only: fake frames and a seeded random source for the engine. */
  engineOptions?: EngineOptions;
}

/**
 * A layer, the size of its positioned parent, in which Bower can fly. The
 * parent decides where home is; a caller drives flights through the ref.
 * When Bower may not move, it sits at home and actions finish at once.
 */
export const BowerLayer = forwardRef<BowerController, LayerProps>(function BowerLayer(
  { home, size = 72, priority = 0, carryLabel = '', carry: carryNode, speed = 1, engineOptions },
  ref,
) {
  const layer = useRef<HTMLDivElement>(null);
  const bird = useRef<HTMLButtonElement>(null);
  const carry = useRef<HTMLDivElement>(null);
  const spark = useRef<HTMLDivElement>(null);
  const { turn, setHandle } = useBirdTurn(priority);
  const moves = useMoves(turn);
  const outranked = useOutranked(priority);
  const { onPart, engine, home: homeRef, animated } = useBirdEngine({ bird, frame: layer, carry, spark }, home, size, moves, 'parent', {
    turn,
    setHandle,
    speed,
    options: engineOptions,
  });

  useImperativeHandle(ref, (): BowerController => {
    const still = !moves;
    const ctl: BowerController = {
      flyTo: (get) => (still ? ctl : (engine.current?.flyTo(get), ctl)),
      hopTo: (get) => (still ? ctl : (engine.current?.hopTo(get), ctl)),
      peck: (onBite) => {
        if (still) onBite?.();
        else engine.current?.peck(onBite);
        return ctl;
      },
      holding: (on) => (still ? ctl : (engine.current?.holding(on), ctl)),
      showOff: () => (still ? ctl : (engine.current?.showOff(), ctl)),
      face: (d) => (still ? ctl : (engine.current?.face(d), ctl)),
      study: (sec) => (still ? ctl : (engine.current?.study(sec), ctl)),
      scribble: (sec, onStroke, every) => {
        if (still) onStroke?.();
        else engine.current?.scribble(sec, onStroke, every);
        return ctl;
      },
      then: (fn) => {
        if (still) fn();
        else engine.current?.then(fn);
        return ctl;
      },
      wait: (s) => (still ? ctl : (engine.current?.wait(s), ctl)),
      settled: () => engine.current?.settled() ?? Promise.resolve(),
      interrupt: () => engine.current?.interrupt(),
      pointOn: (el, along = 0.85) => {
        const r = layer.current?.getBoundingClientRect();
        const t = el?.getBoundingClientRect();
        if (!r || !t) return homeRef.current();
        return { x: t.left - r.left + t.width * along, y: t.top - r.top + 2 };
      },
      get moving() {
        return !still;
      },
    };
    return ctl;
  }, [moves, engine, homeRef]);

  return (
    <div ref={layer} className="bower-layer" aria-hidden="true" data-bird style={outranked ? { visibility: 'hidden' } : undefined}>
      <div ref={spark} className="bower-spark">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <button
        ref={bird}
        type="button"
        tabIndex={-1}
        aria-label="Bower"
        className={`bird bower-flyer ${animated ? '' : 'posed idle still'}`}
        onClick={() => react('tap')}
      >
        <Rig onPart={onPart} />
      </button>
      <div ref={carry} className={carryNode ? 'bower-carry bower-carry-thing' : 'bower-carry'}>
        {carryNode ?? carryLabel}
      </div>

    </div>
  );
});
