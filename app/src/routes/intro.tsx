/**
 * "What is Bower" (#207, #796): five true pages in a horizontal CSS
 * scroll-snap track, one idea each. Shown once per device, before the
 * sign-in, to a signed-out visitor (`session.tsx`'s `decideRedirect`, gated
 * by `introSeen()` in `intro.ts`). Reachable again any time from Settings
 * and from the sign-in's "What is Bower?" link (`/welcome?from=settings` or
 * `from=login`: Close and Done instead of Skip and Sign in with Google).
 *
 * The page is in the URL (`?page=3`, clamped to 1 to 5), so browser back goes
 * to the previous page and a reload resumes. Next, Back and a swipe push a
 * history entry; Skip, Close and the first load replace it. Focus moves to
 * the new page's `h1` (`tabindex="-1"`), the other pages are `inert`, and a
 * polite status next to the dots says "2 of 5". The seen flag is set on Skip,
 * Close and on reaching page 5 through the controls, never by typing
 * `?page=5`.
 *
 * In a demo build (#361) the same pages carry the demo banner on top and
 * "Try the demo" where the app says Sign in with Google.
 *
 * The illustrations are CSS only and static: nothing loops, so reduced
 * motion has nothing to change. The copy is `intro.ts`'s.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { isDemo, loginUrl } from '../api.js';
import { Bird, BowerMark } from '../components/bird.js';
import { DemoBanner } from '../components/demo-banner.js';
import { IconClose, IconFolder, IconNote } from '../components/icons.js';
import {
  INTRO_FOLDER,
  INTRO_JOIN,
  INTRO_LEARN_LABEL,
  INTRO_NOTE,
  INTRO_PAGES,
  INTRO_PAGE_COUNT,
  INTRO_PILE,
  INTRO_REQUEST,
  introPageFromQuery,
  introPageLabel,
  introReturnPath,
  markIntroSeen,
  type IntroPage,
} from '../intro.js';
import '../styles/intro.css';

const LAST = INTRO_PAGE_COUNT - 1;

/** Whether the system asks for reduced motion; matches `components/bird.tsx`. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** `/welcome?...` for a 0-based page, keeping every other query parameter. */
function urlForPage(index: number): string {
  const params = new URLSearchParams(window.location.search);
  params.set('page', String(index + 1));
  return `/welcome?${params.toString()}`;
}

/** The 0-based page the address bar names right now. */
function pageFromLocation(): number {
  return introPageFromQuery(
    new URLSearchParams(window.location.search).get('page'),
  );
}

function Art({ children }: { children: ComponentChildren }): JSX.Element {
  return (
    <div class="intro-art" aria-hidden="true">
      {children}
    </div>
  );
}

function Page1Art(): JSX.Element {
  return (
    <Art>
      <div class="intro-hero-bird">
        <Bird state="looking" size={96} />
      </div>
      <div class="intro-card">
        <span class="intro-kicker">{INTRO_PILE.title}</span>
        <p class="intro-pile-line">{INTRO_PILE.line}</p>
        <ul class="intro-rows">
          {INTRO_PILE.files.map((name) => (
            <li class="intro-row">
              <IconNote />
              <span>{name}</span>
            </li>
          ))}
        </ul>
        <span class="intro-fake-button">{INTRO_PILE.button}</span>
      </div>
      <div class="intro-chips">
        {INTRO_PILE.chips.map((chip) => (
          <span class="intro-chip" style={{ background: chip.color }}>
            {chip.name}
          </span>
        ))}
      </div>
    </Art>
  );
}

function Page2Art(): JSX.Element {
  return (
    <Art>
      <div class="intro-card intro-original">
        <IconNote />
        <span>
          <b>{INTRO_NOTE.original}</b>
          <br />
          <span class="intro-muted">{INTRO_NOTE.originalCaption}</span>
        </span>
      </div>
      <div class="intro-card intro-note">
        <b class="intro-note-title">{INTRO_NOTE.title}</b>
        <p>{INTRO_NOTE.summary}</p>
        <ul class="intro-facts">
          {INTRO_NOTE.facts.map((fact, index) => (
            <li>
              <span class={`intro-origin intro-origin--${index}`} />
              <span class="intro-muted">{fact.label}</span>
              <b>{fact.value}</b>
            </li>
          ))}
        </ul>
        <p class="intro-check">{INTRO_NOTE.check}</p>
      </div>
    </Art>
  );
}

function Page3Art(): JSX.Element {
  return (
    <Art>
      <div class="intro-join">
        {INTRO_JOIN.notes.map((name) => (
          <div class="intro-card intro-join-note">
            <IconNote />
            <b>{name}</b>
          </div>
        ))}
      </div>
      <div class="intro-join-line">
        <Bird state="flying" size={48} />
      </div>
      <div class="intro-card intro-join-result">{INTRO_JOIN.result}</div>
      <p class="intro-muted intro-join-disagree">{INTRO_JOIN.disagree}</p>
    </Art>
  );
}

function Page4Art(): JSX.Element {
  return (
    <Art>
      <p class="intro-bubble">{INTRO_REQUEST.bubble}</p>
      <p class="intro-waits">{INTRO_REQUEST.waits}</p>
      <div class="intro-card intro-bar-done">
        <b>{INTRO_REQUEST.barTitle}</b>
        <ul class="intro-counts">
          {INTRO_REQUEST.counts.map((count) => (
            <li>{count}</li>
          ))}
        </ul>
      </div>
    </Art>
  );
}

function Page5Art(): JSX.Element {
  return (
    <Art>
      <div class="intro-places">
        {INTRO_FOLDER.places.map((place) => (
          <div class="intro-card intro-place">
            <b>{place}</b>
            <ul class="intro-rows">
              {INTRO_FOLDER.rows.map((name) => (
                <li class="intro-row">
                  <IconFolder />
                  <span>{name}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p class="intro-caption">{INTRO_FOLDER.caption}</p>
    </Art>
  );
}

const ART: readonly (() => JSX.Element)[] = [
  Page1Art,
  Page2Art,
  Page3Art,
  Page4Art,
  Page5Art,
];

interface LastActionsProps {
  fromApp: boolean;
  onDone: () => void;
}

/** Page 5's buttons: sign in (or Done from inside the app) and Learn Bower. */
function LastActions({ fromApp, onDone }: LastActionsProps): JSX.Element {
  const { route } = useLocation();
  return (
    <div class="intro-actions">
      {fromApp ? (
        <button type="button" class="button intro-cta" onClick={onDone}>
          Done
        </button>
      ) : isDemo() ? (
        <button
          type="button"
          class="button intro-cta"
          onClick={() => {
            markIntroSeen(localStorage);
            route('/');
          }}
        >
          Try the demo
        </button>
      ) : (
        <a
          href={loginUrl()}
          class="button intro-cta"
          onClick={() => markIntroSeen(localStorage)}
        >
          Sign in with Google
        </a>
      )}
      <a href="/learn" class="intro-learn">
        {INTRO_LEARN_LABEL}
      </a>
    </div>
  );
}

export function Intro(): JSX.Element {
  const { query, route } = useLocation();
  // Opened from inside the app (Settings, the sign-in, the demo's Run your
  // own): Close and Done, back to where it came from.
  const returnTo = introReturnPath(query.from);
  const fromApp = returnTo !== null;
  const trackRef = useRef<HTMLDivElement>(null);
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);
  const focusPending = useRef(false);
  const [page, setPage] = useState(() => introPageFromQuery(query.page));
  const pageRef = useRef(page);
  pageRef.current = page;

  function scrollToPage(index: number, smooth: boolean): void {
    const track = trackRef.current;
    if (track === null || typeof track.scrollTo !== 'function') return;
    track.scrollTo({
      left: index * track.clientWidth,
      behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto',
    });
  }

  // The first load replaces its entry with the clamped, complete address and
  // opens on the page it names.
  useEffect(() => {
    window.history.replaceState(window.history.state, '', urlForPage(page));
    scrollToPage(page, false);
    // Once, on mount.
  }, []);

  // Focus follows Next, Back, a swipe and browser back (never the first load).
  useLayoutEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    headings.current[page]?.focus({ preventScroll: true });
  }, [page]);

  // Browser back and forward: show the page the address names.
  useEffect(() => {
    function onPop(): void {
      const index = pageFromLocation();
      if (index === pageRef.current) return;
      focusPending.current = true;
      pageRef.current = index;
      setPage(index);
      scrollToPage(index, false);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** Moves to `index` from a control or a swipe: a new history entry. */
  function goTo(index: number, scroll: boolean): void {
    const clamped = Math.min(LAST, Math.max(0, index));
    if (clamped === pageRef.current) return;
    focusPending.current = true;
    pageRef.current = clamped;
    setPage(clamped);
    window.history.pushState(window.history.state, '', urlForPage(clamped));
    if (scroll) scrollToPage(clamped, true);
    // Reaching the last page through the controls counts as having seen it.
    if (clamped === LAST) markIntroSeen(localStorage);
  }

  // A swipe: once the track stops, the panel nearest its offset is the page.
  useEffect(() => {
    const track = trackRef.current;
    if (track === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function settle(): void {
      if (track === null || track.clientWidth === 0) return;
      goTo(Math.round(track.scrollLeft / track.clientWidth), false);
    }
    function onScroll(): void {
      clearTimeout(timer);
      timer = setTimeout(settle, 120);
    }
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      track.removeEventListener('scroll', onScroll);
    };
    // goTo only reads refs and stable setters.
  }, []);

  function leave(): void {
    markIntroSeen(localStorage);
    route(returnTo ?? '/login', true);
  }

  function onKeyDown(event: JSX.TargetedKeyboardEvent<HTMLElement>): void {
    if (event.key === 'ArrowRight') goTo(page + 1, true);
    else if (event.key === 'ArrowLeft') goTo(page - 1, true);
  }

  return (
    <section class="intro" onKeyDown={onKeyDown}>
      <div class="intro-frame">
        <header class="intro-bar">
          <span class="intro-brand">
            <BowerMark size={32} />
            Bower
          </span>
          {fromApp ? (
            <button
              type="button"
              class="intro-icon-button"
              aria-label="Close"
              onClick={leave}
            >
              <IconClose />
            </button>
          ) : (
            <button type="button" class="intro-skip" onClick={leave}>
              {page === LAST ? 'Close' : 'Skip'}
            </button>
          )}
        </header>
        <DemoBanner />

        <div class="intro-viewport">
          <div class="intro-track" ref={trackRef}>
            {INTRO_PAGES.map((item: IntroPage, index) => {
              const Illustration = ART[index];
              return (
                <section
                  class={`intro-page intro-page--${index + 1}`}
                  aria-labelledby={`intro-heading-${index + 1}`}
                  inert={index !== page}
                >
                  <div class="intro-text">
                    <h1
                      class="intro-heading"
                      id={`intro-heading-${index + 1}`}
                      tabIndex={-1}
                      ref={(el) => {
                        headings.current[index] = el;
                      }}
                    >
                      {item.heading}
                    </h1>
                    <p class="intro-body">{item.body}</p>
                    {index === LAST && (
                      <LastActions fromApp={fromApp} onDone={leave} />
                    )}
                  </div>
                  {Illustration !== undefined && <Illustration />}
                </section>
              );
            })}
          </div>
        </div>

        <footer class="intro-footer">
          <div class="intro-progress">
            <div class="intro-dots" aria-hidden="true">
              {INTRO_PAGES.map((_, index) => (
                <span
                  class={
                    index === page ? 'intro-dot intro-dot--active' : 'intro-dot'
                  }
                />
              ))}
            </div>
            <span class="intro-status" role="status" aria-live="polite">
              {introPageLabel(page)}
            </span>
          </div>
          <div class="intro-buttons">
            {page > 0 ? (
              <button
                type="button"
                class="button button-secondary intro-back"
                onClick={() => goTo(page - 1, true)}
              >
                Back
              </button>
            ) : (
              <span />
            )}
            {page < LAST && (
              <button
                type="button"
                class="button intro-next"
                onClick={() => goTo(page + 1, true)}
              >
                Next
              </button>
            )}
          </div>
        </footer>
      </div>
    </section>
  );
}
