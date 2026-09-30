/**
 * The Bower tab's Activity (#345, spec C.7, boards Phone-Bower-Activity and
 * Desktop-Bower): one card per tidy-up, newest first, built by
 * `activity.ts` from the Worker's run history (`GET /runs`) and `log.md`.
 * The first card is the last tidy-up, the one Home's Last tidy-up card
 * links to (`ACTIVITY_PATH`).
 */

import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { activityCards } from '../activity.js';
import type { ActivityCard, ActivityRow, ActivityTone } from '../activity.js';
import { getRuns } from '../api.js';
import type { Run } from '../api.js';
import { useRun } from '../run-store.js';
import { useVault } from '../vault-store.js';
import {
  IconChat,
  IconClock,
  IconEyeOff,
  IconFile,
  IconHelp,
  IconImage,
  IconNote,
  IconPdf,
  IconRedo,
  IconShield,
} from './icons.js';
import { Hint } from './hint.js';
import { RunMeaning } from './run-meaning.js';
import { useFileText } from './rules-panel.js';

const LOG_PATH = 'log.md';

export type RunsLoad =
  | { status: 'loading' }
  | { status: 'ready'; runs: Run[] }
  | { status: 'error' };

const TONE_ICONS: Record<ActivityTone, () => JSX.Element> = {
  note: IconNote,
  pdf: IconPdf,
  image: IconImage,
  file: IconFile,
  question: IconChat,
  rule: IconShield,
  move: IconRedo,
  'set-aside': IconEyeOff,
};

/** What the row says after its name: where it went, and how. */
function RowWhere({ row }: { row: ActivityRow }): JSX.Element | null {
  if (row.setAside !== undefined) {
    return <span class="activity-where">set aside: {row.setAside}</span>;
  }
  if (row.answerId !== undefined) {
    return (
      <span class="activity-where">
        → Answers,{' '}
        <a class="activity-link" href={`/note/${row.answerId}`}>
          read it
        </a>
      </span>
    );
  }
  if (row.destination !== undefined) {
    return (
      <span class="activity-where">
        → {row.destination}
        {row.renamed !== undefined && `, renamed “${row.renamed}”`}
      </span>
    );
  }
  if (row.outcome !== undefined) {
    return <span class="activity-where">{row.outcome}</span>;
  }
  return null;
}

function Card({ card }: { card: ActivityCard }): JSX.Element {
  const tone = card.failed
    ? 'failed'
    : card.rows.some((row) => row.setAside !== undefined)
      ? 'set-aside'
      : 'done';
  return (
    <li class="activity-card">
      <p class="activity-head">
        <IconClock />
        <b>
          {card.when} · {card.duration}
        </b>
        <span class={`bower-state activity-state--${tone}`}>{card.status}</span>
      </p>
      <p class="activity-counts">{card.sentence}</p>
      <RunMeaning outcome={card.outcome} />
      {card.rows.length > 0 && (
        <ul class="activity-rows">
          {card.rows.map((row) => {
            const Icon = TONE_ICONS[row.tone];
            return (
              <li
                key={row.key}
                class={`activity-row activity-row--${row.tone}`}
              >
                <Icon />
                <span class="activity-title">{row.title}</span>
                <RowWhere row={row} />
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * The finished runs (`GET /runs`), read when `enabled` and again whenever a
 * run ends in this session (`finishedKey`, so the new card shows). Shared by
 * Requests, which lists what each run did with its requests, and Activity's
 * cards: the Bower tab makes the one call.
 */
export function useRuns(
  enabled: boolean,
  finishedKey: string | null,
): RunsLoad {
  const [load, setLoad] = useState<RunsLoad>({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    getRuns()
      .then(({ runs }) => {
        if (!cancelled) setLoad({ status: 'ready', runs });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error(err);
        setLoad({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, finishedKey]);
  return load;
}

export function ActivityPanel({ load }: { load: RunsLoad }): JSX.Element {
  const { index, files } = useVault();
  const { now } = useRun();
  const logLoad = useFileText(index?.byPath.get(LOG_PATH));

  if (load.status === 'loading') {
    return <p class="bower-panel-note">Reading what Bower did…</p>;
  }
  if (load.status === 'error') {
    return (
      <p class="auth-error" role="alert">
        Could not read what Bower did. Try again in a moment.
      </p>
    );
  }
  const cards = activityCards({
    runs: load.runs,
    log: logLoad.status === 'ready' ? logLoad.text : '',
    files,
    now,
  });
  if (cards.length === 0) {
    return (
      <p class="bower-panel-note">
        No tidy-up yet. What each one did will show here: what went where, and
        what was set aside.
      </p>
    );
  }
  return (
    <>
      <Hint id="activity-fix" variant="tip" icon={<IconHelp />}>
        Something in the wrong place? Say so: &ldquo;The lease goes under Home,
        not Flat hunt&rdquo;. Bower moves it and remembers.
      </Hint>
      <ol class="activity-cards" aria-label="Tidy-ups, newest first">
        {cards.map((card) => (
          <Card key={card.key} card={card} />
        ))}
      </ol>
    </>
  );
}
