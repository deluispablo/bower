import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import type { Me } from '../api.js';
import { ApiError, deleteAccount, loginUrl, updateSettings } from '../api.js';
import { Bird } from '../components/bird.js';
import { Toggle } from '../components/toggle.js';
import { getPref, setPref } from '../prefs.js';
import type { ThemePref } from '../prefs.js';
import {
  currentPushState,
  currentPushSupport,
  disablePush,
  enablePush,
} from '../push.js';
import { useSession } from '../session.js';
import { replayTour } from '../tour-store.js';
import '../styles/settings.css';
import { setTheme } from '../theme.js';

/**
 * `apiFetch` already turns a non-2xx response into an `ApiError` carrying a
 * short, people-facing message, so that message is what gets shown; anything
 * else (a thrown bug, not a rejected request) gets the generic sentence and
 * the real error goes to the console, never the screen.
 */
function toMessage(err: unknown): string {
  console.error(err);
  return err instanceof ApiError ? err.message : 'Something went wrong.';
}

function driveUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/** External link, kept local: the icon set (`components/icons.tsx`) is owned by #144 in parallel. */
function ExternalIcon(): JSX.Element {
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
      <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />
    </svg>
  );
}

interface ApiKeySectionProps {
  me: Me;
}

function ApiKeySection({ me }: ApiKeySectionProps) {
  const { setMe } = useSession();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    const apiKey = value.trim();
    if (apiKey === '') return;
    setBusy(true);
    setError(null);
    try {
      const { hasApiKey } = await updateSettings({ apiKey });
      setMe({ ...me, hasApiKey });
      setValue('');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { hasApiKey } = await updateSettings({ apiKey: null });
      setMe({ ...me, hasApiKey });
      setValue('');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="settings-field">
      <label for="api-key">Use my own Claude API key</label>
      <p class="settings-hint">
        Runs Bower on your own Anthropic billing instead of the person who runs
        it.
      </p>
      {me.hasApiKey && <p class="settings-note">A key is saved.</p>}
      <input
        id="api-key"
        type="password"
        autocomplete="off"
        placeholder="sk-ant-…"
        value={value}
        disabled={busy}
        onInput={(e) => {
          setValue(e.currentTarget.value);
        }}
      />
      <div class="settings-actions">
        <button
          type="button"
          class="settings-button"
          disabled={busy || value.trim() === ''}
          onClick={() => void save()}
        >
          Save
        </button>
        <button
          type="button"
          class="settings-button settings-button-secondary"
          disabled={busy || !me.hasApiKey}
          onClick={() => void clear()}
        >
          Clear
        </button>
      </div>
      {error && <p class="settings-error">{error}</p>}
    </div>
  );
}

const THEME_OPTIONS: Array<{ value: ThemePref; label: string }> = [
  { value: 'system', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Light/dark, following the system by default, with a manual override (#42). */
function AppearanceSection() {
  const [theme, setThemeState] = useState<ThemePref>(() => getPref('theme'));

  const choose = (value: ThemePref): void => {
    setThemeState(value);
    setTheme(value);
  };

  return (
    <div class="settings-section">
      <h2>Look</h2>
      <div class="settings-segmented" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            class="settings-segment"
            role="radio"
            aria-checked={theme === option.value}
            onClick={() => {
              choose(option.value);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The "Ping me when it's done" switch: reflects the browser's actual
 * subscription state (`currentPushState()`, checked once on mount) rather
 * than only the local preference, since the two can drift (permission
 * revoked elsewhere, a subscription that expired). Calls
 * `enablePush()`/`disablePush()` and keeps `notifyOnFinish` in sync so
 * other screens (the push prompt) can read it.
 */
function NotificationsToggle() {
  const [state, setState] = useState<'on' | 'off'>(() =>
    getPref('notifyOnFinish') ? 'on' : 'off',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [support] = useState(() => currentPushSupport());

  useEffect(() => {
    let cancelled = false;
    void currentPushState().then((pushState) => {
      if (cancelled) return;
      setState(pushState);
      setPref('notifyOnFinish', pushState === 'on');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (checked: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (checked) {
        await enablePush();
      } else {
        await disablePush();
      }
      const pushState = await currentPushState();
      setState(pushState);
      setPref('notifyOnFinish', pushState === 'on');
      if (checked && pushState !== 'on') {
        setError('Notifications were not turned on.');
      }
    } catch (err) {
      console.error(err);
      setError('Could not update notifications.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Toggle
        label="Ping me when it's done"
        hint={
          support === 'needs-install'
            ? 'Add Bower to your Home Screen first to get notifications.'
            : 'Notifications on this phone'
        }
        checked={state === 'on'}
        disabled={busy || support !== 'ready'}
        onChange={(checked) => void toggle(checked)}
      />
      {error && <p class="settings-error">{error}</p>}
    </>
  );
}

/**
 * Settings › Advanced (spec §6): the own Claude API key form, "Show me
 * around again" (replays the first-run tour on Home through a one-shot flag
 * in memory, `tour-store.ts`; `tourSeenAt` is left alone) and the same
 * `showAppFiles` pref as the explorer's footer button.
 */
function AdvancedSection({ me }: { me: Me }) {
  const { route } = useLocation();
  const [showAppFiles, setShowAppFiles] = useState(() =>
    getPref('showAppFiles'),
  );

  return (
    <div class="settings-section">
      <h2>Advanced</h2>

      <ApiKeySection me={me} />

      <button
        type="button"
        class="settings-row"
        onClick={() => {
          replayTour();
          route('/');
        }}
      >
        <span class="settings-row-text">
          <span class="settings-row-label">Show me around again</span>
          <span class="toggle-hint">Replay the three-step tour</span>
        </span>
      </button>

      <Toggle
        label="Show Bower's own files"
        hint="Rulebook, catalogue, journal, instruction notes, health reports and dot-folders (.obsidian, .claude), grouped at the bottom of your notes."
        checked={showAppFiles}
        onChange={(checked) => {
          setShowAppFiles(checked);
          setPref('showAppFiles', checked);
        }}
      />
    </div>
  );
}

function DangerZone() {
  const { signOut } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      // The account is gone; hand back to the sign-in screen the same way
      // an ordinary sign-out does — including forgetting the device
      // (IndexedDB, caches, the Drive token, per-user prefs), which
      // `signOut()` now does on every path.
      await signOut();
    } catch (err) {
      setError(toMessage(err));
      setBusy(false);
    }
  };

  return (
    <section class="settings-section">
      {!confirming && (
        <button
          type="button"
          class="settings-button settings-button-danger"
          onClick={() => {
            setConfirming(true);
          }}
        >
          Delete my Bower account
        </button>
      )}
      {confirming && (
        <div class="settings-confirm">
          <p>
            Your notes and your Bower folder in Drive stay untouched. Only
            Bower&rsquo;s access and settings are removed.
          </p>
          <div class="settings-actions">
            <button
              type="button"
              class="settings-button settings-button-danger"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              Yes, delete my Bower account
            </button>
            <button
              type="button"
              class="settings-button settings-button-secondary"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error && <p class="settings-error">{error}</p>}
        </div>
      )}
    </section>
  );
}

export function Settings() {
  const { me, signOut } = useSession();

  if (!me) return null;

  const version = import.meta.env.VITE_APP_VERSION ?? __APP_VERSION__;

  return (
    <section class="settings">
      <h1>Settings</h1>

      <div class="settings-section settings-account">
        <Bird state="looking" size={48} />
        <div class="settings-account-info">
          {me.name !== undefined && (
            <p class="settings-account-name">{me.name}</p>
          )}
          <p class="settings-account-email">{me.email}</p>
        </div>
        <div class="settings-account-links">
          {me.vault && (
            <a
              href={driveUrl(me.vault.folderId)}
              target="_blank"
              rel="noopener"
            >
              <ExternalIcon /> Drive
            </a>
          )}
          <a href={loginUrl()}>Reconnect Google</a>
        </div>
      </div>

      <div class="settings-section">
        <h2>Tidying up</h2>
        <NotificationsToggle />
        <div class="settings-static-row">
          <span class="settings-row-label">Weekly health check</span>
          <span class="settings-static-value">Every Sunday</span>
        </div>
      </div>

      <AppearanceSection />

      <AdvancedSection me={me} />

      <div class="settings-section">
        <button
          type="button"
          class="settings-button settings-button-secondary"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>

      <DangerZone />

      <div class="settings-footer">
        <p>Bower {version}</p>
        <a
          href="https://github.com/deluispablo/bower"
          target="_blank"
          rel="noopener"
        >
          Source code
        </a>
        <p>
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
        </p>
      </div>
    </section>
  );
}
