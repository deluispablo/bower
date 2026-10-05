import { Link, useLocation } from 'react-router';
import { useNote } from '@/data/provider';
import { displayName, nameOf, parentOf } from '@/data/tree';
import type { Note } from '@/data/types';
import { crumbs, decodeSplat, noteRoute } from '@/app/paths';
import { useUi } from '@/app/ui-store';
import { Icon, BowerHead } from '@/ui/Icon';
import { noteOutline } from './markdown';
import { LocalGraph } from './LocalGraph';
import { BowerPanel } from '@/features/bower/BowerPanel';
import s from './panel.module.css';
import { Tabs, tabPanel } from '@/ui/Tabs';

/** The desktop's right panel: links of the open note, its outline, and Bower. */
export function RightPanel() {
  const { rightTab, setRightTab } = useUi();
  const loc = useLocation();
  const path = loc.pathname.startsWith('/note/') ? decodeSplat(loc.pathname.slice(6)) : null;
  const isNote = !!path && path.endsWith('.md');
  // Without a note there are no links or headings: show Bower there instead.
  const tab = isNote ? rightTab : 'bower';
  return (
    <>
      <Tabs
        label="Right panel"
        id="right"
        className={s.tabs}
        tabClassName={s.tab}
        value={tab}
        onChange={setRightTab}
        items={[
          { key: 'links', label: 'Linked notes', icon: <Icon name="graph" size={18} /> },
          { key: 'outline', label: 'Outline', icon: <Icon name="outline" size={18} /> },
          { key: 'bower', label: 'Bower', icon: <BowerHead size={20} /> },
        ]}
      />
      <div className={s.body} {...tabPanel('right', tab)}>
        {tab === 'bower' ? (
          <BowerPanel />
        ) : !isNote || !path ? (
          <p className={s.hint}>Open a note to see {rightTab === 'links' ? 'what it links to and what links to it' : 'its headings'}.</p>
        ) : (
          <NotePanel path={path} tab={tab === 'outline' ? 'outline' : 'links'} />
        )}
      </div>
    </>
  );
}

function NotePanel({ path, tab }: { path: string; tab: 'links' | 'outline' }) {
  const { data: note } = useNote(path);
  if (!note) return null;
  if (tab === 'outline') {
    const o = noteOutline(note);
    const go = (id: string | null): void => {
      const view = document.getElementById('main');
      const el = id ? document.getElementById(id) : null;
      if (!el) {
        view?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // The keyboard goes with it, so reading on starts at that heading.
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    };
    return o.length ? (
      <ul className={s.outline}>
        <li>
          <button type="button" onClick={() => go(null)} className={s.outlineTitle}>
            {note.title}
          </button>
        </li>
        {o.map((h, i) => (
          <li key={i} style={{ paddingLeft: (h.level - 1) * 14 }}>
            <button type="button" onClick={() => go(h.id)}>
              {h.text}
            </button>
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
