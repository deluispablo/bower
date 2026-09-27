import terms from '../../../docs/terms.md?raw';
import { IconChevronRight } from '../components/icons.js';
import { renderPlainMarkdown } from '../markdown/render.js';
import '../styles/markdown.css';
import '../styles/privacy.css';

const termsHtml = renderPlainMarkdown(terms);

/**
 * Public, no sign-in required (see `PUBLIC_PATHS` in `session.tsx`): this is
 * the page Google's OAuth consent screen links to alongside Privacy, so it
 * must be reachable before signing in. Renders `docs/terms.md` with the
 * same Markdown pipeline as a note, so the app and the repository never
 * drift apart. Shares `privacy.css` — same reading layout, no new styles.
 *
 * No shell (spec §14, `app.tsx`): this page's own back link takes the place
 * of the header's. It always points at sign-in — signed in, `/login`
 * redirects straight back here to `/` (`decideRedirect`, `session.tsx`).
 */
export function Terms() {
  return (
    <section class="privacy note-view">
      <a href="/login" class="page-bare-back">
        <IconChevronRight />
        <span>Back</span>
      </a>
      <div class="markdown" dangerouslySetInnerHTML={{ __html: termsHtml }} />
    </section>
  );
}
