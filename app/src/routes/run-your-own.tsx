/**
 * "Run your own Bower" (#366, board Demo-RunYourOwn): the demo build's
 * stand-in for sign-in. Replaces `routes/login.tsx` at `/login` (`app.tsx`'s
 * route line), which the demo banner's "Run your own" links to
 * (`components/demo-banner.tsx`), and `routes/not-invited.tsx` falls back
 * to it too. In a demo build both render inside the shell (`shell-routes.ts`),
 * as the board draws it: the demo is always signed in as Alex, so the tabs
 * are the way back.
 *
 * The dancing bird, one paragraph, three rows (one folder in your Drive;
 * your own keys; about an hour), "Read the runbook on GitHub" (the repo's
 * `docs/runbook.md`) and "What is Bower, in nine screens", the intro opened
 * with Close, which comes back here (`introReturnPath`, `intro.ts`).
 */

import type { JSX } from 'preact';

import { Bird } from '../components/bird.js';
import { IconClock, IconDrive } from '../components/icons.js';
import '../styles/run-your-own.css';

/** The repository's runbook, where running your own Bower is written up. */
export const RUNBOOK_URL =
  'https://github.com/deluispablo/bower/blob/main/docs/runbook.md';

/** The nine intro pages with Close, back to this screen. */
export const INTRO_FROM_RUN_YOUR_OWN_HREF = '/welcome?from=run-your-own';

/** A key: the board's "Your own keys" row. */
function IconKey(): JSX.Element {
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
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3M15 12v2" />
    </svg>
  );
}

const ROWS = [
  {
    Icon: IconDrive,
    title: 'One folder in your Drive',
    line: 'Plain files; delete the app and it is still there.',
  },
  {
    Icon: IconKey,
    title: 'Your own keys',
    line: "Google sign-in, a Claude subscription, GitHub for the bird's workroom.",
  },
  {
    Icon: IconClock,
    title: 'About an hour',
    line: 'The runbook walks you through it, step by step.',
  },
] as const;

/** `/login` (and `/not-invited`'s fallback) in a demo build. */
export function RunYourOwn(): JSX.Element {
  return (
    <section class="run-your-own">
      <Bird state="showoff" size={120} />
      <h1 class="run-your-own-title">Run your own Bower</h1>
      <p class="run-your-own-lede">
        The demo shows Alex's things. Yours live in your own Google Drive, and
        only you can see them. Bower is free, open source, and runs on free
        tiers; you bring a Google account and a Claude subscription.
      </p>
      <ul class="run-your-own-rows">
        {ROWS.map(({ Icon, title, line }) => (
          <li class="run-your-own-row">
            <span class="run-your-own-icon">
              <Icon />
            </span>
            <span class="run-your-own-text">
              <b>{title}</b>
              <span>{line}</span>
            </span>
          </li>
        ))}
      </ul>
      <a
        class="button run-your-own-runbook"
        href={RUNBOOK_URL}
        target="_blank"
        rel="noopener"
      >
        Read the runbook on GitHub
      </a>
      <a class="run-your-own-intro" href={INTRO_FROM_RUN_YOUR_OWN_HREF}>
        What is Bower, in nine screens
      </a>
    </section>
  );
}
