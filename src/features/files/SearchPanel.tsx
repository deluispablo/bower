import { useMemo, useState } from 'react';
import { useTree } from '@/data/provider';
import { displayName } from '@/data/tree';
import type { TreeNode } from '@/data/types';
import { crumbs } from '@/app/paths';
import { Icon } from '@/ui/Icon';
import { useFileActions } from './file-actions';
import s from './files.module.css';

/** Phase 1 searches names in the demo folder; phase 2 searches contents too. */
export function SearchPanel() {
  const { data: tree } = useTree();
  const act = useFileActions();
  const [q, setQ] = useState('');
  const files = useMemo(() => {
    const out: TreeNode[] = [];
    const walk = (ns: TreeNode[]): void => ns.forEach((n) => (n.type === 'file' ? out.push(n) : walk(n.children ?? [])));
    walk(tree ?? []);
    return out;
  }, [tree]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? files.filter((f) => words.every((w) => f.path.toLowerCase().includes(w))).slice(0, 60) : [];
  return (
    <div className={s.panel}>
      <label className={s.search}>
        <Icon name="search" size={18} />
        <input type="search" autoFocus placeholder="Search your notes and files" aria-label="Search your notes and files" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <p className={s.hint} role="status">
        {words.length ? `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}` : 'Names and folders. Contents arrive later.'}
      </p>
      <ul className={s.results}>
        {hits.map((h) => (
          <li key={h.path}>
            <button type="button" onClick={() => act.open(h)}>
              <span className={s.resTitle}>{displayName(h.name)}</span>
              <span className={s.resPath}>{crumbs(h.path.slice(0, h.path.lastIndexOf('/')))}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
