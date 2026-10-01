import { render } from 'preact';

import { App } from './app.js';
import { startBootTimers } from './boot-screen.js';
import './styles/layout.css';
import './styles/primitives.css';
import { initTheme } from './theme.js';

initTheme();
startBootTimers();

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
