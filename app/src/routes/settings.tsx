import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useLocation } from 'preact-iso';

import type { Me } from '../api.js';
import {
  ApiError,
  deleteAccount,
  isDemo,
  loginUrl,
  logoutAll,
  updateSettings,
} from '../api.js';
import { useShellSlot } from '../components/shell-slots.js';
import { Toggle } from '../components/toggle.js';
import { getPref, setPref } from '../prefs.js';
import type { ThemePref } from '../prefs.js';
import {
  currentPushState,
  currentPushSupport,
  disablePush,
  enablePush,
} from '../push.js';
import { isRulebookBehind } from '../rulebook.js';
import { useSession } from '../session.js';
import { replayTour } from '../tour-store.js';
import '../styles/settings.css';
import { setTheme } from '../theme.js';
import { useVault } from '../vault-store.js';

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

/** Delete account, the own API key and Sign out everywhere all need a
 * real backend (#193): the demo shows this sentence instead of acting. */
const NOT_IN_DEMO = 'Not in the demo: run your own Bower to use this.';

function driveUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/** The account card's initial disc (spec §14): the name's first letter, or
 * the address's when there is no name. */
function accountInitial(me: Me): string {
  const source =
    me.name !== undefined && me.name.trim() !== '' ? me.name : me.email;
  return source.charAt(0).toUpperCase();
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

  if (isDemo()) {
    return (
      <div class="settings-field">
        <label>Use my own Claude API key</label>
        <p class="settings-note">{NOT_IN_DEMO}</p>
      </div>
    );
  }

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

/** The phone top bar's title (spec §14): a stable element, so it never
 * refills the shell's `crumb` slot on a re-render (`shell-slots.ts`). */
const CRUMB = <h1 class="topbar-title">Settings</h1>;

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
 * "Update Bower's rules (vN → vM)" (#197), shown only when the Bower
 * folder's rulebook is older than the one compiled into the app. The
 * template's version comes from a lazily loaded chunk
 * (`rulebook-template.ts`), so its text never weighs on startup.
 */
function UpdateRulesRow() {
  const vault = useVault();
  const [templateVersion, setTemplateVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('../rulebook-template.js')
      .then((template) => {
        if (!cancelled) setTemplateVersion(template.TEMPLATE_RULES_VERSION);
      })
      .catch((err: unknown) => {
        console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const vaultVersion = vault.index?.bowerRulesVersion ?? null;
  const behind =
    vaultVersion !== null &&
    templateVersion !== null &&
    isRulebookBehind(vaultVersion, templateVersion);

  const update = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await vault.updateRules();
      const moved =
        result.moved === 0
          ? ''
          : result.moved === 1
            ? ' One line of yours moved to Your rules.'
            : ` ${result.moved} lines of yours moved to Your rules.`;
      setDone(`Bower's rules are up to date (v${result.to}).${moved}`);
    } catch (err) {
      console.error(err);
      setError("Could not update Bower's rules. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {behind && (
        <button
          type="button"
          class="settings-row"
          disabled={busy}
          onClick={() => void update()}
        >
          <span class="settings-row-text">
            <span class="settings-row-label">
              Update Bower's rules (v{vaultVersion} → v{templateVersion})
            </span>
            <span class="toggle-hint">
              Replaces Bower's rulebook with the latest one; rules you added to
              it move to Your rules, and About me is left alone.
            </span>
          </span>
        </button>
      )}
      {done && <p class="settings-note">{done}</p>}
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

      <UpdateRulesRow />

      <button
        type="button"
        class="settings-row"
        onClick={() => route('/onboarding?step=interview&from=settings')}
      >
        <span class="settings-row-text">
          <span class="settings-row-label">
            Tell Bower about yourself again
          </span>
          <span class="toggle-hint">
            The four first-run questions, again — About me and Your rules keep
            everything else you have added.
          </span>
        </span>
      </button>

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

      <button
        type="button"
        class="settings-row"
        onClick={() => route('/welcome?from=settings')}
      >
        <span class="settings-row-text">
          <span class="settings-row-label">What is Bower</span>
          <span class="toggle-hint">The four-page intro, again</span>
        </span>
      </button>

      <Toggle
        label="Show Bower's own files"
        hint="Rulebook, your rules, about me, catalogue, journal, instruction notes, health reports and dot-folders (.obsidian, .claude), grouped at the bottom of your notes."
        checked={showAppFiles}
        onChange={(checked) => {
          setShowAppFiles(checked);
          setPref('showAppFiles', checked);
        }}
      />
    </div>
  );
}

/**
 * Sign out on this device, or everywhere: "Sign out everywhere" ends every
 * session of the account on the Worker first, then signs this device out
 * the ordinary way. A 401 means this session had already ended, so the
 * device is signed out all the same.
 */
function SignOutSection() {
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOutEverywhere = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await logoutAll();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setError(toMessage(err));
        setBusy(false);
        return;
      }
      console.error(err);
    }
    await signOut();
  };

  return (
    <div class="settings-section">
      <div class="settings-actions">
        <button
          type="button"
          class="settings-button settings-button-secondary"
          disabled={busy}
          onClick={() => void signOut()}
        >
          Sign out
        </button>
        {isDemo() ? (
          <p class="settings-note">{NOT_IN_DEMO}</p>
        ) : (
          <button
            type="button"
            class="settings-button settings-button-secondary"
            disabled={busy}
            onClick={() => void signOutEverywhere()}
          >
            Sign out everywhere
          </button>
        )}
      </div>
      {error && <p class="settings-error">{error}</p>}
    </div>
  );
}

function DangerZone() {
  const { signOut } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isDemo()) {
    return (
      <section class="settings-section">
        <p class="settings-note">{NOT_IN_DEMO}</p>
      </section>
    );
  }

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
  const { me } = useSession();

  useShellSlot('crumb', CRUMB);

  if (!me) return null;

  const version = import.meta.env.VITE_APP_VERSION ?? __APP_VERSION__;

  return (
    <section class="settings">
      <h1 class="screen-title">Settings</h1>

      <div class="settings-section settings-account">
        <span class="settings-account-avatar" aria-hidden="true">
          {accountInitial(me)}
        </span>
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
      </div>

      <AppearanceSection />

      <AdvancedSection me={me} />

      <SignOutSection />

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
