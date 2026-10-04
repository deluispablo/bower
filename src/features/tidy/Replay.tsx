import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRun, useSources } from '@/data/provider';
import type { FiledItem } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { crumbs, paraColor } from '@/app/paths';
import { plural } from '@/app/words';
import { nameOf } from '@/data/tree';
import { BowerLayer, type BowerController } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { useIsDesktop } from '@/ui/media';
import { landedSummary } from './run-words';
import s from './replay.module.css';

/**
 * The tidy-up already ran (about 5 minutes on GitHub). This replays it from
 * the run's report in a few seconds: Bower carries each thing to the folder
 * it really went to. Skippable; offered again with "Watch again".
 */
export function Replay() {
  const { replayRunId, startReplay } = useUi();
  const { data: run } = useRun();
  const { runs } = useSources();
  if (!replayRunId || !run || run.id !== replayRunId || !run.report) return null;
  const close = (): void => {
    void runs.markSeen(run.id);
    startReplay(null);
  };
  return createPortal(<ReplayStage items={run.report.filed} summary={landedSummary(run)} updated={run.report.updated.length} onClose={close} />, document.body);
}

function ReplayStage({ items, summary, updated, onClose }: { items: FiledItem[]; summary: string; updated: number; onClose: () => void }) {
  const desktop = useIsDesktop();
  const bird = useRef<BowerController>(null);
  const stage = useRef<HTMLDivElement>(null);
  const shown = items.slice(0, desktop ? 4 : 3);
  const rest = items.length - shown.length;
  const folders = useMemo(() => [...new Set(items.map((i) => i.to))], [items]);
  const [taken, setTaken] = useState<Set<number>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [landing, setLanding] = useState<string | null>(null);
  const [carry, setCarry] = useState('');
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const q = (sel: string): Element | null => stage.current?.querySelector(sel) ?? null;
    const t = setTimeout(() => {
      // Read the controller now: Bower gets its turn on screen a moment after mounting.
      const b = bird.current;
      if (!b) return;
      shown.forEach((it, i) => {
        b.then(() => setCarry(it.title))
          .flyTo(() => b.pointOn(q(`[data-item="${i}"]`), 0.9))
          .peck(() => setTaken((x) => new Set(x).add(i)))
          .holding(true)
          .flyTo(() => b.pointOn(q(`[data-folder="${CSS.escape(it.to)}"]`), 0.8))
          .peck(() => {
            setLanding(it.to);
            setCounts((c) => ({ ...c, [it.to]: (c[it.to] ?? 0) + 1 }));
          })
          .holding(false);
      });
      b.then(() => {
        // The ones not carried one by one land together.
        setCounts(() => {
          const c: Record<string, number> = {};
          items.forEach((it) => (c[it.to] = (c[it.to] ?? 0) + 1));
          return c;
        });
        setTaken(new Set(shown.map((_, i) => i)));
        setLanding(null);
      })
        .flyTo(() => b.pointOn(q('[data-home]'), 0.85))
        .showOff()
        .then(() => setFinished(true));
      if (!b.moving) setFinished(true);
    }, 700);
    return () => clearTimeout(t);
    // Runs once per replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={s.scrim} role="dialog" aria-modal="true" aria-label="What Bower did in the tidy-up">
      <div className={s.stage} ref={stage}>
        <header className={s.head} data-home>
          <div>
            <h2 className={s.title}>{finished ? `${plural(items.length, 'thing')} filed` : 'What Bower did'}</h2>
            <p className="muted">{finished ? `${summary} ${updated ? `${plural(updated, 'note')} brought up to date.` : ''}` : 'The tidy-up already ran. This is where everything went.'}</p>
          </div>
          <Button variant={finished ? 'primary' : 'ghost'} size="sm" onClick={onClose}>
            {finished ? 'Done' : 'Skip'}
          </Button>
        </header>
        <div className={s.cols}>
          <section aria-label="Your inbox">
            <h3 className={s.colTitle}>Inbox</h3>
            <ul className={s.items}>
              {shown.map((it, i) => (
                <li key={i} data-item={i} className={taken.has(i) ? s.gone : ''}>
                  <span className="mono">{it.name}</span>
                  {taken.has(i) && <span className={s.went}>Filed as {it.title}</span>}
                </li>
              ))}
              {rest > 0 && <li className={s.more}>and {plural(rest, 'more thing')}</li>}
            </ul>
          </section>
          <section aria-label="Your folders">
            <h3 className={s.colTitle}>Your folders</h3>
            <ul className={s.folders}>
              {folders.map((f) => (
                <li key={f} data-folder={f} className={landing === f ? s.land : counts[f] ? s.fresh : ''}>
                  <span className={s.dot} style={{ background: paraColor(f) }} />
                  <span className={s.fname}>
                    {nameOf(f)}
                    <span className={s.fpath}>{crumbs(f.slice(0, Math.max(0, f.lastIndexOf('/'))))}</span>
                  </span>
                  {counts[f] ? (
                    <span className={s.count}>
                      <Icon name="add" size={12} stroke={2.6} />
                      {counts[f]}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <BowerLayer ref={bird} size={desktop ? 84 : 64} priority={2} speed={1.9} carryLabel={carry} home={() => {
          const h = stage.current?.querySelector('[data-home]')?.getBoundingClientRect();
          const r = stage.current?.getBoundingClientRect();
          return h && r ? { x: h.right - r.left - (desktop ? 150 : 110), y: h.top - r.top + 4 } : { x: 100, y: 40 };
        }} />
      </div>
    </div>
  );
}
