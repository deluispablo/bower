/**
 * The one-time bottom sheet asking for push permission, shown right after
 * the first `done` (#39; restyled as a sheet with the bird singing in
 * #148). Mounted once in the shell (`run-sheets.tsx`). On iOS before the PWA is
 * installed, push isn't possible yet ("needs-install"), so this shows the
 * install hint instead of the permission buttons.
 */

import { useEffect, useState } from 'preact/hooks';

import '../styles/push-prompt.css';
import { Bird } from './bird.js';
import {
  currentPermission,
  currentPushSupport,
  enablePush,
  hasBeenPrompted,
  markPrompted,
  shouldPrompt,
} from '../push.js';
import { OVERLAY_PRIORITY } from '../overlay-queue.js';
import { useRun } from '../run-store.js';
import { Overlay } from './overlay.js';
import { Queued } from './queued-overlay.js';

type Variant = 'ask' | 'ios-hint';

export function PushPrompt() {
  const { phase, resultSeen } = useRun();
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

  // Not while the chip still shows the result (R-OVL-5): the person reads
  // that first. `Queued` also holds it back while any overlay is open.
  if (variant === null || !resultSeen) return null;

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
    <Queued id="push-prompt" priority={OVERLAY_PRIORITY.hint}>
      <Overlay
        kind="dialog"
        desktopPlacement="right"
        labelledBy="push-prompt-title"
        onClose={dismiss}
      >
        <div class="push-prompt">
          <Bird state="singing" size={88} overlay />
          {variant === 'ask' && (
            <>
              <p id="push-prompt-title" class="push-prompt-title">
                Want a ping when I&rsquo;m done?
              </p>
              <p class="push-prompt-text">
                Tidying up takes a few minutes. I&rsquo;ll send one short
                notification when everything is filed, and nothing else, ever.
              </p>
              <div class="push-prompt-actions">
                <button
                  type="button"
                  class="push-prompt-button"
                  disabled={busy}
                  onClick={() => void onYes()}
                >
                  Yes, ping me
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
              <p id="push-prompt-title" class="push-prompt-title">
                Add Bower to your Home Screen first to get notifications.
              </p>
              <p class="push-prompt-text">
                Tap Share, then Add to Home Screen.
              </p>
              <div class="push-prompt-actions">
                <button
                  type="button"
                  class="push-prompt-button"
                  onClick={dismiss}
                >
                  Got it
                </button>
              </div>
            </>
          )}
          {error && <p class="push-prompt-error">{error}</p>}
        </div>
      </Overlay>
    </Queued>
  );
}
