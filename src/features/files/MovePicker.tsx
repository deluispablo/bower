import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
  const [hint, setHint] = useState(false);
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
    .filter((f) => moveFor && f !== from && f !== moveFor && !f.startsWith(`${moveFor}/`) && f !== 'Inbox' && !f.startsWith('Inbox/'))
    .filter((f) => f.toLowerCase().includes(q.trim().toLowerCase()));
  const close = (): void => {
    setMoveFor(null);
    setQ('');
  };
  const listRef = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pick = (f: string): void => {
    const p = moveFor;
    close();
    if (p) void act.move(p, f);
  };
  /** Arrows walk the folders; up from the first goes back to the box. */
  const walk = (e: KeyboardEvent, i: number): void => {
    const buttons = [...(listRef.current?.querySelectorAll('button') ?? [])];
    if (e.key === 'ArrowDown') buttons[Math.min(i + 1, buttons.length - 1)]?.focus();
    else if (e.key === 'ArrowUp') (i <= 0 ? input.current : buttons[i - 1])?.focus();
    else return;
    e.preventDefault();
  };
  return (
    <Sheet open={!!moveFor} onOpenChange={(o) => !o && close()} title={moveFor ? `Move ${displayName(nameOf(moveFor))}` : 'Move'} description={from ? `Now in ${crumbs(from)}` : undefined}>
      <label className={s.search}>
        <Icon name="search" size={18} />
        <input
          ref={input}
          autoFocus
          placeholder="Find a folder"
          aria-label="Find a folder"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHint(false);
          }}
          onKeyDown={(e) => {
            // Enter takes the first folder that matches; arrows go into the list.
            if (e.key === 'Enter' && q.trim()) {
              // Enter moves only when one folder matches; with more, the arrows pick one.
              e.preventDefault();
              if (list.length === 1 && list[0]) pick(list[0]);
              else if (list.length > 1) setHint(true);
            } else walk(e, -1);
          }}
        />
      </label>
      {hint && (
        <p className="muted" role="status">
          Several folders match. Pick one with the arrows, or type more.
        </p>
      )}
      <ul className={s.pickList} ref={listRef}>
        {list.map((f, i) => (
          <li key={f}>
            <button type="button" onClick={() => pick(f)} onKeyDown={(e) => walk(e, i)}>
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
