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
import type { DriveFile } from '../drive.js';
import { kindLabel } from '../meta-line.js';
import { displayName, paraKindOf } from '../navigation.js';
import type { ParaKind } from '../navigation.js';
import { useRun } from '../run-store.js';
import { useVault } from '../vault-store.js';
import {
  IconChat,
  IconClock,
  IconEyeOff,
  IconFile,
  IconImage,
  IconNote,
  IconPdf,
  IconRedo,
  IconShield,
} from './icons.js';
import { Badge } from './badge.js';
import { ListRow } from './list-row.js';
import type { ListRowItem } from './list-row.js';
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

/** How many rows a card shows before "and N more" (BW-Activity-375). */
export const CARD_ROWS = 2;

/** A row's root, from the top folder of where it now lives. */
function rootOfPath(path: string): ParaKind | null {
  return paraKindOf(path.split('/')[0] ?? '');
}

/** What the row's icon and kind word read of it: the listing's entry when
 * the folder is loaded, else its name alone. A note a tidy-up filed is
 * Bower's (it wrote it from what was in the inbox): it shows the bird. */
function rowItem(row: ActivityRow, files: readonly DriveFile[]): ListRowItem {
  const path = row.path;
  const name =
    path === undefined ? row.title : path.slice(path.lastIndexOf('/') + 1);
  const listed =
    path === undefined
      ? undefined
      : files.find((file) => file.path === path);
  return {
    id: row.key,
    title: row.renamed ?? displayName(path === undefined ? row.title : name),
    name: row.tone === 'note' && !/\.md$/i.test(name) ? `${name}.md` : name,
    mimeType: listed?.mimeType ?? '',
    ...(path !== undefined && { path, root: rootOfPath(path) }),
    bowerWritten: row.tone === 'note',
    ...(listed !== undefined && {
      href: `/${/\.md$/i.test(name) ? 'note' : 'file'}/${listed.id}`,
    }),
  };
}

/** A file the run filed: the one ListRow (R-BW-5), "<kind> · ● <parent>". */
function FiledRow({
  row,
  files,
}: {
  row: ActivityRow;
  files: readonly DriveFile[];
}): JSX.Element {
  const item = rowItem(row, files);
  const parts = row.path?.split('/') ?? [];
  const parent = parts.length > 1 ? (parts[parts.length - 2] ?? '') : '';
  return (
    <li class="activity-filed">
      <ListRow
        item={item}
        meta={kindLabel(item)}
        {...(parent !== '' && {
          where: { name: displayName(parent), root: item.root ?? null },
        })}
      />
    </li>
  );
}

/** A file the run took from the inbox (not a request, a rule or a thing
 * set aside): drawn as a ListRow. */
const FILE_TONES: ReadonlySet<ActivityTone> = new Set([
  'note',
  'pdf',
  'image',
  'file',
]);

function isFileRow(row: ActivityRow): boolean {
  return (
    FILE_TONES.has(row.tone) &&
    row.setAside === undefined &&
    row.answerId === undefined &&
    row.outcome === undefined
  );
}

function Card({
  card,
  files,
}: {
  card: ActivityCard;
  files: readonly DriveFile[];
}): JSX.Element {
  const [all, setAll] = useState(false);
  const setAside = card.rows.some((row) => row.setAside !== undefined);
  const shown = all ? card.rows : card.rows.slice(0, CARD_ROWS);
  const more = card.rows.length - shown.length;
  return (
    <li class="activity-card">
      <p class="activity-head">
        <IconClock />
        <b>
          {card.when} · {card.duration}
        </b>
        <Badge
          tone={card.failed ? 'failed' : setAside ? 'check' : 'done'}
          class="activity-badge"
        >
          {card.status}
        </Badge>
      </p>
      <p class="activity-counts">{card.sentence}</p>
      <RunMeaning outcome={card.outcome} />
      {shown.length > 0 && (
        <ul class="activity-rows">
          {shown.map((row) => {
            if (isFileRow(row)) {
              return <FiledRow key={row.key} row={row} files={files} />;
            }
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
      {more > 0 && (
        <button
          type="button"
          class="activity-more"
          onClick={() => {
            setAll(true);
          }}
        >
          and {more} more
        </button>
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
      <ol class="activity-cards" aria-label="Tidy-ups, newest first">
        {cards.map((card) => (
          <Card key={card.key} card={card} files={files} />
        ))}
      </ol>
    </>
  );
}
