import { LoadError } from '@/ui/LoadError';
import { Bone, Skeleton } from '@/ui/Skeleton';
import { useUi } from '@/app/ui-store';
import { findNode, thingName } from '@/data/tree';
import { useTree } from '@/data/provider';
import { crumbs } from '@/app/paths';
import { Icon } from '@/ui/Icon';
import { useFileActions } from './file-actions';
import { useBookmarks } from './bookmarks';
import s from './files.module.css';

export function BookmarksPanel() {
  const { toggleBookmark } = useUi();
  const bookmarks = useBookmarks();
  const treeState = useTree();
  const { data: tree } = treeState;
  const act = useFileActions();
  if (treeState.error) return <LoadError state={treeState} />;
  // The bookmarks are kept on this device, so none known means none: no need to wait for the folder.
  if (!bookmarks.length)
    return (
      <div className={s.panel}>
        <p className={s.hint}>Nothing bookmarked yet. Right-click a note or folder and choose Bookmark.</p>
      </div>
    );
  if (!tree)
    return (
      <div className={s.panel}>
        <Skeleton label="Opening bookmarks">
          {/* One row each: 8 px padding round a 15 px name line and a 13 px place line. */}
          {bookmarks.map((b) => <Bone key={b} style={{ height: 'calc(16px + 1.5 * 28px)', padding: 8, backgroundClip: 'content-box' }} />)}
        </Skeleton>
      </div>
    );
  return (
    <div className={s.panel}>
      <ul className={s.results}>
        {bookmarks.map((b) => {
          const node = findNode(tree, b);
          if (!node) return null;
          const folder = node.type === 'folder';
          const name = folder ? node.name : thingName(node.name);
          return (
            <li key={b} className={s.bmRow}>
              <button type="button" onClick={() => act.open(node)}>
                <span className={s.resTitle}>
                  <Icon name={folder ? 'folder' : 'file'} size={15} /> {name}
                </span>
                <span className={s.resPath}>{b.includes('/') ? crumbs(b.slice(0, b.lastIndexOf('/'))) : 'Your Bower folder'}</span>
              </button>
              <button type="button" className={s.unmark} aria-label={`Remove bookmark ${name}`} onClick={() => toggleBookmark(b)}>
                <Icon name="x" size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
