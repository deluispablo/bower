import { useEffect, useMemo, useState } from 'react';
import { NodeMenuButton } from './Explorer';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { usePiles, useSources, useTree } from '@/data/provider';
import { folderCount } from '@/data/piles';
import { isRoot, thingName, findNode, parentOf, sortNodes } from '@/data/tree';
import type { Note, TreeNode } from '@/data/types';
import { crumbs, decodeSplat, folderRoute, paraColor, routeFor } from '@/app/paths';
import { useUi } from '@/app/ui-store';
import { ago, plural, agoInSentence } from '@/app/words';
import { useIsDesktop } from '@/ui/media';
import { Icon, BowerHead } from '@/ui/Icon';
import { IconButton } from '@/ui/Button';
import { Explorer } from './Explorer';
import { useFileActions } from './file-actions';
import s from './folder.module.css';
import { useBookmarks } from './bookmarks';

/** `/files`: the tree on a phone; `/files/<folder>`: a folder as a list or a table. */
export function FolderScreen() {
  const loc = useLocation();
  const path = decodeSplat(loc.pathname.replace(/^\/files\/?/, ''));
  const desktop = useIsDesktop();
  if (!path) {
    if (!desktop)
      return (
        <div className={s.filesPage}>
          <h1 className={s.pageTitle}>Files</h1>
          <PhoneBookmarks />
          <Explorer variant="page" />
        </div>
      );
    return <RootOverview />;
  }
  // The inbox is shown as piles (Home and the pile screens), not as folders.
  if (path === 'Inbox' || path.startsWith('Inbox/')) return <InboxRedirect path={path} />;
  return <Folder path={path} />;
}

function InboxRedirect({ path }: { path: string }) {
  const { data: piles } = usePiles();
  if (!piles) return <div className={s.page} aria-busy="true" />;
  const pile = piles.find((p) => p.path && (path === p.path || path.startsWith(`${p.path}/`)));
  return <Navigate to={pile ? `/pile/${pile.id}` : '/'} replace />;
}

function RootOverview() {
  const { data: tree } = useTree();
  return (
    <div className={s.page}>
      <h1 className={s.title}>Your Bower folder</h1>
      <p className="muted">In My Drive. Everything Bower files lives here.</p>
      <ul className={s.roots}>
        {(tree ?? []).filter((n) => n.type === 'folder').map((n) => (
          <li key={n.path}>
            <Link to={folderRoute(n.path)} className={s.rootCard}>
              <span className={s.dot} style={{ background: paraColor(n.path) }} />
              <span className={s.rootName}>{n.name}</span>
              <span className="muted">{plural(folderCount(n), 'thing')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type View = 'list' | 'table';
const VIEW_KEY = 'bower:folder-view';

function Folder({ path }: { path: string }) {
  const { data: tree, loading } = useTree();
  const desktop = useIsDesktop();
  const nav = useNavigate();
  const sort = useUi((u) => u.sort);
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as View) || 'list';
    } catch {
      // expected: storage may be blocked (a private window); the default holds.
      return 'list';
    }
  });
  const node = tree ? findNode(tree, path) : null;
  const children = useMemo(() => sortNodes(node?.children ?? [], sort), [node, sort]);
  const hub = children.find((c) => c.hub);
  const changeView = (v: View): void => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // expected: Keeps the choice for this visit only.
    }
  };

  if (node?.type === 'file') return <Navigate to={routeFor(node)} replace />;
  const now = !node && !loading && tree ? useUi.getState().whereNow(path) : null;
  if (now && tree && findNode(tree, now)) return <Navigate to={folderRoute(now)} replace />;
  if (!node && !loading)
    return (
      <div className={s.page}>
        <h1 className={s.title}>Not here any more</h1>
        <p className="muted">This folder may have been moved, renamed or put in the Bin.</p>
        <p style={{ marginTop: 14 }}>
          <Link to="/files">Look in your folders</Link>
        </p>
      </div>
    );
  if (!node)
    return (
      <div className={s.page} aria-busy="true" aria-label="Opening the folder">
        {[40, 90, 80, 85, 70].map((w, i) => (
          <span key={i} className={s.skel} style={{ width: `${w}%`, height: i === 0 ? 34 : 44 }} />
        ))}
      </div>
    );

  const parent = parentOf(path);
  return (
    <div className={s.page}>
      {!desktop && (
        <div className={s.bar}>
          <IconButton label="Back" onClick={() => nav(folderRoute(parent))}>
            <Icon name="back" />
          </IconButton>
          <span className="muted">{crumbs(parent) || 'Files'}</span>
        </div>
      )}
      {desktop && parent && (
        <p className={s.crumbs}>
          <Link to={folderRoute(parent)}>{crumbs(parent)}</Link>
        </p>
      )}
      <header className={s.head}>
        <div>
          <h1 className={s.title}>
            <span className={s.dotBig} style={{ background: paraColor(path) }} />
            {node.name}
            {!desktop && !isRoot(node.path) && node.path !== 'Inbox' && !node.path.startsWith('Inbox/') && <NodeMenuButton node={node} />}
          </h1>
          {/* What is directly here, as the list shows it: a subfolder counts once, the folder's own note not at all. */}
          <p className="muted">{plural(folderCount(node), 'thing')}</p>
        </div>
        <div className={s.views} role="radiogroup" aria-label="View">
          <button type="button" role="radio" aria-checked={view === 'list'} onClick={() => changeView('list')}>
            <Icon name="list" size={18} /> List
          </button>
          <button type="button" role="radio" aria-checked={view === 'table'} onClick={() => changeView('table')}>
            <Icon name="table" size={18} /> Table
          </button>
        </div>
      </header>
      {hub && <HubSummary hub={hub} />}
      {children.length === 0 ? (
        <div className={s.empty}>
          <p>Nothing in here yet.</p>
          <NewNoteButton folder={path} label={`New note in ${node.name}`} />
        </div>
      ) : view === 'list' ? (
        <ul className={s.list}>
          {children.filter((c) => !c.hub).map((c) => (
            <li key={c.path}>
              <Link to={routeFor(c)} className={s.row} onClick={() => useUi.getState().select(c.path)}>
                <span className={s.tile}>{c.type === 'folder' ? <Icon name="folder" /> : c.byBower ? <BowerHead size={20} /> : <Icon name={c.kind === 'image' ? 'image' : c.kind === 'link' ? 'link' : 'file'} />}</span>
                <span className={s.main}>
                  <span className={c.type === 'file' && c.kind !== 'note' ? `${s.name} ${s.mono}` : s.name}>{c.type === 'folder' ? c.name : thingName(c.name)}</span>
                  <span className={s.sub}>{c.type === 'folder' ? plural(folderCount(c), 'thing') : `Changed ${agoInSentence(c.modified)}`}</span>
                </span>
                {c.isNew && <span className={s.new}>New</span>}
                <Icon name="chev" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <FolderTable items={children.filter((c) => !c.hub)} />
      )}
    </div>
  );
}

/** Inside a link card, wikilinks read as their names. */
const plainLinks = (t: string): string => t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a: string, b?: string) => b ?? a);

function PhoneBookmarks() {
  const bookmarks = useBookmarks();
  const { data: tree } = useTree();
  const act = useFileActions();
  if (!tree || !bookmarks.length) return null;
  return (
    <section className={s.bookmarks} aria-label="Bookmarks">
      {bookmarks.map((b) => {
        const node = findNode(tree, b);
        if (!node) return null;
        return (
          <button key={b} type="button" onClick={() => act.open(node)}>
            <Icon name="bookmark" size={14} />
            {node.type === 'folder' ? node.name : thingName(node.name)}
          </button>
        );
      })}
    </section>
  );
}

/** A new note gets its name first, in the one name sheet, then opens. */
function NewNoteButton({ folder, label }: { folder: string; label: string }) {
  const { setNaming } = useUi();
  return (
    <button type="button" className={s.linkBtn} onClick={() => setNaming({ folder, type: 'note' })}>
      {label}
    </button>
  );
}

function HubSummary({ hub }: { hub: TreeNode }) {
  const { vault } = useSources();
  const [note, setNote] = useState<Note | null>(null);
  useEffect(() => {
    let live = true;
    vault.note(hub.path).then((n) => live && setNote(n), (e: unknown) => console.error(e));
    return () => {
      live = false;
    };
  }, [hub.path, hub.modified, vault]);
  if (!note) return null;
  return (
    <Link to={routeFor(hub)} className={s.hub}>
      <BowerHead size={22} />
      <span>
        <span className={s.hubTitle}>{plainLinks(note.summary) || `About ${note.title}`}</span>
        {note.currentState[0] && <span className={s.sub}>{plainLinks(note.currentState[0])}</span>}
      </span>
    </Link>
  );
}

/** Like an Obsidian base: one row per thing, columns from the notes' properties. */
function FolderTable({ items }: { items: TreeNode[] }) {
  const { vault } = useSources();
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [sortBy, setSortBy] = useState<{ key: string; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  useEffect(() => {
    let live = true;
    const md = items.filter((i) => i.kind === 'note');
    void Promise.all(md.map((i) => vault.note(i.path).then((n) => [i.path, n] as const, (e: unknown) => (console.error(e), null)))).then((pairs) => {
      if (!live) return;
      const m: Record<string, Note> = {};
      pairs.forEach((p) => p && (m[p[0]] = p[1]));
      setNotes(m);
    });
    return () => {
      live = false;
    };
  }, [items, vault]);
  const propKeys = useMemo(() => {
    const seen = new Map<string, string>();
    Object.values(notes).forEach((n) => n.properties.forEach((p) => p.key !== 'kind' && p.key !== 'folder' && !seen.has(p.key) && seen.set(p.key, p.label)));
    return [...seen.entries()].slice(0, 4);
  }, [notes]);
  const value = (i: TreeNode, key: string): string => {
    if (key === 'name') return i.type === 'folder' ? i.name : thingName(i.name);
    if (key === 'modified') return String(i.modified);
    if (key === 'status') return notes[i.path]?.status ?? '';
    return notes[i.path]?.properties.find((p) => p.key === key)?.value ?? '';
  };
  const rows = [...items].sort((a, b) => {
    const k = sortBy.key;
    const av = value(a, k),
      bv = value(b, k);
    return (k === 'modified' ? Number(av) - Number(bv) : av.localeCompare(bv, undefined, { numeric: true })) * sortBy.dir;
  });
  // A Status column only when something here has a status.
  const hasStatus = items.some((i) => !!notes[i.path]?.status);
  const cols: Array<[string, string]> = [['name', 'Name'], ...(hasStatus ? [['status', 'Status'] as [string, string]] : []), ...propKeys, ['modified', 'Changed']];
  const head = (k: string, label: string) => (
    <th key={k} aria-sort={sortBy.key === k ? (sortBy.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSortBy({ key: k, dir: sortBy.key === k ? (sortBy.dir === 1 ? -1 : 1) : 1 })}>
        {label}
        {sortBy.key === k && <Icon name={sortBy.dir === 1 ? 'down' : 'chev'} size={13} className={sortBy.dir === 1 ? '' : s.up} />}
      </button>
    </th>
  );
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>{cols.map(([k, l]) => head(k, l))}</tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.path}>
              <td>
                <Link to={routeFor(i)} className={s.cellName}>
                  {i.type === 'folder' ? <Icon name="folder" size={16} /> : null}
                  {value(i, 'name')}
                </Link>
              </td>
              {hasStatus && <td>{value(i, 'status') && <span className={s.status}>{value(i, 'status')}</span>}</td>}
              {propKeys.map(([k]) => (
                <td key={k}>{value(i, k)}</td>
              ))}
              <td className="muted">{ago(i.modified)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
