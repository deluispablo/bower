import { useEffect, useState } from 'react';
import { chooseScenario, SCENARIOS, type Scenario, type TimeScale } from './scenario';
import { SAMPLE_PILES } from './fixture';
import type { DemoWorld } from './world';
import { chooseSource, type SourceKind } from '../choose';
import { forgetPretendDrive } from '../fake/pretend';
import { toast } from '@/ui/toast';
import s from './demo.module.css';

/** Demo only (⌘⇧D): pick a situation, how fast a tidy-up goes, and the demo or the fake Drive. */
export function DemoPanel({
  scenario,
  scale,
  source,
  world,
}: {
  scenario: Scenario;
  scale: TimeScale;
  source: SourceKind;
  world?: DemoWorld;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!open)
    return (
      <button
        type="button"
        className={s.fab}
        onClick={() => setOpen(true)}
        aria-label="Demo situations"
      >
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
        <legend>Behind the screens</legend>
        {(
          [
            ['demo', 'The demo, in memory'],
            ['fake', 'The real logic on a pretend Google Drive'],
          ] as Array<[SourceKind, string]>
        ).map(([k, l]) => (
          <label key={k}>
            <input
              type="radio"
              name="source"
              checked={k === source}
              onChange={() => chooseSource(k)}
            />
            {l}
          </label>
        ))}
      </fieldset>
      {world && (
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
      )}
      {source === 'fake' && (
        <button
          type="button"
          className={s.again}
          onClick={() => {
            forgetPretendDrive();
            location.reload();
          }}
        >
          Start the pretend Drive again
        </button>
      )}
      <fieldset>
        <legend>Situation</legend>
        {(Object.keys(SCENARIOS) as Scenario[]).map((k) => (
          <label key={k}>
            <input
              type="radio"
              name="scenario"
              checked={k === scenario}
              onChange={() => (forgetPretendDrive(), chooseScenario(k, scale))}
            />
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
            <input
              type="radio"
              name="scale"
              checked={k === scale}
              onChange={() => (forgetPretendDrive(), chooseScenario(scenario, k))}
            />
            {l}
          </label>
        ))}
      </fieldset>
    </aside>
  );
}
