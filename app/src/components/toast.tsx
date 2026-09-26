/**
 * A single, minimal toast: bottom of the screen, above the bottom nav,
 * auto-hides. No library, no queue — the caller owns the text and bumps
 * `messageKey` whenever it should (re)appear, even for the same text.
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
}

export function Toast({
  message,
  messageKey,
  duration = DEFAULT_DURATION_MS,
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
      {message}
    </div>
  );
}
