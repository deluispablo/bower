import type { ReactNode } from 'react';
import { useSources, useRules } from '@/data/provider';
import { usePrefs, type Theme } from '@/app/prefs';
import { Button } from '@/ui/Button';
import { toast } from '@/ui/toast';
import { useNavigate } from 'react-router';
import s from './settings.module.css';

function Row({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className={s.row}>
      <div className={s.rowText}>
        <span className={s.rowTitle}>{title}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={s.toggle} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** Turning notifications on asks the browser first; a refusal keeps the switch off and says why. */
async function setNotify(on: boolean, save: (on: boolean) => void): Promise<void> {
  if (!on) return save(false);
  if (typeof Notification === 'undefined') {
    toast('This browser cannot show notifications.');
    return save(false);
  }
  const answer = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (answer !== 'granted') {
    toast('Notifications are blocked for Bower in this browser. Allow them in its settings.');
    return save(false);
  }
  save(true);
  toast('Bower tells you here when a tidy-up ends.');
}

export function Settings() {
  const prefs = usePrefs();
  const { data: rules } = useRules();
  const { session } = useSources();
  const nav = useNavigate();
  return (
    <div className={s.page}>
      <h1 className={s.title}>Settings</h1>

      <h2 className={s.h2}>Your Bower folder</h2>
      <Row title="Bower" sub="In My Drive">
        <Button size="sm" variant="ghost" onClick={() => toast('Your Bower folder opens in Google Drive.')}>
          Open in Drive
        </Button>
      </Row>
      <Row title="Rules" sub={`${rules?.length ?? 0} rules`}>
        <Button size="sm" variant="ghost" onClick={() => nav('/bower')}>
          See them
        </Button>
      </Row>

      <h2 className={s.h2}>Tidying up</h2>
      <Row title="Look things up on the web" sub="Fill in what a document leaves out, with sources">
        <Toggle on={prefs.lookUpWeb} label="Look things up on the web" onChange={(v) => prefs.set({ lookUpWeb: v })} />
      </Row>
      <Row title="Tell me when a tidy-up ends" sub="A notification on this device">
        <Toggle on={prefs.notifyRuns} label="Tell me when a tidy-up ends" onChange={(v) => void setNotify(v, (on) => prefs.set({ notifyRuns: on }))} />
      </Row>

      <h2 className={s.h2}>This device</h2>
      <Row title="Appearance">
        <div className={s.seg} role="radiogroup" aria-label="Appearance">
          {(
            [
              ['system', 'System'],
              ['dark', 'Dark'],
              ['light', 'Light'],
            ] as Array<[Theme, string]>
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={prefs.theme === v} onClick={() => prefs.set({ theme: v })}>
              {l}
            </button>
          ))}
        </div>
      </Row>
      <Row title="Bower moves" sub="Hops, flies and carries things around the app. Off keeps Bower still.">
        <Toggle on={prefs.birdMoves} label="Bower moves" onChange={(v) => prefs.set({ birdMoves: v })} />
      </Row>

      <h2 className={s.h2}>About Bower</h2>
      <Row title="The Bower website" sub="What Bower is, for people who have not met it yet">
        <a className={s.linkBtn} href="/landing/index.html" target="_blank" rel="noopener">
          Open it
        </a>
      </Row>

      <h2 className={s.h2}>Account</h2>
      <Row title="Alex" sub="you@example.com">
        <Button size="sm" variant="ghost" onClick={() => void session.signOut()}>
          Sign out
        </Button>
      </Row>
      <Row title="Delete the app" sub="Bower forgets you. Your folder stays in your Drive.">
        <Button size="sm" variant="danger" onClick={() => toast('In the demo nothing is deleted.')}>
          Delete
        </Button>
      </Row>
    </div>
  );
}
