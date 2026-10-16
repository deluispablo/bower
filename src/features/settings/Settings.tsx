import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSources, useRules, useUser } from '@/data/provider';
import { usePrefs } from '@/app/prefs';
import { plural } from '@/app/words';
import { Button } from '@/ui/Button';
import { Switch } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { toast } from '@/ui/toast';
import { afterOverlaysClosed } from '@/ui/back';
import { Sheet } from '@/ui/Sheet';
import { openDrive, report } from '@/ui/report';
import { useUi } from '@/app/ui-store';
import { Link, useNavigate } from 'react-router';
import s from './settings.module.css';

/** `asLabel`: the whole row is its switch's label, so a tap anywhere on it toggles the switch. */
function Row({ title, sub, asLabel, children }: { title: string; sub?: string; asLabel?: boolean; children: ReactNode }) {
  const Tag = asLabel ? 'label' : 'div';
  return (
    <Tag className={s.row}>
      <div className={s.rowText}>
        <span className={s.rowTitle}>{title}</span>
        {sub && <span className={s.rowSub}>{sub}</span>}
      </div>
      {children}
    </Tag>
  );
}

/** Turning notifications on asks the browser first; a refusal keeps the switch off and says why. */
async function setNotify(on: boolean, save: (on: boolean) => void): Promise<void> {
  if (!on) return save(false);
  if (typeof Notification === 'undefined') {
    toast('This browser cannot show notifications.');
    return save(false);
  }
  if (Notification.permission === 'denied') {
    toast('Notifications are blocked for Bower in this browser. Allow them in its settings.');
    return save(false);
  }
  if (Notification.permission !== 'granted')
    toast('Answer your browser to let Bower tell you when a tidy-up ends.');
  const answer =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (answer === 'default') {
    toast('Nothing changed. Turn it on again to be asked once more.');
    return save(false);
  }
  if (answer !== 'granted') {
    toast('Notifications are blocked for Bower in this browser. Allow them in its settings.');
    return save(false);
  }
  save(true);
  toast('Bower tells you here when a tidy-up ends.');
}

export function Settings() {
  const [askDelete, setAskDelete] = useState(false);
  const [sending, setSending] = useState(0);
  // Read each time Settings shows: the person may have allowed them in the browser meanwhile.
  const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';
  const { data: user } = useUser();
  const prefs = usePrefs();
  const { data: rules } = useRules();
  const { session, vault } = useSources();
  const nav = useNavigate();
  const signOut = (): void => {
    void session.signOut().then(
      () => useUi.getState().forgetPerson(),
      (e: unknown) => report(e, 'Signing out did not finish. Try again.'),
    );
  };
  const askSignOut = (): void => {
    const show = (count: number): void => {
      if (count) setSending(count);
      else signOut();
    };
    const count = vault.pendingUploadCount?.() ?? 0;
    if (typeof count === 'number') show(count);
    else void count.then(show, (e: unknown) => report(e, 'Signing out did not finish. Try again.'));
  };
  const sendingWords = sending === 1
    ? "1 thing you added is still sending from this device. If you sign out now, it stops and you'll need to add it again."
    : `${sending} things you added are still sending from this device. If you sign out now, they stop and you'll need to add them again.`;
  return (
    <div className={s.page}>
      <h1 className={s.title}>Settings</h1>

      <h2 className={s.h2}>Your Bower folder</h2>
      <Row title="Bower" sub="In My Drive">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => openDrive(vault)}
        >
          Open in Drive
        </Button>
      </Row>
      <Row title="Rules" sub={plural(rules?.length ?? 0, 'rule')}>
        <Button size="sm" variant="ghost" onClick={() => nav('/bower')}>
          See them
        </Button>
      </Row>

      <h2 className={s.h2}>Tidying up</h2>
      <Row asLabel title="Look things up on the web" sub="Fill in what a document leaves out, with sources">
        <Switch
          on={prefs.lookUpWeb}
          label="Look things up on the web"
          onChange={(v) => prefs.set({ lookUpWeb: v })}
        />
      </Row>
      <Row
        asLabel
        title="Tell me when a tidy-up ends"
        sub={
          blocked
            ? 'Blocked in this browser. Allow them in its settings to turn this on.'
            : 'A notification on this device'
        }
      >
        <Switch
          on={prefs.notifyRuns}
          label="Tell me when a tidy-up ends"
          onChange={(v) => void setNotify(v, (on) => prefs.set({ notifyRuns: on }))}
        />
      </Row>

      <h2 className={s.h2}>This device</h2>
      <Row title="Appearance">
        <Segmented
          label="Appearance"
          value={prefs.theme}
          onChange={(theme) => prefs.set({ theme })}
          options={[
            { value: 'system', label: 'System' },
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </Row>
      <Row
        asLabel
        title="Bower moves"
        sub="Hops, flies and carries things around the app. Off keeps Bower still."
      >
        <Switch
          on={prefs.birdMoves}
          label="Bower moves"
          onChange={(v) => prefs.set({ birdMoves: v })}
        />
      </Row>

      <h2 className={s.h2}>About Bower</h2>
      <Row title="The Bower website" sub="What Bower is, for people who have not met it yet">
        <a className={s.linkBtn} href="/landing/index.html" target="_blank" rel="noopener">
          Open it
        </a>
      </Row>

      <Row title="Privacy and terms" sub="What Bower keeps and what it never does">
        <span style={{ display: 'flex', gap: 14 }}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </span>
      </Row>

      <h2 className={s.h2}>Account</h2>
      <Row title={user?.name ?? 'Signed in'} sub={user?.email ?? ''}>
        <Button
          size="sm"
          variant="ghost"
          onClick={askSignOut}
        >
          Sign out
        </Button>
      </Row>

      <h2 className={s.h2}>Leaving Bower</h2>
      <Row title="Delete your Bower account"sub="Bower forgets you. Your folder stays in your Drive.">
        <Button size="sm" variant="danger" onClick={() => setAskDelete(true)}>
          Delete
        </Button>
      </Row>
      <Sheet open={sending > 0} onOpenChange={(open) => { if (!open) setSending(0); }} title="Sign out now?">
        <p className="muted">{sendingWords}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setSending(0)}>Keep sending</Button>
          <Button variant="danger" onClick={() => {
            // Let the sheet's history entry close before sign-out changes the route.
            setSending(0);
            void new Promise<void>((resolve) => setTimeout(resolve, 0))
              .then(() => afterOverlaysClosed())
              .then(signOut);
          }}>Sign out</Button>
        </div>
      </Sheet>
      <Sheet open={askDelete} onOpenChange={setAskDelete} title="Delete your Bower account?">
        <p className="muted">
          Bower forgets you: your sign-in, settings and tidy-ups. Your Bower folder and everything
          in it stay in your Drive.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setAskDelete(false)}>
            Keep my account
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              // The sheet closes first (its history entry with it), then the account goes.
              setAskDelete(false);
              void new Promise((r) => setTimeout(r, 0))
                .then(() => afterOverlaysClosed())
                .then(() => session.deleteAccount())
                .then(
                  () => useUi.getState().forgetPerson(),
                  (e: unknown) => report(e, 'Deleting did not finish. Try again.'),
                );
            }}
          >
            Delete my account
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
