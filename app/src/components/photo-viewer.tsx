/**
 * The photo viewer (issue #605, boards `Phone-File-Photo` and
 * `Phone-Photo-Full`, spec §6.8 R-PHOTO-1 and R-PHOTO-2).
 *
 * A photo opens fitted on the screen with the hint "Tap to see it whole".
 * A tap opens it full screen: the Fullscreen API when the browser has it,
 * and always a black overlay, which is also the fallback where the API is
 * missing or refused. Pinch and pan are the browser's (`touch-action:
 * pinch-zoom`); a double tap toggles 2× and a badge shows the zoom factor.
 * Escape, Close or a swipe down closes. Previous and next (buttons and the
 * arrow keys) walk the folder's photos and files.
 *
 * Mounting it on the file screen is #606's job: this component only takes
 * the current photo and the folder's siblings, and reports where to go.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import '../styles/photo-viewer.css';
import { useFocusTrap } from './use-focus-trap.js';

/** One item of the folder's walk: a photo or a file. */
export interface PhotoSibling {
  id: string;
  name: string;
}

export interface PhotoViewerProps {
  /** Address of the current photo. */
  src: string;
  /** The current photo's title, shown as the caption. */
  title: string;
  /** Every photo and file in the folder, in walking order. */
  siblings: readonly PhotoSibling[];
  /** Position of the current photo in `siblings`. */
  index: number;
  /** The folder's display name, for "2 of 5 in Flat hunt". */
  folderName: string;
  /** Asks the screen to show the sibling at this position. */
  onNavigate: (index: number) => void;
}

/** Two taps closer than this (ms) and this (px) are a double tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
/** A swipe down this far (px) closes, when it is mostly vertical. */
const SWIPE_CLOSE_PX = 90;

const CLOSE_ICON = 'M6 6l12 12M18 6L6 18';
const PREVIOUS_ICON = 'M15 6l-6 6 6 6';
const NEXT_ICON = 'M9 6l6 6-6 6';

function Icon({ path }: { path: string }): JSX.Element {
  return (
    <svg class="photo-viewer-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/** "1.8×", "2×": one decimal at most, no trailing zero. */
export function zoomLabel(scale: number): string {
  return `${String(Number(scale.toFixed(1)))}×`;
}

/** "2 of 5 in Flat hunt". */
export function counterText(
  index: number,
  total: number,
  folderName: string,
): string {
  return `${String(index + 1)} of ${String(total)} in ${folderName}`;
}

/** Whether the browser is in real full screen (jsdom has no such API). */
function inFullscreen(): boolean {
  return Boolean(document.fullscreenElement);
}

/** The page's own pinch zoom, which the browser owns. */
function usePinchScale(): number {
  const [scale, setScale] = useState(window.visualViewport?.scale ?? 1);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport === null || viewport === undefined) return;
    const update = (): void => setScale(viewport.scale);
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);
  return scale;
}

interface FullScreenProps extends PhotoViewerProps {
  onClose: () => void;
}

function FullScreen(props: FullScreenProps): JSX.Element {
  const { src, title, siblings, index, folderName, onNavigate, onClose } =
    props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [doubled, setDoubled] = useState(false);
  const pinch = usePinchScale();
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const total = siblings.length;

  useFocusTrap(rootRef, onClose);

  // The black overlay is always there; the Fullscreen API is an extra.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    if (typeof root.requestFullscreen === 'function' && !inFullscreen()) {
      root.requestFullscreen().catch((error: unknown) => {
        console.warn('Full screen was refused; using the overlay.', error);
      });
    }
    // The browser leaving full screen by itself (its own Escape or back
    // gesture) also closes the viewer.
    const onChange = (): void => {
      if (!inFullscreen()) onCloseRef.current();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (inFullscreen()) {
        document.exitFullscreen().catch((error: unknown) => {
          console.warn('Could not leave full screen.', error);
        });
      }
    };
  }, []);

  // A new photo starts fitted.
  useEffect(() => setDoubled(false), [src]);

  function go(next: number): void {
    if (next < 0 || next >= total) return;
    onNavigate(next);
  }
  // Bound once and reading the latest render, so a key pressed right after
  // a step never meets a listener that is between two renders.
  const goRef = useRef(go);
  goRef.current = go;
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'ArrowLeft') goRef.current(indexRef.current - 1);
      else if (event.key === 'ArrowRight') goRef.current(indexRef.current + 1);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function onPhotoClick(event: MouseEvent): void {
    const now = event.timeStamp;
    const previous = lastTap.current;
    if (
      previous !== null &&
      now - previous.at <= DOUBLE_TAP_MS &&
      Math.abs(event.clientX - previous.x) <= DOUBLE_TAP_PX &&
      Math.abs(event.clientY - previous.y) <= DOUBLE_TAP_PX
    ) {
      lastTap.current = null;
      setDoubled((value) => !value);
      return;
    }
    lastTap.current = { at: now, x: event.clientX, y: event.clientY };
  }

  function onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    swipeStart.current =
      event.touches.length === 1 && touch !== undefined
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  }

  function onTouchEnd(event: TouchEvent): void {
    const start = swipeStart.current;
    const touch = event.changedTouches[0];
    swipeStart.current = null;
    if (start === null || touch === undefined) return;
    if (doubled || pinch > 1.01) return;
    const down = touch.clientY - start.y;
    if (down >= SWIPE_CLOSE_PX && down > Math.abs(touch.clientX - start.x)) {
      onClose();
    }
  }

  const scale = (doubled ? 2 : 1) * pinch;

  return (
    <div
      ref={rootRef}
      class="photo-viewer-full"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header class="photo-viewer-bar">
        <button
          type="button"
          class="photo-viewer-button"
          aria-label="Close"
          onClick={onClose}
        >
          <Icon path={CLOSE_ICON} />
        </button>
        <span class="photo-viewer-counter">
          {counterText(index, total, folderName)}
        </span>
      </header>
      <div
        class={`photo-viewer-stage${doubled ? ' is-zoomed' : ''}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img
          class={`photo-viewer-img${doubled ? ' is-zoomed' : ''}`}
          src={src}
          alt={title}
          draggable={false}
          onClick={onPhotoClick}
        />
      </div>
      {scale > 1.01 && (
        <span class="photo-viewer-badge" role="status">
          {zoomLabel(scale)}
        </span>
      )}
      <footer class="photo-viewer-foot">
        <button
          type="button"
          class="photo-viewer-button"
          aria-label="Previous"
          aria-disabled={index <= 0}
          onClick={() => go(index - 1)}
        >
          <Icon path={PREVIOUS_ICON} />
        </button>
        <span class="photo-viewer-caption">{title}</span>
        <button
          type="button"
          class="photo-viewer-button"
          aria-label="Next"
          aria-disabled={index >= total - 1}
          onClick={() => go(index + 1)}
        >
          <Icon path={NEXT_ICON} />
        </button>
      </footer>
    </div>
  );
}

export function PhotoViewer(props: PhotoViewerProps): JSX.Element {
  const { src, title } = props;
  const [open, setOpen] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);

  function close(): void {
    setOpen(false);
    // Leaving real full screen is asynchronous and the browser may take
    // focus with it, so the photo asks for it back once that is done too.
    const focusPhoto = (): void => openRef.current?.focus();
    if (inFullscreen()) {
      document.addEventListener('fullscreenchange', focusPhoto, {
        once: true,
      });
    }
    requestAnimationFrame(focusPhoto);
  }

  return (
    <div class="photo-viewer">
      <button
        ref={openRef}
        type="button"
        class="photo-viewer-open"
        aria-label={`${title}. Tap to see it whole`}
        onClick={() => setOpen(true)}
      >
        <img class="photo-viewer-fit" src={src} alt="" />
        <span class="photo-viewer-hint" aria-hidden="true">
          Tap to see it whole
        </span>
      </button>
      {open && <FullScreen {...props} onClose={close} />}
    </div>
  );
}
