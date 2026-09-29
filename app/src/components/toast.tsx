/**
 * The one toast (issues #216, #304): bottom of the screen, above the bottom
 * nav, with an optional link and a Close. Mounted once, in the shell
 * (`layout.tsx`); what it shows and for how long lives in `toast-store.ts`,
 * so mounting it again on a route change never brings a toast back.
 */

import type { JSX } from 'preact';

import '../styles/toast.css';
import { dismissToast, useToast } from '../toast-store.js';

export function Toast(): JSX.Element | null {
  const toast = useToast();
  if (toast === null) return null;

  return (
    <div class="toast" role="status" aria-live="polite">
      <span class="toast-message">{toast.message}</span>
      {toast.link !== undefined && (
        <a class="toast-link" href={toast.link.href}>
          {toast.link.label}
        </a>
      )}
      {toast.action !== undefined && (
        <button
          type="button"
          class="toast-link toast-action"
          onClick={() => {
            const { run } = toast.action as NonNullable<typeof toast.action>;
            dismissToast();
            run();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        class="toast-close"
        aria-label="Close"
        onClick={dismissToast}
      >
        ×
      </button>
    </div>
  );
}
