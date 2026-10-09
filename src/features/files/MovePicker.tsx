import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTree } from '@/data/provider';
import { findNode, thingName, nameOf, parentOf } from '@/data/tree';
import type { TreeNode } from '@/data/types';
import { useUi } from '@/app/ui-store';
import { crumbs, paraColor } from '@/app/paths';
import { Sheet } from '@/ui/Sheet';
import { fieldBox, Input } from '@/ui/Field';
import { Icon } from '@/ui/Icon';
import { Button } from '@/ui/Button';
import { useFileActions } from './file-actions';
import s from './files.module.css';
import folder from './folder.module.css';

/** "Move to…": every folder, filtered as you type. */
export function MovePicker() {
  const { moveFor, setMoveFor } = useUi();
  const { data: tree } = useTree();
  const act = useFileActions();
  const [q, setQ] = useState('');
  const [hint, setHint] = useState<string | null>(null);
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
  const moving = moveFor ? findNode(tree ?? [], moveFor) : null;
  const movingName = moving ? (moving.type === 'folder' ? moving.name : thingName(moving.name)) : moveFor ? nameOf(moveFor) : '';
  const list = folders
    .filter((f) => moveFor && f !== moveFor && !f.startsWith(`${moveFor}/`) && f !== 'Inbox' && !f.startsWith('Inbox/'))
    .filter((f) => f.toLowerCase().includes(q.trim().toLowerCase()));
  const close = (): void => {
    setMoveFor(null);
    setQ('');
  };
  const listRef = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pick = (f: string): void => {
    if (f === from) return;
    const p = moveFor;
    close();
    if (p) void act.move(p, f);
  };
  /** Arrows walk the folders; up from the first goes back to the box. */
  const walk = (e: KeyboardEvent, i: number): void => {
    const buttons = [...(listRef.current?.querySelectorAll('button') ?? [])];
    if (e.key === 'ArrowDown') {
      let next = i + 1;
      while (buttons[next]?.getAttribute('aria-disabled') === 'true') next++;
      buttons[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      let next = i - 1;
      while (buttons[next]?.getAttribute('aria-disabled') === 'true') next--;
      (next < 0 ? input.current : buttons[next])?.focus();
    }
    else return;
    e.preventDefault();
  };
  return (
    <Sheet open={!!moveFor} onOpenChange={(o) => !o && close()} title={moveFor ? `Move ${movingName}` : 'Move'} description={from ? `Now in ${crumbs(from)}` : undefined}>
      <label className={fieldBox()}>
        <Icon name="search" size={18} />
        <Input
          inBox
          ref={input}
          autoFocus
          placeholder="Find a folder"
          aria-label="Find a folder"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHint(null);
          }}
          onKeyDown={(e) => {
            // Enter moves to the one folder that matches, or the one named exactly so; arrows go into the list.
            if (e.key === 'Enter') {
              e.preventDefault();
              const want = q.trim().toLowerCase();
              const choices = list.filter((f) => f !== from);
              const exact = choices.filter((f) => nameOf(f).toLowerCase() === want);
              const one = choices.length === 1 ? choices[0] : exact.length === 1 ? exact[0] : undefined;
              if (!want) setHint('Type a folder name, or pick one with the arrows.');
              else if (one) pick(one);
              else if (choices.length > 1) setHint('Several folders match. Pick one with the arrows, or type more.');
              else setHint('No folder has that name. Type another, or clear the box to see them all.');
            } else walk(e, -1);
          }}
        />
      </label>
      {hint && (
        <p className="muted" role="status">
          {hint}
        </p>
      )}
      <ul className={s.pickList} ref={listRef}>
        {list.map((f, i) => (
          <li key={f}>
            <button type="button" aria-disabled={f === from ? true : undefined} tabIndex={f === from ? -1 : undefined} onClick={() => pick(f)} onKeyDown={(e) => walk(e, i)}>
              <span className={s.dot} style={{ background: paraColor(f) }} />
              <span className={s.pickName}>{nameOf(f)}</span>
              <span className={s.pickPath}>{crumbs(parentOf(f))}</span>
              {f === from && <span className={folder.new}>Now here</span>}
            </button>
          </li>
        ))}
        {!list.length && <li className="muted" style={{ padding: 12 }}>No folder by that name.</li>}
      </ul>
      <div className={s.confirmRow}>
        <Button variant="ghost" block onClick={close}>Cancel</Button>
      </div>
    </Sheet>
  );
}
