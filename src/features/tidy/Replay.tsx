import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRun, useSources } from '@/data/provider';
import type { FiledItem, RunReport } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { crumbs, paraColor } from '@/app/paths';
import { plural } from '@/app/words';
import { nameOf, parentOf } from '@/data/tree';
import { BowerLayer, type BowerController } from '@/bird/Bower';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { useIsDesktop } from '@/ui/media';
import { report } from '@/ui/report';
import { landedSummary, notesUpdated, unfinishedWords } from './run-words';
import { SetAsideRows } from './RunLinks';
import { useBackCloses } from '@/ui/back';
import { returnFocusTo } from '@/ui/focus';
import s from './replay.module.css';

/**
 * The tidy-up already ran (about 5 minutes on GitHub). This replays it from
 * the run's report, the way the landing's court works: the inbox is a messy
 * heap, each folder a shelf, and Bower picks things out of the heap one by
 * one and sets them on their shelf in a neat row. The rest land together at
 * the end. Skippable; "Watch again" from Home.
 */
export function Replay() {
  const { replayRunId, startReplay } = useUi();
  const { data: run } = useRun();
  const { runs } = useSources();
  const showing = !!replayRunId && !!run && run.id === replayRunId && !!run.report;
  useBackCloses(showing, () => {
    if (run) void runs.markSeen(run.id).catch((e: unknown) => report(e, 'That did not work. Try again.'));
    startReplay(null);
  });
  if (!replayRunId || !run || run.id !== replayRunId || !run.report) return null;
  const close = (): void => {
    void runs.markSeen(run.id).catch((e: unknown) => report(e, 'That did not work. Try again.'));
    startReplay(null);
  };
  return createPortal(
    <Court items={run.report.filed} summary={landedSummary(run)} updated={notesUpdated(run.report)} unfinished={unfinishedWords(run.report)} setAside={run.report.setAside} onClose={close} />,
    document.body,
  );
}

/** A small, stable pseudo-random number per index, so the heap looks the same every time. */
const jitter = (i: number, k: number): number => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** A month folder reads better with its parent: "Receipts 2026-10". */
function shelfName(folder: string): string {
  const name = nameOf(folder);
  return /^\d{4}(-\d{2})?$/.test(name) ? `${nameOf(parentOf(folder))} ${name}` : name;
}

function Thing({ item }: { item: FiledItem }) {
  return (
    <span className={s.thing} data-kind={item.kind}>
      <Icon name={item.kind === 'image' ? 'image' : item.kind === 'link' ? 'link' : item.kind === 'note' ? 'note' : 'file'} size={14} />
      <span className={s.thingName}>{item.title}</span>
    </span>
  );
}

function Court({ items, summary, updated, unfinished, setAside, onClose }: {
  items: FiledItem[]; summary: string; updated: number; unfinished: string; setAside: RunReport['setAside']; onClose: () => void;
}) {
  const desktop = useIsDesktop();
  const bird = useRef<BowerController>(null);
  const stage = useRef<HTMLDivElement>(null);
  const carried = items.slice(0, desktop ? 6 : 4);
  const folders = useMemo(() => [...new Set(items.map((i) => i.to))], [items]);
  const [inHeap, setInHeap] = useState<Set<number>>(() => new Set(items.map((_, i) => i)));
  const [onShelf, setOnShelf] = useState<number[]>([]);
  const [holding, setHolding] = useState<number | null>(null);
  const [landing, setLanding] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const q = (sel: string): Element | null => stage.current?.querySelector(sel) ?? null;
    const t = setTimeout(() => {
      // Read the controller now: Bower gets its turn on screen a moment after mounting.
      const b = bird.current;
      if (!b) return;
      carried.forEach((it, i) => {
        b.then(() => {
          setHolding(i);
          q(`[data-heap="${i}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        })
          .flyTo(() => b.pointOn(q(`[data-heap="${i}"]`), 0.5))
          .peck(() =>
            setInHeap((h) => {
              const n = new Set(h);
              n.delete(i);
              return n;
            }),
          )
          .holding(true)
          // On a phone the shelf may be below the fold: bring it into view first.
          .then(() => q(`[data-next="${CSS.escape(it.to)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
          .flyTo(() => b.pointOn(q(`[data-next="${CSS.escape(it.to)}"]`), 0.3))
          .peck(() => {
            setLanding(it.to);
            setOnShelf((x) => [...x, i]);
          })
          .holding(false);
      });
      b.then(() => {
        setInHeap(new Set());
        setOnShelf(items.map((_, i) => i));
        setLanding(null);
      })
        .flyTo(() => b.pointOn(q('[data-perch]'), 0.5))
        .showOff()
        .then(() => setFinished(true));
      if (!b.moving) setFinished(true);
    }, 700);
    return () => clearTimeout(t);
    // Runs once per replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A modal: focus goes in and stays in (Tab cycles inside the replay), and back where it was after.
    const opener = document.activeElement as HTMLElement | null;
    const box = stage.current;
    box?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !box) return;
      const els = [...box.querySelectorAll<HTMLElement>('button:not([disabled]):not([tabindex="-1"]), a[href]')];
      const first = els[0];
      const last = els[els.length - 1];
      if (!first || !last) return;
      if (!box.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      returnFocusTo(opener);
    };
  }, [onClose]);

  const heapLeft = items.length - onShelf.length;
  return (
    <div className={s.scrim} role="dialog" aria-modal="true" aria-label="What Bower did in the tidy-up">
      <div className={s.stage} ref={stage}>
        <header className={s.head}>
          <div aria-live="polite">
            <h2 className={s.title}>{finished ? `${plural(items.length, 'thing')} filed` : 'What Bower did'}</h2>
            <p className="muted">{finished ? [summary, updated ? `${plural(updated, 'note')} brought up to date.` : '', unfinished].filter(Boolean).join(' ') : 'The tidy-up already ran. This is where everything went.'}</p>
          </div>
          <Button variant={finished ? 'primary' : 'ghost'} size="sm" onClick={onClose}>
            {finished ? 'Done' : 'Skip'}
          </Button>
        </header>
        <SetAsideRows rows={setAside} />

        <div className={s.court}>
          {/* Only the filed things: what was set aside or waits is not in this heap, so it is never called the inbox. */}
          <section className={s.heapBox} aria-label="Filed from your inbox">
            <h3 className={s.label}>Filed from your inbox{heapLeft ? `, ${heapLeft} left` : ''}</h3>
            <div className={s.heap} data-perch>
              {items.map((it, i) =>
                inHeap.has(i) ? (
                  <span
                    key={i}
                    data-heap={i}
                    className={s.heaped}
                    style={{
                      left: `${3 + jitter(i, 1) * 60}%`,
                      top: `${6 + jitter(i, 2) * 78}%`,
                      transform: `rotate(${(jitter(i, 3) - 0.5) * 34}deg)`,
                      zIndex: 10 + (items.length - i),
                    }}
                  >
                    <Thing item={it} />
                  </span>
                ) : null,
              )}
              {heapLeft === 0 && <p className={s.emptyHeap}>All filed items reached their folders.</p>}
            </div>
          </section>

          <section className={s.shelves} aria-label="Your folders">
            {folders.map((f) => {
              const here = onShelf.filter((i) => items[i]?.to === f);
              return (
                <div key={f} className={`${s.shelf} ${landing === f ? s.land : ''}`}>
                  <p className={s.shelfName}>
                    <span className={s.dot} style={{ background: paraColor(f) }} />
                    <span className={s.shelfText}>
                      {shelfName(f)}
                      <span className={s.shelfPath}>{crumbs(parentOf(f))}</span>
                    </span>
                  </p>
                  <div className={s.row}>
                    {here.slice(-4).map((i) => {
                      const it = items[i];
                      return it ? (
                        <span key={i} className={s.placed}>
                          <Thing item={it} />
                        </span>
                      ) : null;
                    })}
                    <span className={s.slot} data-next={f} aria-hidden="true" />
                  </div>
                  {here.length > 0 && <span className={s.count}>{here.length}</span>}
                  <span className={s.twig} aria-hidden="true" />
                </div>
              );
            })}
          </section>
        </div>

        <BowerLayer
          ref={bird}
          size={desktop ? 80 : 62}
          priority={2}
          speed={1.7}
          carry={holding !== null && carried[holding] ? <Thing item={carried[holding]} /> : null}
          home={() => {
            const h = stage.current?.querySelector('[data-perch]')?.getBoundingClientRect();
            const r = stage.current?.getBoundingClientRect();
            return h && r ? { x: h.left - r.left + h.width * 0.5, y: h.top - r.top + 2 } : { x: 100, y: 40 };
          }}
        />
      </div>
    </div>
  );
}
