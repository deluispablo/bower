import { useEffect, useRef, useState } from 'react';
import type { RunPhase } from '@/data/types';
import { BowerLayer, PoseBower, type BowerController } from '@/bird/Bower';
import { Icon } from '@/ui/Icon';
import { PHASE_POSE } from './run-words';
import s from './scene.module.css';

const CARDS = ['#f3f6fa', '#f0b64f', '#93c5fd', '#f3f6fa', '#5fcfbc', '#c4b5fd'];

/**
 * What Bower is doing while a tidy-up runs, acted out on a little stage: the
 * inbox pile, a note being written, the folder. The run only tells us its
 * phase, so the scene shows the kind of work, never invented progress:
 * reading pecks a card up and looks at it; writing scribbles on the note;
 * putting away carries cards from the pile to the folder.
 */
export function TidyScene({ phase }: { phase: RunPhase }) {
  const stage = useRef<HTMLDivElement>(null);
  const bird = useRef<BowerController>(null);
  const [pile, setPile] = useState(CARDS.length);
  const [filed, setFiled] = useState(0);
  const [lifted, setLifted] = useState(false);
  const [lines, setLines] = useState(1);
  const [bump, setBump] = useState(0);
  const [moving, setMoving] = useState(true);

  useEffect(() => {
    let live = true;
    const q = (sel: string): Element | null => stage.current?.querySelector(sel) ?? null;
    const run = async (): Promise<void> => {
      await new Promise((r) => setTimeout(r, 400));
      const b = bird.current;
      if (!b || !live) return;
      if (!b.moving) {
        setMoving(false);
        return;
      }
      setMoving(true);
      const at = (sel: string, along: number) => () => b.pointOn(q(sel), along);
      if (phase === 'done') {
        b.flyTo(at('[data-spot="mid"]', 0.5)).showOff();
        return;
      }
      while (live) {
        if (phase === 'queued') b.wait(2);
        if (phase === 'reading')
          b.flyTo(at('[data-spot="pile"]', 0.5))
            .peck(() => setLifted(true))
            .holding(true)
            .wait(1.1)
            .peck(() => setLifted(false))
            .holding(false)
            .wait(0.2);
        if (phase === 'writing')
          b.hopTo(at('[data-spot="paper"]', 0.2))
            .peck(() => setLines((n) => (n >= 5 ? 1 : n + 1)))
            .wait(0.25)
            .peck(() => setLines((n) => (n >= 5 ? 1 : n + 1)))
            .wait(0.5);
        if (phase === 'saving')
          b.flyTo(at('[data-spot="pile"]', 0.5))
            .peck(() => setPile((n) => (n <= 1 ? CARDS.length : n - 1)))
            .holding(true)
            .flyTo(at('[data-spot="folder"]', 0.45))
            .peck(() => {
              setFiled((n) => n + 1);
              setBump((n) => n + 1);
            })
            .holding(false);
        await b.settled();
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [phase]);

  const homeFor = (): { x: number; y: number } => {
    const spot = phase === 'writing' ? 'paper' : phase === 'saving' ? 'folder' : phase === 'done' ? 'mid' : 'pile';
    const el = stage.current?.querySelector(`[data-spot="${spot}"]`)?.getBoundingClientRect();
    const r = stage.current?.getBoundingClientRect();
    if (!el || !r) return { x: 140, y: 110 };
    return { x: el.left - r.left + el.width * (spot === 'pile' ? 1.15 : 0.5), y: el.top - r.top + (spot === 'pile' ? el.height : 2) };
  };


  return (
    <div className={s.stage} ref={stage} aria-hidden="true">
      <div className={s.ground} />
      <div className={s.pile} data-spot="pile" data-show={phase !== 'done'}>
        {CARDS.slice(0, pile).map((c, i) => (
          <span key={i} className={s.card} style={{ background: c, transform: `translateY(${-i * 5}px) rotate(${[-5, 4, -2, 6, -3, 2][i]}deg)`, opacity: lifted && i === pile - 1 ? 0 : 1 }} />
        ))}
      </div>
      <div className={s.paper} data-spot="paper" data-show={phase === 'writing'}>
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} style={{ transform: `scaleX(${i < lines ? 1 : 0})`, width: `${[100, 80, 92, 60, 75][i]}%` }} />
        ))}
      </div>
      <div className={s.folder} data-spot="folder" data-show={phase === 'saving' || phase === 'done'} key={bump}>
        <Icon name="folder" size={56} stroke={1.5} />
        {filed > 0 && <span className={s.filed}>{filed}</span>}
      </div>
      <span className={s.mid} data-spot="mid" />
      {moving ? (
        <BowerLayer ref={bird} size={84} priority={1} home={homeFor} carry={<span className={s.held} />} />
      ) : (
        <div className={s.still}>
          <PoseBower pose={PHASE_POSE[phase]} size={100} priority={1} />
        </div>
      )}
    </div>
  );
}
