import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { bootDone, bootFail } from './boot';
import { applyTheme, usePrefs } from './prefs';
import { Shell } from './Shell';
import { useSources } from '@/data/provider';
import { BowerError, type FolderState, type User } from '@/data/types';
import type { Scenario, TimeScale } from '@/data/demo/scenario';
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
import { DemoPanel } from '@/data/demo/DemoPanel';

interface Gate {
  user: User | null;
  folder: FolderState;
}

export function App({ demo }: { demo: { scenario: Scenario; scale: TimeScale } }) {
  return (
    <BrowserRouter>
      <Gatekeeper />
      <DemoPanel scenario={demo.scenario} scale={demo.scale} />
    </BrowserRouter>
  );
}

/** Who is here and whether their folder exists decide which screens exist. */
function Gatekeeper() {
  const { session } = useSources();
  const [gate, setGate] = useState<Gate | null>(null);
  const [attempt, setAttempt] = useState(0);
  const theme = usePrefs((p) => p.theme);
  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    let live = true;
    const check = async (): Promise<void> => {
      try {
        const user = await session.current();
        const folder = user ? await session.folderState() : 'ready';
        if (live) setGate({ user, folder });
      } catch (e) {
        if (!live) return;
        console.error(e);
        bootFail(e instanceof BowerError && e.code === 'offline' ? 'offline' : 'error', () => setAttempt((a) => a + 1));
      }
    };
    void check();
    const off = session.subscribe(() => void check());
    return () => {
      live = false;
      off();
    };
  }, [session, attempt]);

  useEffect(() => {
    if (gate) bootDone();
  }, [gate]);

  if (!gate) return null;
  if (!gate.user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }
  if (gate.folder === 'missing') {
    return (
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
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
      <Route path="/sign-in" element={<Navigate to="/" replace />} />
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
