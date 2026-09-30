import { useEffect, useRef, useState } from 'preact/hooks';
import { LocationProvider, lazy, Route, Router, useLocation } from 'preact-iso';
import { registerSW } from 'virtual:pwa-register';

import { isDemo } from './api.js';
import { Layout } from './components/layout.js';
import { Home } from './routes/home.js';
import { Login } from './routes/login.js';
import { NotFound } from './routes/not-found.js';
import { RunProvider, useRun } from './run-store.js';
import { RunChipHost } from './components/run-chip-host.js';
import { ShellSlotsProvider } from './components/shell-slots.js';
import { SessionProvider, useSession } from './session.js';
import { JUST_FILED_PATH } from './just-filed.js';
import { BOWER_PATH, IDEAS_PATH, usesShell } from './shell-routes.js';
import { openSwitcher } from './switcher-store.js';
import { VaultProvider } from './vault-store.js';

/** Every screen but Home and Login loads on demand (#661), keeping the startup
 * script under its size budget. */
const Add = lazy(() => import('./routes/add.js').then((m) => m.Add));
const Bower = lazy(() => import('./routes/bower.js').then((m) => m.Bower));
const FileScreen = lazy(() =>
  import('./routes/file.js').then((m) => m.FileScreen),
);
const Folder = lazy(() => import('./routes/folder.js').then((m) => m.Folder));
const Health = lazy(() => import('./routes/health.js').then((m) => m.Health));
const Ideas = lazy(() => import('./routes/ideas.js').then((m) => m.Ideas));
const Intro = lazy(() => import('./routes/intro.js').then((m) => m.Intro));
const LintRedirect = lazy(() =>
  import('./routes/lint-redirect.js').then((m) => m.LintRedirect),
);
const JustFiled = lazy(() =>
  import('./routes/just-filed.js').then((m) => m.JustFiled),
);
const Note = lazy(() => import('./routes/note.js').then((m) => m.Note));
const Notes = lazy(() => import('./routes/notes.js').then((m) => m.Notes));
const NotInvited = lazy(() =>
  import('./routes/not-invited.js').then((m) => m.NotInvited),
);
const Onboarding = lazy(() =>
  import('./routes/onboarding.js').then((m) => m.Onboarding),
);
const Privacy = lazy(() =>
  import('./routes/privacy.js').then((m) => m.Privacy),
);
const Recover = lazy(() =>
  import('./routes/recover.js').then((m) => m.Recover),
);
const RunYourOwn = lazy(() =>
  import('./routes/run-your-own.js').then((m) => m.RunYourOwn),
);
const SearchRedirect = lazy(() =>
  import('./routes/search.js').then((m) => m.SearchRedirect),
);
const Settings = lazy(() =>
  import('./routes/settings.js').then((m) => m.Settings),
);
const TellRedirect = lazy(() =>
  import('./routes/tell-redirect.js').then((m) => m.TellRedirect),
);
const Terms = lazy(() => import('./routes/terms.js').then((m) => m.Terms));

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
  const { status, recheckFolder } = useSession();
  const { path } = useLocation();
  const { phase, run } = useRun();

  // A tidy-up that finds the folder gone fails with `vault_missing`: the
  // recovery screens answer that, not the run-failure sheet (R-VAULT-3).
  const missingRunKey =
    phase === 'failed' && run?.reason === 'vault_missing'
      ? (run.runId ?? run.requestedAt)
      : null;
  useEffect(() => {
    if (missingRunKey !== null) void recheckFolder();
  }, [missingRunKey]);

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
      <Route path={JUST_FILED_PATH} component={JustFiled} />
      <Route path="/tell" component={TellRedirect} />
      <Route path="/search" component={SearchRedirect} />
      <Route path="/settings" component={Settings} />
      <Route path="/health" component={Health} />
      <Route path="/lint" component={LintRedirect} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/welcome" component={Intro} />
      <Route path="/recover" component={Recover} />
      <Route default component={NotFoundPage} />
    </Router>
  );

  return (
    <ShellSlotsProvider>
      <RunChipHost />
      {usesShell(path, isDemo(), status === 'signed-in') ? (
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
