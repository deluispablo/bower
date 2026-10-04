import { useEffect, useState } from 'react';
import { chooseScenario, SCENARIOS, type Scenario, type TimeScale } from './scenario';
import { SAMPLE_PILES } from './fixture';
import type { DemoWorld } from './world';
import { toast } from '@/ui/toast';
import s from './demo.module.css';

/** Demo only (⌘⇧D): pick a situation and how fast a tidy-up goes. */
export function DemoPanel({ scenario, scale, world }: { scenario: Scenario; scale: TimeScale; world: DemoWorld }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!open)
    return (
      <button type="button" className={s.fab} onClick={() => setOpen(true)} aria-label="Demo situations">
        Demo
      </button>
    );
  return (
    <aside className={s.panel} aria-label="Demo situations">
      <div className={s.head}>
        <strong>Demo</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>
      <p className={s.note}>Alex&rsquo;s made-up folder. Nothing here is real.</p>
      <fieldset>
        <legend>Add a sample pile to the inbox</legend>
        <div className={s.samples}>
          {SAMPLE_PILES.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                world.addSample(p);
                toast(`"${p.label}" is in the inbox`);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Situation</legend>
        {(Object.keys(SCENARIOS) as Scenario[]).map((k) => (
          <label key={k}>
            <input type="radio" name="scenario" checked={k === scenario} onChange={() => chooseScenario(k, scale)} />
            {SCENARIOS[k]}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>A tidy-up takes</legend>
        {(
          [
            ['demo', 'About 25 seconds'],
            ['real', 'About 5 minutes, as for real'],
            ['instant', 'No time'],
          ] as Array<[TimeScale, string]>
        ).map(([k, l]) => (
          <label key={k}>
            <input type="radio" name="scale" checked={k === scale} onChange={() => chooseScenario(scenario, k)} />
            {l}
          </label>
        ))}
      </fieldset>
    </aside>
  );
}
