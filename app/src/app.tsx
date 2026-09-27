import { useEffect, useRef, useState } from 'preact/hooks';
import { LocationProvider, Route, Router } from 'preact-iso';
import { registerSW } from 'virtual:pwa-register';

import { Layout } from './components/layout.js';
import { Add } from './routes/add.js';
import { Health } from './routes/health.js';
import { Home } from './routes/home.js';
import { Login } from './routes/login.js';
import { Note } from './routes/note.js';
import { NotFound } from './routes/not-found.js';
import { NotInvited } from './routes/not-invited.js';
import { Onboarding } from './routes/onboarding.js';
import { Privacy } from './routes/privacy.js';
import { SearchRedirect } from './routes/search.js';
import { Settings } from './routes/settings.js';
import { Tell } from './routes/tell.js';
import { Terms } from './routes/terms.js';
import { RunProvider } from './run-store.js';
import { ShellSlotsProvider } from './components/shell-slots.js';
import { SessionProvider, useSession } from './session.js';
import { openSwitcher } from './switcher-store.js';
import { VaultProvider } from './vault-store.js';

/** Whether `target` is a field the user is typing in — Ctrl/Cmd+K is ignored there. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

function AppRoutes() {
  const { status } = useSession();

  // Ctrl/Cmd+K opens the quick switcher from anywhere (#142).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      ) {
        return;
      }
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      openSwitcher();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  if (status === 'loading') {
    return <p class="app-loading">Loading…</p>;
  }

  return (
    <ShellSlotsProvider>
      <Layout>
        <Router>
          <Route path="/" component={Home} />
          <Route path="/login" component={Login} />
          <Route path="/not-invited" component={NotInvited} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/terms" component={Terms} />
          <Route path="/note/:id" component={Note} />
          <Route path="/add" component={Add} />
          <Route path="/tell" component={Tell} />
          <Route path="/search" component={SearchRedirect} />
          <Route path="/settings" component={Settings} />
          <Route path="/lint" component={Health} />
          <Route path="/onboarding" component={Onboarding} />
          <Route default component={NotFound} />
        </Router>
      </Layout>
    </ShellSlotsProvider>
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
