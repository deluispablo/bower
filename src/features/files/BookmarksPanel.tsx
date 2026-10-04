import { useUi } from '@/app/ui-store';
import { displayName, nameOf } from '@/data/tree';
import { crumbs } from '@/app/paths';
import { Icon } from '@/ui/Icon';
import { useFileActions } from './file-actions';
import s from './files.module.css';

export function BookmarksPanel() {
  const { bookmarks, toggleBookmark } = useUi();
  const act = useFileActions();
  if (!bookmarks.length)
    return (
      <div className={s.panel}>
        <p className={s.hint}>Nothing bookmarked yet. Right-click a note or folder and choose Bookmark.</p>
      </div>
    );
  return (
    <div className={s.panel}>
      <ul className={s.results}>
        {bookmarks.map((b) => {
          const folder = !/\.[A-Za-z0-9]{1,5}$/.test(b);
          return (
            <li key={b} className={s.bmRow}>
              <button type="button" onClick={() => act.open({ path: b, type: folder ? 'folder' : 'file' })}>
                <span className={s.resTitle}>
                  <Icon name={folder ? 'folder' : 'file'} size={15} /> {displayName(nameOf(b))}
                </span>
                <span className={s.resPath}>{crumbs(b.slice(0, b.lastIndexOf('/')))}</span>
              </button>
              <button type="button" className={s.unmark} aria-label={`Remove bookmark ${displayName(nameOf(b))}`} onClick={() => toggleBookmark(b)}>
                <Icon name="x" size={14} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
