/**
 * "What is Bower" (#207, spec §14): four pages in a horizontal CSS
 * scroll-snap track. Shown once per device, before the sign-in, to a
 * signed-out visitor on `/` or `/login` (`session.tsx`'s `decideRedirect`,
 * gated by `introSeen()` in `intro.ts`); reachable again any time from
 * Settings › Advanced › "What is Bower" and from the sign-in's "What is
 * Bower?" link, both as `/welcome?from=settings` (Close and Done instead of
 * Skip and Sign in with Google).
 *
 * Swiping moves the track on touch; the prev/next buttons and the arrow
 * keys move it everywhere. All decoration is CSS transform/opacity only
 * (`styles/intro.css`), holding its resting frame under
 * `prefers-reduced-motion: reduce`. The copy is `intro.ts`'s, verbatim from
 * the design boards (`docs/design/screens/Intro-1.dc.html` to `Intro-4`).
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { loginUrl } from '../api.js';
import { Bird } from '../components/bird.js';
import { IconClose } from '../components/icons.js';
import {
  INTRO_DRIVE_ROWS,
  INTRO_INBOX_ITEMS,
  INTRO_INVITED_LINE,
  INTRO_NOT_ROWS,
  INTRO_PAGES,
  INTRO_PARA,
  INTRO_SORTED_FOLDERS,
  INTRO_VERBS,
  markIntroSeen,
} from '../intro.js';
import '../styles/intro.css';

const PAGE_COUNT = INTRO_PAGES.length;

function Page1(): JSX.Element {
  return (
    <>
      <Bird state="looking" size={72} />
      <h1 class="intro-heading">{INTRO_PAGES[0].heading}</h1>
      <p class="intro-body">{INTRO_PAGES[0].body}</p>
      <div class="intro-sort" aria-hidden="true">
        <div class="intro-sort-row">
          {INTRO_INBOX_ITEMS.map((item) => (
            <span class="intro-chip">{item}</span>
          ))}
        </div>
        <div class="intro-sort-row intro-sort-row--out">
          {INTRO_SORTED_FOLDERS.map((folder) => (
            <span class="intro-chip intro-chip--folder">{folder}</span>
          ))}
        </div>
      </div>
    </>
  );
}

function Page2(): JSX.Element {
  return (
    <>
      <h1 class="intro-heading">{INTRO_PAGES[1].heading}</h1>
      <ul class="intro-verbs">
        {INTRO_VERBS.map((item) => (
          <li class="intro-verb">
            <b>{item.verb}</b> {item.detail}
          </li>
        ))}
      </ul>
    </>
  );
}

function Page3(): JSX.Element {
  return (
    <>
      <h1 class="intro-heading">{INTRO_PAGES[2].heading}</h1>
      <p class="intro-body">{INTRO_PAGES[2].body}</p>
      <div class="intro-drive" aria-hidden="true">
        <div class="intro-drive-window">
          <span class="intro-drive-title">In the app</span>
          {INTRO_DRIVE_ROWS.map((row) => (
            <span class="intro-drive-row">{row}</span>
          ))}
        </div>
        <div class="intro-drive-window">
          <span class="intro-drive-title">In your Drive</span>
          {INTRO_DRIVE_ROWS.map((row) => (
            <span class="intro-drive-row">{row}</span>
          ))}
        </div>
      </div>
      <ul class="intro-not-rows">
        {INTRO_NOT_ROWS.map((row) => (
          <li>{row}</li>
        ))}
      </ul>
    </>
  );
}

interface Page4Props {
  fromSettings: boolean;
  onFinish: () => void;
}

function Page4({ fromSettings, onFinish }: Page4Props): JSX.Element {
  return (
    <>
      <h1 class="intro-heading">{INTRO_PAGES[3].heading}</h1>
      <p class="intro-body">{INTRO_PAGES[3].body}</p>
      <ul class="intro-para">
        {INTRO_PARA.map((item) => (
          <li class="intro-para-item">
            <span class="intro-para-letter" style={{ background: item.color }}>
              {item.letter}
            </span>
            <span class="intro-para-text">
              <b>{item.title}</b>
              <span>{item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {fromSettings ? (
        <button type="button" class="button intro-cta" onClick={onFinish}>
          Done
        </button>
      ) : (
        <>
          <a
            href={loginUrl()}
            class="button intro-cta"
            onClick={() => markIntroSeen(localStorage)}
          >
            Sign in with Google
          </a>
          <p class="intro-invited">{INTRO_INVITED_LINE}</p>
        </>
      )}
    </>
  );
}

/** Whether the system asks for reduced motion; matches `components/bird.tsx`. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function Intro() {
  const { query, route } = useLocation();
  const fromSettings = query.from === 'settings';
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  // Follows a swipe (not only Next/Back) so the dots and the "N of 4"
  // label stay right, reading the panel nearest the track's scroll offset.
  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;
    function onScroll(): void {
      if (track === null || track.clientWidth === 0) return;
      const index = Math.round(track.scrollLeft / track.clientWidth);
      setPage(Math.min(PAGE_COUNT - 1, Math.max(0, index)));
    }
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => track.removeEventListener('scroll', onScroll);
  }, []);

  function goTo(index: number): void {
    const track = trackRef.current;
    if (track === null) return;
    const clamped = Math.min(PAGE_COUNT - 1, Math.max(0, index));
    track.scrollTo({
      left: clamped * track.clientWidth,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    setPage(clamped);
  }

  function finish(): void {
    markIntroSeen(localStorage);
    route(fromSettings ? '/settings' : '/login');
  }

  function onKeyDown(event: JSX.TargetedKeyboardEvent<HTMLElement>): void {
    if (event.key === 'ArrowRight') goTo(page + 1);
    else if (event.key === 'ArrowLeft') goTo(page - 1);
  }

  return (
    <section class="intro" onKeyDown={onKeyDown}>
      <div class="intro-bar">
        <div class="intro-dots" role="presentation">
          {INTRO_PAGES.map((_, index) => (
            <span
              class={
                index === page ? 'intro-dot intro-dot--active' : 'intro-dot'
              }
            />
          ))}
        </div>
        {fromSettings ? (
          <button
            type="button"
            class="intro-icon-button"
            aria-label="Close"
            onClick={finish}
          >
            <IconClose />
          </button>
        ) : (
          <button type="button" class="button-link intro-skip" onClick={finish}>
            Skip
          </button>
        )}
      </div>

      <div class="intro-viewport">
        <button
          type="button"
          class="intro-arrow intro-arrow--prev"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => goTo(page - 1)}
        />
        <div class="intro-track" ref={trackRef}>
          <section
            class="intro-page"
            aria-label={`What is Bower, 1 of ${PAGE_COUNT}`}
          >
            <Page1 />
            <button
              type="button"
              class="button intro-next"
              onClick={() => goTo(1)}
            >
              Next
            </button>
          </section>
          <section
            class="intro-page"
            aria-label={`What is Bower, 2 of ${PAGE_COUNT}`}
          >
            <Page2 />
            <button
              type="button"
              class="button intro-next"
              onClick={() => goTo(2)}
            >
              Next
            </button>
          </section>
          <section
            class="intro-page"
            aria-label={`What is Bower, 3 of ${PAGE_COUNT}`}
          >
            <Page3 />
            <button
              type="button"
              class="button intro-next"
              onClick={() => goTo(3)}
            >
              Next
            </button>
          </section>
          <section
            class="intro-page"
            aria-label={`What is Bower, 4 of ${PAGE_COUNT}`}
          >
            <Page4 fromSettings={fromSettings} onFinish={finish} />
          </section>
        </div>
        <button
          type="button"
          class="intro-arrow intro-arrow--next"
          aria-label="Next page"
          disabled={page === PAGE_COUNT - 1}
          onClick={() => goTo(page + 1)}
        />
      </div>
    </section>
  );
}
