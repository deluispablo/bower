/**
 * The Ideas screen (#332, spec C.7; board `Phone-Ideas`): grouped example
 * sentences a person can copy into the Bower tab's box. Reached from the
 * Bower tab's "?" tip ("More ideas") and every help sheet's Ideas button.
 * Back goes to the Bower tab, as the board's bar does.
 *
 * Copy is a plain link to `/bower?text=…` (`ideaHref`, `ideas.ts`) — the
 * same prefill link Health's "Ask Bower to fix these" uses — so it fills
 * the box and navigates there without any extra state here.
 */

import type { JSX } from 'preact';

import { BackLink } from '../components/back-link.js';
import { Bird } from '../components/bird.js';
import { IconCopy, IconSparkle } from '../components/icons.js';
import { useShellSlot } from '../components/shell-slots.js';
import { IDEAS, ideaHref } from '../ideas.js';
import type { Idea } from '../ideas.js';
import { BOWER_PATH } from '../shell-routes.js';
import '../styles/ideas.css';

/** The phone top bar (#318): Back to the Bower tab, and the screen's
 * title. Stable elements, so they never refill the shell's slots on a
 * re-render (`shell-slots.ts`). */
const BACK = <BackLink href={BOWER_PATH} label="Bower" />;
const CRUMB = <span class="topbar-title">Ideas</span>;

function IdeaRow({ text, prompt }: Idea): JSX.Element {
  return (
    <li class="idea-row">
      <IconSparkle />
      <span class="idea-text">{text}</span>
      <a class="idea-copy" href={ideaHref(prompt)}>
        <IconCopy />
        Copy
      </a>
    </li>
  );
}

export function Ideas(): JSX.Element {
  useShellSlot('back', BACK);
  useShellSlot('crumb', CRUMB);

  return (
    <section class="ideas-screen page-column">
      <h1 class="screen-title">Ideas</h1>

      <div class="ideas-intro">
        <Bird state="idle" face="curious" size={64} />
        <p class="ideas-bubble">
          Bower does more when you ask. Tap Copy and it goes into the box, ready
          to send.
        </p>
      </div>

      {IDEAS.map((group) => (
        <div key={group.title} class="idea-group">
          <h2 class="idea-group-title">{group.title}</h2>
          <ul class="idea-list">
            {group.ideas.map((idea) => (
              <IdeaRow key={idea.text} text={idea.text} prompt={idea.prompt} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
