/**
 * Home (spec §6, Home row): a greeting with the bird and a speech bubble
 * stating the situation (`greetingFor`/`bubbleFor`, `home.ts`), the search
 * pill (opens the same search as the drawer's filter field — the switcher
 * itself, #142, hasn't landed), the Inbox and Answers count cards, and
 * Recent. Desktop adds the Health and Notes cards and an inline Tell Bower
 * composer next to Recent, reusing `TellComposer` (#146) exactly as
 * `routes/tell.tsx` does.
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
import { Search } from '../components/search.js';
import { TellComposer } from '../components/tell-composer.js';
import { createTextFile } from '../drive.js';
import { findReport, isReportNew } from '../health-report.js';
import { birdStateFor, bubbleFor, greetingFor } from '../home.js';
import {
  folderCounts,
  pendingCount,
  recentNotes,
  relativeTime,
} from '../navigation.js';
import { offlineReason, useOnline } from '../online.js';
import { getPref } from '../prefs.js';
import type { RunPhase } from '../run-store.js';
import { useRun } from '../run-store.js';
import { useSession } from '../session.js';
import {
  addSent,
  firstLine,
  instructionFileName,
  instructionNote,
  loadSent,
  statusLineFor,
} from '../tell.js';
import type { RunSnapshot, SentItem } from '../tell.js';
import { isAppFile } from '../vault-index.js';
import { formatAgo, useVault } from '../vault-store.js';
import '../styles/home.css';

const MINUTE_MS = 60_000;
const ANSWERS_FOLDER = 'Answers';

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
      await createTextFile(inboxFolderId, name, content);
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
          <Bird state="looking" face="happy" size={40} />
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

export function Home() {
  const { me } = useSession();
  const { index, files, fetchedAt, status } = useVault();
  const { phase, run, process } = useRun();
  const online = useOnline();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  // "Search for it" on Not found (`/#search`) focuses this pill once; no
  // route of its own, same minimal spirit as the "Answers" shortcut
  // (`#folder=`, `components/tree.tsx`).
  useEffect(() => {
    if (window.location.hash !== '#search') return;
    document
      .querySelector<HTMLInputElement>('.home-search .search-input')
      ?.focus();
  }, []);

  const showAppFiles = getPref('showAppFiles');
  const recent = index === null ? [] : recentNotes(index, 20, showAppFiles);
  const pending = pendingCount(files);
  const answers =
    index === null ? 0 : (folderCounts(index).get(ANSWERS_FOLDER) ?? 0);
  const noteCount =
    index === null
      ? 0
      : index.notes.filter(
          (note) => showAppFiles || !isAppFile(note.path, note.name),
        ).length;

  const reportTime =
    index === null ? undefined : findReport(index)?.modifiedTime;
  const newHealthReport = isReportNew(reportTime, getPref('healthSeenAt'));
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
    ? { processed: run?.processed?.length ?? 0 }
    : undefined;

  const idealBird = birdStateFor({
    offline,
    justDone,
    pending,
    newHealthReport,
  });
  const settledBird = birdStateFor({
    offline,
    justDone: false,
    pending,
    newHealthReport,
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

  const bubble = bubbleFor({ offline, error, done, newHealthReport, pending });
  const greeting = greetingFor(new Date(now), me?.name);
  const onDone = () => setRestedPlay(playId);

  return (
    <section class="home">
      <Greeting
        variant="phone"
        size={88}
        state={birdState}
        greeting={greeting}
        bubble={bubble}
        onDone={onDone}
      />
      <Greeting
        variant="desktop"
        size={112}
        state={birdState}
        greeting={greeting}
        bubble={bubble}
        onDone={onDone}
      />

      <div class="home-search">
        <IconSearch />
        <Search />
      </div>

      <div class="home-cards">
        <div class="home-card">
          <h2>
            <IconInbox />
            Inbox
          </h2>
          <p class="home-card-count">{pending}</p>
          <p>{pending > 0 ? 'waiting to be tidied' : 'nothing waiting'}</p>
        </div>
        <a class="home-card home-card-link" href={`/#folder=${ANSWERS_FOLDER}`}>
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
          <p>{healthHint}</p>
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
                  <a href={`/note/${note.id}`}>{note.name}</a>
                  <span class="home-note-meta">
                    {note.path}
                    {note.modifiedTime !== undefined &&
                      ` · ${relativeTime(note.modifiedTime, now)}`}
                  </span>
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
    </section>
  );
}
