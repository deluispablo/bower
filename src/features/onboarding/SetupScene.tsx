import { useEffect, useRef, useState } from 'react';
import { BowerLayer, PoseBower, type BowerController } from '@/bird/Bower';
import s from './welcome.module.css';

const SIZE = 72;
/** How far ahead of its feet Bower's beak reaches when it picks up or sets down a twig. */
const REACH = 38;
const GROUND = 22;
const TWIGS = 5;

/**
 * Setup's little stage: a pile of twigs and a bower. While the folder is being made ('carry'), Bower carries
 * twigs from the pile to the bower, again and again: it shows activity, never progress. Otherwise it waits by the
 * pile. With "Bower moves" off or reduced motion, the same scene holds still.
 */
export function SetupScene({ pose }: { pose: 'idle' | 'carry' | 'proud' }) {
  const working = pose === 'carry';
  const stage = useRef<HTMLDivElement>(null);
  const bird = useRef<BowerController>(null);
  const [built, setBuilt] = useState(2);
  const [moving, setMoving] = useState(true);

  useEffect(() => {
    let live = true;
    /** A spot's left edge on the ground line, in stage pixels. */
    const spot = (name: 'twigs' | 'bower'): { x: number; y: number } => {
      const st = stage.current;
      const y = (st?.clientHeight ?? 150) - GROUND;
      const el = st?.querySelector(`[data-spot="${name}"]`);
      if (!st || !el) return { x: 120, y };
      return { x: el.getBoundingClientRect().left - st.getBoundingClientRect().left, y };
    };
    const standAt = (name: 'twigs' | 'bower') => () => {
      const p = spot(name);
      return { x: p.x + 12 - REACH, y: p.y };
    };
    const run = async (): Promise<void> => {
      // The layer's controller is there by now: a child's ref is set before its parent's effect runs.
      const b = bird.current;
      if (!live || !b) return;
      if (!b.moving) {
        setMoving(false);
        return;
      }
      b.interrupt();
      while (live && working) {
        b.hopTo(standAt('twigs'))
          .face(1)
          .peck()
          .holding(true)
          .hopTo(standAt('bower'))
          .face(1)
          .peck(() => setBuilt((n) => (n >= TWIGS ? 1 : n + 1)))
          .holding(false)
          .wait(0.3);
        await b.settled();
        // Never spin, even if the errand ended at once: hand the thread back before the next one.
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [working]);

  /** Bower's resting place: on the ground by the pile of twigs. */
  const home = (): { x: number; y: number; perch?: boolean } => {
    const st = stage.current;
    const y = (st?.clientHeight ?? 150) - GROUND;
    const el = st?.querySelector('[data-spot="twigs"]');
    if (!st || !el) return { x: 80, y };
    return { x: el.getBoundingClientRect().left - st.getBoundingClientRect().left + 12 - REACH, y, perch: true };
  };

  return (
    <div className={s.stage} ref={stage} aria-hidden="true">
      <div className={s.ground} />
      <div className={s.twigs} data-spot="twigs">
        {Array.from({ length: TWIGS }, (_, i) => (
          <i key={i} style={{ bottom: i * 4, transform: `rotate(${[-4, 3, -2, 5, -3][i] ?? 0}deg)` }} />
        ))}
      </div>
      <div className={s.arch} data-spot="bower" data-built={built}>
        {Array.from({ length: TWIGS }, (_, i) => (
          <i key={i} className={i < built ? s.laid : ''} style={{ left: `${i * 18}%` }} />
        ))}
      </div>
      {moving ? (
        <BowerLayer ref={bird} size={SIZE} priority={1} home={home} carry={<span className={s.held} />} />
      ) : (
        <div className={s.still}>
          <PoseBower pose={pose} size={96} priority={1} />
        </div>
      )}
    </div>
  );
}
