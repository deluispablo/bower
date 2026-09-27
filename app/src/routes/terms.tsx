import terms from '../../../docs/terms.md?raw';
import { IconChevronRight } from '../components/icons.js';
import { renderPlainMarkdown } from '../markdown/render.js';
import { useSession } from '../session.js';
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
 * of the header's (#313, 6.3.4). With no session it goes to `/login` — the
 * only place a signed-out visitor could have come from (Google's consent
 * screen, or the sign-in screen itself); signed in, it steps back through
 * browser history to wherever it was actually opened from (Settings, most
 * often), rather than always bouncing to a now-signed-out `/login`.
 */
export function Terms() {
  const { status } = useSession();

  return (
    <section class="privacy note-view">
      {status === 'signed-in' ? (
        <button
          type="button"
          class="page-bare-back"
          onClick={() => {
            history.back();
          }}
        >
          <IconChevronRight />
          <span>Back</span>
        </button>
      ) : (
        <a href="/login" class="page-bare-back">
          <IconChevronRight />
          <span>Back</span>
        </a>
      )}
      <div class="markdown" dangerouslySetInnerHTML={{ __html: termsHtml }} />
    </section>
  );
}
