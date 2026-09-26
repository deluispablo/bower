import { render } from 'preact';

import { App } from './app.js';
import './styles/layout.css';
import { initTheme } from './theme.js';

initTheme();

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
