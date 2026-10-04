import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { applyTheme, usePrefs } from '@/app/prefs';
import { bootStart } from '@/app/boot';
import { DataProvider } from '@/data/provider';
import { DemoWorld } from '@/data/demo/world';
import { readScenario, readTimeScale } from '@/data/demo/scenario';
import '@/styles/base.css';

bootStart();
applyTheme(usePrefs.getState().theme);

// Phase 1 runs on the demo only; phase 2 picks the real sources here.
const world = new DemoWorld({ scenario: readScenario(), scale: readTimeScale() });

const root = document.getElementById('root');
if (!root) throw new Error('No #root');
createRoot(root).render(
  <StrictMode>
    <DataProvider sources={world.sources()}>
      <App demo={{ scenario: world.scenario, scale: world.scale, world }} />
    </DataProvider>
  </StrictMode>,
);
