/**
 * `/just-filed` (#616, spec §6.10 R-JUST-2, boards `Phone-JustFiled` and
 * `Desktop-JustFiled`): what the last tidy-up filed, with the name each thing
 * had, the name it has now and the folder it went to. The phone shows rows,
 * the desktop a table (You added, Now called, Where it went, Bower's note);
 * both list what was set aside and the earlier tidy-ups from `GET /runs`.
 * A report without `to` (a runner before report v2) falls back to its
 * Activity lines.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { BackLink } from '../components/back-link.js';
import { FolderMark } from '../components/folder-mark.js';
import { useJustFiled } from '../components/just-filed-row.js';
import { KindBadge } from '../components/kind-badge.js';
import { useShellSlot } from '../components/shell-slots.js';
import { NewTag } from '../components/tags.js';
import { useFileText } from '../components/rules-panel.js';
import { inlineFactsText } from '../components/key-facts.js';
import type { Run } from '../api.js';
import { keyFactsFor, kindById } from '../kinds.js';
import {
  asideLabel,
  earlierHeading,
  fallbackLines,
  groupHeading,
  hasDestinations,
  JUST_EARLIER,
  JUST_EARLIER_SUB,
  JUST_INTRO,
  JUST_MARK_ALL,
  justFiledRows,
  setAsideRows,
  wasLabel,
} from '../just-filed.js';
import type { JustFiledRow, SetAsideRow } from '../just-filed.js';
import { loadNoteMeta } from '../note-meta.js';
import { markAllSeen } from '../seen.js';
import { useMediaQuery } from '../use-media-query.js';
import { useVault } from '../vault-store.js';
import type { VaultIndex } from '../vault-index.js';

import '../styles/just-filed.css';

const DESKTOP_QUERY = '(min-width: 900px)';
const LOG_PATH = 'log.md';

const BACK = <BackLink href="/notes" label="Notes" />;
const CRUMB = <span class="topbar-title">Just filed</span>;

/** The key facts of the note beside each row (or the row's own note), as the
 * inline line: `notePath` → "£2,150 · 2 bed · 14 min by bike". A note that
 * cannot be read, or names no kind, has none. */
function useNoteFacts(
  rows: readonly JustFiledRow[],
  index: VaultIndex | null,
): ReadonlyMap<string, string> {
  const [facts, setFacts] = useState<ReadonlyMap<string, string>>(new Map());
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
          const kind = meta.kind === undefined ? undefined : kindById(meta.kind);
          if (kind === undefined) return null;
          const text = inlineFactsText(keyFactsFor(kind, meta.fields));
          return text === '' ? null : [row.notePath, text];
        } catch (err: unknown) {
          console.error('Reading a note for Just filed failed', err);
          return null;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setFacts(
        new Map(pairs.filter((p): p is [string, string] => p !== null)),
      );
    });
    return () => {
      cancelled = true;
    };
    // `key` stands for `rows`, which is a new array on every render.
  }, [key, index]);
  return facts;
}

function Where({ row }: { row: JustFiledRow }): JSX.Element {
  return (
    <span class="just-filed-where">
      {row.para !== null && <FolderMark kind={row.para} size={18} />}
      <span>{row.folder}</span>
    </span>
  );
}

function Badge({ row }: { row: JustFiledRow }): JSX.Element {
  return (
    <KindBadge kind={row.kind} file={{ name: row.name, mimeType: '' }} />
  );
}

function Title({
  row,
  isNew,
}: {
  row: JustFiledRow;
  isNew: boolean;
}): JSX.Element {
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

function PhoneRows({
  rows,
  unseen,
  facts,
}: {
  rows: readonly JustFiledRow[];
  unseen: ReadonlySet<string>;
  facts: ReadonlyMap<string, string>;
}): JSX.Element {
  return (
    <ul class="just-filed-list">
      {rows.map((row) => {
        const note = facts.get(row.notePath);
        return (
          <li key={row.key} class="just-filed-item">
            <Badge row={row} />
            <div class="just-filed-body">
              <Title
                row={row}
                isNew={row.id !== undefined && unseen.has(row.id)}
              />
              {row.oldName !== undefined && (
                <span class="just-filed-was">{wasLabel(row.oldName)}</span>
              )}
              <span class="just-filed-to">
                <span aria-hidden="true">{'→'} </span>
                <Where row={row} />
              </span>
              {note !== undefined && (
                <span class="just-filed-note">Bower's note · {note}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DesktopTable({
  rows,
  unseen,
  facts,
}: {
  rows: readonly JustFiledRow[];
  unseen: ReadonlySet<string>;
  facts: ReadonlyMap<string, string>;
}): JSX.Element {
  return (
    <table class="just-filed-table">
      <thead>
        <tr>
          <th scope="col">You added</th>
          <th scope="col">Now called</th>
          <th scope="col">Where it went</th>
          <th scope="col">Bower's note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td class="just-filed-was-cell">{row.oldName ?? row.name}</td>
            <td>
              <span class="just-filed-cell-title">
                <Badge row={row} />
                <Title
                  row={row}
                  isNew={row.id !== undefined && unseen.has(row.id)}
                />
              </span>
            </td>
            <td>
              <Where row={row} />
            </td>
            <td class="just-filed-note-cell">
              {facts.get(row.notePath) ?? '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AsideGroup({ rows }: { rows: readonly SetAsideRow[] }): JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <section class="just-filed-group" aria-label="Set aside">
      <h2 class="just-filed-heading">{asideLabel(rows.length)}</h2>
      <ul class="just-filed-list">
        {rows.map((row) => (
          <li key={row.key} class="just-filed-aside">
            <span class="just-filed-title">
              {row.href === undefined ? (
                <span>{row.title}</span>
              ) : (
                <a href={row.href}>{row.title}</a>
              )}
            </span>
            <span class="just-filed-note">
              Kept in {row.folder} by its date. {row.sentence}
            </span>
            <a class="just-filed-say" href={row.sayHref}>
              Say what it is
            </a>
          </li>
        ))}
      </ul>
    </section>
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

function Earlier({
  runs,
  index,
  log,
  now,
}: {
  runs: readonly Run[];
  index: VaultIndex | null;
  log: string;
  now: number;
}): JSX.Element | null {
  if (runs.length === 0) return null;
  return (
    <section class="just-filed-group" aria-label={JUST_EARLIER}>
      <h2 class="just-filed-heading">{JUST_EARLIER}</h2>
      <p class="just-filed-sub">{JUST_EARLIER_SUB}</p>
      <ul class="just-filed-earlier">
        {runs.map((run) => (
          <li key={run.requestedAt}>
            <details class="just-filed-details">
              <summary>{earlierHeading(run, now, index)}</summary>
              {hasDestinations(run) ? (
                <PhoneRows
                  rows={justFiledRows(run, index)}
                  unseen={new Set()}
                  facts={new Map()}
                />
              ) : (
                <FallbackList run={run} log={log} now={now} />
              )}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function JustFiled(): JSX.Element {
  useShellSlot('back', BACK);
  useShellSlot('crumb', CRUMB);

  const desktop = useMediaQuery(DESKTOP_QUERY);
  const { index } = useVault();
  const { latest, earlier, loaded, unseen, now } = useJustFiled(true);
  const logLoad = useFileText(index?.byPath.get(LOG_PATH));
  const log = logLoad.status === 'ready' ? logLoad.text : '';

  const withTo = latest !== null && hasDestinations(latest);
  const rows = latest !== null && withTo ? justFiledRows(latest, index) : [];
  const aside = latest !== null && withTo ? setAsideRows(latest, index) : [];
  const facts = useNoteFacts(rows, index);

  function markAll(): void {
    markAllSeen(unseen).catch((err: unknown) => console.error(err));
  }

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
    body = (
      <>
        <section class="just-filed-group" aria-label="Latest tidy-up">
          <div class="just-filed-head">
            <h2 class="just-filed-heading">
              {groupHeading(latest, now, desktop ? unseen.size : undefined)}
            </h2>
            {unseen.size > 0 && (
              <button
                type="button"
                class="just-filed-markall"
                onClick={markAll}
              >
                {JUST_MARK_ALL}
              </button>
            )}
          </div>
          {!withTo ? (
            <FallbackList run={latest} log={log} now={now} />
          ) : desktop ? (
            <DesktopTable rows={rows} unseen={unseen} facts={facts} />
          ) : (
            <PhoneRows rows={rows} unseen={unseen} facts={facts} />
          )}
        </section>
        <AsideGroup rows={aside} />
      </>
    );
  }

  return (
    <div class="just-filed-screen">
      <h1 class="screen-title">Just filed</h1>
      <p class="just-filed-intro">{JUST_INTRO}</p>
      {body}
      <Earlier runs={earlier} index={index} log={log} now={now} />
    </div>
  );
}
