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
export function RunLinks({ report, onOpen }: { report: Pick<RunReport, 'created' | 'updated'>; onOpen?: () => void }) {
  const { made, updated } = runLinkRows(report);
  if (!made.length && !updated.length) return null;
  return (
    <div className={s.links}>
      <LinkList label="New notes" rows={made} {...(onOpen ? { onOpen } : {})} />
      <LinkList label="Brought up to date" rows={updated} {...(onOpen ? { onOpen } : {})} />
    </div>
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
