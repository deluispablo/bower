import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { applyTheme, usePrefs } from '@/app/prefs';
import { bootStart } from '@/app/boot';
import { DataProvider } from '@/data/provider';
import { readScenario, readTimeScale } from '@/data/demo/scenario';
import { buildSources, readSource } from '@/data/choose';
import '@/styles/base.css';

bootStart();
applyTheme(usePrefs.getState().theme);

// The demo, the fake Drive (the real logic, in the browser) or the real Worker; see data/choose.ts.
const source = readSource();
const scenario = readScenario();
const scale = readTimeScale();

const root = document.getElementById('root');
if (!root) throw new Error('No #root');
void buildSources(source, scenario, scale).then(({ sources, world }) =>
  createRoot(root).render(
    <StrictMode>
      <DataProvider sources={sources}>
        <App
          demo={
            source === 'real' ? undefined : { scenario, scale, source, ...(world ? { world } : {}) }
          }
        />
      </DataProvider>
    </StrictMode>,
  ),
);
