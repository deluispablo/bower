/**
 * Sign in (spec §6, Login row): the bird saying hello on a ground line, the
 * wordmark, a one-line promise, the Google button, the invited-only note,
 * and links to Privacy and Terms.
 */

import { loginUrl } from '../api.js';
import { Bird } from '../components/bird.js';
import { IconGoogle } from '../components/icons.js';
import { useSession } from '../session.js';
import '../styles/auth.css';

export function Login() {
  const { error } = useSession();

  return (
    <section class="auth-screen">
      <div class="auth-bird auth-bird--ground">
        <Bird state="hello" size={96} />
      </div>
      <div class="auth-heading">
        <h1 class="auth-wordmark">Bower</h1>
        <p class="auth-promise">
          Your notes, kept tidy, in your own Google Drive.
        </p>
      </div>
      {error && <p class="auth-error">{error}</p>}
      <a href={loginUrl()} class="button auth-google">
        <IconGoogle />
        Sign in with Google
      </a>
      <p class="auth-note">
        Only people the person running this Bower has invited can sign in. Bower
        reads and writes one folder in your Drive and nothing else.
      </p>
      <p class="auth-legal-links">
        <a href="/privacy" class="button-link">
          Privacy
        </a>
        {' · '}
        <a href="/terms" class="button-link">
          Terms
        </a>
        {' · '}
        <a href="/welcome?from=settings" class="button-link">
          What is Bower?
        </a>
      </p>
    </section>
  );
}
