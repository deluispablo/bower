import { useEffect, useState } from 'preact/hooks';

import type { Me } from '../api.js';
import { ApiError, deleteAccount, loginUrl, updateSettings } from '../api.js';
import { getPref, setPref } from '../prefs.js';
import type { ThemePref } from '../prefs.js';
import {
  currentPushState,
  currentPushSupport,
  disablePush,
  enablePush,
} from '../push.js';
import { useSession } from '../session.js';
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
    <section class="settings-section">
      <h2>Claude API key</h2>
      <div class="settings-field">
        <label for="api-key">Use my own Claude API key</label>
        <p class="settings-hint">
          Runs Bower on your own Anthropic billing instead of the person who
          runs it.
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
      </div>
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
    </section>
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

  return (
    <div class="settings-section">
      <h2>Appearance</h2>
      <div class="settings-field">
        <label for="theme-select">Theme</label>
        <select
          id="theme-select"
          class="settings-select"
          value={theme}
          onChange={(e) => {
            const value = e.currentTarget.value as ThemePref;
            setThemeState(value);
            setTheme(value);
          }}
        >
          {THEME_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * The Notifications toggle: reflects the browser's actual subscription
 * state (`currentPushState()`, checked once on mount) rather than only the
 * local preference, since the two can drift (permission revoked elsewhere,
 * a subscription that expired). Calls `enablePush()`/`disablePush()` and
 * keeps `notifyOnFinish` in sync so other screens can read it.
 */
function NotificationsSection() {
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
    <div class="settings-section">
      <h2>Notifications</h2>
      <label class="settings-toggle">
        <input
          type="checkbox"
          checked={state === 'on'}
          disabled={busy || support !== 'ready'}
          onChange={(e) => {
            void toggle(e.currentTarget.checked);
          }}
        />
        Notify me when Bower finishes
      </label>
      {support === 'needs-install' && (
        <p class="settings-hint">
          Add Bower to your Home Screen first to get notifications.
        </p>
      )}
      {error && <p class="settings-error">{error}</p>}
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
      <h2>Danger zone</h2>
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
  const [autoProcess, setAutoProcess] = useState(() =>
    getPref('autoProcessOnAdd'),
  );

  if (!me) return null;

  const version = import.meta.env.VITE_APP_VERSION ?? __APP_VERSION__;

  return (
    <section class="settings">
      <h1>Settings</h1>

      <div class="settings-section">
        <h2>Account</h2>
        <p>{me.email}</p>
        {me.vault && (
          <a href={driveUrl(me.vault.folderId)} target="_blank" rel="noopener">
            Open your Bower folder in Drive
          </a>
        )}
        <a href={loginUrl()}>Reconnect Google</a>
      </div>

      <AppearanceSection />

      <NotificationsSection />

      <ApiKeySection me={me} />

      <div class="settings-section">
        <h2>Processing</h2>
        <label class="settings-toggle">
          <input
            type="checkbox"
            checked={autoProcess}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setAutoProcess(checked);
              setPref('autoProcessOnAdd', checked);
            }}
          />
          Process automatically after adding
        </label>
      </div>

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
        <a href="/privacy">Privacy</a>
      </div>
    </section>
  );
}
