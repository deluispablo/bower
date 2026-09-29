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
import { useEffect, useRef, useState } from 'preact/hooks';

import { getRuns } from '../api.js';
import type { Run } from '../api.js';
import { Bird } from '../components/bird.js';
import { ONCE_STATES } from '../components/bird-classes.js';
import type { BirdState } from '../components/bird-classes.js';
import { HEALTH_PATH, useHealthFindings } from '../components/explorer.js';
import {
  IconClock,
  IconHeart,
  IconInbox,
  IconNote,
  IconSearch,
  IconSparkle,
} from '../components/icons.js';
import { inlineFactsText } from '../components/key-facts.js';
import { KindBadge } from '../components/kind-badge.js';
import { PinnedSection } from '../components/pinned-section.js';
import { ProcessButton } from '../components/process-button.js';
import { RunSummary } from '../components/run-summary.js';
import { Tour } from '../components/help-sheet.js';
import { BowerTag, NewTag } from '../components/tags.js';
import { useShellSlot } from '../components/shell-slots.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import {
  findReport,
  healthCardLine,
  isReportNew,
  reportDayStart,
} from '../health-report.js';
import {
  birdStateFor,
  bubbleFor,
  greetingFor,
  homeStateFor,
  inboxLine,
  lastTidyUpOverride,
  things,
  restingBird,
  tidyUpAgo,
} from '../home.js';
import type { BubblePart, HomeState } from '../home.js';
import { JUST_FILED_PATH } from '../just-filed.js';
import { keyFactsFor, kindById } from '../kinds.js';
import {
  folderCounts,
  folderHref,
  displayPath,
  folderOf,
  recentNotes,
  relativeTime,
} from '../navigation.js';
import { loadNoteMeta } from '../note-meta.js';
import { isLinkNote, noteTitle } from '../note-title.js';
import { tourOnScreen } from '../onboarding.js';
import { useOnline } from '../online.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { inboxCount, inboxTotal } from '../inbox-count.js';
import { outcomeCounts, outcomeFromRun } from '../run-outcome.js';
import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import type { DriveFile } from '../drive.js';
import { ACTIVITY_PATH } from '../shell-routes.js';
import { openSwitcher } from '../switcher-store.js';
import {
  endTour,
  markTourSeen,
  showoffPlayed,
  useTour,
} from '../tour-store.js';
import { useNew } from '../use-new.js';
import { useMediaQuery } from '../use-media-query.js';
import { fileKind, isAppFile } from '../vault-index.js';
import type { FileKind, VaultIndex } from '../vault-index.js';
import { originalFileOf } from '../components/about-panel.js';
import { isBowerNote } from './note.js';
import { pinned, useVault } from '../vault-store.js';
import '../styles/home.css';

/** The phone top bar's title (Flow-05-Home): "Home", not the wordmark. */
const CRUMB = <span class="topbar-title">Home</span>;

/** Recent shows this many rows (C.4); "All" opens Notes for the rest. */
const RECENT_ROWS = 5;

interface BubbleProps {
  parts: readonly BubblePart[];
  onTidyUp: () => void;
  onFailure: () => void;
}

/** The bubble's text, its links wired: Tidy up and Try again act here,
 * See where they went opens Just filed, See what I did the Bower tab. Exported for `home-bubble.test.tsx`
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
        if (part.link === 'activity' || part.link === 'just-filed') {
          return (
            <a
              key={i}
              href={part.link === 'activity' ? ACTIVITY_PATH : JUST_FILED_PATH}
            >
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
        {variant === 'desktop' && <h1 class="home-h1">{greeting}</h1>}
        <BubbleText {...bubble} />
      </div>
    </div>
  );
}

interface InboxCardProps {
  state: HomeState;
  pending: number;
  onOpenSheet: () => void;
}

/** The Inbox card (C.4): the count, a line, and Tidy up or Try again. */
function InboxCard({
  state,
  pending,
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
    return (
      <div class="home-card home-card-active">
        {head}
        <button
          type="button"
          class="home-card-running"
          aria-haspopup="dialog"
          onClick={onOpenSheet}
        >
          {inboxLine(state, pending)}
        </button>
      </div>
    );
  }

  // A done run that left things for the person: "1 · Needs you" (R-HOME-0);
  // the things are theirs to sort, so no Tidy up button.
  if (state === 'done' && pending > 0) {
    return (
      <a
        class="home-card home-card-link home-card-warn"
        href={folderHref('0-Inbox')}
      >
        {head}
        <p class="home-card-sub">{inboxLine(state, pending)}</p>
      </a>
    );
  }

  if (state !== 'failed' && state !== 'partial' && pending === 0) {
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
          : state === 'partial'
            ? 'home-card home-card-warn'
            : 'home-card home-card-active'
      }
    >
      {head}
      <p class="home-card-sub">{inboxLine(state, pending)}</p>
      <ProcessButton />
    </div>
  );
}

/** The run in flight, for the Last tidy-up card's "Running · 2 min". */
export interface ActiveRun {
  startedAt: string;
  total: number;
}

/** "Running · 2 min": whole minutes since the run started, at least one. */
function runningFor(startedAt: string, now: number): string {
  const minutes = Math.max(
    1,
    Math.floor((now - new Date(startedAt).getTime()) / 60_000) || 1,
  );
  return `Running · ${minutes} min`;
}

/**
 * The Last tidy-up card (C.4, R-HOME-0): the time and the counts line, and
 * nothing else; the greeting carries the sentence. While a run goes it reads
 * "Tidy-up / Running · 2 min / 5 things"; after a partly done one "Partly
 * done" in the warning colour, linking to the sheet; otherwise "No tidy-up
 * yet" only when nothing has ever finished (R-HOME-3: `run` is the run
 * store's `lastFinished`, or the newest of `GET /runs` when this session has
 * not seen one). Exported for its own render test.
 */
export function LastTidyUpCard({
  state,
  run,
  now,
  active,
  onOpenSheet,
}: {
  state: HomeState;
  run: Run | null;
  now: number;
  /** The run in flight; the card shows it while `state` is `running`. */
  active?: ActiveRun;
  /** Opens the working sheet: where a partly done card leads. */
  onOpenSheet?: () => void;
}): JSX.Element {
  const head = (title: string): JSX.Element => (
    <h2>
      <IconClock />
      {title}
    </h2>
  );
  // #322: until the folder index resolves, "No tidy-up yet" is not a fact.
  if (state === 'loading') {
    return (
      <div class="home-card home-card-loading" aria-hidden="true">
        {head('Last tidy-up')}
        <span class="home-skeleton home-skeleton-line" />
        <span class="home-skeleton home-skeleton-line" />
      </div>
    );
  }
  if (state === 'running' && active !== undefined) {
    return (
      <div class="home-card home-card-active">
        {head('Tidy-up')}
        <p class="home-card-when">
          <span class="home-card-spinner" aria-hidden="true" />
          {runningFor(active.startedAt, now)}
        </p>
        <p class="home-card-sub">{things(active.total)}</p>
      </div>
    );
  }
  if (run === null) {
    return (
      <div class="home-card">
        {head('Last tidy-up')}
        <p class="home-card-sub">No tidy-up yet</p>
      </div>
    );
  }
  const outcome = outcomeFromRun(run);
  const own = lastTidyUpOverride(run);
  const counts =
    own !== null ? (
      own
    ) : outcomeCounts(outcome, { short: true }) === '' ? (
      'Nothing new'
    ) : (
      <RunSummary outcome={outcome} size="inline" short />
    );
  const when = tidyUpAgo(run.finishedAt ?? run.requestedAt, now);
  if (outcome.state === 'partial') {
    return (
      <button
        type="button"
        class="home-card home-card-link home-card-warn home-card-button"
        aria-haspopup="dialog"
        onClick={onOpenSheet}
      >
        {head('Last tidy-up')}
        <p class="home-card-when home-card-partial">Partly done</p>
        <p class="home-card-sub">{counts}</p>
      </button>
    );
  }
  return (
    <a
      class="home-card home-card-link"
      href={outcome.items.length > 0 ? JUST_FILED_PATH : ACTIVITY_PATH}
    >
      {head('Last tidy-up')}
      <p class="home-card-when">{when}</p>
      <p class="home-card-sub">{counts}</p>
    </a>
  );
}

interface RecentInfo {
  /** Bower wrote this note (it has a kind, an original or origins). */
  bower: boolean;
  /** The badge's kind: the original's, when the note came from a file. */
  kind: FileKind;
  badgeFile?: { name: string; mimeType: string };
  /** "£2,150 · 2 bed · 14 min by bike", `''` when the note has none. */
  facts: string;
  /** The original file's id (its New state is what the tidy-up tracks). */
  originalId?: string;
}

/** What each Recent row shows beyond its title, read from the note's
 * frontmatter (the cache first, `loadNoteMeta`). A note that cannot be read
 * keeps the plain row. */
function useRecentInfo(
  notes: readonly DriveFile[],
  index: VaultIndex | null,
): ReadonlyMap<string, RecentInfo> {
  const [info, setInfo] = useState<ReadonlyMap<string, RecentInfo>>(new Map());
  const key = notes
    .map((note) => `${note.id}:${note.modifiedTime ?? ''}`)
    .join();
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      notes.map(async (note): Promise<[string, RecentInfo] | null> => {
        try {
          const meta = await loadNoteMeta(note);
          const kind =
            meta.kind === undefined ? undefined : kindById(meta.kind);
          const original = meta.original
            ?.replace(/^\[\[|\]\]$/g, '')
            .split('|')[0]
            ?.trim();
          const badgeFile =
            original === undefined || original === ''
              ? undefined
              : { name: original, mimeType: '' };
          const originalId =
            index === null
              ? undefined
              : originalFileOf(index, note, meta.original)?.id;
          return [
            note.id,
            {
              ...(originalId !== undefined && { originalId }),
              bower: isBowerNote(meta),
              kind:
                badgeFile !== undefined
                  ? fileKind(badgeFile)
                  : isLinkNote(note.name, meta.fields)
                    ? 'doc'
                    : 'note',
              ...(badgeFile !== undefined && { badgeFile }),
              facts:
                kind === undefined
                  ? ''
                  : inlineFactsText(keyFactsFor(kind, meta.fields)),
            },
          ];
        } catch (err: unknown) {
          console.error('Reading a note for Recent failed', err);
          return null;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setInfo(
        new Map(pairs.filter((p): p is [string, RecentInfo] => p !== null)),
      );
    });
    return () => {
      cancelled = true;
    };
    // `key` stands for `notes`, which is a new array on every render.
  }, [key, index]);
  return info;
}

/**
 * Recent's rows (#617, `Flow-05-Home`): the kind badge, the title, New and
 * the Bower tag, the note's key facts on one line ("£2,150 · 2 bed · 14 min
 * by bike"), its folder and when it changed. Exported for its own render
 * test.
 */
export function RecentRows({
  notes,
  titles,
  isNew,
  now,
  index = null,
}: {
  notes: readonly DriveFile[];
  titles: ReadonlyMap<string, string>;
  isNew: (id: string) => boolean;
  now: number;
  /** Lets a note's New follow its original file (a filed PDF). */
  index?: VaultIndex | null;
}): JSX.Element {
  const info = useRecentInfo(notes, index);
  return (
    <ul class="home-notes">
      {notes.map((note) => {
        const folder = folderOf(note.path);
        const extra = info.get(note.id);
        return (
          <li key={note.id}>
            <a class="home-note-row" href={`/note/${note.id}`}>
              <span class="home-note-badge">
                <KindBadge
                  kind={extra?.kind ?? 'note'}
                  {...(extra?.badgeFile !== undefined && {
                    file: extra.badgeFile,
                  })}
                />
              </span>
              <span class="home-note-text">
                <span class="home-note-line">
                  <b class="home-note-title">
                    {titles.get(note.id) ?? noteTitle(note)}
                  </b>
                  {(isNew(note.id) ||
                    (extra?.originalId !== undefined &&
                      isNew(extra.originalId))) && <NewTag />}
                  {extra?.bower === true && <BowerTag />}
                </span>
                {extra !== undefined && extra.facts !== '' && (
                  <span class="home-note-facts">{extra.facts}</span>
                )}
                {folder !== '' && (
                  <span class="home-note-meta">{displayPath(folder)}</span>
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
  );
}

/**
 * The run the Last tidy-up card and the greeting speak about: the run store's
 * `lastFinished`, or, when this session has not seen one finish, the newest of
 * the Worker's history (`GET /runs`), so the card never says "No tidy-up yet"
 * while there are runs (R-HOME-3).
 */
function useLastRun(lastFinished: Run | null): Run | null {
  const [history, setHistory] = useState<Run | null>(null);
  const need = lastFinished === null;
  useEffect(() => {
    if (!need) return;
    let cancelled = false;
    getRuns()
      .then(({ runs }) => {
        if (!cancelled) setHistory(runs[0] ?? null);
      })
      .catch((err: unknown) => {
        console.error('Reading the tidy-up history for Home failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [need]);
  return lastFinished ?? history;
}

export function Home(): JSX.Element {
  const { me } = useSession();
  const { index, files, status, unpinNote, unpinFolder, unpinFile, refresh } =
    useVault();
  // #513: `now` is the run store's own shared clock, so this card, the
  // Last tidy-up card and the working sheet always agree on how long ago
  // something happened, down to the same minute boundary.
  const { phase, run, lastFinished, now, tidyUp, openSheet } = useRun();
  const online = useOnline();
  const [editing, setEditing] = useState(false);

  // Recent lists what Add just uploaded (report F6): read the folder again
  // when Home opens, so a file added a moment ago is not missing.
  useEffect(() => {
    refresh().catch((err: unknown) => {
      console.error('Refreshing the listing for Home failed', err);
    });
    // Once per visit: `refresh` changes with the folder, not with the visit.
  }, []);
  // R-HOME-3: a session that has not seen a run finish still has the history.
  const lastRun = useLastRun(lastFinished);

  const showAppFiles = getPref('showAppFiles');
  const recent =
    index === null ? [] : recentNotes(index, RECENT_ROWS, showAppFiles);
  const recentTitles = useNoteTitles(recent);
  const news = useNew();
  // #506: the same total the working sheet counts against, so "N things"
  // here never runs one ahead of it — the context note Add may have left
  // in the inbox is not one of the "things" either place counts.
  const pending = inboxTotal(inboxCount(files, status === 'loading'));
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

  const findings = useHealthFindings(true);
  const reportTime =
    index === null ? undefined : findReport(index)?.modifiedTime;
  const healthHint =
    reportTime === undefined
      ? 'Not checked yet'
      : isReportNew(reportTime, getPref('healthSeenAt'))
        ? 'New'
        : healthCardLine(
            `Checked ${relativeTime(reportDayStart(reportTime), now)}`,
            findings,
          );

  const offline = !online;
  // #322: the very first fetch, before the folder index has ever resolved —
  // not `refreshing`, which already has a cached index to show.
  const loading = status === 'loading';
  const state = homeStateFor({
    phase,
    pending,
    lastFinished: lastRun,
    loading,
  });

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
      lastFinished: lastRun,
      now,
    }),
    onTidyUp: tidyUp,
    onFailure: openSheet,
  };
  const greeting = greetingFor(new Date(now), me?.name);
  useShellSlot('crumb', CRUMB);

  // The first-run tour (#149): once per account, or again from Settings.
  // "Let's go" ends it with one show-off on Home.
  const tour = useTour();
  const showTour = tourOnScreen(me, tour);
  // One greeting, so one bird (spec 6.21 rule 1); 900 px is the CSS breakpoint.
  const wide = useMediaQuery('(min-width: 900px)');
  const greetingBird: BirdState = tour.showoff ? 'showoff' : birdState;
  const onDone = tour.showoff ? showoffPlayed : () => setRestedPlay(playId);

  return (
    <section class="home" data-state={state} aria-busy={loading || undefined}>
      <Greeting
        variant={wide ? 'desktop' : 'phone'}
        size={wide ? 112 : 88}
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
        <span>Search folders, notes and files</span>
      </button>

      {offline && (
        <p class="home-card-sub home-offline-hint" role="status">
          You are offline. Showing what is on this device; Bower checks your
          folder when you are back.
        </p>
      )}

      <div class="home-cards">
        <InboxCard state={state} pending={pending} onOpenSheet={openSheet} />
        <LastTidyUpCard
          state={state}
          run={lastRun}
          now={now}
          active={{
            startedAt: run?.startedAt ?? run?.requestedAt ?? '',
            total: pending,
          }}
          onOpenSheet={openSheet}
        />
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
        onUnpinFile={unpinFile}
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
          <RecentRows
            notes={recent}
            titles={recentTitles}
            isNew={(id) => news.isNew(id)}
            now={now}
            index={index}
          />
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
