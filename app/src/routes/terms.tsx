import terms from '../../../docs/terms.md?raw';
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
 */
export function Terms() {
  return (
    <section class="privacy note-view">
      <div class="markdown" dangerouslySetInnerHTML={{ __html: termsHtml }} />
    </section>
  );
}
