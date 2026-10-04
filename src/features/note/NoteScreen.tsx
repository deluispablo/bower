import { useEffect, useState } from 'react';
import { report } from '@/ui/report';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useNote, useSources, useTree } from '@/data/provider';
import { displayName, findNode, nameOf, parentOf } from '@/data/tree';
import type { Note, TreeNode } from '@/data/types';
import { crumbs, decodeSplat, folderRoute, noteRoute, paraColor } from '@/app/paths';
import { NodeMenuButton } from '@/features/files/Explorer';
import { ago } from '@/app/words';
import { useIsDesktop } from '@/ui/media';
import { useUi } from '@/app/ui-store';
import { Icon, BowerHead } from '@/ui/Icon';
import { IconButton, Button, buttonLinkClass } from '@/ui/Button';
import { PoseBower } from '@/bird/Bower';
import { Inline, Markdown } from './markdown';
import { useResolver } from './resolve';
import { webSource } from './web-source';
import { useFileActions } from '@/features/files/file-actions';
import { LinkedList } from './RightPanel';
import { inAppHistory } from '@/app/paths';
import s from './note.module.css';

export function NoteScreen() {
  const loc = useLocation();
  const path = decodeSplat(loc.pathname.slice('/note/'.length));
  const { data: tree } = useTree();
  const node = tree ? findNode(tree, path) : null;
  if (tree && !node) {
    // An old address (Back after a rename or move): go to where it is now.
    const now = useUi.getState().whereNow(path);
    if (now && findNode(tree, now)) return <Navigate to={noteRoute(now)} replace />;
    return <Gone />;
  }
  if (node?.type === 'folder') return <Navigate to={folderRoute(node.path)} replace />;
  if (node && node.kind !== 'note') return <FileView node={node} />;
  return <NoteView path={path} />;
}

function Gone() {
  return (
    <div className={s.page}>
      <PoseBower pose="wait" size={110} />
      <h1 className={s.title}>Not here any more</h1>
      <p className="muted">It may have been moved, renamed or put in the Bin.</p>
      <p style={{ marginTop: 14 }}>
        <Link to="/files">Look in your folders</Link>
      </p>
    </div>
  );
}

function PhoneBar({ folder, path }: { folder: string; path: string }) {
  const nav = useNavigate();
  const { data: tree } = useTree();
  const node = tree ? findNode(tree, path) : null;
  return (
    <div className={s.phoneBar}>
      <IconButton label="Back" onClick={() => (inAppHistory() ? nav(-1) : nav(folderRoute(folder)))}>
        <Icon name="back" />
      </IconButton>
      <Link to={folderRoute(folder)} className={s.phoneCrumb}>
        <span className={s.dot} style={{ background: paraColor(folder) }} />
        {crumbs(folder)}
      </Link>
      {node && <NodeMenuButton node={node} />}
    </div>
  );
}

function NoteView({ path }: { path: string }) {
  const { data: note, error, loading } = useNote(path);
  const desktop = useIsDesktop();
  const resolve = useResolver();
  const { vault } = useSources();
  const folder = parentOf(path);
  useEffect(() => {
    void vault.markSeen(path).catch((e: unknown) => console.error(e));
  }, [path, vault]);

  if (error && !note) return <div className={s.page}><p>{error.message}</p></div>;
  if (!note || (loading && note.path !== path)) return <NoteSkeleton />;

  const link = (target: string, label: string, key: string) => {
    const p = resolve(target);
    return p ? (
      <Link key={key} to={noteRoute(p)} className={s.wikilink}>
        {label}
      </Link>
    ) : (
      <span key={key} className={s.unresolved} title="No note by that name yet">
        {label}
      </span>
    );
  };

  return (
    <article className={s.page}>
      {!desktop && <PhoneBar folder={folder} path={path} />}
      {desktop && (
        <p className={s.crumbs}>
          <Link to={folderRoute(folder)}>{crumbs(folder) || 'Your Bower folder'}</Link>
        </p>
      )}
      <h1 className={s.title}>{note.title}</h1>
      {note.summary && (
        <p className={s.summary}>
          <Inline text={note.summary} link={link} />
        </p>
      )}
      <Properties note={note} />
      {note.currentState.length > 0 && (
        <section className={s.state} aria-labelledby="cs">
          <h2 id="cs">Current state</h2>
          <ul>
            {note.currentState.map((c) => (
              <li key={c}>
                <Inline text={c} link={link} />
              </li>
            ))}
          </ul>
          <p className={s.keeper}>Bower rewrites this in every tidy-up that touches the note.</p>
        </section>
      )}
      {!note.body.trim() && !note.summary && !note.currentState.length && !note.timeline.length && (
        <p className={s.empty}>This note is empty. Write in it from Google Drive or any notes app on your computer; writing here comes in a later version.</p>
      )}
      <div className={s.body}>
        <Markdown
          text={note.body}
          link={link}
          onToggle={(i) =>
            void vault.toggleTask(path, i).catch((e: unknown) => report(e, 'That did not save. Try again.'))
          }
        />
      </div>
      {note.bowerNote && (
        <aside className={s.bowerNote} aria-label="Bower's note">
          <div className={s.bowerPerch}>
            <PoseBower pose="idle" size={64} />
          </div>
          <h2 id="bn">Bower&rsquo;s note</h2>
          <p>
            <Inline text={note.bowerNote.text} link={link} />
          </p>
          <p className={s.source}>
            <span className={s.dot} style={{ background: note.bowerNote.source === 'notes' ? 'var(--brand)' : note.bowerNote.source === 'web' ? 'var(--para-resources)' : 'var(--para-archive)' }} />
            {note.bowerNote.source === 'notes' ? 'From your notes' : note.bowerNote.source === 'web' ? 'From the web' : 'From your notes and the web'}
          </p>
        </aside>
      )}
      {note.timeline.length > 0 && (
        <section className={s.timeline} aria-labelledby="tl">
          <h2 id="tl">Timeline</h2>
          <ol>
            {note.timeline.map((t, i) => (
              <li key={i}>
                <span className={s.when}>{t.date}</span>
                <span>
                  <Inline text={t.text} link={link} />
                  {t.source && (
                    <span className={s.from}>
                      {' '}
                      From{' '}
                      {resolve(t.source) || !webSource(t.source) ? (
                        link(t.source, t.source, `src-${i}`)
                      ) : (
                        <a href={webSource(t.source)?.href} target="_blank" rel="noreferrer noopener">
                          {webSource(t.source)?.label}
                        </a>
                      )}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!desktop && (note.links.length > 0 || note.backlinks.length > 0) && (
        <section className={s.linked}>
          <h2>Linked notes</h2>
          <LinkedList note={note} />
        </section>
      )}
    </article>
  );
}

function Properties({ note }: { note: Note }) {
  const [open, setOpen] = useState(true);
  const props = [...note.properties];
  if (note.status) props.splice(1, 0, { key: 'status', label: 'Status', value: note.status });
  if (note.tags.length) props.push({ key: 'tags', label: 'Tags', value: note.tags.map((t) => `#${t}`).join(' ') });
  if (note.original) props.push({ key: 'original', label: 'Original', value: displayName(nameOf(note.original)), link: note.original });
  if (!props.length) return null;
  return (
    <section className={s.props}>
      <button type="button" className={s.propsHead} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="chev" size={14} stroke={2.2} className={open ? s.rot : ''} />
        Properties
      </button>
      {open && (
        <dl>
          {props.map((p) => (
            <div key={p.key} className={s.prop}>
              <dt>{p.label}</dt>
              <dd>
                {p.link ? <Link to={noteRoute(p.link)}>{p.value}</Link> : p.key === 'status' ? <span className={s.status}>{p.value}</span> : p.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

const KIND_WORD: Record<string, string> = { pdf: 'PDF', image: 'Photo', link: 'Link', doc: 'Document', sheet: 'Spreadsheet', audio: 'Audio', other: 'File' };

function FileView({ node }: { node: TreeNode }) {
  const desktop = useIsDesktop();
  const act = useFileActions();
  const { vault } = useSources();
  const folder = parentOf(node.path);
  const [web, setWeb] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (node.kind !== 'link') return;
    let live = true;
    vault.linkAddress(node.path).then(
      (url) => live && setWeb({ path: node.path, url }),
      (e: unknown) => console.error(e),
    );
    return () => {
      live = false;
    };
  }, [node.kind, node.path, vault]);
  const url = web?.path === node.path ? web.url : null;
  return (
    <article className={s.page}>
      {!desktop && <PhoneBar folder={folder} path={node.path} />}
      {desktop && (
        <p className={s.crumbs}>
          <Link to={folderRoute(folder)}>{crumbs(folder)}</Link>
        </p>
      )}
      <h1 className={`${s.title} ${s.fileTitle}`}>{node.kind === 'link' ? node.name.replace(/\.url$/, '') : node.name}</h1>
      <div className={`${s.preview} ${node.kind === 'image' ? s.previewImage : ''}`} aria-hidden="true">
        <Icon name={node.kind === 'image' ? 'image' : node.kind === 'link' ? 'link' : 'pdf'} size={44} stroke={1.4} />
      </div>
      <dl className={s.fileFacts}>
        <div className={s.prop}>
          <dt>Kind</dt>
          <dd>{KIND_WORD[node.kind ?? 'other']}</dd>
        </div>
        <div className={s.prop}>
          <dt>Folder</dt>
          <dd>{crumbs(folder)}</dd>
        </div>
        <div className={s.prop}>
          <dt>Changed</dt>
          <dd>{ago(node.modified)}</dd>
        </div>
      </dl>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
        {url && (
          <a className={buttonLinkClass} href={url} target="_blank" rel="noreferrer noopener">
            <Icon name="link" size={18} /> Open the web page
          </a>
        )}
        <Button variant={url ? 'ghost' : undefined} onClick={() => act.openInDrive(node.path)}>
          <Icon name="drive" size={18} /> Open in Drive
        </Button>
        <Button variant="ghost" onClick={() => act.copyLink(node)}>
          Copy link
        </Button>
      </div>
      {node.path.startsWith('Inbox/') && (
        <p className="muted" style={{ marginTop: 18, fontSize: 15, display: 'flex', gap: 8, alignItems: 'center' }}>
          <BowerHead size={18} /> Bower reads files like this one in a tidy-up and writes what matters into a note.
        </p>
      )}
    </article>
  );
}

function NoteSkeleton() {
  return (
    <div className={s.page} aria-busy="true" aria-label="Opening the note">
      {[30, 70, 90, 60, 85, 75].map((w, i) => (
        <span key={i} style={{ display: 'block', height: i === 1 ? 34 : 16, width: `${w}%`, margin: '14px 0', borderRadius: 8, background: 'var(--surface)' }} />
      ))}
    </div>
  );
}
