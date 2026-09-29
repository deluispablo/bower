/**
 * "What is Bower" (#207, #327): nine pages in a horizontal CSS scroll-snap
 * track, one case per PARA letter in the middle. Shown once per device,
 * before the sign-in, to a signed-out visitor (`session.tsx`'s
 * `decideRedirect`, gated by `introSeen()` in `intro.ts`); the seen flag is
 * set on Skip and on reaching the last page. Reachable again any time from
 * Settings › "What is Bower" and from the sign-in's "What is Bower?" link,
 * both as `/welcome?from=settings` (Close and Done instead of Skip and Sign
 * in with Google).
 *
 * In a demo build (#361, board Demo-Intro) the same nine pages carry the
 * demo banner on top and "Try the demo" where the app says Sign in with
 * Google; it lands on Home, where the four-sheet tour starts. The seen flag
 * is per browser there too.
 *
 * Swiping moves the track on touch; Next, the desktop's side arrows and the
 * arrow keys move it everywhere. Every page is its board's resting frame
 * (the v3 Intro boards); `intro.css` plays
 * the boards' loops over it (#328) and `prefers-reduced-motion` keeps the
 * resting frame. The copy is `intro.ts`'s, verbatim from the boards.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { isDemo, loginUrl } from '../api.js';
import { Bird } from '../components/bird.js';
import { DemoBanner } from '../components/demo-banner.js';
import {
  IconChevronRight,
  IconClose,
  IconEyeOff,
  IconFolder,
  IconNote,
} from '../components/icons.js';
import {
  INTRO_ACTS,
  INTRO_APP_ROWS,
  INTRO_APP_TITLE,
  INTRO_ARRIVALS,
  INTRO_ARRIVALS_TITLE,
  INTRO_ASK_LINE,
  INTRO_CASES,
  INTRO_DRIVE_ROWS,
  INTRO_DRIVE_TITLE,
  INTRO_INVITED_LINE,
  INTRO_NOT_ROWS,
  INTRO_PAGES,
  INTRO_SAY,
  INTRO_SAY_TITLE,
  INTRO_SORT_CAPTION,
  INTRO_SORT_DONE,
  INTRO_SORT_FOLDERS,
  INTRO_STARTS,
  INTRO_TIP,
  INTRO_TREE,
  INTRO_TREE_TITLE,
  INTRO_VERBS,
  INTRO_WHYS,
  introRuns,
  introReturnPath,
  markIntroSeen,
  type IntroCase,
  type IntroPage,
  type IntroTable,
  type IntroWindowRow,
} from '../intro.js';
import '../styles/intro.css';

const PAGE_COUNT = INTRO_PAGES.length;

/** A prose string with its `**bold**` runs rendered as `<b>`. */
function Prose({ text }: { text: string }): JSX.Element {
  return (
    <>
      {introRuns(text).map((run) => (run.bold ? <b>{run.text}</b> : run.text))}
    </>
  );
}

function Heading({ page }: { page: IntroPage }): JSX.Element {
  return <h1 class="intro-heading">{page.heading}</h1>;
}

function Body({ page }: { page: IntroPage }): JSX.Element {
  return (
    <p class="intro-body">
      <Prose text={page.body} />
    </p>
  );
}

/**
 * Where each card of the sort strip starts, jumbled, before it flies to its
 * folder (Intro-1 board), in the strip's reading order: the board's jumble
 * minus its target, x as a share of the card's width so it scales with the
 * strip, y in px (the strip is as tall as the board's), and the card's delay.
 */
const SORT_JUMBLE: readonly {
  x: string;
  y: string;
  turn: string;
  delay: string;
}[] = [
  { x: '31%', y: '-50px', turn: '14deg', delay: '0.36s' },
  { x: '144%', y: '-146px', turn: '9deg', delay: '0.12s' },
  { x: '97%', y: '-58px', turn: '-9deg', delay: '0.48s' },
  { x: '-131%', y: '-138px', turn: '-12deg', delay: '0s' },
  { x: '63%', y: '-132px', turn: '-5deg', delay: '0.24s' },
  { x: '3%', y: '-74px', turn: '6deg', delay: '0.6s' },
];

/** Custom properties for the stylesheet's loops (`--i`, `--jx`, ...). */
type LoopVars = Record<`--${string}`, string>;

function Page1(): JSX.Element {
  const page = INTRO_PAGES[0];
  let cardIndex = 0;
  return (
    <>
      <div class="intro-hero-bird">
        <Bird state="looking" size={112} />
      </div>
      <Heading page={page} />
      <Body page={page} />
      <div class="intro-strip" aria-hidden="true">
        <span class="intro-strip-done">{INTRO_SORT_DONE}</span>
        <div class="intro-strip-columns">
          {INTRO_SORT_FOLDERS.map((folder) => (
            <div class="intro-strip-column">
              {folder.cards.map((card) => {
                const jumble = SORT_JUMBLE[cardIndex++];
                const vars: LoopVars | undefined =
                  jumble === undefined
                    ? undefined
                    : {
                        '--jx': jumble.x,
                        '--jy': jumble.y,
                        '--jr': jumble.turn,
                        '--delay': jumble.delay,
                      };
                return (
                  <span class="intro-strip-card" style={vars}>
                    <IconNote />
                    <span>{card}</span>
                  </span>
                );
              })}
              <span class="intro-strip-folder" style={{ color: folder.color }}>
                {folder.name}
                <span class="intro-strip-check" />
              </span>
            </div>
          ))}
        </div>
        <span class="intro-strip-carrier">
          <Bird state="flying" size={44} />
        </span>
      </div>
      <p class="intro-caption">{INTRO_SORT_CAPTION}</p>
    </>
  );
}

/**
 * The Bower folder on page 2. Each highlighted row is where one arrival
 * lands, in order: in motion a copy of that arrival flies from its tile down
 * into the row and the row lights up (`--i` staggers the three and picks the
 * tile, `--row` says how far down the row is); at rest every landing row is
 * lit and the copies are hidden.
 */
function FilingTree(): JSX.Element {
  let landing = 0;
  return (
    <ul class="intro-tree">
      {INTRO_TREE.map((row, rowIndex) => {
        const depthClass = `intro-tree-row intro-tree-row--${row.depth}`;
        if (row.lit !== true) {
          return (
            <li class={depthClass}>
              <IconFolder />
              <span>{row.name}</span>
            </li>
          );
        }
        const index = landing++;
        const arrival = INTRO_ARRIVALS[index];
        return (
          <li
            class={`${depthClass} intro-tree-row--lit`}
            style={
              {
                '--i': String(index),
                '--row': String(rowIndex),
              } satisfies LoopVars
            }
          >
            <IconFolder />
            <b>{row.name}</b>
            {arrival !== undefined && (
              <span class="intro-fly" aria-hidden="true">
                <IconNote />
                {arrival}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Page2(): JSX.Element {
  const page = INTRO_PAGES[1];
  return (
    <>
      <Heading page={page} />
      <Body page={page} />
      <div class="intro-stack">
        <span class="intro-kicker">{INTRO_ARRIVALS_TITLE}</span>
        <div class="intro-arrivals">
          {INTRO_ARRIVALS.map((name) => (
            <div class="intro-raw intro-raw--tile">
              <span class="intro-thumb intro-thumb--small" aria-hidden="true">
                <IconNote />
              </span>
              <b>{name}</b>
            </div>
          ))}
        </div>
        <span class="intro-kicker">{INTRO_TREE_TITLE}</span>
        <FilingTree />
      </div>
      {INTRO_WHYS.map((why, index) => (
        <p
          class={`intro-why intro-why--${why.kind}`}
          style={{ '--i': String(index) } satisfies LoopVars}
        >
          <span class="intro-why-mark" aria-hidden="true" />
          <span>
            <Prose text={why.text} />
          </span>
        </p>
      ))}
    </>
  );
}

function Page3(): JSX.Element {
  const page = INTRO_PAGES[2];
  return (
    <>
      <Heading page={page} />
      <Body page={page} />
      <ul class="intro-verbs">
        {INTRO_VERBS.map((item) => (
          <li class="intro-verb">
            <b>{item.verb}</b> {item.detail}
          </li>
        ))}
      </ul>
      <div class="intro-idea">
        <b>{INTRO_SAY_TITLE}</b>
        <ul>
          {INTRO_SAY.map((line) => (
            <li>
              <IconChevronRight />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function WindowRowIcon({ row }: { row: IntroWindowRow }): JSX.Element {
  if (row.kind === 'folder') return <IconFolder />;
  if (row.kind === 'hidden') return <IconEyeOff />;
  return <IconNote />;
}

function Page4(): JSX.Element {
  const page = INTRO_PAGES[3];
  return (
    <>
      <Heading page={page} />
      <Body page={page} />
      <div class="intro-window" aria-hidden="true">
        <div class="intro-window-layer intro-window-layer--drive">
          <span class="intro-window-title">{INTRO_DRIVE_TITLE}</span>
          {INTRO_DRIVE_ROWS.map((row) => (
            <span class="intro-window-row">
              <WindowRowIcon row={row} />
              <span class="intro-window-name">{row.name}</span>
              <span class="intro-window-meta">{row.meta}</span>
            </span>
          ))}
        </div>
        <div class="intro-window-curtain">
          <div class="intro-window-layer intro-window-layer--app">
            <span class="intro-window-title">
              <Bird state="idle" size={22} />
              {INTRO_APP_TITLE}
            </span>
            {INTRO_APP_ROWS.map((row) => (
              <span class="intro-window-row">
                <WindowRowIcon row={row} />
                <span class="intro-window-name">{row.name}</span>
                <span class="intro-window-meta">{row.meta}</span>
              </span>
            ))}
          </div>
        </div>
        <div class="intro-window-slider">
          <span class="intro-window-handle">
            <Bird state="flying" size={56} />
          </span>
        </div>
        <span class="intro-window-tag intro-window-tag--app">In the app</span>
        <span class="intro-window-tag intro-window-tag--drive">
          In your Drive
        </span>
      </div>
      <ul class="intro-rules">
        {INTRO_NOT_ROWS.map((row) => (
          <li class="intro-rule">
            <b>{row.title}</b>
            <span>{row.detail}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/** A table cell; a rating's stars ("★★★½ 7.2") are drawn in amber. */
function Cell({ text }: { text: string }): JSX.Element {
  const stars = /^([★½]+)(.*)$/u.exec(text);
  if (stars === null) return <>{text}</>;
  return (
    <>
      <span class="intro-stars">{stars[1]}</span>
      {stars[2]}
    </>
  );
}

function NoteTable({ table }: { table: IntroTable }): JSX.Element {
  return (
    <table class="intro-table">
      <thead>
        <tr>
          {table.head.map((cell) => (
            <th scope="col">{cell}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, index) => (
          <tr class={index === table.best ? 'intro-table-best' : undefined}>
            {row.map((cell) => (
              <td>
                <Cell text={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ActProps {
  step: number;
  children: ComponentChildren;
}

function Act({ step, children }: ActProps): JSX.Element {
  return (
    <div class="intro-act">
      <p class="intro-act-title">
        <span class="intro-act-step">{step}</span>
        {INTRO_ACTS[step - 1]}
      </p>
      {children}
    </div>
  );
}

function CasePage({
  page,
  item,
}: {
  page: IntroPage;
  item: IntroCase;
}): JSX.Element {
  const { note } = item;
  return (
    <>
      <div class="intro-case-heading">
        <span
          class="intro-letter"
          style={{ background: item.color }}
          aria-hidden="true"
        >
          {item.letter}
        </span>
        <Heading page={page} />
      </div>
      <Body page={page} />
      <Act step={1}>
        {item.added.map((added) => (
          <div class="intro-raw">
            <span class="intro-scan" aria-hidden="true" />
            <span class="intro-thumb" aria-hidden="true">
              <IconNote />
            </span>
            <span>
              <b>{added.title}</b>
              <br />
              {added.detail}
            </span>
          </div>
        ))}
      </Act>
      <Act step={2}>
        <p class="intro-bubble">{item.ask}</p>
        <div class="intro-workers" aria-hidden="true">
          <Bird state="shiny" size={44} />
          <Bird state="flying" size={44} />
          <Bird state="building" size={44} />
        </div>
        <p class="intro-ask-line">{INTRO_ASK_LINE}</p>
      </Act>
      <Act step={3}>
        <div class="intro-note">
          <span class="intro-note-path">{note.path}</span>
          <h2 class="intro-note-title">{note.title}</h2>
          {note.lead !== undefined && <p>{note.lead}</p>}
          {note.table !== undefined && <NoteTable table={note.table} />}
          {note.summary !== undefined && (
            <p>
              <Prose text={note.summary} />
            </p>
          )}
          {note.checklistTitle !== undefined && (
            <p class="intro-note-subtitle">{note.checklistTitle}</p>
          )}
          <ul class="intro-checklist">
            {note.checklist.map((line, index) => (
              <li style={{ '--i': String(index) } satisfies LoopVars}>
                {line}
              </li>
            ))}
          </ul>
          {note.after !== undefined && (
            <p>
              <Prose text={note.after} />
            </p>
          )}
        </div>
      </Act>
      <p class="intro-memory">
        <Prose text={item.closing} />
      </p>
    </>
  );
}

interface LastPageProps {
  fromSettings: boolean;
  onFinish: () => void;
}

function Page9({ fromSettings, onFinish }: LastPageProps): JSX.Element {
  const page = INTRO_PAGES[8];
  return (
    <>
      <Heading page={page} />
      <Body page={page} />
      <div class="intro-idea">
        <ul>
          {INTRO_STARTS.map((line) => (
            <li>
              <IconChevronRight />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
      <p class="intro-tip">{INTRO_TIP}</p>
      <div class="intro-footer intro-footer--last">
        {fromSettings ? (
          <button type="button" class="button intro-cta" onClick={onFinish}>
            Done
          </button>
        ) : isDemo() ? (
          <TryTheDemo />
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
      </div>
    </>
  );
}

/**
 * The demo's stand-in for Sign in with Google: the demo is already signed
 * in as Alex (`demo/api.ts`), so it only marks the intro seen and goes Home,
 * where the first-run tour takes over.
 */
function TryTheDemo(): JSX.Element {
  const { route } = useLocation();
  return (
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

/** The page dots: the current one is the long teal one. */
function Dots({ page, where }: { page: number; where: string }): JSX.Element {
  return (
    <div class={`intro-dots intro-dots--${where}`} aria-hidden="true">
      {INTRO_PAGES.map((_, index) => (
        <span
          class={index === page ? 'intro-dot intro-dot--active' : 'intro-dot'}
        />
      ))}
    </div>
  );
}

function PageContent({
  index,
  fromSettings,
  onFinish,
}: {
  index: number;
  fromSettings: boolean;
  onFinish: () => void;
}): JSX.Element {
  if (index === 0) return <Page1 />;
  if (index === 1) return <Page2 />;
  if (index === 2) return <Page3 />;
  if (index === 3) return <Page4 />;
  const item = INTRO_CASES[index - 4];
  const page = INTRO_PAGES[index];
  if (item !== undefined && page !== undefined) {
    return <CasePage page={page} item={item} />;
  }
  return <Page9 fromSettings={fromSettings} onFinish={onFinish} />;
}

export function Intro(): JSX.Element {
  const { query, route } = useLocation();
  // Opened from inside the app (Settings, or the demo's Run your own):
  // Close and Done, back to where it came from.
  const returnTo = introReturnPath(query.from);
  const fromSettings = returnTo !== null;
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  // Follows a swipe (not only Next/Back) so the dots and the "N of 9"
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

  // Reaching the last page counts as having seen the intro, the same as Skip.
  useEffect(() => {
    if (page === PAGE_COUNT - 1) markIntroSeen(localStorage);
  }, [page]);

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
    route(returnTo ?? '/login');
  }

  function onKeyDown(event: JSX.TargetedKeyboardEvent<HTMLElement>): void {
    if (event.key === 'ArrowRight') goTo(page + 1);
    else if (event.key === 'ArrowLeft') goTo(page - 1);
  }

  return (
    <section class="intro" onKeyDown={onKeyDown}>
      <header class="intro-bar">
        <span class="intro-brand" aria-hidden="true">
          <Bird state="idle" size={32} />
          Bower
        </span>
        <Dots page={page} where="top" />
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
          <button type="button" class="intro-skip" onClick={finish}>
            Skip
          </button>
        )}
      </header>
      <DemoBanner />

      <div class="intro-viewport">
        <button
          type="button"
          class="intro-arrow intro-arrow--prev"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => goTo(page - 1)}
        />
        <div class="intro-track" ref={trackRef}>
          {INTRO_PAGES.map((_, index) => (
            <section
              class={`intro-page intro-page--${index + 1}`}
              aria-label={`What is Bower, ${index + 1} of ${PAGE_COUNT}`}
            >
              <PageContent
                index={index}
                fromSettings={fromSettings}
                onFinish={finish}
              />
              {index < PAGE_COUNT - 1 && (
                <div class="intro-footer">
                  <button
                    type="button"
                    class="button intro-next"
                    onClick={() => goTo(index + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
        <button
          type="button"
          class="intro-arrow intro-arrow--next"
          aria-label="Next page"
          disabled={page === PAGE_COUNT - 1}
          onClick={() => goTo(page + 1)}
        />
      </div>
      <Dots page={page} where="bottom" />
    </section>
  );
}
