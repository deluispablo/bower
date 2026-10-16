import { useEffect, useState } from 'react';
import { NOTHING_FOUND } from '@/app/words';
import { useSources } from '@/data/provider';
import type { SearchHit } from '@/data/types';
import { fieldBox, Input } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { useFileActions } from './file-actions';
import s from './files.module.css';

/** Names first, then notes whose text matches, with the line that matched. */
/** `focus`: the box takes the keyboard when it opens (not when arrows walk the panel's tabs). */
export function SearchPanel({ focus = true }: { focus?: boolean }) {
  const { vault } = useSources();
  const act = useFileActions();
  const [q, setQ] = useState('');
  const [result, setResult] = useState<{ q: string; hits: SearchHit[]; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!q.trim()) return;
    let live = true;
    const t = setTimeout(() => {
      vault.search(q).then(
        (h) => live && setResult({ q, hits: h }),
        (e: unknown) => {
          console.error(e);
          if (live) setResult({ q, hits: [], failed: true });
        },
      );
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, vault]);
  // Results only for the query on screen: older answers never show for a newer query.
  const shown = q.trim() && result?.q === q ? result.hits : null;
  const searching = !!q.trim() && result?.q !== q;
  return (
    <div className={s.panel}>
      <label className={fieldBox({ pill: true })}>
        <Icon name="search" size={18} />
        <Input inBox type="search" autoFocus={focus} placeholder="Search your notes and files" aria-label="Search your notes and files" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <p className={s.hint} role="status">
        {searching ? 'Searching…' : result?.q === q && result.failed ? 'Search did not work. Try again.' : shown === null ? 'Names, summaries and what notes say.' : shown.length === 0 ? NOTHING_FOUND : `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`}
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
