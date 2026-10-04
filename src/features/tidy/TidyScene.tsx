import { useEffect, useRef, useState } from 'react';
import type { RunPhase } from '@/data/types';
import { BowerLayer, PoseBower, type BowerController } from '@/bird/Bower';
import { Icon } from '@/ui/Icon';
import { PHASE_POSE } from './run-words';
import s from './scene.module.css';

const SIZE = 72;
/** How far ahead of its feet Bower's beak reaches when it pecks or writes. */
const REACH = 38;
const GROUND = 22;
const START = 5;
type Spot = 'inbox' | 'read' | 'note' | 'folder' | 'mid';

/**
 * What Bower is doing while a tidy-up runs, acted out on the ground of a
 * little stage. The run only reports its phase, so the scene shows the kind
 * of work, never invented progress:
 * - reading: takes a paper from the inbox pile, studies it, sets it on the
 *   "read" pile;
 * - writing: stands at a note and writes it with its beak, line by line;
 * - putting away: carries papers from the read pile into the folder.
 * Bower always stands on the ground and hops between places.
 */
export function TidyScene({
  phase,
  scope = 'all',
  filed: total,
}: {
  phase: RunPhase;
  /** A read of your changes files nothing: only the note is on the stage. */
  scope?: 'all' | 'instructions';
  /** How many things the run filed, once it is done. */
  filed?: number;
}) {
  const changes = scope === 'instructions';
  const stage = useRef<HTMLDivElement>(null);
  const bird = useRef<BowerController>(null);
  const [inbox, setInbox] = useState(START);
  const [read, setRead] = useState(1);
  const [lines, setLines] = useState(0);
  const [filed, setFiled] = useState(0);
  const [bump, setBump] = useState(0);
  const [moving, setMoving] = useState(true);

  useEffect(() => {
    let live = true;
    /** A spot's left edge on the ground line, in stage pixels. */
    const spot = (name: Spot): { x: number; y: number } => {
      const st = stage.current;
      const y = (st?.clientHeight ?? 150) - GROUND;
      const el = st?.querySelector(`[data-spot="${name}"]`);
      if (!st || !el) return { x: 120, y };
      return { x: el.getBoundingClientRect().left - st.getBoundingClientRect().left, y };
    };
    /** Where Bower stands to reach a spot with its beak, facing right. */
    const standAt = (name: Exclude<Spot, 'mid'>) => () => {
      const p = spot(name);
      return { x: p.x + (name === 'note' ? 0 : 12) - REACH, y: p.y };
    };
    const run = async (): Promise<void> => {
      await new Promise((r) => setTimeout(r, 150));
      // A stopped run has nothing to act out: Bower stands still, startled (rendered below).
      if (phase === 'failed' || !live) return;
      const b = bird.current;
      if (!b) return;
      if (!b.moving) {
        setMoving(false);
        return;
      }
      setMoving(true);
      // A new phase: drop the rest of the last phase's errand.
      b.interrupt();
      if (phase === 'done') {
        b.hopTo(() => spot('mid'))
          .face(1)
          .showOff();
        return;
      }
      while (live) {
        if (changes) {
          // Reading your changes: Bower studies, then writes; nothing is carried anywhere.
          if (phase === 'writing' || phase === 'saving')
            b.hopTo(standAt('note'))
              .face(1)
              .scribble(2.4, () => setLines((n) => (n >= 6 ? 1 : n + 1)), 0.4)
              .wait(0.5);
          else b.hopTo(standAt('note')).face(1).study(1.6).wait(0.4);
          await Promise.all([b.settled(), new Promise((r) => setTimeout(r, 120))]);
          continue;
        }
        if (phase === 'queued') b.hopTo(standAt('inbox')).face(1).wait(1.6);
        if (phase === 'reading')
          b.hopTo(standAt('inbox'))
            .face(1)
            .peck(() => setInbox((n) => (n <= 1 ? START : n - 1)))
            .holding(true)
            .study(1.2)
            .hopTo(standAt('read'))
            .face(1)
            .peck(() => setRead((n) => (n >= 6 ? 1 : n + 1)))
            .holding(false);
        if (phase === 'writing')
          b.hopTo(standAt('note'))
            .face(1)
            .scribble(2.4, () => setLines((n) => (n >= 6 ? 1 : n + 1)), 0.4)
            .wait(0.5);
        if (phase === 'saving')
          b.hopTo(standAt('read'))
            .face(1)
            .peck(() => setRead((n) => (n <= 1 ? 5 : n - 1)))
            .holding(true)
            .hopTo(standAt('folder'))
            .face(1)
            .peck(() => {
              setFiled((n) => n + 1);
              setBump((n) => n + 1);
            })
            .holding(false);
        // Never spin: even if nothing was queued, wait a beat before the next errand.
        await Promise.all([b.settled(), new Promise((r) => setTimeout(r, 120))]);
      }
    };
    void run();
    return () => {
      live = false;
    };
  }, [phase, changes]);

  /** Bower's resting place: the ground by the inbox pile. Actions move it from there. */
  const home = (): { x: number; y: number; perch?: boolean } => {
    const st = stage.current;
    const y = (st?.clientHeight ?? 150) - GROUND;
    const el = st?.querySelector(changes ? '[data-spot="note"]' : '[data-spot="inbox"]');
    if (!st || !el) return { x: 80, y };
    return {
      x: el.getBoundingClientRect().left - st.getBoundingClientRect().left + 12 - REACH,
      y,
      perch: true,
    };
  };

  // Done: the scene agrees with the result, whatever the errands had reached
  // (an interrupted errand may still finish a peck after this).
  const done = phase === 'done';
  const inboxShown = done ? 0 : inbox;
  const readShown = done ? 0 : read;
  const filedShown = done && total !== undefined ? total : filed;

  return (
    <div className={s.stage} ref={stage} aria-hidden="true">
      <div className={s.ground} />
      {!changes && (
        <div
          className={s.stack}
          data-spot="inbox"
          data-sheets={inboxShown}
          data-dim={phase === 'writing'}
        >
          {Array.from({ length: inboxShown }, (_, i) => (
            <span
              key={i}
              className={s.sheet}
              style={{ bottom: i * 5, transform: `translateX(${[0, 2, -2, 3, -1, 1][i] ?? 0}px)` }}
            />
          ))}
          <span className={s.tag}>Inbox</span>
        </div>
      )}
      {!changes && (
        <div
          className={s.stack}
          data-spot="read"
          data-sheets={readShown}
          data-dim={phase === 'writing'}
        >
          {Array.from({ length: readShown }, (_, i) => (
            <span key={i} className={`${s.sheet} ${s.readSheet}`} style={{ bottom: i * 5 }} />
          ))}
        </div>
      )}
      <div className={s.note} data-spot="note" data-dim={phase !== 'writing'}>
        {Array.from({ length: 6 }, (_, i) => (
          <i
            key={i}
            className={i < lines ? s.written : ''}
            style={{ width: `${[86, 70, 92, 60, 80, 50][i]}%` }}
          />
        ))}
      </div>
      {!changes && (
        <div
          className={s.folder}
          data-spot="folder"
          data-filed={filedShown}
          data-dim={phase !== 'saving' && phase !== 'done'}
          key={bump}
        >
          <Icon name="folder" size={52} stroke={1.5} />
          {filedShown > 0 && <span className={s.filed}>{filedShown}</span>}
        </div>
      )}
      <span className={s.mid} data-spot="mid" />
      {moving && phase !== 'failed' ? (
        <BowerLayer
          ref={bird}
          size={SIZE}
          priority={1}
          home={home}
          carry={<span className={s.held} />}
        />
      ) : (
        <div className={s.still}>
          <PoseBower pose={PHASE_POSE[phase]} size={96} priority={1} />
        </div>
      )}
    </div>
  );
}
