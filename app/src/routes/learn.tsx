/**
 * Learn Bower (R-LEARN-0 to 3, spec 6.19; boards Learn-375, Learn-1280,
 * Example-FlatHunt-375): what Bower does and what people use it for. Public
 * at `/learn` and `/learn/:example`, signed in or out. Signed in it sits in
 * the shell (Back in the top bar); signed out it is bare and ends with "Sign
 * in with Google" where the tab bar would be (`app.tsx`, `usesShell`).
 * The copy is `learn.ts`'s.
 */

import type { JSX } from 'preact';
import { useRoute } from 'preact-iso';

import { loginUrl } from '../api.js';
import { BackLink } from '../components/back-link.js';
import { FolderMark } from '../components/folder-mark.js';
import { IconChevronRight, IconGoogle } from '../components/icons.js';
import { useShellSlot } from '../components/shell-slots.js';
import { IDEAS_PATH } from '../shell-routes.js';
import {
  ACTS,
  EXAMPLES,
  HOW_IT_WORKS,
  LEARN_EXAMPLES_TITLE,
  LEARN_EXAMPLE_HINT,
  LEARN_HOW_TITLE,
  LEARN_IDEAS,
  LEARN_INTRO_CARD,
  LEARN_LEAD,
  LEARN_PATH,
  LEARN_TITLE,
  exampleHref,
  findExample,
} from '../learn.js';
import { useSession } from '../session.js';
import '../styles/learn.css';

const BACK_TO_SETTINGS = <BackLink href="/settings" label="Settings" />;
const BACK_TO_LEARN = <BackLink href={LEARN_PATH} label={LEARN_TITLE} />;
const CRUMB = <span class="topbar-title">{LEARN_TITLE}</span>;

/** In the shell the phone's top bar carries the title (`.screen-title` shows on
 * desktop only); the bare page has no bar, so its heading always shows. */
function titleClass(signedIn: boolean): string {
  return signedIn ? 'screen-title' : 'learn-title';
}

/** The intro from here: Close goes back to a page that links to Learn. */
function introHref(signedIn: boolean): string {
  return signedIn ? '/welcome?from=settings' : '/welcome?from=login';
}

/** Signed out: the bare page's own Back, and at the end the sign-in. */
function BareBack({ href, label }: { href: string; label: string }): JSX.Element {
  return (
    <a href={href} class="page-bare-back">
      <IconChevronRight />
      <span>{label}</span>
    </a>
  );
}

function SignInEnd(): JSX.Element {
  return (
    <div class="learn-signin">
      <a href={loginUrl()} class="button auth-google">
        <IconGoogle />
        Sign in with Google
      </a>
    </div>
  );
}

function RowLink({
  href,
  title,
  hint,
  lead,
}: {
  href: string;
  title: string;
  hint: string;
  lead?: JSX.Element;
}): JSX.Element {
  return (
    <a class="learn-row" href={href}>
      {lead}
      <span class="learn-row-text">
        <span class="learn-row-title">{title}</span>
        <span class="learn-row-hint">{hint}</span>
      </span>
      <IconChevronRight />
    </a>
  );
}

export function Learn(): JSX.Element {
  const { status } = useSession();
  const signedIn = status === 'signed-in';
  useShellSlot('back', BACK_TO_SETTINGS);
  useShellSlot('crumb', CRUMB);

  return (
    <section class="learn-screen page-column">
      {!signedIn && <BareBack href="/login" label="Sign in" />}
      <h1 class={titleClass(signedIn)}>{LEARN_TITLE}</h1>
      <p class="learn-lead">{LEARN_LEAD}</p>

      <RowLink
        href={introHref(signedIn)}
        title={LEARN_INTRO_CARD.title}
        hint={LEARN_INTRO_CARD.hint}
      />

      <h2 class="learn-heading">{LEARN_HOW_TITLE}</h2>
      <ul class="learn-how">
        {HOW_IT_WORKS.map((card) => (
          <li key={card.title} class="learn-how-card">
            <span class="learn-row-title">{card.title}</span>
            <span class="learn-row-hint">{card.body}</span>
          </li>
        ))}
      </ul>

      <h2 class="learn-heading">{LEARN_EXAMPLES_TITLE}</h2>
      <ul class="learn-examples">
        {EXAMPLES.map((example) => (
          <li key={example.slug}>
            <RowLink
              href={exampleHref(example.slug)}
              title={example.title}
              hint={example.blurb}
              lead={<FolderMark kind={example.kind} size={28} />}
            />
          </li>
        ))}
      </ul>

      {signedIn && (
        <>
          <h2 class="learn-heading">{LEARN_IDEAS.title}</h2>
          <RowLink
            href={IDEAS_PATH}
            title={LEARN_IDEAS.title}
            hint={LEARN_IDEAS.hint}
          />
        </>
      )}

      {!signedIn && <SignInEnd />}
    </section>
  );
}

export function LearnExample(): JSX.Element {
  const { status } = useSession();
  const { params } = useRoute();
  const signedIn = status === 'signed-in';
  useShellSlot('back', BACK_TO_LEARN);
  useShellSlot('crumb', CRUMB);
  const example = findExample(params.example);

  if (example === undefined) {
    return (
      <section class="learn-screen page-column">
        <BareBack href={LEARN_PATH} label={LEARN_TITLE} />
        <h1 class={titleClass(signedIn)}>Example not found</h1>
        <p class="learn-lead">That example does not exist.</p>
      </section>
    );
  }

  return (
    <section class="learn-screen page-column">
      {!signedIn && <BareBack href={LEARN_PATH} label={LEARN_TITLE} />}
      <div class="learn-example-head">
        <FolderMark kind={example.kind} size={40} />
        <div>
          <h1 class={titleClass(signedIn)}>{example.title}</h1>
          <p class="learn-lead">{example.blurb}</p>
        </div>
      </div>

      {ACTS.map((act) => (
        <div key={act.id} class="learn-act">
          <h2 class="learn-heading">{act.title}</h2>
          <ul class="learn-act-list">
            {example.acts[act.id].map((claim) => (
              <li key={claim.text} class="learn-act-item">
                {claim.text}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p class="learn-hint">{LEARN_EXAMPLE_HINT}</p>
      {!signedIn && <SignInEnd />}
    </section>
  );
}
