/**
 * Home (#913, spec §4.2, boards HM-Main, HM-Waiting, HM-Running, HM-Recent,
 * HM-Edit): "G'day, Alex" with its ⋯ (the phone's top bar, the desktop h1),
 * the bird with its bubble about the last tidy-up, the search field (phone
 * only: on desktop the sidebar's field is the only one), the stat tiles
 * (Inbox, Last tidy-up and, on desktop only, Health check: E-8), Pinned
 * with its Edit mode, and Recent as list rows with the "where" dot.
 *
 * Home knows about the run: `homeStateFor` (`home.ts`) picks one of
 * Waiting, Empty (the first day), Running, Done and Failed, and the bird,
 * the bubble and the tiles follow it. The bubble and the Last tidy-up tile
 * read the same run, so "21 h ago" is the same value in both (K-16).
 * Editing the pins hides Recent (HM-Edit). The first-run tour
 * (`components/help-sheet.tsx`) opens over Home once per account, or when
 * Settings asks for a replay.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { getRuns } from '../api.js';
import type { Run } from '../api.js';
import { Badge } from '../components/badge.js';
import { Bird, BirdNapButton } from '../components/bird.js';
import { ONCE_STATES } from '../components/bird-classes.js';
import { ErrorLine, Skeleton } from '../components/system-state.js';
import type { BirdState } from '../components/bird-classes.js';
import { Card, StatTile } from '../components/card.js';
import { Hint } from '../components/hint.js';
import { HEALTH_PATH, useHealthFindings } from '../components/explorer.js';
import {
  IconClock,
  IconHeart,
  IconInbox,
  IconSparkle,
} from '../components/icons.js';
import { ListRow } from '../components/list-row.js';
import { MoreButton } from '../components/more-button.js';
import { NoteMenu } from '../components/note-menu.js';
import { PinnedSection } from '../components/pinned-section.js';
import { ProcessButton } from '../components/process-button.js';
import { SearchField } from '../components/search-field.js';
import { useShellSlot } from '../components/shell-slots.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import { findReport, reportDayStart } from '../health-report.js';
import {
  birdStateFor,
  bubbleFor,
  greetingFor,
  finishedRunFor,
  homeStateFor,
  homeTiles,
  inboxLine,
  lastTidyUpNote,
  things,
  restingBird,
  tidyUpAgo,
} from '../home.js';
import type { BubblePart, HomeState } from '../home.js';
import { JUST_FILED_PATH } from '../just-filed.js';
import { kindLabel, shortDate } from '../meta-line.js';
import {
  displayName,
  folderCounts,
  folderOf,
  paraKindOf,
  recentNotes,
  relativeTime,
} from '../navigation.js';
import { loadNoteMeta } from '../note-meta.js';
import { noteTitle } from '../note-title.js';
import { tourOnScreen } from '../onboarding.js';
import { useOnline } from '../online.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { inboxCount, inboxTotal } from '../inbox-count.js';
import { outcomeFromRun } from '../run-outcome.js';
import { runningCount, useRun } from '../run-store.js';
import { useSession } from '../session.js';
import type { DriveFile } from '../drive.js';
import { ACTIVITY_PATH, FOLDERS_PATH } from '../shell-routes.js';
import { greetingBirdHidden, useOverlayBird } from '../bird-presence.js';
import {
  endTour,
  markTourSeen,
  showoffPlayed,
  useTour,
} from '../tour-store.js';
import { useMediaQuery } from '../use-media-query.js';
import { isBowerWritten } from '../bower-written.js';
import { lazyOverlay } from '../lazy-overlay.js';
import { pinned, useVault } from '../vault-store.js';
import '../styles/home.css';

/** The first-run tour loads when it first shows (#834). */
const LazyTour = lazyOverlay(() =>
  import('../components/help-sheet.js').then((m) => m.Tour),
);
const Tour = LazyTour.Component;

/** Recent shows this many rows; "All in Folders" opens the rest. */
const RECENT_ROWS = 5;

/** The bird: 84 px on the phone, 96 on desktop (spec §4.2, K-32). */
const BIRD_PHONE = 84;
const BIRD_DESKTOP = 96;

/** S-HM-16, S-HM-18. */
export const RECENT_EMPTY = 'Nothing yet. What you add and open shows here.';

interface BubbleProps {
  parts: readonly BubblePart[];
  onTidyUp: () => void;
  onFailure: () => void;
}

/** The bubble's text, its links wired: Tidy up and Finish the tidy-up act
 * here, See what changed opens Just filed, See what I did the Bower tab.
 * Exported for `home-bubble.test.tsx` (#420: the button's click event must
 * never reach `onTidyUp`/`onFailure`, which both take no arguments). */
export function BubbleText({
  parts,
  onTidyUp,
  onFailure,
}: BubbleProps): JSX.Element {
  return (
    <p class="home-bubble card card-bubble">
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

/** A stat tile that also holds a control or a Badge (the Inbox tile's Tidy
 * up, a failed run's "Did not finish"): `StatTile`'s own markup and
 * classes, with room under the note. */
function ActionTile({
  label,
  icon,
  value,
  note,
  active = false,
  children,
}: {
  label: string;
  icon: ComponentChildren;
  value: ComponentChildren;
  note?: string;
  active?: boolean;
  children?: ComponentChildren;
}): JSX.Element {
  return (
    <Card
      variant={active ? 'accent' : 'plain'}
      class={
        active ? 'stat-tile home-tile home-tile-active' : 'stat-tile home-tile'
      }
    >
      <div class="stat-tile-label">
        {icon}
        {label}
      </div>
      <div class="stat-tile-value">{value}</div>
      {note !== undefined && <div class="stat-tile-note">{note}</div>}
      {children}
    </Card>
  );
}

/** A tile that opens somewhere: the whole tile is the link. */
function TileLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <a class="home-tile-link" href={href} aria-label={label}>
      {children}
    </a>
  );
}

function SkeletonTile({
  label,
  icon,
  class: extra,
}: {
  label: string;
  icon: ComponentChildren;
  class?: string;
}): JSX.Element {
  return (
    <div aria-hidden="true" class={extra}>
      <Card class="stat-tile home-tile home-tile-loading">
        <div class="stat-tile-label">
          {icon}
          {label}
        </div>
        <span class="home-skeleton home-skeleton-count" />
        <span class="home-skeleton home-skeleton-line" />
      </Card>
    </div>
  );
}

/** The Inbox tile (S-HM-9): the count, its line, and Tidy up while things
 * wait. */
function InboxTile({
  state,
  pending,
  onOpenSheet,
}: {
  state: HomeState;
  pending: number;
  /** Opens the working sheet: where "Being tidied up" leads. */
  onOpenSheet: () => void;
}): JSX.Element {
  if (state === 'loading')
    return <SkeletonTile label="Inbox" icon={<IconInbox />} />;
  const line = inboxLine(state, pending);
  if (state === 'running') {
    return (
      <ActionTile label="Inbox" icon={<IconInbox />} value={pending} active>
        <button
          type="button"
          class="stat-tile-note home-tile-running"
          aria-haspopup="dialog"
          onClick={onOpenSheet}
        >
          {line}
        </button>
      </ActionTile>
    );
  }
  const waits =
    pending > 0 &&
    (state === 'waiting' || state === 'failed' || state === 'partial');
  if (waits) {
    return (
      <ActionTile
        label="Inbox"
        icon={<IconInbox />}
        value={pending}
        note={line}
        active
      >
        <div class="home-tile-action">
          <ProcessButton finish={state === 'partial'} />
        </div>
      </ActionTile>
    );
  }
  return (
    <TileLink
      href={pending === 0 ? '/add' : '/notes'}
      label={`Inbox: ${String(pending)}. ${line}`}
    >
      <StatTile
        label="Inbox"
        icon={<IconInbox />}
        value={pending}
        note={line}
        class="home-tile"
      />
    </TileLink>
  );
}

/** The run in flight, for the tile's "Running · 1 min". */
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
  return `Running · ${String(minutes)} min`;
}

/**
 * The Last tidy-up tile (S-HM-10, S-HM-11): "21 h ago" / "1 filed", the
 * same values the bubble says; "Tidy-up" / "Running · 1 min" / "3 things"
 * while a run goes; "Not yet" before the first one; a failed run's Badge
 * "Did not finish". `run` is the run store's `lastFinished`, or the newest
 * of `GET /runs` when this session has not seen one. Exported for its own
 * render test.
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
  /** The run in flight; the tile shows it while `state` is `running`. */
  active?: ActiveRun;
  /** Opens the working sheet: where a running or partly done tile leads. */
  onOpenSheet?: () => void;
}): JSX.Element {
  if (state === 'loading') {
    return <SkeletonTile label="Last tidy-up" icon={<IconClock />} />;
  }
  if (state === 'running' && active !== undefined) {
    return (
      <button
        type="button"
        class="home-tile-link home-tile-button"
        aria-haspopup="dialog"
        onClick={onOpenSheet}
      >
        <ActionTile
          label="Tidy-up"
          icon={<IconClock />}
          value={runningFor(active.startedAt, now)}
          note={things(active.total)}
          active
        />
      </button>
    );
  }
  if (run === null) {
    return (
      <StatTile
        label="Last tidy-up"
        icon={<IconClock />}
        value="Not yet"
        class="home-tile"
      />
    );
  }
  const outcome = outcomeFromRun(run);
  const when = tidyUpAgo(run.finishedAt ?? run.requestedAt, now);
  if (outcome.state === 'failed') {
    return (
      <TileLink
        href={JUST_FILED_PATH}
        label={`Last tidy-up: ${when}. Did not finish`}
      >
        <ActionTile label="Last tidy-up" icon={<IconClock />} value={when}>
          <div class="home-tile-badge">
            <Badge tone="failed">Did not finish</Badge>
          </div>
        </ActionTile>
      </TileLink>
    );
  }
  if (outcome.state === 'partial') {
    return (
      <button
        type="button"
        class="home-tile-link home-tile-button"
        aria-haspopup="dialog"
        onClick={onOpenSheet}
      >
        <StatTile
          label="Last tidy-up"
          icon={<IconClock />}
          value="Partly done"
          note={lastTidyUpNote(run)}
          class="home-tile home-tile-partial"
        />
      </button>
    );
  }
  const note = lastTidyUpNote(run);
  return (
    <TileLink
      href={outcome.items.length > 0 ? JUST_FILED_PATH : ACTIVITY_PATH}
      label={`Last tidy-up: ${when}. ${note}`}
    >
      <StatTile
        label="Last tidy-up"
        icon={<IconClock />}
        value={when}
        note={note}
        class="home-tile"
      />
    </TileLink>
  );
}

/** "today" as a tile value reads "Today"; "4 days ago" stays as it is. */
function sentenceCase(text: string): string {
  return /^(today|yesterday)$/.test(text)
    ? `${text.charAt(0).toUpperCase()}${text.slice(1)}`
    : text;
}

/** The Health check tile (S-HM-12, E-8): desktop only, as on HM-Main-1280. */
function HealthTile({
  loading,
  value,
  note,
}: {
  loading: boolean;
  value: string;
  note: string;
}): JSX.Element {
  if (loading) {
    return (
      <SkeletonTile
        label="Health check"
        icon={<IconHeart />}
        class="home-desktop-only"
      />
    );
  }
  return (
    <a
      class="home-tile-link home-desktop-only"
      href={HEALTH_PATH}
      aria-label={`Health check: ${value}. ${note}`}
    >
      <StatTile
        label="Health check"
        icon={<IconHeart />}
        value={value}
        note={note}
        class="home-tile"
      />
    </a>
  );
}

/** Which of the Recent notes Bower wrote (the bird icon, "Bower note"),
 * and which of those are its answers ("Bower answer", `type: answer`),
 * read from each note's frontmatter (the cache first). A note that cannot
 * be read keeps the plain row. */
interface BowerNotes {
  written: ReadonlySet<string>;
  answers: ReadonlySet<string>;
}

function useBowerWritten(notes: readonly DriveFile[]): BowerNotes {
  const [found, setFound] = useState<BowerNotes>({
    written: new Set(),
    answers: new Set(),
  });
  const key = notes
    .map((note) => `${note.id}:${note.modifiedTime ?? ''}`)
    .join();
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      notes.map(
        async (note): Promise<{ id: string; answer: boolean } | null> => {
          try {
            const meta = await loadNoteMeta(note);
            return isBowerWritten(meta)
              ? { id: note.id, answer: meta.type === 'answer' }
              : null;
          } catch (err: unknown) {
            console.error('Reading a note for Recent failed', err);
            return null;
          }
        },
      ),
    ).then((rows) => {
      if (cancelled) return;
      const mine = rows.filter(
        (row): row is { id: string; answer: boolean } => row !== null,
      );
      setFound({
        written: new Set(mine.map((row) => row.id)),
        answers: new Set(mine.filter((row) => row.answer).map((row) => row.id)),
      });
    });
    return () => {
      cancelled = true;
    };
    // `key` stands for `notes`, which is a new array on every render.
  }, [key]);
  return found;
}

/** The parent folder's name and its root, for the row's "where". */
function whereOf(
  path: string,
): { name: string; root: ReturnType<typeof paraKindOf> } | undefined {
  const parent = folderOf(path);
  if (parent === '') return undefined;
  const name = parent.slice(parent.lastIndexOf('/') + 1);
  return {
    name: displayName(name),
    root: paraKindOf(parent.split('/')[0] ?? ''),
  };
}

/**
 * Recent's rows (R-HM-4, HM-Recent): FileIcon (the bird for Bower's
 * writing), the title, "<kind> · ● <parent>", and the time today or "29
 * Sep" otherwise. No facts, no MD/FILE kinds, no full paths. Exported for
 * its own render test.
 */
export function RecentRows({
  notes,
  titles,
  now,
}: {
  notes: readonly DriveFile[];
  titles: ReadonlyMap<string, string>;
  now: number;
}): JSX.Element {
  const bower = useBowerWritten(notes);
  return (
    <ul class="home-notes" role="list">
      {notes.map((note) => {
        const item = {
          id: note.id,
          title: titles.get(note.id) ?? noteTitle(note),
          href: `/note/${note.id}`,
          name: note.name,
          mimeType: note.mimeType,
          path: note.path,
          bowerWritten: bower.written.has(note.id),
          answer: bower.answers.has(note.id),
        };
        const where = whereOf(note.path);
        return (
          <li key={note.id}>
            <ListRow
              item={item}
              meta={kindLabel(item)}
              {...(where !== undefined && { where })}
              trailing={
                note.modifiedTime === undefined ? undefined : (
                  <time dateTime={note.modifiedTime}>
                    {shortDate(note.modifiedTime, now)}
                  </time>
                )
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The run the Last tidy-up tile and the bubble speak about: the run store's
 * `lastFinished`, or, when this session has not seen one finish, the newest
 * of the Worker's history (`GET /runs`), so the tile never says "Not yet"
 * while there are runs.
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
  const { index, files, status, refresh, unpinNote, unpinFolder, unpinFile } =
    useVault();
  // `now` is the run store's own shared clock, so the bubble, the tiles and
  // the working sheet always agree on how long ago something happened.
  const { phase, run, lastFinished, now, tidyUp, openSheet, keptCount } =
    useRun();
  const online = useOnline();
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // One greeting, so one bird (spec 6.21 rule 1); 900 px is the CSS breakpoint.
  const wide = useMediaQuery('(min-width: 900px)');

  const settled = finishedRunFor(phase, run, lastFinished);
  const lastRun = useLastRun(settled);

  const showAppFiles = getPref('showAppFiles');
  const recent =
    index === null ? [] : recentNotes(index, RECENT_ROWS, showAppFiles);
  const recentTitles = useNoteTitles(recent);
  // The same total the working sheet counts against.
  const pending = inboxTotal(inboxCount(files, status === 'loading'));
  // R-AD-8: while a tidy-up runs, the bubble and the card read the count it
  // was confirmed with, as the chip and the sheet do.
  const runPending = runningCount(keptCount, run?.total) ?? pending;
  const noteCounts =
    index === null ? new Map<string, number>() : folderCounts(index);
  const pinnedItems = index === null ? [] : pinned(index);
  const editingPins = editing && pinnedItems.length > 0;

  const findings = useHealthFindings(true);
  const reportTime =
    index === null ? undefined : findReport(index)?.modifiedTime;
  // The tile states where the check stands, never a bare "New" that reads
  // like a badge (HM-Main-1280, DA-28).
  // One line each, like the other tiles (lead ruling, #920): the value is
  // when it last ran ("4 days ago"), the meta what it found.
  const healthValue =
    reportTime === undefined
      ? 'Not checked yet'
      : sentenceCase(relativeTime(reportDayStart(reportTime), now));
  const healthNote =
    reportTime !== undefined && findings !== undefined && findings > 0
      ? `${String(findings)} small ${findings === 1 ? 'thing' : 'things'} to fix`
      : 'Runs every Sunday.';

  const offline = !online;
  const loading = status === 'loading';
  const state = homeStateFor({
    phase,
    pending,
    // The history read is not a reason to leave Loading: only a run this
    // session already saw finish is.
    lastFinished: loading ? settled : lastRun,
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
      pending: state === 'running' ? runPending : pending,
      offline,
      error: status === 'error',
      editingPins,
      lastFinished: lastRun,
      now,
      desktop: wide,
    }),
    onTidyUp: tidyUp,
    onFailure: openSheet,
  };
  const greeting = greetingFor(me?.name);
  const toggleMenu = (): void => setMenuOpen((open) => !open);

  // The phone's top bar (R-HM-1): "G'day, Alex" and its ⋯. The page's one
  // h1 on the phone, as on Add and Bower (DA-1, T-9); the desktop's h1 is
  // the greeting in the page, so the bar's copy stays a plain span there.
  const crumb = useMemo(
    () =>
      wide ? (
        <span class="topbar-title">{greeting}</span>
      ) : (
        <h1 class="topbar-title">{greeting}</h1>
      ),
    [greeting, wide],
  );
  useShellSlot('crumb', crumb);
  const actions = useMemo(
    () =>
      wide ? null : (
        <MoreButton expanded={menuOpen} onClick={toggleMenu} name="Home" />
      ),
    [wide, menuOpen],
  );
  useShellSlot('actions', actions);

  const tour = useTour();
  const overlayBird = useOverlayBird();
  const showTour = tourOnScreen(me, tour);
  const greetingBird: BirdState = tour.showoff ? 'showoff' : birdState;
  const onDone = tour.showoff ? showoffPlayed : () => setRestedPlay(playId);
  const birdHidden = greetingBirdHidden(showTour, overlayBird);
  const size = wide ? BIRD_DESKTOP : BIRD_PHONE;

  return (
    <section class="home" data-state={state} aria-busy={loading || undefined}>
      <div class={`home-greeting home-greeting--${wide ? 'desktop' : 'phone'}`}>
        {birdHidden ? (
          <span
            class="home-greeting-bird-gap"
            style={{ width: `${String(size)}px`, height: `${String(size)}px` }}
            aria-hidden="true"
          />
        ) : (
          <span class="home-greeting-bird">
            <BirdNapButton>
              <Bird state={greetingBird} size={size} onDone={onDone} />
            </BirdNapButton>
          </span>
        )}
        <div class="home-greeting-text">
          {wide && (
            <div class="home-h1-row">
              <h1 class="home-h1">{greeting}</h1>
              <MoreButton
                expanded={menuOpen}
                onClick={toggleMenu}
                name="Home"
                class="home-more"
              />
            </div>
          )}
          <BubbleText {...bubble} />
        </div>
      </div>
      {menuOpen && (
        <NoteMenu
          kind="home"
          title="Home"
          onEditPinned={() => setEditing(true)}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {!wide && (
        <div class="home-search">
          <SearchField variant="trigger" size="phone" />
        </div>
      )}

      {offline && (
        <p class="home-offline-hint" role="status">
          You are offline. Showing what is on this device; Bower checks your
          folder when you are back.
        </p>
      )}

      <div class="home-tiles">
        <InboxTile state={state} pending={pending} onOpenSheet={openSheet} />
        <LastTidyUpCard
          state={state}
          run={lastRun}
          now={now}
          active={{
            startedAt: run?.startedAt ?? run?.requestedAt ?? '',
            total: runPending,
          }}
          onOpenSheet={openSheet}
        />
        {homeTiles(wide).includes('Health check') && (
          <HealthTile loading={loading} value={healthValue} note={healthNote} />
        )}
      </div>

      {state === 'empty' && (
        <Hint id="home-start" variant="tip" icon={<IconSparkle />}>
          <b>Not sure where to start?</b> Add the thing that has been sitting in
          your downloads for a month. Or the last three receipts. Or a photo of
          a letter.
        </Hint>
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
          <Skeleton shape="rows" count={RECENT_ROWS} />
        </div>
      )}

      {!editingPins && state !== 'loading' && (
        <div class="home-recent">
          <div class="home-recent-head">
            <h2>Recent</h2>
            {!wide && <a href={FOLDERS_PATH}>All in Folders</a>}
          </div>
          {index === null && status === 'error' ? (
            <ErrorLine what="home" onRetry={() => void refresh()} />
          ) : recent.length > 0 ? (
            <RecentRows notes={recent} titles={recentTitles} now={now} />
          ) : (
            <p class="home-empty">{RECENT_EMPTY}</p>
          )}
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
