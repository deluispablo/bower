import { forwardRef, useCallback, type ReactNode, useEffect, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { prefersReducedMotion, usePrefs } from '@/app/prefs';
import { BirdEngine, type Point, type TargetFn } from './engine';
import { useBirdTurn } from './presence';
import { Rig, type RigPart } from './Rig';
import './poses.css';
import './bower.css';

export type Pose = 'idle' | 'wait' | 'read' | 'write' | 'carry' | 'proud' | 'sleep' | 'alarm' | 'land';

/** Whether this Bower may move: its turn on screen, the setting, the system. */
function useMoves(priority: number): boolean {
  const turn = useBirdTurn(priority);
  const birdMoves = usePrefs((p) => p.birdMoves);
  return turn && birdMoves && !prefersReducedMotion();
}

interface PoseProps {
  pose: Pose;
  size: number;
  /** Overlays outrank the page, so the bird in a sheet is the one that moves. */
  priority?: number;
  className?: string;
  style?: CSSProperties;
}

/** Bower in one place, looping a pose with CSS only. */
export function PoseBower({ pose, size, priority = 0, className = '', style }: PoseProps) {
  const moves = useMoves(priority);
  return (
    <div
      className={`bird posed ${pose} ${moves ? '' : 'still'} ${className}`}
      style={{ width: size, height: size, ...style }}
      data-pose={pose}
    >
      <Rig carrying={pose === 'carry'} />
    </div>
  );
}

export interface BowerController {
  flyTo(get: TargetFn): BowerController;
  hopTo(get: TargetFn): BowerController;
  peck(onBite?: () => void): BowerController;
  holding(on: boolean): BowerController;
  showOff(): BowerController;
  then(fn: () => void): BowerController;
  wait(seconds: number): BowerController;
  settled(): Promise<void>;
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
}

/**
 * A layer, the size of its positioned parent, in which Bower can fly. The
 * parent decides where home is; a caller drives flights through the ref.
 * When Bower may not move, it sits at home and actions finish at once.
 */
export const BowerLayer = forwardRef<BowerController, LayerProps>(function BowerLayer(
  { home, size = 72, priority = 0, carryLabel = '', carry: carryNode, speed = 1 },
  ref,
) {
  const layer = useRef<HTMLDivElement>(null);
  const bird = useRef<HTMLButtonElement>(null);
  const carry = useRef<HTMLDivElement>(null);
  const spark = useRef<HTMLDivElement>(null);
  const parts = useRef<Partial<Record<RigPart, SVGGElement | null>>>({});
  const onPart = useCallback((part: RigPart, el: SVGGElement | null) => {
    parts.current[part] = el;
  }, []);
  const engine = useRef<BirdEngine | null>(null);
  const homeRef = useRef(home);
  useLayoutEffect(() => {
    homeRef.current = home;
  });
  const moves = useMoves(priority);

  useEffect(() => {
    const p = parts.current;
    if (!bird.current || !p.rig || !p.head || !p.tail || !p.wing || !p.legs || !p.jaw || !p.tuft || !p.eye || !p.iris) return;
    const e = new BirdEngine(
      {
        bird: bird.current,
        rig: p.rig,
        head: p.head,
        tail: p.tail,
        wing: p.wing,
        legs: p.legs,
        jaw: p.jaw,
        tuft: p.tuft,
        eye: p.eye,
        iris: p.iris,
        carry: carry.current,
        spark: spark.current,
      },
      () => homeRef.current(),
      size,
    );
    engine.current = e;
    return () => {
      e.stop();
      engine.current = null;
    };
    // The engine is made once; size and motion are updated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engine.current?.setSize(size);
    if (engine.current) engine.current.speed = speed;
  }, [size, speed]);

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
  }, [moves]);

  // Bower watches the pointer while it is over the layer's parent.
  useEffect(() => {
    const host = layer.current?.parentElement;
    if (!host || !moves) return;
    const onMove = (ev: PointerEvent): void => {
      const r = layer.current?.getBoundingClientRect();
      if (r) engine.current?.look({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    };
    host.addEventListener('pointermove', onMove);
    return () => host.removeEventListener('pointermove', onMove);
  }, [moves]);

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
      then: (fn) => {
        if (still) fn();
        else engine.current?.then(fn);
        return ctl;
      },
      wait: (s) => (still ? ctl : (engine.current?.wait(s), ctl)),
      settled: () => engine.current?.settled() ?? Promise.resolve(),
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
    <div ref={layer} className="bower-layer" aria-hidden="true">
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
