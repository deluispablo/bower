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
import { prefersReducedMotion, usePrefs } from '@/app/prefs';
import { BirdEngine, type EngineOptions, type PoseName, type Point, type TargetFn } from './engine';
import { useBirdTurn, useOutranked } from './presence';
import { Rig, type RigPart } from './Rig';
import './poses.css';
import './bower.css';

export type Pose = PoseName;

/** Whether the Bower holding the turn may move: the setting, the system. */
function useMoves(turn: boolean): boolean {
  const birdMoves = usePrefs((p) => p.birdMoves);
  return turn && birdMoves && !prefersReducedMotion();
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
  setHandle: (engine: BirdEngine | null) => void;
  /** A perched bird plays this pose in place; its engine exists only while it moves. */
  pose?: Pose;
  speed?: number;
  options?: EngineOptions;
}

/**
 * The one engine mount, for the layer and the perched bird: the rig's parts,
 * the engine, its size and speed, start and stop on motion and visibility,
 * home on resize, and the pointer (`look`: the layer's parent, or the whole
 * document for a perched bird). Presence gets the engine while it moves.
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
  const { pose, speed = 1, options, setHandle } = use;
  const perched = pose !== undefined;
  // A layer keeps its engine (it snaps home while still); a perched bird has one only while it moves.
  const live = !perched || moves;

  useEffect(() => {
    const p = parts.current;
    const bird = els.bird.current;
    if (!live || !bird || !p.rig || !p.head || !p.tail || !p.wing || !p.legs || !p.jaw || !p.tuft || !p.eye || !p.iris) return;
    const e = new BirdEngine(
      {
        bird,
        rig: p.rig,
        head: p.head,
        tail: p.tail,
        wing: p.wing,
        legs: p.legs,
        jaw: p.jaw,
        tuft: p.tuft,
        eye: p.eye,
        iris: p.iris,
        glyph: p.carry ?? null,
        carry: els.carry?.current ?? null,
        spark: els.spark?.current ?? null,
      },
      () => homeRef.current(),
      size,
      options,
    );
    engine.current = e;
    return () => {
      if (perched) e.release();
      else e.stop();
      engine.current = null;
    };
    // The engine is made once per mount; size, speed, pose and motion are updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    if (pose) engine.current?.setPose(pose);
  }, [pose, live]);

  useEffect(() => {
    engine.current?.setSize(size);
    if (engine.current) engine.current.speed = speed;
  }, [size, speed, live]);

  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (moves) {
      e.start();
      const stopOnHide = (): void => (document.hidden ? e.stop() : e.start());
      document.addEventListener('visibilitychange', stopOnHide);
      return () => {
        document.removeEventListener('visibilitychange', stopOnHide);
        e.stop();
      };
    }
    e.stop();
    e.snapHome();
    const keep = (): void => e.snapHome();
    window.addEventListener('resize', keep);
    return () => window.removeEventListener('resize', keep);
  }, [moves, live]);

  useEffect(() => {
    setHandle(moves ? engine.current : null);
    return () => setHandle(null);
  }, [moves, live, setHandle]);

  // Bower watches the pointer while it is over the layer's parent, or anywhere for a perched bird.
  useEffect(() => {
    const host = look === 'document' ? document : els.frame.current?.parentElement;
    if (!host || !moves) return;
    const onMove = (ev: Event): void => {
      const r = els.frame.current?.getBoundingClientRect();
      if (r && ev instanceof PointerEvent) engine.current?.look({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    };
    host.addEventListener('pointermove', onMove);
    return () => host.removeEventListener('pointermove', onMove);
    // The elements are refs, read when the pointer moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, look]);

  return { onPart, engine, home: homeRef };
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
  const { onPart } = useBirdEngine({ bird: perch, frame: box }, home, drawn, moves, 'document', {
    pose,
    setHandle,
    options: engineOptions,
  });
  return (
    <div
      ref={box}
      className={`bird ${moves ? '' : `posed ${pose} still`} ${className}`}
      style={{ width: size, height: size, ...style, ...(outranked ? { visibility: 'hidden' } : {}) }}
      data-pose={pose}
      data-bird
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
  const { onPart, engine, home: homeRef } = useBirdEngine({ bird, frame: layer, carry, spark }, home, size, moves, 'parent', {
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
  }, [moves]);

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
        className="bird bower-flyer"
        onClick={() => engine.current?.poke()}
      >
        <Rig onPart={onPart} />
      </button>
      <div ref={carry} className={carryNode ? 'bower-carry bower-carry-thing' : 'bower-carry'}>
        {carryNode ?? carryLabel}
      </div>

    </div>
  );
});
