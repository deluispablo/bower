import s from './ui.module.css';

/**
 * A control named only by an icon shows its name on hover and keyboard focus (ui.module.css `.hint`).
 * Escape hides the hint until focus moves or the pointer reaches something else (WCAG 1.4.13, dismissible).
 */
export const hintCls: string = s.hint ?? '';
if (typeof document !== 'undefined') {
  const root = document.documentElement;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') root.dataset.hintOff = '';
  });
  document.addEventListener('focusin', () => delete root.dataset.hintOff);
  document.addEventListener('pointerover', (e) => {
    if (!(hintCls && e.target instanceof Element && e.target.closest(`.${hintCls}`))) delete root.dataset.hintOff;
  });
}
