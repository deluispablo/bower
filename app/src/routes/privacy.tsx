import privacy from '../../../docs/privacy.md?raw';
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
 */
export function Privacy() {
  return (
    <section class="privacy note-view">
      <div class="markdown" dangerouslySetInnerHTML={{ __html: privacyHtml }} />
    </section>
  );
}
