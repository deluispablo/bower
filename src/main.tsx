import './clean-start';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { applyTheme, usePrefs } from '@/app/prefs';
import { bootStart } from '@/app/boot';
import { DataProvider } from '@/data/provider';
import { readScenario, readTimeScale } from '@/data/demo/scenario';
import { buildSources, readSource } from '@/data/choose';
import { bootFail } from '@/app/boot';
import '@/styles/base.css';

// Recover a removed lazy chunk without reloading on service-worker activation.
// Memory bounds this page even when storage is unavailable; a short stored window
// also prevents a fresh page from looping if the deployment is still incomplete.
let preloadReloaded = false;
const PRELOAD_RELOAD_KEY = 'bower:preload-reload';
const PRELOAD_RELOAD_WINDOW = 30_000;
window.addEventListener('vite:preloadError', (event) => {
  const payload: unknown = (event as Event & { payload: unknown }).payload;
  if (!(payload instanceof TypeError) ||
      !/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(payload.message)) return;
  if (preloadReloaded) return;
  preloadReloaded = true;
  try {
    const previous = Number(window.sessionStorage.getItem(PRELOAD_RELOAD_KEY));
    const now = Date.now();
    if (previous > 0 && now - previous < PRELOAD_RELOAD_WINDOW) return;
    window.sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(now));
  } catch {
    // Storage can be blocked. The in-memory guard still allows only one attempt.
  }
  event.preventDefault();
  location.reload();
});

bootStart();
applyTheme(usePrefs.getState().theme);

// The demo, the fake Drive (the real logic, in the browser) or the real Worker; see data/choose.ts.
const source = readSource();
const scenario = readScenario();
const scale = readTimeScale();

const root = document.getElementById('root');
if (!root) throw new Error('No #root');
// Starting can fail (no network for the pretend Drive's code, a broken page): say so on the boot screen.
const start = (): void => {
  buildSources(source, scenario, scale).then(
    ({ sources, world }) =>
      createRoot(root).render(
        <StrictMode>
          <DataProvider sources={sources}>
            <App demo={source === 'real' ? undefined : { scenario, scale, source, ...(world ? { world } : {}) }} />
          </DataProvider>
        </StrictMode>,
      ),
    (e: unknown) => {
      console.error(e);
      bootFail(navigator.onLine ? 'error' : 'offline', () => location.reload());
    },
  );
};
start();
