/**
 * `/just-filed` (#755, spec §6.6 R-JUST, boards `JustFiled-375` and
 * `JustFiled-1280`): what a tidy-up did as a table. Desktop is a real
 * `<table>` (What Bower did, Now called, You added, Where it is, What
 * changed); the phone is the same table as stacked rows grouped by action.
 * `?run=` opens an earlier run; an unknown key opens the latest. Earlier
 * tidy-ups, failed and partly done ones too, fold open with the same table.
 * A report without `to` (a runner before report v2) falls back to its
 * Activity lines, without the raw "Moved:" ones.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { cardDuration, cardWhen } from '../activity.js';
import { BackLink } from '../components/back-link.js';
import { FolderMark } from '../components/folder-mark.js';
import { useJustFiled } from '../components/just-filed-row.js';
import { KindBadge } from '../components/kind-badge.js';
import { RunSummary } from '../components/run-summary.js';
import { isLinkNote } from '../note-title.js';
import { useShellSlot } from '../components/shell-slots.js';
import { NewTag } from '../components/tags.js';
import { useFileText } from '../components/rules-panel.js';
import type { Run } from '../api.js';
import {
  ACTION_TAG,
  fallbackLines,
  groupRows,
  hasDestinations,
  JUST_EARLIER,
  JUST_EARLIER_SUB,
  JUST_INTRO,
  JUST_MARK_ALL,
  linkAddress,
  originLine,
  runKey,
  runLine,
  SAY_LABEL,
  showsNewChip,
  stateLabel,
  tableRows,
  youAdded,
} from '../just-filed.js';
import type { TableRow } from '../just-filed.js';
import { loadNoteMeta } from '../note-meta.js';
import { outcomeFromRun, runSentence } from '../run-outcome.js';
import { groupByOrigin } from '../pile-groups.js';
import { markAllSeen } from '../seen.js';
import { useMediaQuery } from '../use-media-query.js';
import { useVault } from '../vault-store.js';
import type { VaultIndex } from '../vault-index.js';

import '../styles/just-filed.css';

const DESKTOP_QUERY = '(min-width: 900px)';
const LOG_PATH = 'log.md';

const BACK = <BackLink href="/notes" label="Notes" />;
const CRUMB = <span class="topbar-title">Just filed</span>;

/** `notePath` → the address of a saved link ("host/…/page"), for the rows
 * whose note names one. */
function useAddresses(
  rows: readonly TableRow[],
  index: VaultIndex | null,
): ReadonlyMap<string, string> {
  const [addresses, setAddresses] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const key = rows.map((row) => row.notePath).join('\n');
  useEffect(() => {
    if (index === null) return;
    let cancelled = false;
    void Promise.all(
      rows.map(async (row): Promise<[string, string] | null> => {
        const file = index.byPath.get(row.notePath);
        if (file === undefined) return null;
        try {
          const meta = await loadNoteMeta(file);
          const address = isLinkNote(row.name, meta.fields)
            ? linkAddress(meta.fields.source)
            : null;
          return address === null ? null : [row.notePath, address];
        } catch (err: unknown) {
          console.error('Reading a note for Just filed failed', err);
          return null;
        }
      }),
    ).then((reads) => {
      if (cancelled) return;
      const next = new Map<string, string>();
      for (const read of reads) if (read !== null) next.set(read[0], read[1]);
      setAddresses(next);
    });
    return () => {
      cancelled = true;
    };
    // `key` stands for `rows`, which is a new array on every render.
  }, [key, index]);
  return addresses;
}

function Where({ row }: { row: TableRow }): JSX.Element {
  return (
    <span class="just-filed-where">
      {row.para !== null && <FolderMark kind={row.para} size={18} />}
      <span>{row.folder}</span>
    </span>
  );
}

function Badge({ row }: { row: TableRow }): JSX.Element {
  return (
    <KindBadge
      kind={isLinkNote(row.name) ? 'doc' : row.kind}
      file={{ name: row.name, mimeType: '' }}
    />
  );
}

function Title({ row, isNew }: { row: TableRow; isNew: boolean }): JSX.Element {
  return (
    <span class="just-filed-title">
      {row.href === undefined ? (
        <span>{row.title}</span>
      ) : (
        <a href={row.href}>{row.title}</a>
      )}
      {isNew && <NewTag />}
    </span>
  );
}

function Tag({ row }: { row: TableRow }): JSX.Element {
  return (
    <span class={`just-filed-tag just-filed-tag-${row.action}`}>
      {ACTION_TAG[row.action]}
    </span>
  );
}

interface ViewProps {
  rows: readonly TableRow[];
  unseen: ReadonlySet<string>;
  addresses: ReadonlyMap<string, string>;
}

function isUnseen(row: TableRow, unseen: ReadonlySet<string>): boolean {
  return showsNewChip(row, unseen);
}

function Changed({ row }: { row: TableRow }): JSX.Element {
  return (
    <>
      <span>{row.changed}</span>
      {row.sayHref !== undefined && (
        <>
          {' '}
          <a class="just-filed-say" href={row.sayHref}>
            {SAY_LABEL}
          </a>
        </>
      )}
    </>
  );
}

/** The phone: `role="table"` per group, each row stacked cells. */
function PhoneTable({ rows, unseen, addresses }: ViewProps): JSX.Element {
  return (
    <>
      {groupRows(rows).map((group) => (
        <section
          key={group.action}
          class="just-filed-group"
          aria-label={group.heading}
        >
          <h2 class="just-filed-heading">{group.heading}</h2>
          <div class="just-filed-list" role="table" aria-label={group.heading}>
            <div role="rowgroup">
              {group.rows.map((row) => {
                const origin = originLine(row, addresses.get(row.notePath));
                return (
                  <div key={row.key} class="just-filed-item" role="row">
                    <div class="just-filed-badge" role="cell">
                      <Badge row={row} />
                    </div>
                    <div class="just-filed-body">
                      <div role="cell">
                        <Title row={row} isNew={isUnseen(row, unseen)} />
                      </div>
                      <div role="cell" class="just-filed-to">
                        <Where row={row} />
                      </div>
                      {row.action === 'needs' ? (
                        <div role="cell" class="just-filed-note">
                          <Changed row={row} />
                        </div>
                      ) : (
                        origin !== undefined && (
                          <div role="cell" class="just-filed-was">
                            {origin}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}

function DesktopTable({ rows, unseen, addresses }: ViewProps): JSX.Element {
  return (
    <table class="just-filed-table">
      <thead>
        <tr>
          <th scope="col">What Bower did</th>
          <th scope="col">Now called</th>
          <th scope="col">You added</th>
          <th scope="col">Where it is</th>
          <th scope="col">What changed</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>
              <Tag row={row} />
            </td>
            <td>
              <span class="just-filed-cell-title">
                <Badge row={row} />
                <Title row={row} isNew={isUnseen(row, unseen)} />
              </span>
            </td>
            <td class="just-filed-was-cell">
              {youAdded(row, addresses.get(row.notePath))}
            </td>
            <td>
              <Where row={row} />
            </td>
            <td class="just-filed-note-cell">
              <Changed row={row} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A report with no `to`: what Activity says for that run. */
function FallbackList({
  run,
  log,
  now,
}: {
  run: Run;
  log: string;
  now: number;
}): JSX.Element {
  const lines = fallbackLines(run, log, now);
  if (lines.length === 0) {
    return <p class="just-filed-empty">Nothing to show for this one.</p>;
  }
  return (
    <ul class="just-filed-list">
      {lines.map((line) => (
        <li key={line.key} class="just-filed-item">
          <div class="just-filed-body">
            <span class="just-filed-title">{line.title}</span>
            {(line.destination ?? line.outcome ?? line.setAside) !==
              undefined && (
              <span class="just-filed-to">
                {line.destination !== undefined
                  ? `→ ${line.destination}`
                  : (line.outcome ?? line.setAside)}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One run's body: the table, else why it stopped, else the Activity lines. */
function RunBody({
  run,
  index,
  log,
  now,
  desktop,
  unseen,
  addresses,
}: {
  run: Run;
  index: VaultIndex | null;
  log: string;
  now: number;
  desktop: boolean;
  unseen: ReadonlySet<string>;
  addresses: ReadonlyMap<string, string>;
}): JSX.Element {
  const rows = tableRows(run, index);
  if (rows.length > 0) {
    const View = desktop ? DesktopTable : PhoneTable;
    const groups = groupByOrigin(rows, (row) => row.origin);
    if (groups.length === 1 && groups[0]?.origin === undefined) {
      return <View rows={rows} unseen={unseen} addresses={addresses} />;
    }
    // R-PILE-5: what came out of a pile sits under its pile's line.
    return (
      <>
        {groups.map((group) => (
          <section key={group.origin ?? 'elsewhere'} class="just-filed-pile">
            <h2 class="just-filed-pile-heading">
              {group.origin ?? 'Added from elsewhere'}
            </h2>
            <View
              rows={group.rows}
              unseen={unseen}
              addresses={addresses}
            />
          </section>
        ))}
      </>
    );
  }
  const outcome = outcomeFromRun(run);
  if (outcome.state === 'failed' || outcome.state === 'partial') {
    return (
      <p class="just-filed-danger">
        {runSentence(outcome, { voice: 'third', now })}
      </p>
    );
  }
  if (!hasDestinations(run))
    return <FallbackList run={run} log={log} now={now} />;
  return <p class="just-filed-empty">Nothing to show for this one.</p>;
}

function Earlier({
  runs,
  index,
  log,
  now,
  desktop,
}: {
  runs: readonly Run[];
  index: VaultIndex | null;
  log: string;
  now: number;
  desktop: boolean;
}): JSX.Element | null {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  if (runs.length === 0) return null;
  return (
    <section class="just-filed-group" aria-label={JUST_EARLIER}>
      <h2 class="just-filed-heading">{JUST_EARLIER}</h2>
      <p class="just-filed-sub">{JUST_EARLIER_SUB}</p>
      <ul class="just-filed-earlier">
        {runs.map((run) => {
          const line = runLine(run, now);
          const key = runKey(run);
          return (
            <li key={key}>
              <details
                class="just-filed-details"
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (isOpen) next.add(key);
                    else next.delete(key);
                    return next;
                  });
                }}
              >
                <summary>
                  <span class="just-filed-when">{line.when}</span>
                  <span
                    class={`just-filed-state just-filed-state-${line.tone}`}
                  >
                    {line.label}
                  </span>
                  {line.counts !== '' && (
                    <span class="just-filed-counts">{line.counts}</span>
                  )}
                </summary>
                {open.has(key) && (
                  <RunBodyWithAddresses
                    run={run}
                    index={index}
                    log={log}
                    now={now}
                    desktop={desktop}
                  />
                )}
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RunBodyWithAddresses({
  run,
  index,
  log,
  now,
  desktop,
}: {
  run: Run;
  index: VaultIndex | null;
  log: string;
  now: number;
  desktop: boolean;
}): JSX.Element {
  const addresses = useAddresses(tableRows(run, index), index);
  return (
    <RunBody
      run={run}
      index={index}
      log={log}
      now={now}
      desktop={desktop}
      unseen={new Set()}
      addresses={addresses}
    />
  );
}

export function JustFiled(): JSX.Element {
  useShellSlot('back', BACK);
  useShellSlot('crumb', CRUMB);

  const { query } = useLocation();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { index } = useVault();
  const { latest, earlier, loaded, unseen, now } = useJustFiled(
    true,
    query.run,
  );
  const logLoad = useFileText(index?.byPath.get(LOG_PATH));
  const log = logLoad.status === 'ready' ? logLoad.text : '';

  const rows = latest === null ? [] : tableRows(latest, index);
  const addresses = useAddresses(rows, index);

  function markAll(): void {
    markAllSeen(unseen).catch((err: unknown) => console.error(err));
  }
  const markAllButton =
    unseen.size > 0 ? (
      <button type="button" class="just-filed-markall" onClick={markAll}>
        {JUST_MARK_ALL}
      </button>
    ) : null;

  let body: JSX.Element;
  if (latest === null) {
    body = (
      <p class="just-filed-empty">
        {loaded
          ? 'Nothing has been tidied yet. When Bower files what you add, you will see where it went here.'
          : 'Reading what Bower did…'}
      </p>
    );
  } else {
    const outcome = outcomeFromRun(latest);
    const state = stateLabel(outcome);
    body = (
      <>
        <section class="just-filed-summary" aria-label="Tidy-up summary">
          <h2 class="just-filed-when">
            {cardWhen(latest.finishedAt ?? latest.requestedAt, now)}
          </h2>
          <p class="just-filed-summary-line">
            {cardDuration(latest)} {'·'}{' '}
            <span class={`just-filed-state just-filed-state-${state.tone}`}>
              {state.label}
            </span>
          </p>
          <RunSummary outcome={outcome} size="stats" />
        </section>
        <RunBody
          run={latest}
          index={index}
          log={log}
          now={now}
          desktop={desktop}
          unseen={unseen}
          addresses={addresses}
        />
        {!desktop && markAllButton}
      </>
    );
  }

  return (
    <div class="just-filed-screen">
      <div class="just-filed-head">
        <h1 class="screen-title">Just filed</h1>
        {desktop && markAllButton}
      </div>
      <p class="just-filed-intro">{JUST_INTRO}</p>
      {body}
      <Earlier
        runs={earlier}
        index={index}
        log={log}
        now={now}
        desktop={desktop}
      />
    </div>
  );
}
