/**
 * Settings (spec §4.14, boards ST-Top, ST-Mid, ST-Bot; #917). One centred
 * column: the PageHeader (crumb "Home", ⋯ beside the title), the profile
 * row, then Tidying up, Look (the one segmented control, K-21), Bower,
 * Learn Bower, Advanced (the Claude key as the Composer `send` box with
 * the mic, owner review O-R1), Sign out, Delete my Bower account and the
 * footer. The phone bar shows "Home" back and no avatar (ST-1).
 * Destructive actions ask once through #907's `Confirm` (§3.39).
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
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
import { BackLink } from '../components/back-link.js';
import { Composer } from '../components/composer.js';
import { Confirm } from '../components/confirm.js';
import {
  DICTATION_LANGUAGES,
  languageLabel,
} from '../components/dictate-button.js';
import { IconChevronRight, IconExternalLink } from '../components/icons.js';
import { NoteMenu } from '../components/note-menu.js';
import { HOME_CRUMBS, PageHeader } from '../components/page-header.js';
import { Segmented } from '../components/segmented.js';
import { useShellSlot } from '../components/shell-slots.js';
import { useGuardedSignOut } from '../components/upload-chip.js';
import { Toggle } from '../components/toggle.js';
import { LEARN_PATH } from '../learn.js';
import { getPref, setPref } from '../prefs.js';
import type { ThemePref } from '../prefs.js';
import {
  currentPushState,
  currentPushSupport,
  disablePush,
  enablePush,
} from '../push.js';
import { isRulebookBehind } from '../rulebook.js';
import { IDEAS_PATH } from '../shell-routes.js';
import { personOf, useSession } from '../session.js';
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

/** The demo's line under every control that needs a real backend (spec
 * §4.14 states, #193): the key box, Sign out everywhere, Delete my Bower
 * account and the push toggle. */
export const NOT_IN_DEMO = 'Not in the demo. Run your own Bower to use it.';

/** S-ST-6: the key box's lines. */
export const KEY_SAVED = 'Saved. Bower runs on your Claude key.';
export const KEY_WRONG = 'That key did not work. Check it and try again.';

function driveUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/** The footer's version line (#512): "0.1.0 · a1b2c3d" when the build
 * knows its commit, "0.1.0" alone (no dangling separator) when it does
 * not. Pure, unit-tested without rendering anything. */
export function formatVersion(version: string, commit: string): string {
  return commit === '' ? version : `${version} · ${commit}`;
}

/** The phone bar: back to Home, no avatar (ST-1, `barHasAvatar`). */
const BACK = <BackLink href="/" label="Home" />;

/**
 * "Use your own Claude key" (R-ST-4 with the owner review's `send` mode):
 * the Composer, one row, a password field with the mic, the arrow "Save
 * the key" once it holds text; no separate Save button. A saved key shows
 * the line "Saved. …" and a "Clear" link that asks first; a key the
 * Worker refuses shows "That key did not work. …".
 */
function ApiKeyBox({ me }: { me: Me }): JSX.Element {
  const { setMe } = useSession();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const demo = isDemo();

  const save = async (typed: string): Promise<void> => {
    const apiKey = typed.trim();
    if (apiKey === '' || demo) return;
    setBusy(true);
    setError(null);
    try {
      const { hasApiKey } = await updateSettings({ apiKey });
      setMe({ ...me, hasApiKey });
      setValue('');
    } catch (err) {
      // A refused key is the person's to fix; anything else is ours.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        console.error(err);
        setError(KEY_WRONG);
      } else {
        setError(toMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const clear = async (): Promise<void> => {
    setConfirming(false);
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

  const hint = !demo && me.hasApiKey && value === '' ? KEY_SAVED : null;

  return (
    <div class="settings-field settings-key">
      <p class="settings-row-label" id="api-key-label">
        Use your own Claude key
      </p>
      <p class="settings-hint">Runs Bower on your own Claude billing.</p>
      <Composer
        mode="send"
        rows={1}
        id="api-key"
        label="Use your own Claude key"
        placeholder="sk-ant-…"
        inputType="password"
        value={value}
        onChange={(next) => {
          setValue(next);
          setError(null);
        }}
        onCommit={(typed) => void save(typed)}
        commitLabel="Save the key"
        sending={busy}
        error={error}
        hint={hint}
        disabled={demo}
      />
      {demo && <p class="settings-note">{NOT_IN_DEMO}</p>}
      {me.hasApiKey && !demo && (
        <button
          type="button"
          class="settings-link"
          disabled={busy}
          onClick={() => {
            setConfirming(true);
          }}
        >
          Clear
        </button>
      )}
      {confirming && (
        <Confirm
          action="clearKey"
          onConfirm={() => void clear()}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      )}
    </div>
  );
}

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePref; label: string }> =
  [
    { value: 'system', label: 'Match my device' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

/** Look (R-SEG-1, K-21): the one segmented control. */
function LookSection(): JSX.Element {
  const [theme, setThemeState] = useState<ThemePref>(() => getPref('theme'));

  return (
    <div class="settings-section">
      <h2>Look</h2>
      <Segmented
        label="Look"
        outlined
        options={THEME_OPTIONS}
        value={theme}
        onChange={(value) => {
          setThemeState(value);
          setTheme(value);
        }}
      />
    </div>
  );
}

/**
 * The "Ping me when it is done" switch: reflects the browser's actual
 * subscription state (`currentPushState()`, checked once on mount) rather
 * than only the local preference, since the two can drift (permission
 * revoked elsewhere, a subscription that expired). Calls
 * `enablePush()`/`disablePush()` only on the person's own toggle (R-API-16)
 * and keeps `notifyOnFinish` in sync so other screens can read it.
 */
function NotificationsToggle(): JSX.Element {
  const [state, setState] = useState<'on' | 'off'>(() =>
    getPref('notifyOnFinish') ? 'on' : 'off',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [support] = useState(() => currentPushSupport());

  // Skips the browser subscription check entirely in the demo: every hook
  // above still runs unconditionally (rules of hooks), this just never
  // subscribes to anything real.
  useEffect(() => {
    if (isDemo()) return;
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

  if (isDemo()) {
    return (
      <Toggle
        label="Ping me when it is done"
        hint={NOT_IN_DEMO}
        checked={false}
        disabled
        onChange={() => {
          /* not in the demo */
        }}
      />
    );
  }

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
        label="Ping me when it is done"
        hint={
          support === 'needs-install'
            ? 'Add Bower to your Home Screen first to get notifications.'
            : 'Notifications on this device'
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
 * "Let Bower look things up on the web" (#374): the user's own switch,
 * stored by the Worker (`PATCH /settings`) and sent with every run. Off by
 * default; a run gets the web tools only when the instance allows them too.
 */
function WebLookupToggle({ me }: { me: Me }): JSX.Element {
  const { setMe } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (checked: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const { allowWeb } = await updateSettings({ allowWeb: checked });
      setMe({ ...me, allowWeb: allowWeb === true });
    } catch (err) {
      console.error(err);
      setError('Could not change web lookups.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Toggle
        label="Let Bower look things up on the web"
        hint="Off, Bower only reads what you gave it. On, it may search the web to fill in what a document leaves out."
        checked={me.allowWeb === true}
        disabled={busy}
        onChange={(checked) => void toggle(checked)}
      />
      {error && <p class="settings-error">{error}</p>}
    </>
  );
}

/** A row that opens something: label, hint and the chevron (52 high). */
function LinkRow({
  label,
  hint,
  disabled = false,
  onClick,
}: {
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      class="settings-row settings-link-row"
      disabled={disabled}
      onClick={onClick}
    >
      <span class="settings-row-text">
        <span class="settings-row-label">{label}</span>
        <span class="settings-hint">{hint}</span>
      </span>
      <IconChevronRight />
    </button>
  );
}

/**
 * "Update Bower's rules (vN → vM)" (#197), shown only when the Bower
 * folder's rulebook is older than the one compiled into the app. The
 * template's version comes from a lazily loaded chunk
 * (`rulebook-template.ts`), so its text never weighs on startup.
 */
function UpdateRulesRow(): JSX.Element {
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
        <LinkRow
          label={`Update Bower's rules (v${vaultVersion} → v${templateVersion})`}
          hint="Replaces Bower's rulebook with the latest one; rules you added to it move to Your rules, and About me is left alone."
          disabled={busy}
          onClick={() => void update()}
        />
      )}
      {done && <p class="settings-note">{done}</p>}
      {error && <p class="settings-error">{error}</p>}
    </>
  );
}

/** Settings › Bower (S-ST-4): the rulebook update row when it is behind,
 * and "Tell Bower about yourself again". */
function BowerSection(): JSX.Element {
  const { route } = useLocation();

  return (
    <div class="settings-section">
      <h2>Bower</h2>
      <UpdateRulesRow />
      <LinkRow
        label="Tell Bower about yourself again"
        hint="The four first-run questions, again; About me and Your rules keep everything else you have added."
        onClick={() => route('/onboarding?step=interview&from=settings')}
      />
    </div>
  );
}

/** Learn Bower (S-ST-5, K-30): the intro, the tour, the examples and the
 * things you can ask. */
function LearnSection(): JSX.Element {
  const { route } = useLocation();
  const rows: readonly { label: string; hint: string; go: () => void }[] = [
    {
      label: 'What is Bower',
      hint: 'The intro: five screens',
      go: () => route('/welcome?from=settings'),
    },
    {
      label: 'Show me around',
      hint: 'The tour of the app',
      go: () => {
        replayTour();
        route('/');
      },
    },
    {
      label: 'Examples and use cases',
      hint: 'What people use Bower for',
      go: () => route(LEARN_PATH),
    },
    {
      label: 'Things you can ask',
      hint: 'Ideas for rules, jobs and questions',
      go: () => route(IDEAS_PATH),
    },
  ];
  return (
    <div class="settings-section">
      <h2>Learn Bower</h2>
      {rows.map((row) => (
        <LinkRow
          key={row.label}
          label={row.label}
          hint={row.hint}
          onClick={row.go}
        />
      ))}
    </div>
  );
}

/** "Dictation language: Match my device", with a small menu to change it (R-DICT-3). */
function DictationLanguageRow(): JSX.Element {
  const [lang, setLang] = useState(() => getPref('dictationLang'));

  return (
    <label class="settings-row settings-row-select">
      <span class="settings-row-text">
        <span class="settings-row-label">Dictation language</span>
        <span class="settings-hint">
          What the microphone listens for when you dictate.
        </span>
      </span>
      {/* ST-Bot: a compact select button; the native select sits over it,
          see-through, so the keyboard, screen readers and the phone's own
          picker all work as before. */}
      <span class="settings-select-wrap">
        <span class="settings-select-face" aria-hidden="true">
          {lang === '' ? 'Match my device' : languageLabel(lang)}
        </span>
        <select
          class="settings-select"
          value={lang}
          onChange={(e) => {
            const next = e.currentTarget.value;
            setLang(next);
            setPref('dictationLang', next);
          }}
        >
          <option value="">Match my device</option>
          {DICTATION_LANGUAGES.map((tag) => (
            <option key={tag} value={tag}>
              {languageLabel(tag)}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

/**
 * "Sign out everywhere" (ST-3, R-ST-5): a row with a secondary button that
 * asks first (§3.39), then ends every session of the account on the
 * Worker and signs this device out the ordinary way. A 401 means this
 * session had already ended, so the device is signed out all the same.
 */
function SignOutEverywhereRow(): JSX.Element {
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demo = isDemo();

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
  // Like "Sign out": unfinished uploads ask first.
  const { request, dialog } = useGuardedSignOut(signOutEverywhere);

  return (
    <>
      <div class="settings-row settings-row-action">
        <span class="settings-row-text">
          <span class="settings-row-label">Sign out everywhere</span>
          <span class="settings-hint">
            Ends every browser and device signed in to this account.
          </span>
        </span>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          disabled={busy || demo}
          onClick={() => {
            setConfirming(true);
          }}
        >
          Sign out everywhere
        </button>
      </div>
      {error && <p class="settings-error">{error}</p>}
      {confirming && (
        <Confirm
          action="signOutEverywhere"
          onConfirm={() => {
            setConfirming(false);
            request();
          }}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      )}
      {dialog}
    </>
  );
}

/**
 * Settings › Advanced (S-ST-6, S-ST-7): the Claude key box, "Show Bower's
 * own files" (the same `showAppFiles` pref as the explorer's), the
 * dictation language and Sign out everywhere.
 */
function AdvancedSection({ me }: { me: Me }): JSX.Element {
  const [showAppFiles, setShowAppFiles] = useState(() =>
    getPref('showAppFiles'),
  );

  return (
    <div class="settings-section">
      <h2>Advanced</h2>

      <ApiKeyBox me={me} />

      <Toggle
        label="Show Bower's own files"
        hint="Rulebook, your rules, about me, catalogue, journal, instruction notes, health reports and other files Bower keeps for itself, at the bottom of your folders."
        checked={showAppFiles}
        onChange={(checked) => {
          setShowAppFiles(checked);
          setPref('showAppFiles', checked);
        }}
      />

      <DictationLanguageRow />

      <SignOutEverywhereRow />
    </div>
  );
}

/** Sign out of this device only: a plain button on its own. */
function SignOutSection(): JSX.Element {
  const { signOut } = useSession();
  // With files still uploading, Sign out first asks (R-UPL-4).
  const { request, dialog } = useGuardedSignOut(signOut);

  return (
    <div class="settings-section">
      <button
        type="button"
        class="btn btn-secondary btn-block settings-sign-out"
        onClick={request}
      >
        Sign out
      </button>
      {dialog}
    </div>
  );
}

/** "Delete my Bower account (your Bower folder stays)" (K-30, C-6): a red
 * text link that asks first (§3.39). */
function DeleteAccount(): JSX.Element {
  const { signOut } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const demo = isDemo();

  const confirmDelete = async (): Promise<void> => {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      // The account is gone; hand back to the sign-in screen the same way
      // an ordinary sign-out does, forgetting the device too.
      await signOut();
    } catch (err) {
      setError(toMessage(err));
      setBusy(false);
    }
  };

  return (
    <section class="settings-section">
      <button
        type="button"
        class="settings-link-danger"
        disabled={busy || demo}
        onClick={() => {
          setConfirming(true);
        }}
      >
        Delete my Bower account (your Bower folder stays)
      </button>
      {demo && <p class="settings-note">{NOT_IN_DEMO}</p>}
      {error && <p class="settings-error">{error}</p>}
      {confirming && (
        <Confirm
          action="deleteAccount"
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      )}
    </section>
  );
}

export function Settings(): JSX.Element | null {
  const { me } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  useShellSlot('back', BACK);

  if (!me) return null;

  const version = import.meta.env.VITE_APP_VERSION ?? __APP_VERSION__;
  const versionLine = formatVersion(version, __BOWER_COMMIT__);
  const person = personOf(me);

  return (
    <section class="settings page-column">
      <div class="settings-header">
        <PageHeader
          title="Settings"
          crumbs={HOME_CRUMBS}
          more={{
            expanded: menuOpen,
            onClick: () => {
              setMenuOpen((open) => !open);
            },
            name: 'Settings',
          }}
        />
        {menuOpen && (
          <NoteMenu
            kind="settings"
            title="Settings"
            driveIds={
              me.vault === undefined || me.vault === null
                ? {}
                : { root: me.vault.folderId }
            }
            onClose={() => {
              setMenuOpen(false);
            }}
          />
        )}
      </div>

      <div class="settings-section settings-account">
        {/* The same initial as the avatar everywhere (R-ST-2). */}
        <span class="settings-account-avatar" aria-hidden="true">
          {person.initial}
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
              <IconExternalLink /> Drive
            </a>
          )}
          {me.needsReauth && (
            <p class="settings-hint">
              Google access needs to be renewed.{' '}
              <a href={loginUrl()}>Reconnect Google</a>
            </p>
          )}
        </div>
      </div>

      <div class="settings-section">
        <h2>Tidying up</h2>
        <NotificationsToggle />
        <WebLookupToggle me={me} />
      </div>

      <LookSection />

      <BowerSection />
      <LearnSection />

      <AdvancedSection me={me} />

      <SignOutSection />

      <DeleteAccount />

      <p class="settings-footer">
        Bower {versionLine} ·{' '}
        <a
          href="https://github.com/deluispablo/bower"
          target="_blank"
          rel="noopener"
        >
          Source code
        </a>{' '}
        · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
      </p>
    </section>
  );
}
