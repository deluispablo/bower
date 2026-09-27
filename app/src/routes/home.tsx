/**
 * Home (spec §6, Home row): a greeting with the bird and a speech bubble
 * stating the situation (`greetingFor`/`bubbleFor`, `home.ts`), the search
 * pill (opens the quick switcher, #142 — same as the drawer's filter field
 * and the desktop sidebar's button), the Inbox and Answers count cards, and
 * Recent. Desktop adds the Health and Notes cards and an inline Tell Bower
 * composer next to Recent, reusing `TellComposer` (#146) exactly as
 * `routes/tell.tsx` does. The first-run tour (#149, `components/tour.tsx`)
 * opens over it once per account, or when Settings asks for a replay.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import type { Run } from '../api.js';
import { Bird } from '../components/bird.js';
import { ONCE_STATES } from '../components/bird-classes.js';
import type { BirdState } from '../components/bird-classes.js';
import { HEALTH_PATH } from '../components/explorer.js';
import {
  IconChat,
  IconHeart,
  IconInbox,
  IconNote,
  IconSearch,
} from '../components/icons.js';
import { PinnedSection } from '../components/pinned-section.js';
import { TellComposer } from '../components/tell-composer.js';
import { Tour } from '../components/tour.js';
import { useNoteTitles } from '../components/use-note-titles.js';
import { INSTRUCTION_APP_PROPERTIES, createTextFile } from '../drive.js';
import { findReport, isReportNew } from '../health-report.js';
import {
  ANSWERS_FOLDER,
  birdStateFor,
  bubbleFor,
  greetingFor,
} from '../home.js';
import {
  folderCounts,
  folderHref,
  folderOf,
  pendingCount,
  recentNotes,
  relativeTime,
} from '../navigation.js';
import { noteTitle } from '../note-title.js';
import { shouldShowTour } from '../onboarding.js';
import { offlineReason, useOnline } from '../online.js';
import { runPinAction } from '../pin-action.js';
import { getPref } from '../prefs.js';
import { findProposals, openProposals } from '../proposals.js';
import type { RunPhase } from '../run-store.js';
import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import { openSwitcher } from '../switcher-store.js';
import {
  addSent,
  firstLine,
  instructionFileName,
  instructionNote,
  loadSent,
  statusLineFor,
} from '../tell.js';
import type { RunSnapshot, SentItem } from '../tell.js';
import {
  endTour,
  markTourSeen,
  showoffPlayed,
  useTour,
} from '../tour-store.js';
import { isAppFile } from '../vault-index.js';
import { formatAgo, OfflineError, pinned, useVault } from '../vault-store.js';
import type { Vault } from '../vault-store.js';
import '../styles/home.css';

const MINUTE_MS = 60_000;

/**
 * How many open suggestions Bower's proposals file holds (#199), read only
 * when the file changed since Health last showed them; 0 otherwise, while
 * it loads, or when it cannot be read (logged, never shown: Health says so).
 */
function useNewProposals(
  index: Vault['index'],
  getNoteText: Vault['getNoteText'],
): number {
  const [count, setCount] = useState(0);
  const file = index === null ? undefined : findProposals(index);
  const isNew = isReportNew(file?.modifiedTime, getPref('proposalsSeenAt'));
  useEffect(() => {
    if (file === undefined || !isNew) {
      setCount(0);
      return;
    }
    let cancelled = false;
    getNoteText(file.id)
      .then((text) => {
        if (!cancelled) setCount(openProposals(text).length);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (!(err instanceof OfflineError)) console.error(err);
        setCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [file, isNew, getNoteText]);
  return count;
}

interface DesktopTellProps {
  inboxFolderId: string | null;
  online: boolean;
  phase: RunPhase;
  run: Run | null;
  process: () => Promise<void>;
}

/** Desktop's inline Tell Bower composer (spec §6, Home row): posts the same
 * instruction note as `/tell` and shows the last message's status. */
function DesktopTell({
  inboxFolderId,
  online,
  phase,
  run,
  process,
}: DesktopTellProps): JSX.Element {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<SentItem | null>(
    () => loadSent()[0] ?? null,
  );

  const runSnapshot: RunSnapshot = { phase, run };
  const canSend =
    text.trim() !== '' && !sending && inboxFolderId !== null && online;

  async function handleSend(): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '' || sending || inboxFolderId === null || !online) return;

    setSending(true);
    setError(null);

    const now = new Date();
    const name = instructionFileName(trimmed, '', now);
    const content = instructionNote(trimmed, now);

    try {
      await createTextFile(inboxFolderId, name, content, {
        appProperties: INSTRUCTION_APP_PROPERTIES,
      });
    } catch (err) {
      console.error(err);
      setError('Could not send that. Try again.');
      setSending(false);
      return;
    }

    void process();
    const item: SentItem = { name, text: trimmed, sentAt: now.toISOString() };
    addSent(item);
    setLast(item);
    setText('');
    setSending(false);
  }

  return (
    <div class="home-tell home-desktop-only">
      <h2>Tell Bower</h2>
      {error !== null && <p class="auth-error">{error}</p>}
      {!online && <p class="offline-reason">{offlineReason('tell')}</p>}
      <TellComposer
        value={text}
        onChange={setText}
        onSubmit={() => void handleSend()}
        disabled={!canSend}
        sending={sending}
      />
      {last !== null && (
        <div class="home-tell-last">
          <Bird state="idle" face="happy" size={40} />
          <p>
            Last one: &ldquo;{firstLine(last.text)}&rdquo;.{' '}
            {statusLineFor(last, runSnapshot)}
          </p>
        </div>
      )}
    </div>
  );
}

interface GreetingProps {
  variant: 'phone' | 'desktop';
  size: number;
  state: BirdState;
  greeting: string;
  bubble: string;
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
        <p class="home-bubble">{bubble}</p>
      </div>
    </div>
  );
}

/** A Recent row's second line: "folder · time", either half left out when
 * the note is top-level or its time is unknown (spec: relative times). */
function recentMeta(
  path: string,
  modifiedTime: string | undefined,
  now: number,
): string {
  const folder = folderOf(path);
  const label = folder === '' ? '' : folder.split('/').join(' / ');
  const time =
    modifiedTime === undefined ? '' : relativeTime(modifiedTime, now);
  if (label !== '' && time !== '') return `${label} · ${time}`;
  return label || time;
}

export function Home() {
  const { me } = useSession();
  const {
    index,
    files,
    fetchedAt,
    status,
    unpinNote,
    unpinFolder,
    getNoteText,
  } = useVault();
  const { phase, run, process } = useRun();
  const online = useOnline();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  const showAppFiles = getPref('showAppFiles');
  const recent = index === null ? [] : recentNotes(index, 20, showAppFiles);
  const recentTitles = useNoteTitles(recent);
  const pending = pendingCount(files);
  const noteCounts =
    index === null ? new Map<string, number>() : folderCounts(index);
  const pinnedItems = index === null ? [] : pinned(index);
  const answers = noteCounts.get(ANSWERS_FOLDER) ?? 0;
  const noteCount =
    index === null
      ? 0
      : index.notes.filter(
          (note) => showAppFiles || !isAppFile(note.path, note.name),
        ).length;

  const reportTime =
    index === null ? undefined : findReport(index)?.modifiedTime;
  const newHealthReport = isReportNew(reportTime, getPref('healthSeenAt'));
  const newProposals = useNewProposals(index, getNoteText);
  const healthHint =
    reportTime === undefined
      ? 'No check yet'
      : newHealthReport
        ? 'New'
        : `Checked ${relativeTime(reportTime, now)}`;

  const offline = !online;
  const error = status === 'error';
  const justDone = phase === 'done';
  const done = justDone
    ? {
        processed: run?.processed?.length ?? 0,
        quarantined: run?.quarantined?.length,
        refused: run?.refused?.length,
      }
    : undefined;

  const idealBird = birdStateFor({
    offline,
    justDone,
    pending,
    newHealthReport,
    newProposals,
  });
  const settledBird = birdStateFor({
    offline,
    justDone: false,
    pending,
    newHealthReport,
    newProposals,
  });
  const play = useRef({ state: idealBird, id: 0 });
  if (play.current.state !== idealBird) {
    play.current = { state: idealBird, id: play.current.id + 1 };
  }
  const playId = play.current.id;
  const [restedPlay, setRestedPlay] = useState(-1);
  const birdState =
    restedPlay === playId && ONCE_STATES.includes(idealBird)
      ? settledBird
      : idealBird;

  const bubble = bubbleFor({
    offline,
    error,
    done,
    newHealthReport,
    newProposals,
    pending,
  });
  const greeting = greetingFor(new Date(now), me?.name);

  // The first-run tour (#149): once per account, or again from Settings.
  // "Let's go" ends it with one show-off on Home.
  const tour = useTour();
  const showTour =
    me !== undefined && !tour.dismissed && shouldShowTour(me, tour.replay);
  const greetingBird: BirdState = tour.showoff ? 'showoff' : birdState;
  const onDone = tour.showoff ? showoffPlayed : () => setRestedPlay(playId);

  return (
    <section class="home">
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
        <div class="home-card">
          <h2>
            <IconInbox />
            Inbox
          </h2>
          <p class="home-card-count">{pending}</p>
          <p>{pending > 0 ? 'waiting to be tidied' : 'nothing waiting'}</p>
        </div>
        <a class="home-card home-card-link" href={folderHref(ANSWERS_FOLDER)}>
          <h2>
            <IconChat />
            Answers
          </h2>
          <p class="home-card-count">{answers}</p>
          <p>things Bower answered</p>
        </a>
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
        <div class="home-card home-desktop-only">
          <h2>
            <IconNote />
            Notes
          </h2>
          <p class="home-card-count">{noteCount}</p>
          <p>in your notes</p>
        </div>
      </div>

      <PinnedSection
        items={pinnedItems}
        noteCounts={noteCounts}
        onUnpinNote={unpinNote}
        onUnpinFolder={unpinFolder}
        runUnpin={(unpin) => runPinAction(unpin, 'Unpinned')}
      />

      <div class="home-columns">
        <div class="home-recent">
          <div class="home-recent-head">
            <h2>Recent</h2>
            {fetchedAt !== null && (
              <span>Updated {formatAgo(fetchedAt, now)}</span>
            )}
          </div>
          {recent.length === 0 ? (
            <p>Nothing here yet.</p>
          ) : (
            <ul class="home-notes">
              {recent.map((note) => (
                <li key={note.id}>
                  <a class="home-note-row" href={`/note/${note.id}`}>
                    <span class="home-note-icon">
                      <IconNote />
                    </span>
                    <span class="home-note-text">
                      <b class="home-note-title">
                        {recentTitles.get(note.id) ?? noteTitle(note)}
                      </b>
                      <span class="home-note-meta">
                        {recentMeta(note.path, note.modifiedTime, now)}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DesktopTell
          inboxFolderId={me?.vault?.inboxFolderId ?? null}
          online={online}
          phase={phase}
          run={run}
          process={process}
        />
      </div>
      {showTour && (
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
