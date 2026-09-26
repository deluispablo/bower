import { loginUrl } from '../api.js';
import { useSession } from '../session.js';

export function Login() {
  const { error } = useSession();

  return (
    <section class="auth-screen">
      <img src="/logo.svg" alt="Bower" width="64" height="64" />
      <p>Your notes, kept organised.</p>
      {error && <p class="auth-error">{error}</p>}
      <a href={loginUrl()} class="button">
        Sign in with Google
      </a>
    </section>
  );
}
