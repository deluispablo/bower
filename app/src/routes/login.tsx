/**
 * Sign in (spec §6, Login row; #331): the bird saying hello on a ground
 * line, the wordmark, a one-line promise, the Google button, the
 * invited-only note, and links to Privacy and Terms. On desktop
 * `.auth-screen--login` (auth.css) centres the whole block vertically in
 * the viewport; the phone keeps `.auth-screen`'s own top margin.
 */

import { loginUrl } from '../api.js';
import { Bird } from '../components/bird.js';
import { IconGoogle } from '../components/icons.js';
import { LEARN_PATH } from '../learn.js';
import { useSession } from '../session.js';
import '../styles/auth.css';
import '../styles/learn.css';

/** What Sign in says after Delete my account (`/login?deleted=1`). */
export const ACCOUNT_DELETED =
  'Your account is deleted. Your Bower folder is still in your Google Drive.';

export function Login() {
  const { error } = useSession();
  const deleted =
    new URLSearchParams(window.location.search).get('deleted') === '1';

  return (
    <section class="auth-screen auth-screen--login">
      <div class="auth-bird auth-bird--ground">
        <Bird state="hello" size={96} />
      </div>
      <div class="auth-heading">
        <h1 class="auth-wordmark">Bower</h1>
        <p class="auth-promise">
          Your notes, kept tidy, in your own Google Drive.
        </p>
      </div>
      {deleted && (
        <p class="auth-notice" role="status">
          {ACCOUNT_DELETED}
        </p>
      )}
      {error && <p class="auth-error">{error}</p>}
      <a href={loginUrl()} class="button auth-google">
        <IconGoogle />
        Sign in with Google
      </a>
      <a href={LEARN_PATH} class="auth-learn">
        What is Bower? · 2 min
      </a>
      <p class="auth-note">
        Only people the person running this Bower has invited can sign in. Bower
        reads and writes your Bower folder; when you pick files from the rest of
        your Drive, it copies them into that folder and never changes the
        originals.
      </p>
      <p class="auth-legal-links">
        <a href="/privacy" class="button-link">
          Privacy
        </a>
        {' · '}
        <a href="/terms" class="button-link">
          Terms
        </a>
      </p>
    </section>
  );
}
