/**
 * Not found (spec §6, default row): the bird confused, one sentence, and
 * two ways out — search, or home. "Search for it" is the `/search` route
 * (`routes/search.tsx`): it opens the quick switcher (#142) and replaces
 * itself with Home.
 */

import { Bird } from '../components/bird.js';
import '../styles/auth.css';

export function NotFound() {
  return (
    <section class="auth-screen page-column">
      <div class="auth-bird">
        <Bird state="confused" size={120} />
      </div>
      <div class="auth-heading">
        <h1>I can&rsquo;t find that note</h1>
        <p class="auth-note">
          It isn&rsquo;t in your Bower folder any more. Maybe it moved, or the
          link is old.
        </p>
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
