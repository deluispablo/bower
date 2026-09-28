import { useEffect, useRef, useState } from 'preact/hooks';
import { LocationProvider, Route, Router, useLocation } from 'preact-iso';
import { registerSW } from 'virtual:pwa-register';

import { isDemo } from './api.js';
import { Layout } from './components/layout.js';
import { Add } from './routes/add.js';
import { Bower } from './routes/bower.js';
import { FileScreen } from './routes/file.js';
import { Folder } from './routes/folder.js';
import { Health } from './routes/health.js';
import { Home } from './routes/home.js';
import { Ideas } from './routes/ideas.js';
import { Intro } from './routes/intro.js';
import { LintRedirect } from './routes/lint-redirect.js';
import { Login } from './routes/login.js';
import { Note } from './routes/note.js';
import { NotFound } from './routes/not-found.js';
import { Notes } from './routes/notes.js';
import { NotInvited } from './routes/not-invited.js';
import { Onboarding } from './routes/onboarding.js';
import { Privacy } from './routes/privacy.js';
import { RunYourOwn } from './routes/run-your-own.js';
import { SearchRedirect } from './routes/search.js';
import { Settings } from './routes/settings.js';
import { TellRedirect } from './routes/tell-redirect.js';
import { Terms } from './routes/terms.js';
import { RunProvider } from './run-store.js';
import { ShellSlotsProvider } from './components/shell-slots.js';
import { SessionProvider, useSession } from './session.js';
import { BOWER_PATH, IDEAS_PATH, usesShell } from './shell-routes.js';
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

/** The catch-all route's own screen (#504): any URL that matches no route
 * above is a page that never existed, not a missing note. */
function NotFoundPage() {
  return <NotFound kind="page" />;
}

function AppRoutes() {
  const { status } = useSession();
  const { path } = useLocation();

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

  const routes = (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/login" component={isDemo() ? RunYourOwn : Login} />
      <Route path="/not-invited" component={NotInvited} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/note/:id" component={Note} />
      <Route path="/file/:id" component={FileScreen} />
      <Route path="/folder/:path*" component={Folder} />
      <Route path="/notes" component={Notes} />
      <Route path="/add" component={Add} />
      <Route path={BOWER_PATH} component={Bower} />
      <Route path={IDEAS_PATH} component={Ideas} />
      <Route path="/tell" component={TellRedirect} />
      <Route path="/search" component={SearchRedirect} />
      <Route path="/settings" component={Settings} />
      <Route path="/health" component={Health} />
      <Route path="/lint" component={LintRedirect} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/welcome" component={Intro} />
      <Route default component={NotFoundPage} />
    </Router>
  );

  return (
    <ShellSlotsProvider>
      {usesShell(path, isDemo()) ? (
        <Layout>{routes}</Layout>
      ) : (
        <main class="page page-bare">{routes}</main>
      )}
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
