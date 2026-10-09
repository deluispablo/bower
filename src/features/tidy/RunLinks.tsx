import { useId } from 'react';
import { Link } from 'react-router';
import type { RunReport } from '@/data/types';
import { displayName, nameOf } from '@/data/tree';
import { noteRoute } from '@/app/paths';
import { runLinkRows, type RunLinkRow as Row } from './run-words';
import s from './tidy.module.css';

/**
 * The notes a finished tidy-up made and brought up to date, each a link to
 * its note: native links in a list named by its visible label (WAI-ARIA
 * APG link pattern; WAI tutorials, content structure: lists).
 */
export function RunLinks({ report, onOpen }: { report: Pick<RunReport, 'created' | 'updated' | 'answered'>; onOpen?: () => void }) {
  const { made, updated } = runLinkRows(report);
  const answered = report.answered ?? [];
  if (!made.length && !updated.length && !answered.length) return null;
  return (
    <div className={s.links}>
      <LinkList label="New notes" rows={made} {...(onOpen ? { onOpen } : {})} />
      <LinkList label="Brought up to date" rows={updated} {...(onOpen ? { onOpen } : {})} />
      <AnsweredRows rows={answered} />
    </div>
  );
}

type AnsweredRow = NonNullable<RunReport['answered']>[number];

/**
 * Answers that did nothing because what they were about had gone (TL-P4-19 addendum 10), one row each in the run
 * result's row style, all kinds in one list. The note that stays shows its pair's row with it.
 */
export function AnsweredRows({ rows }: { rows: readonly AnsweredRow[] }) {
  if (!rows.length) return null;
  return (
    <ul className={s.linkList}>
      {rows.map((r) => (
        <li key={r.questionId}>
          <span className="muted">{r.why}</span>
        </li>
      ))}
    </ul>
  );
}

function LinkList({ label, rows, onOpen }: { label: string; rows: Row[]; onOpen?: () => void }) {
  const id = useId();
  if (!rows.length) return null;
  return (
    <>
      <p id={id} className={s.linksLabel}>
        {label}
      </p>
      <ul aria-labelledby={id} className={s.linkList}>
        {rows.map((r) => (
          <li key={r.path}>
            <Link to={noteRoute(r.path)} onClick={onOpen}>
              {displayName(nameOf(r.path))}
            </Link>
            <span className="muted">{r.what}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
