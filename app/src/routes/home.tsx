/**
 * Home (#321, handover C.4, the Phone-Home boards): the greeting with the
 * bird and its speech bubble, the Inbox card, the Last tidy-up card,
 * Pinned and Recent. Home knows about the run: `homeStateFor` (`home.ts`)
 * picks one of Waiting, Empty (the first day), Running, Done and Failed,
 * and the bird, the bubble and the two cards follow it; editing the pins
 * shortens the bubble and hides Recent (Phone-Home-Pins).
 *
 * There is no Tell Bower here: asking lives on the Bower tab (C.2). The
 * phone keeps the search row that opens the quick switcher (#142); desktop
 * adds the Health and Notes cards. The first-run tour (#330,
 * `components/help-sheet.tsx`) opens over Home once per account, or when
 * Settings asks for a replay.
 */

import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';

import type { Run } from '../api.js';
import { Bird } from '../components/bird.js';
import { ONCE_STATES } from '../components/bird-classes.js';
import type { BirdState } from '../components/bird-classes.js';
import { HEALTH_PATH } from '../components/explorer.js';
import {
  IconChat,
  IconClock,
  IconHeart,
  IconInbox,
  IconNote,
  IconSearch,
  IconSparkle,
} from '../components/icons.js';
import { PinnedSection } from '../components/pinned-section.js';
import { ProcessButton } from '../components/process-button.js';
import { Tour } from '../components/help-sheet.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import { startedAgo } from '../components/working-sheet.js';
import { findReport, isReportNew, reportDayStart } from '../health-report.js';
import {
  ANSWERS_FOLDER,
  birdStateFor,
  bubbleFor,
  greetingFor,
  homeStateFor,
  inboxLine,
  lastTidyUpLine,
  restingBird,
  tidyUpAgo,
} from '../home.js';
import type { BubblePart, HomeState } from '../home.js';
import {
  folderCounts,
  folderOf,
  recentNotes,
  relativeTime,
} from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { tourOnScreen } from '../onboarding.js';
import { useOnline } from '../online.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { visiblePendingCount } from '../run-progress.js';
import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import { BOWER_PATH } from '../shell-routes.js';
import { openSwitcher } from '../switcher-store.js';
import {
  endTour,
  markTourSeen,
  showoffPlayed,
  useTour,
} from '../tour-store.js';
import { isAppFile } from '../vault-index.js';
import { pinned, useVault } from '../vault-store.js';
import '../styles/home.css';

/** Recent shows this many rows (C.4); "All" opens Notes for the rest. */
const RECENT_ROWS = 5;

interface BubbleProps {
  parts: readonly BubblePart[];
  onTidyUp: () => void;
  onFailure: () => void;
}

/** The bubble's text, its links wired: Tidy up and Try again act here,
 * See what I did goes to the Bower tab. Exported for `home-bubble.test.tsx`
 * (#420: the button's click event must never reach `onTidyUp`/`onFailure`,
 * which both take no arguments). */
export function BubbleText({
  parts,
  onTidyUp,
  onFailure,
}: BubbleProps): JSX.Element {
  return (
    <p class="home-bubble">
      {parts.map((part, i) => {
        if (typeof part === 'string') return part;
        if (part.link === 'activity') {
          return (
            <a key={i} href={BOWER_PATH}>
              {part.text}
            </a>
          );
        }
        return (
          <button
            key={i}
            type="button"
            class="home-bubble-link"
            aria-haspopup={part.link === 'failure' ? 'dialog' : undefined}
            onClick={() => (part.link === 'tidy-up' ? onTidyUp() : onFailure())}
          >
            {part.text}
          </button>
        );
      })}
    </p>
  );
}

interface GreetingProps {
  variant: 'phone' | 'desktop';
  size: number;
  state: BirdState;
  greeting: string;
  bubble: BubbleProps;
  onDone: () => void;
}

function Greeting({
  variant,
  size,
  state,
  greeting,
  bubble,
  onDone,
}: GreetingProps): JSX.Element {
  return (
    <div class={`home-greeting home-greeting--${variant}`}>
      <Bird state={state} size={size} onDone={onDone} />
      <div class="home-greeting-text">
        <h1 class="home-h1">{greeting}</h1>
        <BubbleText {...bubble} />
      </div>
    </div>
  );
}

interface InboxCardProps {
  state: HomeState;
  pending: number;
  run: Run | null;
  now: number;
  onOpenSheet: () => void;
}

/** The Inbox card (C.4): the count, a line, and Tidy up or Try again. */
function InboxCard({
  state,
  pending,
  run,
  now,
  onOpenSheet,
}: InboxCardProps): JSX.Element {
  const head = (
    <>
      <h2>
        <IconInbox />
        Inbox
      </h2>
      <p class="home-card-count">{pending}</p>
    </>
  );

  // #322: until the folder index resolves, no count is a fact yet.
  if (state === 'loading') {
    return (
      <div class="home-card home-card-loading" aria-hidden="true">
        <h2>
          <IconInbox />
          Inbox
        </h2>
        <span class="home-skeleton home-skeleton-count" />
        <span class="home-skeleton home-skeleton-line" />
      </div>
    );
  }

  if (state === 'running') {
    const started =
      run === null
        ? ''
        : ` ${startedAgo(run.startedAt ?? run.requestedAt, now).toLowerCase()}`;
    return (
      <div class="home-card home-card-active">
        {head}
        <button
          type="button"
          class="home-card-running"
          aria-haspopup="dialog"
          onClick={onOpenSheet}
        >
          {`${inboxLine(state, pending)}${started}`}
        </button>
      </div>
    );
  }

  if (state !== 'failed' && pending === 0) {
    return (
      <a class="home-card home-card-link" href="/add">
        {head}
        <p class="home-card-sub">{inboxLine(state, pending)}</p>
      </a>
    );
  }

  return (
    <div
      class={
        state === 'failed'
          ? 'home-card home-card-failed'
          : 'home-card home-card-active'
      }
    >
      {head}
      <p class="home-card-sub">{inboxLine(state, pending)}</p>
      <ProcessButton />
    </div>
  );
}

/**
 * The Last tidy-up card (C.4): when, and what it did, or "No tidy-up yet".
 * `run` is the run store's `lastFinished` (#321), which already stays put
 * while the next run goes (`lastFinishedRun`, `run-store.tsx`) — so this
 * only ever reads "No tidy-up yet" when nothing has finished, `state`
 * notwithstanding; a run in progress (`state === 'running'`) is not
 * special-cased here on purpose (#498). Exported for its own render test.
 */
export function LastTidyUpCard({
  state,
  run,
  now,
}: {
  state: HomeState;
  run: Run | null;
  now: number;
}): JSX.Element {
  const head = (
    <h2>
      <IconClock />
      Last tidy-up
    </h2>
  );
  // #322: until the folder index resolves, "No tidy-up yet" is not a fact.
  if (state === 'loading') {
    return (
      <div class="home-card home-card-loading" aria-hidden="true">
        {head}
        <span class="home-skeleton home-skeleton-line" />
        <span class="home-skeleton home-skeleton-line" />
      </div>
    );
  }
  if (run === null) {
    return (
      <div class="home-card">
        {head}
        <p class="home-card-sub">No tidy-up yet</p>
      </div>
    );
  }
  return (
    <a class="home-card home-card-link" href={BOWER_PATH}>
      {head}
      <p class="home-card-when">
        {tidyUpAgo(run.finishedAt ?? run.requestedAt, now)}
      </p>
      <p class="home-card-sub">{lastTidyUpLine(run)}</p>
    </a>
  );
}

export function Home(): JSX.Element {
  const { me } = useSession();
  const { index, files, status, unpinNote, unpinFolder } = useVault();
  // #513: `now` is the run store's own shared clock, so this card, the
  // Last tidy-up card and the working sheet always agree on how long ago
  // something happened, down to the same minute boundary.
  const { phase, run, lastFinished, now, tidyUp, openSheet } = useRun();
  const online = useOnline();
  const [editing, setEditing] = useState(false);

  const showAppFiles = getPref('showAppFiles');
  const recent =
    index === null ? [] : recentNotes(index, RECENT_ROWS, showAppFiles);
  const recentTitles = useNoteTitles(recent);
  // #506: the same total the working sheet counts against, so "N things"
  // here never runs one ahead of it — the context note Add may have left
  // in the inbox is not one of the "things" either place counts.
  const pending = visiblePendingCount(files);
  const noteCounts =
    index === null ? new Map<string, number>() : folderCounts(index);
  const pinnedItems = index === null ? [] : pinned(index);
  const editingPins = editing && pinnedItems.length > 0;
  const noteCount =
    index === null
      ? 0
      : index.notes.filter(
          (note) => showAppFiles || !isAppFile(note.path, note.name),
        ).length;

  const reportTime =
    index === null ? undefined : findReport(index)?.modifiedTime;
  const healthHint =
    reportTime === undefined
      ? 'No check yet'
      : isReportNew(reportTime, getPref('healthSeenAt'))
        ? 'New'
        : `Checked ${relativeTime(reportDayStart(reportTime), now)}`;

  const offline = !online;
  // #322: the very first fetch, before the folder index has ever resolved —
  // not `refreshing`, which already has a cached index to show.
  const loading = status === 'loading';
  const state = homeStateFor({ phase, pending, lastFinished, loading });

  // A play-once pose (the first day's hello, the dance after a run) plays
  // once per change of pose, then rests.
  const idealBird = birdStateFor({
    state,
    offline,
    justDone: phase === 'done',
  });
  const play = useRef({ state: idealBird, id: 0 });
  if (play.current.state !== idealBird) {
    play.current = { state: idealBird, id: play.current.id + 1 };
  }
  const playId = play.current.id;
  const [restedPlay, setRestedPlay] = useState(-1);
  const birdState =
    restedPlay === playId && ONCE_STATES.includes(idealBird)
      ? restingBird(idealBird)
      : idealBird;

  const bubble: BubbleProps = {
    parts: bubbleFor({
      state,
      pending,
      offline,
      error: status === 'error',
      editingPins,
      lastFinished,
    }),
    onTidyUp: tidyUp,
    onFailure: openSheet,
  };
  const greeting = greetingFor(new Date(now), me?.name);

  // The first-run tour (#149): once per account, or again from Settings.
  // "Let's go" ends it with one show-off on Home.
  const tour = useTour();
  const showTour = tourOnScreen(me, tour);
  const greetingBird: BirdState = tour.showoff ? 'showoff' : birdState;
  const onDone = tour.showoff ? showoffPlayed : () => setRestedPlay(playId);

  return (
    <section class="home" data-state={state} aria-busy={loading || undefined}>
      <Greeting
        variant="phone"
        size={88}
        state={greetingBird}
        greeting={greeting}
        bubble={bubble}
        onDone={onDone}
      />
      <Greeting
        variant="desktop"
        size={112}
        state={greetingBird}
        greeting={greeting}
        bubble={bubble}
        onDone={onDone}
      />

      <button
        type="button"
        class="home-search"
        onClick={() => {
          openSwitcher();
        }}
      >
        <IconSearch />
        <span>Search or jump to a note</span>
      </button>

      <div class="home-cards">
        <InboxCard
          state={state}
          pending={pending}
          run={run}
          now={now}
          onOpenSheet={openSheet}
        />
        <LastTidyUpCard state={state} run={lastFinished} now={now} />
        {state === 'loading' ? (
          <div
            class="home-card home-card-loading home-desktop-only"
            aria-hidden="true"
          >
            <h2>
              <IconHeart />
              Health
            </h2>
            <span class="home-skeleton home-skeleton-line" />
          </div>
        ) : (
          <a
            class="home-card home-card-link home-desktop-only"
            href={HEALTH_PATH}
          >
            <h2>
              <IconHeart />
              Health
            </h2>
            <p class="home-card-sub">{healthHint}</p>
            <p class="home-card-sub">Runs every Sunday.</p>
          </a>
        )}
        <div
          class={
            state === 'loading'
              ? 'home-card home-card-loading home-desktop-only'
              : 'home-card home-desktop-only'
          }
          aria-hidden={state === 'loading' || undefined}
        >
          <h2>
            <IconNote />
            Notes
          </h2>
          {state === 'loading' ? (
            <span class="home-skeleton home-skeleton-count" />
          ) : (
            <p class="home-card-count">{noteCount}</p>
          )}
          <p class="home-card-sub">in your notes</p>
        </div>
      </div>

      {state === 'empty' && (
        <div class="home-tip">
          <IconSparkle />
          <p>
            <b>Not sure where to start?</b> Add the thing that has been sitting
            in your downloads for a month. Or the last three receipts. Or a
            photo of a letter.
          </p>
        </div>
      )}

      <PinnedSection
        items={pinnedItems}
        noteCounts={noteCounts}
        onUnpinNote={unpinNote}
        onUnpinFolder={unpinFolder}
        runUnpin={(unpin) => runPinAction(unpin, 'Unpinned')}
        editing={editingPins}
        onEditingChange={setEditing}
      />

      {!editingPins && state === 'loading' && (
        <div class="home-recent" aria-hidden="true">
          <div class="home-recent-head">
            <h2>Recent</h2>
          </div>
          <ul class="home-notes">
            {Array.from({ length: RECENT_ROWS }).map((_, i) => (
              <li key={i} class="home-recent-skeleton-row">
                <span class="home-skeleton home-recent-skeleton-icon" />
                <span class="home-skeleton home-recent-skeleton-text" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {!editingPins && state !== 'loading' && recent.length > 0 && (
        <div class="home-recent">
          <div class="home-recent-head">
            <h2>Recent</h2>
            <a href="/notes">All</a>
          </div>
          <ul class="home-notes">
            {recent.map((note) => {
              const answer = note.path.startsWith(`${ANSWERS_FOLDER}/`);
              const folder = folderOf(note.path);
              return (
                <li key={note.id}>
                  <a class="home-note-row" href={`/note/${note.id}`}>
                    <span
                      class="home-note-icon"
                      data-type={answer ? 'answer' : 'note'}
                    >
                      {answer ? <IconChat /> : <IconNote />}
                    </span>
                    <span class="home-note-text">
                      <b class="home-note-title">
                        {recentTitles.get(note.id) ?? noteTitle(note)}
                      </b>
                      {folder !== '' && (
                        <span class="home-note-meta">
                          {folder.split('/').join(' / ')}
                        </span>
                      )}
                    </span>
                    {note.modifiedTime !== undefined && (
                      <span class="home-note-time">
                        {relativeTime(note.modifiedTime, now)}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {showTour && me !== undefined && (
        <Tour
          onEnd={(finished) => {
            endTour(finished);
            void markTourSeen(me);
          }}
        />
      )}
    </section>
  );
}
