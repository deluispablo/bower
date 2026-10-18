import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSources } from '@/data/provider';
import { BowerError } from '@/data/types';
import { Button } from '@/ui/Button';
import { toHeading } from '@/ui/focus';
import { SetupScene } from './SetupScene';
import s from './welcome.module.css';

type View = 'checking' | 'unread' | 'ask' | 'creating' | 'found';
type Fail = { kind: 'look' | 'make' | 'out'; message: string };
type Target = 'title' | 'retry' | 'consent';

const MADE = 'Your Bower folder could not be made. Try again.';
const OPENED = 'Your Bower folder could not be opened. Try again.';
const OUT = 'Bower could not sign you out. Try again.';

/**
 * First sign-in: Bower says what it will make and makes it only when asked. Reading the folder never makes it;
 * a press makes it (`Session.createFolder` also finds an old folder again). Reading, making and signing out each
 * retry on their own, one action at a time.
 */
export function Welcome() {
  const { session } = useSources();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const legacy = useRef(params.has('step'));
  const [view, setView] = useState<View>('checking');
  const [fail, setFail] = useState<Fail | null>(null);
  const [leaving, setLeaving] = useState(false);
  const errorId = useId();
  /** An action is under way: checked at once, before React shows it, so a second press does nothing. */
  const busy = useRef(false);
  const started = useRef(false);

  // Keyboard targets, applied after the change shows, and only while focus is still on what was pressed or
  // what this moved it to (or has fallen away): focus the person placed elsewhere stays there.
  const title = useRef<HTMLHeadingElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const consent = useRef<HTMLButtonElement>(null);
  const mine = useRef<Element | null>(null);
  const want = useRef<Target | null>(null);
  useEffect(() => {
    const to = want.current;
    if (!to) return;
    want.current = null;
    const el = { title: title.current, retry: retry.current, consent: consent.current }[to];
    const at = document.activeElement;
    if (!el || (at && at !== document.body && at.isConnected && at !== mine.current)) return;
    mine.current = el;
    if (to === 'title') toHeading(el);
    else el.focus({ preventScroll: true });
  });
  const act = (e: MouseEvent<HTMLButtonElement>, then: () => void): void => {
    if (busy.current) return;
    mine.current = e.currentTarget;
    then();
  };

  /** Reads only. `again`: the person asked again, so the keyboard follows the answer. */
  const look = useCallback((again: boolean) => {
    busy.current = true;
    setFail(null);
    setView('checking');
    void session
      .folderState()
      .then((st) => {
        if (st === 'ready' && legacy.current) {
          nav('/', { replace: true });
          return;
        }
        if (again) want.current = st === 'ready' ? 'title' : 'consent';
        setView(st === 'ready' ? 'found' : 'ask');
      })
      .catch((e: unknown) => {
        console.error(e);
        if (again) want.current = 'retry';
        setFail({ kind: 'look', message: e instanceof BowerError ? e.message : OPENED });
        setView('unread');
      })
      .finally(() => {
        busy.current = false;
      });
  }, [session, nav]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    look(false);
  }, [look]);

  const make = (): void => {
    busy.current = true;
    // Making again after a failure: the retry button leaves, so the keyboard goes to the heading.
    if (fail) want.current = 'title';
    setFail(null);
    setView('creating');
    void session
      .createFolder(() => undefined)
      .then(({ found }) => {
        if (!found) {
          nav('/', { replace: true });
          return;
        }
        want.current = 'title';
        setView('found');
      })
      .catch((e: unknown) => {
        console.error(e);
        want.current = 'retry';
        setFail({ kind: 'make', message: MADE });
        setView('ask');
      })
      .finally(() => {
        busy.current = false;
      });
  };

  const leave = (): void => {
    busy.current = true;
    if (fail) want.current = 'title';
    setFail(null);
    setLeaving(true);
    void session
      .signOut()
      .then(() => nav('/sign-in', { replace: true }))
      .catch((e: unknown) => {
        console.error(e);
        want.current = 'retry';
        setFail({ kind: 'out', message: OUT });
        setLeaving(false);
        busy.current = false;
      });
  };

  const blocked = leaving || fail?.kind === 'out';
  const again = fail?.kind === 'look' ? () => look(true) : fail?.kind === 'make' ? make : leave;
  const heading = { checking: 'Checking your Drive', unread: 'Where Bower keeps things', ask: 'Where Bower keeps things', creating: 'Where Bower keeps things', found: 'Welcome back' }[view];

  return (
    <main className={s.page}>
      <SetupScene pose={view === 'creating' ? 'carry' : view === 'found' ? 'proud' : 'idle'} />
      <h1 ref={title} className={s.title}>{heading}</h1>
      {(view === 'ask' || view === 'creating') && (
        <p className={s.text}>
          Bower makes one new folder called Bower in My Drive. Everything it files goes in there, and you can open it in Drive any time. Nothing outside it moves.
        </p>
      )}
      {view === 'found' && <p className={s.text}>Your Bower folder is still in My Drive, with everything in it.</p>}
      {fail && (
        <div role="alert" className={s.error}>
          <p id={errorId}>{fail.message}</p>
          <Button ref={retry} variant="ghost" aria-describedby={errorId} onClick={(e) => act(e, again)}>Try again</Button>
        </div>
      )}
      <div className={s.foot}>
        {view === 'found' && <Button ref={consent} block onClick={(e) => act(e, () => nav('/', { replace: true }))}>Open Bower</Button>}
        {(view === 'ask' || view === 'creating') && fail?.kind !== 'make' && (
          <Button ref={consent} block disabled={view === 'creating' || blocked} onClick={(e) => act(e, make)}>
            {view === 'creating' ? 'Making it…' : 'Make my Bower folder'}
          </Button>
        )}
        {view !== 'found' && (
          <Button variant="ghost" block disabled={view === 'checking' || view === 'creating' || blocked} onClick={(e) => act(e, leave)}>
            Not now, sign out
          </Button>
        )}
      </div>
    </main>
  );
}
