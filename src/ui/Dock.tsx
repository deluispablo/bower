import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Toasts, useToasts } from './toast';
import { useOverlaysOpen } from './back';
import s from './ui.module.css';

/**
 * The one bottom dock (d-v2-01): the messages stack above whatever the shell puts in its slot (the run chip).
 * It publishes its height as `--dock-h` on the root, so the page's bottom padding and `scroll-padding`
 * (`base.css`, WCAG 2.4.11, technique C43) read one number. ResizeObserver reports the size as it changes
 * (https://developer.mozilla.org/docs/Web/API/ResizeObserver).
 */
export function Dock({ children }: { children?: ReactNode }) {
  const overlayOpen = useOverlaysOpen();
  const pause = useToasts((state) => state.pause);
  // WAI-ARIA APG modal dialog: outside content is inert, so messages wait to be used and announced.
  // https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
  useLayoutEffect(() => {
    pause(overlayOpen);
    return () => pause(false);
  }, [overlayOpen, pause]);
  const stack = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stack.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = (): void => {
      const gap = parseFloat(getComputedStyle(el).getPropertyValue('--dock-gap')) || 0;
      root.style.setProperty('--dock-h', el.offsetHeight > 0 ? `${el.offsetHeight + gap}px` : '0px');
    };
    publish();
    const watch = new ResizeObserver(publish);
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.style.removeProperty('--dock-h');
    };
  }, []);
  return (
    <div className={s.dock}>
      <div className={s.dockStack} ref={stack} data-testid="dock-stack">
        <Toasts visible={!overlayOpen} />
        {children}
      </div>
    </div>
  );
}
