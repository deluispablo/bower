/**
 * The one-time card asking for push permission, shown right after the
 * first `done` (#39). Mounted from `process-button.tsx`. On iOS before the
 * PWA is installed, push isn't possible yet ("needs-install"), so this
 * shows the install hint instead of the permission buttons.
 */

import { useEffect, useState } from 'preact/hooks';

import '../styles/push-prompt.css';
import {
  currentPermission,
  currentPushSupport,
  enablePush,
  hasBeenPrompted,
  markPrompted,
  shouldPrompt,
} from '../push.js';
import { useRun } from '../run-store.js';

type Variant = 'ask' | 'ios-hint';

export function PushPrompt() {
  const { phase } = useRun();
  const [variant, setVariant] = useState<Variant | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'done' || hasBeenPrompted()) return;
    const support = currentPushSupport();
    if (
      shouldPrompt({
        phase,
        alreadyAsked: false,
        permission: currentPermission(),
        support,
      })
    ) {
      setVariant('ask');
    } else if (support === 'needs-install') {
      setVariant('ios-hint');
    }
  }, [phase]);

  if (variant === null) return null;

  const dismiss = (): void => {
    markPrompted();
    setVariant(null);
  };

  const onYes = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await enablePush();
      dismiss();
    } catch (err) {
      console.error(err);
      setError('Could not turn on notifications.');
      setBusy(false);
    }
  };

  return (
    <div class="push-prompt" role="status">
      {variant === 'ask' && (
        <>
          <p class="push-prompt-text">Get notified when Bower finishes?</p>
          <div class="push-prompt-actions">
            <button
              type="button"
              class="push-prompt-button"
              disabled={busy}
              onClick={() => void onYes()}
            >
              Yes, notify me
            </button>
            <button
              type="button"
              class="push-prompt-button push-prompt-button-secondary"
              disabled={busy}
              onClick={dismiss}
            >
              Not now
            </button>
          </div>
        </>
      )}
      {variant === 'ios-hint' && (
        <>
          <p class="push-prompt-text">
            Add Bower to your Home Screen first to get notifications.
          </p>
          <p class="push-prompt-hint">Tap Share, then Add to Home Screen.</p>
          <div class="push-prompt-actions">
            <button type="button" class="push-prompt-button" onClick={dismiss}>
              Got it
            </button>
          </div>
        </>
      )}
      {error && <p class="push-prompt-error">{error}</p>}
    </div>
  );
}
