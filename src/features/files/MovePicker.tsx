import { useMemo, useState } from 'react';
import { useTree } from '@/data/provider';
import { displayName, nameOf, parentOf } from '@/data/tree';
import type { TreeNode } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { crumbs, paraColor } from '@/app/paths';
import { Sheet } from '@/ui/Sheet';
import { Icon } from '@/ui/Icon';
import { useFileActions } from './file-actions';
import s from './files.module.css';

/** "Move to…": every folder, filtered as you type. */
export function MovePicker() {
  const { moveFor, setMoveFor } = useUi();
  const { data: tree } = useTree();
  const act = useFileActions();
  const [q, setQ] = useState('');
  const folders = useMemo(() => {
    const out: string[] = [];
    const walk = (ns: TreeNode[]): void =>
      ns.forEach((n) => {
        if (n.type === 'folder') {
          out.push(n.path);
          if (n.children) walk(n.children);
        }
      });
    walk(tree ?? []);
    return out;
  }, [tree]);
  const from = moveFor ? parentOf(moveFor) : '';
  const list = folders
    .filter((f) => moveFor && f !== from && f !== moveFor && !f.startsWith(`${moveFor}/`))
    .filter((f) => f.toLowerCase().includes(q.trim().toLowerCase()));
  const close = (): void => {
    setMoveFor(null);
    setQ('');
  };
  return (
    <Sheet open={!!moveFor} onOpenChange={(o) => !o && close()} title={moveFor ? `Move ${displayName(nameOf(moveFor))}` : 'Move'} description={from ? `Now in ${crumbs(from)}` : undefined}>
      <label className={s.search}>
        <Icon name="search" size={18} />
        <input autoFocus placeholder="Find a folder" aria-label="Find a folder" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ul className={s.pickList}>
        {list.map((f) => (
          <li key={f}>
            <button
              type="button"
              onClick={() => {
                const p = moveFor;
                close();
                if (p) void act.move(p, f);
              }}
            >
              <span className={s.dot} style={{ background: paraColor(f) }} />
              <span className={s.pickName}>{nameOf(f)}</span>
              <span className={s.pickPath}>{crumbs(parentOf(f))}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="muted" style={{ padding: 12 }}>No folder by that name.</li>}
      </ul>
    </Sheet>
  );
}
