/**
 * Not invited (spec §6, Not invited row): the bird confused, the address
 * that signed in (only from the Worker's one-time `/me` answer, kept in
 * session state; with no session and no such answer it goes to Sign in), who to ask,
 * "Try another account" (Google's account picker) and "Sign out".
 *
 * Never reached in a demo build: the demo has no allowlist, so it falls
 * back to "Run your own Bower" (#193) instead.
 */

import { useLocation } from 'preact-iso';
import { useEffect } from 'preact/hooks';

import { isDemo, loginUrl } from '../api.js';
import { Bird } from '../components/bird.js';
import { useSession } from '../session.js';
import { RunYourOwn } from './run-your-own.js';
import '../styles/auth.css';

export function NotInvited() {
  const { status, notInvitedEmail, signOut } = useSession();
  const { route } = useLocation();
  // No session and no sign-in just turned away (a bookmark, a reload):
  // nothing to explain, so go to Sign in (#1004).
  const stray =
    !isDemo() && status === 'signed-out' && notInvitedEmail === undefined;
  useEffect(() => {
    if (stray) route('/login', true);
  }, [stray]);

  if (isDemo()) return <RunYourOwn />;
  if (stray) return null;

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
