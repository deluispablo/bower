import privacy from '../../../docs/privacy.md?raw';
import { IconChevronRight } from '../components/icons.js';
import { renderPlainMarkdown } from '../markdown/render.js';
import '../styles/markdown.css';
import '../styles/privacy.css';

const privacyHtml = renderPlainMarkdown(privacy);

/**
 * Public, no sign-in required (see `PUBLIC_PATHS` in `session.tsx`): this is
 * the page Google's OAuth consent screen links to, so it must be reachable
 * before signing in. Renders `docs/privacy.md` with the same Markdown
 * pipeline as a note, so the app and the repository never drift apart —
 * restyled in #148 (`styles/privacy.css`), the copy itself untouched.
 *
 * No shell (spec §14, `app.tsx`): this page's own back link takes the place
 * of the header's. It always points at sign-in — signed in, `/login`
 * redirects straight back here to `/` (`decideRedirect`, `session.tsx`).
 */
export function Privacy() {
  return (
    <section class="privacy note-view">
      <a href="/login" class="page-bare-back">
        <IconChevronRight />
        <span>Back</span>
      </a>
      <div class="markdown" dangerouslySetInnerHTML={{ __html: privacyHtml }} />
    </section>
  );
}
