import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { RunReport } from '@/data/types';
import { useRequests } from '@/data/provider';
import { Inline } from '@/features/note/markdown';
import { useNoteLink } from '@/features/note/note-link';
import { displayName, nameOf } from '@/data/tree';
import { noteRoute } from '@/app/paths';
import { runLinkRows, type RunLinkRow as Row } from './run-words';
import s from './tidy.module.css';

/**
 * The notes a finished tidy-up made and brought up to date, each a link to
 * its note, what Bower did for each request, and the answers it could not act on: each kind of row in its own
 * list named by its visible label (WAI-ARIA APG link pattern; WAI tutorials,
 * content structure: lists).
 */
export function RunLinks({ report, onOpen }: { report: Pick<RunReport, 'created' | 'updated' | 'answered' | 'leftAsWritten' | 'requests'>; onOpen?: () => void }) {
  const { made, updated } = runLinkRows(report);
  const answered = report.answered ?? [];
  const left = report.leftAsWritten ?? [];
  const asked = [...new Set(report.requests ?? [])];
  if (!made.length && !updated.length && !answered.length && !left.length && !asked.length) return null;
  return (
    <div className={s.links}>
      <LinkList label="New notes" rows={made} {...(onOpen ? { onOpen } : {})} />
      <LinkList label="Brought up to date" rows={updated} {...(onOpen ? { onOpen } : {})} />
      {!!left.length && <LabelledList label="Left as you wrote them">
        {left.map((r, i) => <li key={r.fileId ?? i}>
          {r.fileId ? <Link to={noteRoute(r.name)} onClick={onOpen}>{displayName(nameOf(r.name))}</Link> : <span>{r.name}</span>}
          <span className="muted">{r.why}</span>
        </li>)}
      </LabelledList>}
      {!!asked.length && <DoneRows words={asked} {...(onOpen ? { onOpen } : {})} />}
      <AnsweredRows rows={answered} />
    </div>
  );
}

/**
 * Each distinct request's words with the newest done line of a request with those words (plan F3-F9 ruling 1, FA-R4);
 * words with no done line have no row. Loading or a load error shows no list: Tell Bower shows that error (FA-R5).
 */
function DoneRows({ words, onOpen }: { words: string[]; onOpen?: () => void }) {
  const { data } = useRequests();
  const link = useNoteLink(onOpen);
  const rows = words.flatMap((text) => {
    const done = (data ?? []).filter((r) => r.text === text && r.done).sort((a, b) => b.at - a.at)[0]?.done;
    return done ? [{ text, done }] : [];
  });
  if (!rows.length) return null;
  return (
    <LabelledList label="Done for you">
      {rows.map((r) => (
        <li key={r.text}>
          <span>{r.text}</span>
          <span className="muted"><Inline text={r.done} link={link} /></span>
        </li>
      ))}
    </LabelledList>
  );
}

type AnsweredRow = NonNullable<RunReport['answered']>[number];

/** The answered rows' own label (TL-P4-19 addendum 11): never under "Brought up to date". */
const ANSWERED_LABEL = 'Answers Bower could not act on';

/**
 * Answers that did nothing because what they were about had gone (TL-P4-19 addenda 10 and 11), one row each in the
 * run result's row style, all kinds in one list under their own label. The note that stays shows its pair's row with it.
 */
export function AnsweredRows({ rows }: { rows: readonly AnsweredRow[] }) {
  if (!rows.length) return null;
  return (
    <LabelledList label={ANSWERED_LABEL}>
      {rows.map((r) => (
        <li key={r.questionId}>
          <span className="muted">{r.why}</span>
        </li>
      ))}
    </LabelledList>
  );
}

function LinkList({ label, rows, onOpen }: { label: string; rows: Row[]; onOpen?: () => void }) {
  if (!rows.length) return null;
  return (
    <LabelledList label={label}>
      {rows.map((r) => (
        <li key={r.path}>
          <Link to={noteRoute(r.path)} onClick={onOpen}>
            {displayName(nameOf(r.path))}
          </Link>
          <span className="muted">{r.what}</span>
        </li>
      ))}
    </LabelledList>
  );
}

/**
 * The one label and list of the run result's rows: a visible label that names its list (WCAG 1.3.1; WAI tutorials,
 * content structure: lists; ARIA APG, naming with aria-labelledby). Every kind of row goes under one of these.
 */
function LabelledList({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <>
      <p id={id} className={s.linksLabel}>
        {label}
      </p>
      <ul aria-labelledby={id} className={s.linkList}>
        {children}
      </ul>
    </>
  );
}
