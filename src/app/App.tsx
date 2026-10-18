import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { bootDone, bootFail } from './boot';
import { applyTheme, usePrefs } from './prefs';
import { Shell } from './Shell';
import { focusRouteHeading } from '@/ui/focus';

/** The demo panel loads only with the demo or the pretend Drive. */
const DemoPanel = lazy(() => import('@/data/demo/DemoPanel').then((m) => ({ default: m.DemoPanel })));
/** BirdLab preview screen loads only in development builds. */
const BirdLab = import.meta.env.DEV ? lazy(() => import('@/bird/BirdLab').then((m) => ({ default: m.BirdLab }))) : null;
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
      <RouteFocus />
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
  const loc = useLocation();
  const navigate = useNavigate();
  const [gate, setGate] = useState<Gate | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [discardedFrom, setDiscardedFrom] = useState<string | null>(null);
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
    return () => {
      live = false;
      off();
      offPlace();
    };
  }, [session, place, attempt]);

  useEffect(() => {
    if (gate) bootDone();
  }, [gate]);

  // Discard before painting Use here, so an immediate takeover cannot revive the query.
  useLayoutEffect(() => {
    if (!gate?.user) return;
    if (gate.elsewhere || gate.folder === 'missing') {
      keepDestination(null);
      const params = new URLSearchParams(loc.search);
      if (params.has('from')) {
        params.delete('from');
        navigate({ pathname: loc.pathname, search: params.toString(), hash: loc.hash }, { replace: true });
      }
    } else if (loc.pathname !== '/' && loc.pathname !== '/sign-in') keepDestination(null);
  }, [gate, loc.pathname, loc.search, loc.hash, loc.key, navigate]);

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

  // Remember the blocked entry before its URL replacement commits.
  if (gate?.user && (gate.elsewhere || gate.folder === 'missing') &&
      new URLSearchParams(loc.search).has('from') && discardedFrom !== loc.key) {
    setDiscardedFrom(loc.key);
  }
  if (!gate) return null;
  if (gate.user && gate.elsewhere && place) return <OpenElsewhere place={place} onUse={useHere} />;
  if (gate.user && gate.folder === null) return null;
  if (!gate.user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignInWithReturn />} />
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
  return <Signed discardedFrom={discardedFrom} />;
}

/** One rule for every route change, including views outside Shell (sign-in, legal). */
function RouteFocus() {
  const { pathname } = useLocation();
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    return focusRouteHeading();
  }, [pathname]);
  return null;
}

function Signed({ discardedFrom }: { discardedFrom: string | null }) {
  const loc = useLocation();
  return (
    <Routes location={loc}>
      <Route path="/welcome" element={<Welcome />} />
      <Route path="/sign-in" element={<BackFromSignIn discard={discardedFrom === loc.key} />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route element={<Shell />}>
        <Route index element={<BackFromSignIn home discard={discardedFrom === loc.key} />} />
        <Route path="add" element={<Add />} />
        <Route path="pile/:id" element={<PileScreen />} />
        <Route path="files/*" element={<FolderScreen />} />
        <Route path="files" element={<FolderScreen />} />
        <Route path="note/*" element={<NoteScreen />} />
        <Route path="bower" element={<BowerScreen />} />
        <Route path="settings" element={<Settings />} />
        {BirdLab && <Route path="_bird" element={<Suspense fallback={null}><BirdLab /></Suspense>} />}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

const DESTINATION_KEY = 'bower:sign-in-from';

/** Signed-out-only pages: returning there after sign-in would leave the person nowhere. */
const SIGNED_OUT_ONLY = /^\/(sign-in\/?|landing(\/[^?]*)?)(\?|$)/;

/** One validator for query and stored paths; preserve their encoding, omit fragments. */
function destination(from: string | null): string | null {
  const printable = !!from && [...from].every((c) => c.charCodeAt(0) > 0x20 && c.charCodeAt(0) !== 0x7f && c !== '\\');
  const path = printable && from.startsWith('/') && !from.startsWith('//') ? from.split('#')[0] ?? null : null;
  return path && !SIGNED_OUT_ONLY.test(path) ? path : null;
}

function keepDestination(from: string | null): void {
  try {
    if (from) sessionStorage.setItem(DESTINATION_KEY, from);
    else sessionStorage.removeItem(DESTINATION_KEY);
  } catch (e) { console.error(e); }
}

function savedDestination(): string | null {
  try { return destination(sessionStorage.getItem(DESTINATION_KEY)); }
  catch (e) { console.error(e); return null; }
}

/** A failed callback has no from parameter: keep its destination for the retry. */
function SignInWithReturn() {
  const { search } = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.has('from')) keepDestination(destination(params.get('from')));
  }, [search]);
  return <SignIn />;
}

/** Signed-out browser arrivals open the exported document; deep links go to sign-in. */
function ToSignIn() {
  const loc = useLocation();
  const root = loc.pathname === '/';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  useEffect(() => {
    if (!root) return;
    keepDestination(null);
    if (!standalone) location.replace('/landing/');
  }, [root, standalone]);
  if (root && !standalone) return null;
  const from = root ? '' : `?from=${encodeURIComponent(loc.pathname + loc.search)}`;
  return <Navigate to={`/sign-in${from}`} replace />;
}

/** Read without consuming during render: Strict Mode may render twice before committing. */
function BackFromSignIn({ home = false, discard }: { home?: boolean; discard: boolean }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const [from] = useState(() => {
    // Takeover can finish before the router commits removal of the blocked query.
    if (discard) return '/';
    const params = new URLSearchParams(loc.search);
    return (params.has('from') ? destination(params.get('from')) : savedDestination()) ?? '/';
  });
  const consumed = useRef(false);
  const redirect = !home || from !== '/';
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    keepDestination(null);
    if (redirect) void navigate(from, { replace: true });
  }, [from, redirect, navigate]);
  // A Home destination with a query (/?view=list) keeps this element mounted: render Home under it.
  return home && (from === '/' || from.startsWith('/?')) ? <Home /> : null;
}
