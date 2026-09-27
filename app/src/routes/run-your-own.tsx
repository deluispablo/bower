/**
 * "Run your own Bower" (#193, spec §5): the demo build's stand-in for
 * sign-in. Replaces `routes/login.tsx` at `/login` (`app.tsx`'s route
 * line), and the last "What is Bower" page's sign-in CTA
 * (`routes/intro.tsx`) and `routes/not-invited.tsx` fall back to it too —
 * neither screen makes sense once there is no real account to sign into.
 *
 * The demo's `getMe()` always answers as Alex (`demo/api.ts`), so "Explore
 * the demo" only needs to make the session state catch up: `refresh()`
 * re-reads it and the router takes it from there.
 */

import { useLocation } from 'preact-iso';

import { Bird } from '../components/bird.js';
import { IconExternalLink } from '../components/icons.js';
import { markIntroSeen } from '../intro.js';
import { useSession } from '../session.js';
import '../styles/auth.css';
import '../styles/run-your-own.css';

const WHAT_YOU_NEED = [
  'A Google account',
  'Free Cloudflare and GitHub accounts',
  'A Claude subscription or API key',
  'About an hour',
];

/**
 * What it is, what it takes, and the way in — shared by the full screen
 * below and by the intro's last page, which already carries its own
 * heading and bird.
 */
export function RunYourOwnCta() {
  const { refresh } = useSession();
  const { route } = useLocation();
  const aboutUrl = import.meta.env.VITE_ABOUT_URL;

  const explore = async (): Promise<void> => {
    markIntroSeen(localStorage);
    await refresh();
    route('/');
  };

  return (
    <>
      <p class="auth-promise">
        This is a demo: sample notes, nothing saved. Run your own Bower and it
        keeps your own notes tidy in your own Google Drive instead.
      </p>
      <ul class="run-your-own-needs">
        {WHAT_YOU_NEED.map((item) => (
          <li>{item}</li>
        ))}
      </ul>
      <div class="run-your-own-links">
        <a
          href="https://github.com/deluispablo/bower"
          target="_blank"
          rel="noopener"
        >
          <IconExternalLink /> Repository
        </a>
        <a
          href="https://github.com/deluispablo/bower/blob/main/docs/runbook.md"
          target="_blank"
          rel="noopener"
        >
          <IconExternalLink /> Runbook
        </a>
        {aboutUrl !== undefined && aboutUrl !== '' && (
          <a href={aboutUrl} target="_blank" rel="noopener">
            <IconExternalLink /> What is Bower
          </a>
        )}
      </div>
      <div class="auth-actions">
        <button type="button" class="button" onClick={() => void explore()}>
          Explore the demo
        </button>
      </div>
    </>
  );
}

/** The full screen: `/login` in a demo build, and `/not-invited`'s fallback. */
export function RunYourOwn() {
  return (
    <section class="auth-screen">
      <div class="auth-bird auth-bird--ground">
        <Bird state="hello" size={96} />
      </div>
      <div class="auth-heading">
        <h1 class="auth-wordmark">Bower</h1>
      </div>
      <RunYourOwnCta />
    </section>
  );
}
