/**
 * The header's Process button (#37). Reads run status from `useRun()` and
 * the pending count from `useVault()`'s file listing; starts a run on tap
 * (idle), or reveals the reason on tap once it stopped (failed / stale /
 * over quota). `done` announces itself without a tap.
 */

import { useEffect, useState } from 'preact/hooks';

import '../styles/process.css';
import { pendingCount, useRun } from '../run-store.js';
import type { RunPhase } from '../run-store.js';
import { useSession } from '../session.js';
import { useVault } from '../vault-store.js';
import { Toast } from './toast.js';

function labelFor(phase: RunPhase, pending: number): string {
  switch (phase) {
    case 'idle':
      return pending > 0 ? `Process (${pending})` : 'Process';
    case 'queued':
      return 'Queued…';
    case 'running':
      return 'Working…';
    case 'done':
      return 'Done ✓';
    case 'failed':
    case 'stale':
      return 'Failed';
    case 'quota':
      return 'Limit reached';
  }
}

export function ProcessButton() {
  const { me } = useSession();
  const { phase, message, process } = useRun();
  const { files } = useVault();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);

  // A finished run announces itself without waiting for a tap.
  useEffect(() => {
    if (phase !== 'done' || message === undefined) return;
    setToastMessage(message);
    setToastKey((key) => key + 1);
  }, [phase, message]);

  function onClick(): void {
    if (phase === 'failed' || phase === 'stale' || phase === 'quota') {
      if (message !== undefined) {
        setToastMessage(message);
        setToastKey((key) => key + 1);
      }
      return;
    }
    if (phase === 'idle') void process();
  }

  const disabled = phase === 'queued' || phase === 'running';

  // Nothing to process before the account has a folder (login, onboarding).
  if (me?.vault == null) return null;

  return (
    <div class="process">
      <button
        type="button"
        class="process-button"
        data-phase={phase}
        disabled={disabled}
        onClick={onClick}
      >
        {phase === 'running' && (
          <span class="process-spinner" aria-hidden="true" />
        )}
        <span aria-live="polite">{labelFor(phase, pendingCount(files))}</span>
      </button>
      <Toast message={toastMessage} messageKey={toastKey} />
    </div>
  );
}
