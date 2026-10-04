import { Link, useLocation } from 'react-router';
import { useNote } from '@/data/provider';
import { displayName, nameOf, parentOf } from '@/data/tree';
import type { Note } from '@/data/types';
import { crumbs, decodeSplat, noteRoute } from '@/app/paths';
import { useUi } from '@/app/ui-store';
import { Icon, BowerHead } from '@/ui/Icon';
import { outlineOf } from './markdown';
import { LocalGraph } from './LocalGraph';
import { BowerPanel } from '@/features/bower/BowerPanel';
import s from './panel.module.css';

/** The desktop's right panel: links of the open note, its outline, and Bower. */
export function RightPanel() {
  const { rightTab, setRightTab } = useUi();
  const loc = useLocation();
  const path = loc.pathname.startsWith('/note/') ? decodeSplat(loc.pathname.slice(6)) : null;
  const isNote = !!path && path.endsWith('.md');
  return (
    <>
      <div className={s.tabs} role="tablist" aria-label="Right panel">
        {(
          [
            ['links', 'graph', 'Linked notes'],
            ['outline', 'outline', 'Outline'],
            ['bower', 'bower', 'Bower'],
          ] as const
        ).map(([k, ic, label]) => (
          <button key={k} type="button" role="tab" aria-selected={rightTab === k} aria-label={label} title={label} className={s.tab} onClick={() => setRightTab(k)}>
            {ic === 'bower' ? <BowerHead size={20} /> : <Icon name={ic} size={18} />}
          </button>
        ))}
      </div>
      <div className={s.body}>
        {rightTab === 'bower' ? (
          <BowerPanel />
        ) : !isNote || !path ? (
          <p className={s.hint}>Open a note to see {rightTab === 'links' ? 'what it links to and what links to it' : 'its headings'}.</p>
        ) : (
          <NotePanel path={path} tab={rightTab} />
        )}
      </div>
    </>
  );
}

function NotePanel({ path, tab }: { path: string; tab: 'links' | 'outline' }) {
  const { data: note } = useNote(path);
  if (!note) return null;
  if (tab === 'outline') {
    const o = outlineOf(note.body);
    return o.length ? (
      <ul className={s.outline}>
        {[{ level: 1, text: note.title }, ...o].map((h, i) => (
          <li key={i} style={{ paddingLeft: (h.level - 1) * 14 }}>
            {h.text}
          </li>
        ))}
      </ul>
    ) : (
      <p className={s.hint}>This note has no headings.</p>
    );
  }
  return (
    <>
      <LocalGraph note={note} />
      <LinkedList note={note} />
    </>
  );
}

export function LinkedList({ note }: { note: Note }) {
  const row = (p: string) => (
    <li key={p}>
      <Link to={noteRoute(p)} className={s.link}>
        <span className={s.linkTitle}>{displayName(nameOf(p))}</span>
        <span className={s.linkPath}>{crumbs(parentOf(p))}</span>
      </Link>
    </li>
  );
  return (
    <>
      <h3 className={s.h}>Links to</h3>
      {note.links.length ? <ul className={s.list}>{note.links.map(row)}</ul> : <p className={s.hint}>No links yet.</p>}
      <h3 className={s.h}>Linked from</h3>
      {note.backlinks.length ? <ul className={s.list}>{note.backlinks.map(row)}</ul> : <p className={s.hint}>Nothing links here yet.</p>}
    </>
  );
}
