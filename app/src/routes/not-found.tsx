/**
 * Not found (spec §6, default row; Phone-NotFound board): the bird
 * confused, one heading, one sentence, and two ways out — search, or home —
 * for whichever kind of thing was not where a link said it would be (#504).
 * One screen (the board has just the one), the sentence per `kind`:
 * `routes/note.tsx` for a missing note, `routes/folder.tsx` for an unknown
 * folder, `routes/file.tsx` for a missing file (#529), and `app.tsx`'s
 * catch-all route for any other unknown URL. "Search for it" is the
 * `/search` route (`routes/search.tsx`): it opens the quick switcher
 * (#142) and replaces itself with Home.
 */

import { Bird } from '../components/bird.js';
import { useTitle } from '../use-title.js';
import '../styles/auth.css';

export type NotFoundKind = 'note' | 'folder' | 'file' | 'page';

const SENTENCE: Readonly<Record<NotFoundKind, string>> = {
  note: "It isn't in your Bower folder any more. Maybe it moved, or the link is old.",
  folder:
    "This folder isn't in your Bower folder any more. Maybe it moved, or the link is old.",
  file: "It isn't in your Bower folder any more. Maybe it moved, or the link is old.",
  page: "That page doesn't exist. Maybe the link is old, or it was never there.",
};

interface NotFoundProps {
  /** Defaults to the generic "page" sentence for any other not-found
   * case. */
  kind?: NotFoundKind;
}

export function NotFound({ kind = 'page' }: NotFoundProps) {
  useTitle('Page not found');
  return (
    <section class="auth-screen page-column">
      <div class="auth-bird">
        <Bird state="confused" size={120} />
      </div>
      <div class="auth-heading">
        <h1>I can&rsquo;t find that</h1>
        <p class="auth-note">{SENTENCE[kind]}</p>
      </div>
      <div class="auth-actions">
        <a href="/search" class="button">
          Search for it
        </a>
        <a href="/" class="button-link">
          Go home
        </a>
      </div>
    </section>
  );
}
