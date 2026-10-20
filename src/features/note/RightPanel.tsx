import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { useFailedChanges, useNote, useSources } from '@/data/provider';
import { thingName, nameOf, parentOf } from '@/data/tree';
import type { Note } from '@/data/types';
import { crumbs, decodeSplat, noteRoute } from '@/app/paths';
import { useUi } from '@/app/ui-store';
import { Icon, BowerHead } from '@/ui/Icon';
import { noteOutline } from './markdown';
import { LocalGraph } from './LocalGraph';
import { BowerPanel } from '@/features/bower/BowerPanel';
import s from './panel.module.css';
import { Tabs, tabPanel } from '@/ui/Tabs';
import { linkReasons } from '@/data/spine/scripted';
import { resolverFor } from './resolve';

const TABS = [
  { key: 'links', label: 'Linked notes', icon: <Icon name="graph" size={18} /> },
  { key: 'outline', label: 'Outline', icon: <Icon name="outline" size={18} /> },
  { key: 'bower', label: 'Activity', icon: <BowerHead size={20} /> },
] as const;

/** The changes that failed which the panel has already turned to, once each, on this page. */
const turnedTo = new Set<string>();

/** The desktop's right panel: links of the open note, its outline, and Bower. */
export function RightPanel() {
  const { rightTab, setRightTab } = useUi();
  const { data: failed } = useFailedChanges();
  const { vault } = useSources();
  const body = useRef<HTMLDivElement>(null);
  /** Focus was inside the panel that a turn closed: it goes to the Bower tab, never to the page. */
  const focusTab = useRef(false);
  const loc = useLocation();
  const path = loc.pathname.startsWith('/note/') ? decodeSplat(loc.pathname.slice(6)) : null;
  const isNote = !!path && path.endsWith('.md');
  // Without a note there are no links or headings: show Bower there instead.
  const tab = isNote ? rightTab : 'bower';
  // A change that failed is found once: the panel turns to Bower, where it shows, and the person may turn away again.
  // Marked seen where what failed is kept, so no later page load turns to it again.
  useEffect(() => {
    const fresh = (failed ?? []).filter((f) => !f.seen && !turnedTo.has(f.id));
    if (!fresh.length) return;
    fresh.forEach((f) => turnedTo.add(f.id));
    focusTab.current = tab !== 'bower' && !!body.current?.contains(document.activeElement);
    setRightTab('bower');
    // Storage that refuses keeps it in this page's memory (journal); a failure here can only mean one more turn later.
    for (const f of fresh) void vault.markFailedSeen?.(f.id).catch((e: unknown) => console.error(e));
  }, [failed, setRightTab, vault, tab]);
  useEffect(() => {
    if (tab !== 'bower' || !focusTab.current) return;
    focusTab.current = false;
    document.getElementById('right-tab-bower')?.focus();
  }, [tab]);
  return (
    <>
      {/* The chosen tab's name stays in sight; the tab already names the panel for a screen reader. */}
      <div className={s.head}>
        <Tabs label="Right panel" id="right" className={s.tabs} tabClassName={s.tab} value={tab} onChange={setRightTab} items={TABS} />
        <span className={s.title} aria-hidden="true">{TABS.find((t) => t.key === tab)?.label}</span>
      </div>
      <div ref={body} className={s.body} {...tabPanel('right', tab)}>
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

/** Each "Links to" row's reason, the first one per row; a link names its row as the reader resolves it (`resolverFor`). */
function rowReasons(note: Note): Map<string, string> {
  // Fed in reverse code-point order, so a title two rows share names the first of their paths.
  const rows = [...note.links].sort().reverse().map((path) => ({ path, name: nameOf(path), type: 'file' as const, modified: 0, created: 0 }));
  const resolve = resolverFor(rows, []);
  const out = new Map<string, string>();
  for (const { target, reason } of linkReasons(note.body)) {
    const p = resolve(target);
    if (p && !out.has(p)) out.set(p, reason);
  }
  return out;
}

/** Each linked note once: the ones that link both ways in their own group, then the one-way links each way. */
export function LinkedList({ note }: { note: Note }) {
  const both = note.links.filter((p) => note.backlinks.includes(p));
  const to = note.links.filter((p) => !both.includes(p));
  const from = note.backlinks.filter((p) => !both.includes(p));
  const reasons = rowReasons(note);
  const row = (p: string) => {
    const why = reasons.get(p);
    return (
      <li key={p}>
        <Link to={noteRoute(p)} className={s.link}>
          <span className={s.linkTitle}>{thingName(nameOf(p))}</span>
          {why ? <span className={`${s.linkPath} muted`}>{why}</span> : <span className={s.linkPath}>{crumbs(parentOf(p))}</span>}
        </Link>
      </li>
    );
  };
  const onlyBoth = 'Only the notes that link both ways.';
  return (
    <>
      {both.length > 0 && (
        <>
          <h3 className={s.h}>Links both ways</h3>
          <ul className={s.list}>{both.map(row)}</ul>
        </>
      )}
      <h3 className={s.h}>Links to</h3>
      {to.length ? <ul className={s.list}>{to.map(row)}</ul> : <p className={s.hint}>{both.length ? onlyBoth : 'No links yet.'}</p>}
      <h3 className={s.h}>Linked from</h3>
      {from.length ? <ul className={s.list}>{from.map(row)}</ul> : <p className={s.hint}>{both.length ? onlyBoth : 'Nothing links here yet.'}</p>}
    </>
  );
}
