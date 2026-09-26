import { useEffect, useRef, useState } from 'preact/hooks';
import { LocationProvider, Route, Router } from 'preact-iso';
import { registerSW } from 'virtual:pwa-register';

import { Layout } from './components/layout.js';
import { Add } from './routes/add.js';
import { Home } from './routes/home.js';
import { Login } from './routes/login.js';
import { Note } from './routes/note.js';
import { NotFound } from './routes/not-found.js';
import { NotInvited } from './routes/not-invited.js';
import { Onboarding } from './routes/onboarding.js';
import { Privacy } from './routes/privacy.js';
import { Settings } from './routes/settings.js';
import { Tell } from './routes/tell.js';
import { RunProvider } from './run-store.js';
import { SessionProvider, useSession } from './session.js';
import { VaultProvider } from './vault-store.js';

function AppRoutes() {
  const { status } = useSession();

  if (status === 'loading') {
    return <p class="app-loading">Loading…</p>;
  }

  return (
    <Layout>
      <Router>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/not-invited" component={NotInvited} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/note/:id" component={Note} />
        <Route path="/add" component={Add} />
        <Route path="/tell" component={Tell} />
        <Route path="/settings" component={Settings} />
        <Route path="/onboarding" component={Onboarding} />
        <Route default component={NotFound} />
      </Router>
    </Layout>
  );
}

export function App() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(
    null,
  );

  useEffect(() => {
    updateSWRef.current = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
    });
  }, []);

  return (
    <LocationProvider>
      <SessionProvider>
        <VaultProvider>
          <RunProvider>
            <AppRoutes />
          </RunProvider>
        </VaultProvider>
      </SessionProvider>
      {needRefresh && (
        <div class="update-bar">
          <span>Update available</span>
          <button
            type="button"
            onClick={() => void updateSWRef.current?.(true)}
          >
            Reload
          </button>
        </div>
      )}
    </LocationProvider>
  );
}
