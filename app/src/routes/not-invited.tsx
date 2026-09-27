/**
 * Not invited (spec §6, Not invited row): the bird confused, the address
 * that signed in (from session state only — never fetched or guessed),
 * who to ask, "Try another account" and "Sign out".
 */

import { loginUrl } from '../api.js';
import { Bird } from '../components/bird.js';
import { useSession } from '../session.js';
import '../styles/auth.css';

export function NotInvited() {
  const { me, signOut } = useSession();

  return (
    <section class="auth-screen">
      <div class="auth-bird">
        <Bird state="confused" size={120} />
      </div>
      <div class="auth-heading">
        <h1>This Bower isn&rsquo;t open to you yet</h1>
        <p class="auth-note">
          {me?.email !== undefined ? (
            <>
              You signed in as <span class="auth-address">{me.email}</span>, but
              that address isn&rsquo;t on the invite list.{' '}
            </>
          ) : (
            "That Google account isn't on the invite list. "
          )}
          Ask the person who runs this Bower to add you, then sign in again.
        </p>
      </div>
      <div class="auth-actions">
        <a href={loginUrl()} class="button">
          Try another account
        </a>
        <button
          type="button"
          class="button-link"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>
    </section>
  );
}
