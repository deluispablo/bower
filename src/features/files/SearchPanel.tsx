import { useEffect, useState } from 'react';
import { useSources } from '@/data/provider';
import type { SearchHit } from '@/data/types';
import { Icon } from '@/ui/Icon';
import { useFileActions } from './file-actions';
import s from './files.module.css';

/** Names first, then notes whose text matches, with the line that matched. */
export function SearchPanel() {
  const { vault } = useSources();
  const act = useFileActions();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  useEffect(() => {
    if (!q.trim()) return;
    let live = true;
    const t = setTimeout(() => {
      vault.search(q).then(
        (h) => live && setHits(h),
        () => live && setHits([]),
      );
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, vault]);
  const shown = q.trim() ? hits : null;
  return (
    <div className={s.panel}>
      <label className={s.search}>
        <Icon name="search" size={18} />
        <input type="search" autoFocus placeholder="Search your notes and files" aria-label="Search your notes and files" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <p className={s.hint} role="status">
        {shown === null ? 'Names, summaries and what notes say.' : `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`}
      </p>
      <ul className={s.results}>
        {(shown ?? []).map((h) => (
          <li key={h.path}>
            <button type="button" onClick={() => act.open({ path: h.path, type: 'file' })}>
              <span className={s.resTitle}>{h.title}</span>
              <span className={s.resPath}>{h.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
