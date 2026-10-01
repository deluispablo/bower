/**
 * `/just-filed` (#913, spec §4.5, boards JF-Main and JF-Earlier): what each
 * tidy-up did. The page header ("Just filed" once, with its ⋯, the purpose
 * line), the latest run as a Card (when, how long, its Badge, four stat
 * tiles), then what it did: ListRows grouped "Filed · 1" on the phone, a
 * real `<table>` on desktop (What Bower did, Now called, You added with the
 * extension, Where it is with the full path, What changed). "Mark all
 * seen", then "Earlier tidy-ups": one row each with its Badge and the
 * outcome said once; a row opens in place to show up to three things and
 * "and N more". A run whose report has no destinations (a runner before
 * report v2) opens to "Bower did not keep a list for this one." (R-API-2).
 * `?run=` opens an earlier run; an unknown key opens the latest.
 */

import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';

import { cardDuration, cardWhen } from '../activity.js';
import { BackLink } from '../components/back-link.js';
import { Badge } from '../components/badge.js';
import { Bird } from '../components/bird.js';
import { Card, StatTile } from '../components/card.js';
import { FileIcon } from '../components/file-icon.js';
import { FolderMark } from '../components/folder-mark.js';
import { IconChevronRight } from '../components/icons.js';
import { useJustFiled } from '../components/just-filed-row.js';
import { ListRow } from '../components/list-row.js';
import { NoteMenu } from '../components/note-menu.js';
import { answeredLine } from '../components/run-summary.js';
import { HOME_CRUMBS, PageHeader } from '../components/page-header.js';
import { useShellSlot } from '../components/shell-slots.js';
import type { Run } from '../api.js';
import {
  ACTION_TAG,
  earlierSub,
  groupRows,
  hasDestinations,
  JUST_EARLIER,
  JUST_INTRO,
  JUST_MARK_ALL,
  linkAddress,
  moreLabel,
  noListLine,
  NOTHING_FILED,
  previewRows,
  runBadge,
  runKey,
  runLine,
  SAY_LABEL,
  showsNewChip,
  tableRows,
  youAdded,
} from '../just-filed.js';
import type { TableRow } from '../just-filed.js';
import { kindLabel } from '../meta-line.js';
import { loadNoteMeta } from '../note-meta.js';
import { isLinkNote } from '../note-title.js';
import { outcomeFromRun, runSentence } from '../run-outcome.js';
import { markAllSeen } from '../seen.js';
import { ACTIVITY_PATH } from '../shell-routes.js';
import { useMediaQuery } from '../use-media-query.js';
import { useVault } from '../vault-store.js';
import type { VaultIndex } from '../vault-index.js';

import '../styles/just-filed.css';

const DESKTOP_QUERY = '(min-width: 900px)';

/** R-JF-1: back to Home (K-5), not to Folders. */
const BACK = <BackLink href="/" label="Home" />;

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

/** The parent folder's own name: the last part of "Areas › Visa & Immigration". */
function parentName(row: TableRow): string {
  const parts = row.folder.split(' › ');
  return parts[parts.length - 1] ?? row.folder;
}

/** What FileIcon and the kind word read of a row. */
function rowItem(row: TableRow): {
  id: string;
  title: string;
  name: string;
  mimeType: string;
  root: TableRow['para'];
  bowerWritten: boolean;
  answer: boolean;
  href?: string;
} {
  return {
    id: row.key,
    title: row.title,
    name: row.name,
    mimeType: '',
    root: row.para,
    bowerWritten: row.action === 'new' || row.action === 'answered',
    answer: row.action === 'answered',
    ...(row.href !== undefined && { href: row.href }),
  };
}

/** The phone (R-JF-3): "Filed · 1" then ListRows "<kind> · ● <parent>". */
function PhoneRows({
  rows,
  unseen,
}: {
  rows: readonly TableRow[];
  unseen: ReadonlySet<string>;
}): JSX.Element {
  return (
    <>
      {groupRows(rows).map((group) => (
        <section
          key={group.action}
          class="just-filed-group"
          aria-label={group.heading}
        >
          <h2 class="just-filed-overline">{group.heading}</h2>
          <ul class="just-filed-rows" role="list">
            {group.rows.map((row) => (
              <li key={row.key}>
                <ListRow
                  item={rowItem(row)}
                  meta={kindLabel(rowItem(row))}
                  where={{ name: parentName(row), root: row.para }}
                  {...(showsNewChip(row, unseen) && {
                    badge: <Badge tone="new">New</Badge>,
                  })}
                  {...(row.href !== undefined && {
                    trailing: <IconChevronRight />,
                  })}
                />
                {row.action === 'needs' && (
                  <p class="just-filed-note">
                    {row.changed}
                    {row.sayHref !== undefined && (
                      <>
                        {' '}
                        <a href={row.sayHref}>{SAY_LABEL}</a>
                      </>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

const TAG_TONE: Readonly<
  Record<TableRow['action'], 'filed' | 'new' | 'check'>
> = {
  filed: 'filed',
  new: 'new',
  answered: 'filed',
  updated: 'filed',
  needs: 'check',
};

/** Desktop (R-JF-3): the table, with "You added" and "Where it is". */
function DesktopTable({
  rows,
  unseen,
  addresses,
}: {
  rows: readonly TableRow[];
  unseen: ReadonlySet<string>;
  addresses: ReadonlyMap<string, string>;
}): JSX.Element {
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
              <Badge tone={TAG_TONE[row.action]}>
                {ACTION_TAG[row.action]}
              </Badge>
            </td>
            <td>
              <span class="just-filed-cell-title">
                <FileIcon item={rowItem(row)} size={16} />
                {row.href === undefined ? (
                  <span>{row.title}</span>
                ) : (
                  <a href={row.href}>{row.title}</a>
                )}
                {showsNewChip(row, unseen) && <Badge tone="new">New</Badge>}
              </span>
            </td>
            <td class="just-filed-muted">
              {youAdded(row, addresses.get(row.notePath))}
            </td>
            <td>
              <span class="just-filed-where">
                {row.para !== null && <FolderMark kind={row.para} size={18} />}
                <span>{row.folder}</span>
              </span>
            </td>
            <td class="just-filed-muted">
              {row.changed}
              {row.sayHref !== undefined && (
                <>
                  {' '}
                  <a href={row.sayHref}>{SAY_LABEL}</a>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The latest run: its Card with the four tiles (S-JF-3). */
function Summary({ run, now }: { run: Run; now: number }): JSX.Element {
  const outcome = outcomeFromRun(run);
  const badge = runBadge(outcome);
  const answered = answeredLine(outcome);
  return (
    <Card class="just-filed-summary">
      <h2 class="just-filed-when">
        {cardWhen(run.finishedAt ?? run.requestedAt, now)}
      </h2>
      <p class="just-filed-summary-line">
        {cardDuration(run)} <Badge tone={badge.tone}>{badge.label}</Badge>
      </p>
      <div class="just-filed-tiles">
        <StatTile label="Filed" value={outcome.filed} />
        <StatTile label="New notes" value={outcome.created} />
        <StatTile label="Updated" value={outcome.updated} />
        <StatTile label="Needs you" value={outcome.needsYou} />
      </div>
      {answered !== '' && <p class="run-summary-answered">{answered}</p>}
    </Card>
  );
}

/** An earlier run opened in place (JF-2): up to three things with where
 * they went, then "and N more". */
function EarlierBody({
  run,
  index,
  now,
}: {
  run: Run;
  index: VaultIndex | null;
  now: number;
}): JSX.Element {
  const [all, setAll] = useState(false);
  if (!hasDestinations(run)) {
    return <p class="just-filed-earlier-empty">{noListLine(run)}</p>;
  }
  const rows = tableRows(run, index);
  if (rows.length === 0) {
    const outcome = outcomeFromRun(run);
    return (
      <p class="just-filed-earlier-empty">
        {outcome.state === 'failed'
          ? NOTHING_FILED
          : outcome.state === 'partial'
            ? runSentence(outcome, { voice: 'third', now })
            : 'Nothing to show for this one.'}
      </p>
    );
  }
  const { shown, more } = all ? { shown: rows, more: 0 } : previewRows(rows);
  return (
    <>
      {groupRows(shown).map((group) => {
        const full = groupRows(rows).find((g) => g.action === group.action);
        return (
          <div key={group.action}>
            <p class="just-filed-overline">{full?.heading ?? group.heading}</p>
            <ul class="just-filed-earlier-items" role="list">
              {group.rows.map((row) => (
                <li key={row.key}>
                  {row.href === undefined ? (
                    <span class="just-filed-earlier-name">{row.title}</span>
                  ) : (
                    <a class="just-filed-earlier-name" href={row.href}>
                      {row.title}
                    </a>
                  )}{' '}
                  <span class="just-filed-earlier-to">→ {parentName(row)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {more > 0 && (
        <button
          type="button"
          class="just-filed-more"
          onClick={() => setAll(true)}
        >
          {moreLabel(more)}
        </button>
      )}
    </>
  );
}

function Earlier({
  runs,
  index,
  now,
  desktop,
}: {
  runs: readonly Run[];
  index: VaultIndex | null;
  now: number;
  desktop: boolean;
}): JSX.Element | null {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  if (runs.length === 0) return null;
  return (
    <section class="just-filed-earlier" aria-label={JUST_EARLIER}>
      <h2 class="just-filed-overline">{JUST_EARLIER}</h2>
      <p class="just-filed-sub">{earlierSub(desktop)}</p>
      <ul class="just-filed-earlier-list" role="list">
        {runs.map((run) => {
          const line = runLine(run, now);
          const badge = runBadge(outcomeFromRun(run));
          const key = runKey(run);
          const isOpen = open.has(key);
          const panelId = `earlier-${key.replace(/[^a-zA-Z0-9_-]/g, '')}`;
          return (
            <li key={key}>
              <button
                type="button"
                class="just-filed-earlier-row"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
              >
                <span class="just-filed-earlier-text">
                  <span class="just-filed-earlier-head">
                    <span class="just-filed-earlier-when">{line.when}</span>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </span>
                  <span class="just-filed-earlier-counts">{line.counts}</span>
                </span>
                <IconChevronRight />
              </button>
              {isOpen && (
                <div id={panelId} class="card just-filed-earlier-panel">
                  <EarlierBody run={run} index={index} now={now} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function JustFiled(): JSX.Element {
  useShellSlot('back', BACK);

  const { query, route } = useLocation();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { index } = useVault();
  const { latest, earlier, loaded, unseen, now } = useJustFiled(
    true,
    query.run,
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const rows = useMemo(
    () => (latest === null ? [] : tableRows(latest, index)),
    [latest, index],
  );
  const addresses = useAddresses(rows, index);

  function markAll(): void {
    markAllSeen(unseen).catch((err: unknown) => console.error(err));
  }

  let body: JSX.Element;
  if (latest === null) {
    body = loaded ? (
      <div class="just-filed-none">
        <Bird state="looking" size={52} />
        <p>
          No tidy-ups yet. Add a few things and {desktop ? 'click' : 'tap'} Tidy
          up; what Bower did shows here. <a href="/add">Add</a>
        </p>
      </div>
    ) : (
      <p class="just-filed-empty">Reading what Bower did…</p>
    );
  } else {
    body = (
      <>
        <Summary run={latest} now={now} />
        {rows.length > 0 ? (
          desktop ? (
            <DesktopTable rows={rows} unseen={unseen} addresses={addresses} />
          ) : (
            <PhoneRows rows={rows} unseen={unseen} />
          )
        ) : (
          <div class="just-filed-empty">
            <EarlierBody run={latest} index={index} now={now} />
          </div>
        )}
        {unseen.size > 0 && (
          <button type="button" class="just-filed-markall" onClick={markAll}>
            {JUST_MARK_ALL}
          </button>
        )}
      </>
    );
  }

  return (
    <div class="just-filed-screen">
      <div class="just-filed-header">
        <PageHeader
          title="Just filed"
          crumbs={HOME_CRUMBS}
          purpose={JUST_INTRO}
          more={{
            expanded: menuOpen,
            onClick: () => setMenuOpen((value) => !value),
            name: 'Just filed',
          }}
        />
        {menuOpen && (
          <NoteMenu
            kind="justFiled"
            title="Just filed"
            onMarkAllSeen={markAll}
            onEveryTidy={() => route(ACTIVITY_PATH)}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
      {body}
      <Earlier runs={earlier} index={index} now={now} desktop={desktop} />
    </div>
  );
}
