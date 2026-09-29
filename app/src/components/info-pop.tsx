/**
 * The (i) explanation (spec §5 `info-pop.tsx`, D16): a 44 px button that
 * opens a small non-modal popover. It closes on Escape (focus returns to the
 * button) or a tap outside; focus is never trapped and nothing else is
 * blocked.
 */

import type { ComponentChildren, JSX } from 'preact';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'preact/hooks';

import '../styles/info-pop.css';

export interface InfoPopProps {
  /** The accessible name of the (i) button, e.g. "What By Bower means". */
  label: string;
  children: ComponentChildren;
}

/** The space kept between the panel and the viewport edge, in px. */
export const POP_GUTTER = 16;

/**
 * How far to shift the panel from the button's inline start so it stays
 * inside the viewport: 0 when it fits, negative when the button is near the
 * inline end (never pushes it past the start gutter).
 */
export function popOffset(
  buttonLeft: number,
  panelWidth: number,
  viewportWidth: number,
): number {
  const maxLeft = viewportWidth - POP_GUTTER - panelWidth;
  const left = Math.max(POP_GUTTER, Math.min(buttonLeft, maxLeft));
  return left - buttonLeft;
}

function IconInfo(): JSX.Element {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function InfoPop({ label, children }: InfoPopProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const popId = useId();

  useLayoutEffect(() => {
    if (!open) {
      setOffset(0);
      return;
    }
    const b = button.current;
    const p = panel.current;
    if (b === null || p === null) return;
    setOffset(
      popOffset(
        b.getBoundingClientRect().left,
        p.getBoundingClientRect().width,
        document.documentElement.clientWidth,
      ),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: Event): void => {
      const target = e.target;
      if (target instanceof Node && root.current?.contains(target) === true) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span class="info-pop" ref={root}>
      <button
        type="button"
        class="info-pop-button"
        ref={button}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <IconInfo />
      </button>
      {open && (
        <div
          class="info-pop-panel"
          role="dialog"
          aria-label={label}
          id={popId}
          ref={panel}
          style={offset === 0 ? undefined : { insetInlineStart: `${offset}px` }}
        >
          {children}
        </div>
      )}
    </span>
  );
}
