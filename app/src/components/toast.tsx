/**
 * A single, minimal toast: bottom of the screen, above the bottom nav,
 * auto-hides. No library, no queue — the caller owns the text and bumps
 * `messageKey` whenever it should (re)appear, even for the same text.
 *
 * An optional `linkHref` (spec §6, Home done row) adds a "See" link — the
 * done toast points it at the Answers folder or the last filed note, when
 * its id is known.
 */

import { useEffect, useState } from 'preact/hooks';

const DEFAULT_DURATION_MS = 5_000;

export interface ToastProps {
  /** Text to show, or `null` for nothing to show yet. */
  message: string | null;
  /** Bumped by the caller each time `message` should (re)appear. */
  messageKey: number;
  /** Milliseconds before it auto-hides. */
  duration?: number;
  /** Destination for the trailing link, or absent for no link. */
  linkHref?: string;
  /** The link's own text. */
  linkLabel?: string;
}

export function Toast({
  message,
  messageKey,
  duration = DEFAULT_DURATION_MS,
  linkHref,
  linkLabel = 'See',
}: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (messageKey === 0 || message === null) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [messageKey, duration, message]);

  if (!visible || message === null) return null;

  return (
    <div class="toast" role="status" aria-live="polite">
      <span class="toast-message">{message}</span>
      {linkHref !== undefined && (
        <a class="toast-link" href={linkHref}>
          {linkLabel}
        </a>
      )}
    </div>
  );
}
