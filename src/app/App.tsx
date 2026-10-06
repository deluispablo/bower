import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { bootDone, bootFail } from './boot';
import { applyTheme, usePrefs } from './prefs';
import { Shell } from './Shell';

/** The demo panel loads only with the demo or the pretend Drive. */
const DemoPanel = lazy(() => import('@/data/demo/DemoPanel').then((m) => ({ default: m.DemoPanel })));
import { useSources } from '@/data/provider';
import { BowerError, type FolderState, type User } from '@/data/types';
import type { Scenario, TimeScale } from '@/data/demo/scenario';
import type { DemoWorld } from '@/data/demo/world';
import type { SourceKind } from '@/data/choose';
import { SignIn } from '@/features/auth/SignIn';
import { Welcome } from '@/features/onboarding/Welcome';
import { Home } from '@/features/home/Home';
import { Add } from '@/features/piles/Add';
import { PileScreen } from '@/features/piles/PileScreen';
import { FolderScreen } from '@/features/files/FolderScreen';
import { NoteScreen } from '@/features/note/NoteScreen';
import { BowerScreen } from '@/features/bower/BowerScreen';
import { Settings } from '@/features/settings/Settings';
import { BirdLab } from '@/bird/BirdLab';
import { NotFound } from './NotFound';
import { OpenElsewhere } from './OpenElsewhere';

import { Privacy, Terms } from '@/features/legal/Legal';

interface Gate {
  user: User | null;
  /** Unknown while the page was blocked from the start (the folder step waits for Use here). */
  folder: FolderState | null;
  /** Bower is active in another tab, window or device: only the block screen shows (TL-P2-13). */
  elsewhere: boolean;
}

/** The demo and fake sources come with their panel (⌘⇧D); the real app has none. */
export interface DemoInfo {
  scenario: Scenario;
  scale: TimeScale;
  source: SourceKind;
  /** The demo's world, for its sample piles; absent on the fake Drive. */
  world?: DemoWorld;
}

export function App({ demo }: { demo?: DemoInfo }) {
  return (
    <BrowserRouter>
      <Gatekeeper />
      {demo && (
        <Suspense fallback={null}>
          <DemoPanel scenario={demo.scenario} scale={demo.scale} source={demo.source} {...(demo.world ? { world: demo.world } : {})} />
        </Suspense>
      )}
    </BrowserRouter>
  );
}

/** Who is here and whether their folder exists decide which screens exist. */
function Gatekeeper() {
  const { session, place } = useSources();
  const [gate, setGate] = useState<Gate | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Use here is under way: only its end shows the app again, once the data was read again. */
  const taking = useRef(false);
  const theme = usePrefs((p) => p.theme);
  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    let live = true;
    let seq = 0;
    const check = async (): Promise<void> => {
      // Only the latest check decides: a slower earlier one never overwrites it.
      const n = ++seq;
      const current = (): boolean => live && n === seq;
      try {
        const user = await session.current();
        // The place starts once someone is signed in, before the folder step; a blocked page reads nothing more.
        if (user && place && (await place.start()) === 'elsewhere') {
          if (current()) setGate((g) => ({ user, folder: g?.user ? g.folder : null, elsewhere: true }));
          return;
        }
        // Use here shows the app itself once it finished; a person signed out meanwhile always reaches sign-in.
        if (user && taking.current) return;
        const folder = user ? await session.folderState() : 'ready';
        if (current()) setGate({ user, folder, elsewhere: false });
      } catch (e) {
        if (!current()) return;
        console.error(e);
        bootFail(e instanceof BowerError && e.code === 'offline' ? 'offline' : 'error', () =>
          setAttempt((a) => a + 1),
        );
      }
    };
    void check();
    const off = session.subscribe(() => void check());
    // Another place took over: the screen shows at once, whatever asking again would answer. A place that
    // starts again (signing out lets it go) waits for the next sign-in, which the session tells.
    const offPlace =
      place?.subscribe(() => {
        if (place.state() === 'elsewhere') setGate((g) => (g?.user && !g.elsewhere ? { ...g, elsewhere: true } : g));
      }) ?? ((): void => undefined);
    // Back from the back/forward cache, the place joins again by itself; if that failed, it sits in
    // 'starting' while someone is signed in, so it is started again here.
    const onShow = (e: PageTransitionEvent): void => {
      if (!e.persisted || !place) return;
      const joined = place.state() === 'starting' ? place.start().then(() => undefined, (err: unknown) => console.error(err)) : Promise.resolve();
      void joined.then(() => check());
    };
    window.addEventListener('pageshow', onShow);
    return () => {
      live = false;
      off();
      offPlace();
      window.removeEventListener('pageshow', onShow);
    };
  }, [session, place, attempt]);

  useEffect(() => {
    if (gate) bootDone();
  }, [gate]);

  /** Use here: the app shows once the place is active and its data was read again; the folder is read only if unknown. */
  const useHere = async (): Promise<void> => {
    if (!place) return;
    taking.current = true;
    try {
      await place.useHere();
      if (place.state() !== 'active') return;
      const folder = gate?.folder ?? (await session.folderState());
      setGate((g) => (g?.user ? { ...g, folder: g.folder ?? folder, elsewhere: place.state() === 'elsewhere' } : g));
    } finally {
      taking.current = false;
    }
  };

  if (!gate) return null;
  if (gate.user && gate.elsewhere && place) return <OpenElsewhere place={place} onUse={useHere} />;
  if (gate.user && gate.folder === null) return null;
  if (!gate.user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<ToSignIn />} />
      </Routes>
    );
  }
  if (gate.folder === 'missing') {
    return (
      <Routes>
        <Route path="/welcome" element={<Welcome missing />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    );
  }
  return <Signed />;
}

function Signed() {
  const loc = useLocation();
  return (
    <Routes location={loc}>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/sign-in" element={<BackFromSignIn />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="add" element={<Add />} />
        <Route path="pile/:id" element={<PileScreen />} />
        <Route path="files/*" element={<FolderScreen />} />
        <Route path="files" element={<FolderScreen />} />
        <Route path="note/*" element={<NoteScreen />} />
        <Route path="bower" element={<BowerScreen />} />
        <Route path="settings" element={<Settings />} />
        <Route path="_bird" element={<BirdLab />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

/** Signed out on a deep link: remember it, so signing in lands there. */
function ToSignIn() {
  const loc = useLocation();
  const from = loc.pathname === '/' ? '' : `?from=${encodeURIComponent(loc.pathname + loc.search)}`;
  return <Navigate to={`/sign-in${from}`} replace />;
}

/** Just signed in: back to where the person was going, if it is a page of this app. */
function BackFromSignIn() {
  const loc = useLocation();
  const from = new URLSearchParams(loc.search).get('from');
  // Only a path of this app: one slash, then no second slash or backslash.
  const printable =
    !!from &&
    [...from].every((c) => c.charCodeAt(0) > 0x20 && c.charCodeAt(0) !== 0x7f && c !== '\\');
  const safe = printable && !!from && from.startsWith('/') && !from.startsWith('//');
  return <Navigate to={safe && from ? from : '/'} replace />;
}
