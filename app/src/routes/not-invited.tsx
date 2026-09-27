/**
 * Not invited (spec §6, Not invited row): the bird confused, the address
 * that signed in (only from the Worker's one-time `/me` answer, kept in
 * session state; after a reload it says "that account"), who to ask,
 * "Try another account" (Google's account picker) and "Sign out".
 *
 * Never reached in a demo build: the demo has no allowlist, so it falls
 * back to "Run your own Bower" (#193) instead.
 */

import { isDemo, loginUrl } from '../api.js';
import { Bird } from '../components/bird.js';
import { useSession } from '../session.js';
import { RunYourOwn } from './run-your-own.js';
import '../styles/auth.css';

export function NotInvited() {
  const { notInvitedEmail, signOut } = useSession();

  if (isDemo()) return <RunYourOwn />;

  return (
    <section class="auth-screen">
      <div class="auth-bird">
        <Bird state="confused" size={120} />
      </div>
      <div class="auth-heading">
        <h1>This Bower isn&rsquo;t open to you yet</h1>
        <p class="auth-note">
          {notInvitedEmail !== undefined ? (
            <>
              You signed in as{' '}
              <span class="auth-address">{notInvitedEmail}</span>, but that
              address isn&rsquo;t on the invite list.{' '}
            </>
          ) : (
            "You signed in with that account, but it isn't on the invite list. "
          )}
          Ask the person who runs this Bower to add you, then sign in again.
        </p>
      </div>
      <div class="auth-actions">
        <a href={loginUrl({ selectAccount: true })} class="button">
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
